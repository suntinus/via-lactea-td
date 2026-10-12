import { randomBytes, randomInt } from 'node:crypto';
import rules from '../../shared/rules.js';
import type { ClientCommand } from './protocol.js';
import { Match, type BaseId, type Intent, type MatchSnap, type Seat, type SideSnap } from './sim.js';
import { RankStore, type RankingRow } from './store.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NICK_MAX = 16;

function acceptNick(raw: string): string | null {
  const nick = raw.normalize('NFKC').trim();
  if (nick.length < 1 || nick.length > NICK_MAX) return null;
  let first = true;
  for (const char of nick) {
    if (first) {
      if (!/^[\p{L}\p{N}]$/u.test(char)) return null;
      first = false;
      continue;
    }
    if (!/^[\p{L}\p{N} _-]$/u.test(char)) return null;
  }
  return nick;
}

export interface HubOptions {
  now?: () => number;
  reconnectMs?: number;
  maxPauses?: number;
  maxReconnects?: number;
  emptyTtlMs?: number;
  idleTtlMs?: number;
  finishedTtlMs?: number;
  maxRoomsPerConnection?: number;
}

const PLAYER_ID_RE = /^[a-f0-9]{32}$/;

export interface SessionPlayer {
  sessionId: string;
  token: string;
  playerId: string;
  nick: string;
  seat: Seat;
  ready: boolean;
  connected: boolean;
  disconnectUntil: number | null;
  pauses: number;
  reconnects: number;
  connectionId: string | null;
}

interface Room {
  code: string;
  base: BaseId;
  players: SessionPlayer[];
  match: Match | null;
  recorded: boolean;
  seed: number;
  lastActivity: number;
  endedAt: number | null;
  emptySince: number | null;
}

export interface SideView {
  hp: number;
  maxHp: number;
  gold: number;
  score: number;
  goldEarned: number;
  heroPlaced: boolean;
  bombCd: number;
  freezeCd: number;
  freezeLeft: number;
  vidaBought: boolean;
  upgrades: SideSnap['upgrades'];
  towers: { x: number; y: number; kind: string }[];
  enemies: {
    id: number;
    type: string;
    dist: number;
    hp: number;
    maxHp: number;
    armor: number;
    slowMul: number;
    lane: Seat;
    pathKey: Seat;
  }[];
  bullets: { x: number; y: number; tx: number; ty: number; color: string; aoe: number }[];
}

export interface GameView {
  phase: 'lobby' | MatchSnap['phase'];
  inviteCode: string;
  youNick: string;
  opponentNick: string | null;
  youReady: boolean;
  opponentReady: boolean;
  base: BaseId;
  ranking: RankingRow[];
  pause: { reason: 'disconnect'; secondsLeft: number } | null;
  match: null | {
    tick: number;
    wave: number;
    phase: MatchSnap['phase'];
    winner: 'you' | 'opponent' | 'draw' | null;
    summarySeconds: number | null;
    you: SideView;
    opponent: SideView;
    youPack: string | null;
    opponentPack: string | null;
    youNeedPack: boolean;
    opponentNeedPack: boolean;
    upgrade: { forYou: boolean; options: { id: string; title: string; description: string }[] } | null;
    resultText: string | null;
  };
}

export interface Welcome {
  sessionId: string;
  token: string;
  playerId: string;
  view: GameView;
}

export type HubResult =
  | { ok: true; welcome?: Welcome; view: GameView; sessionId: string }
  | { ok: false; code: string; message: string };

function makeCode(): string {
  let code = '';
  for (let index = 0; index < 6; index += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

function makeId(): string {
  return randomBytes(16).toString('hex');
}

function flip(seat: Seat): Seat {
  return seat === 'left' ? 'right' : 'left';
}

function mirrorX(x: number, seat: Seat): number {
  return seat === 'right' ? rules.mirrorX(x) : x;
}

export class Hub {
  private readonly rooms = new Map<string, Room>();
  private readonly bySession = new Map<string, Room>();
  private readonly roomsByConnection = new Map<string, Set<string>>();
  private readonly now: () => number;
  private readonly reconnectMs: number;
  private readonly maxPauses: number;
  private readonly maxReconnects: number;
  private readonly emptyTtlMs: number;
  private readonly idleTtlMs: number;
  private readonly finishedTtlMs: number;
  private readonly maxRoomsPerConnection: number;

  constructor(
    private readonly store: RankStore,
    options: HubOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.reconnectMs = options.reconnectMs ?? 45_000;
    this.maxPauses = options.maxPauses ?? 3;
    this.maxReconnects = options.maxReconnects ?? 3;
    this.emptyTtlMs = options.emptyTtlMs ?? 120_000;
    this.idleTtlMs = options.idleTtlMs ?? 600_000;
    this.finishedTtlMs = options.finishedTtlMs ?? 120_000;
    this.maxRoomsPerConnection = options.maxRoomsPerConnection ?? 1;
  }

  hello(nickRaw: string, inviteCode?: string, connectionId?: string, playerId?: string): HubResult {
    const nick = acceptNick(nickRaw);
    if (!nick) {
      return { ok: false, code: 'nick', message: 'Nick precisa ter 1 a 16 caracteres (letras, números, espaço, _ ou -).' };
    }
    const stableId = this.resolvePlayerId(playerId);
    if (inviteCode && inviteCode.trim() !== '') return this.join(nick, inviteCode, connectionId, stableId);
    return this.create(nick, connectionId, stableId);
  }

  resume(sessionId: string, token: string, connectionId?: string): HubResult {
    const room = this.bySession.get(sessionId);
    const player = room?.players.find((item) => item.sessionId === sessionId);
    if (!room || !player || player.token !== token) {
      return { ok: false, code: 'sessao', message: 'Sessão não encontrada. Entre de novo com o código de convite.' };
    }
    if (connectionId && !this.claim(connectionId, room.code)) {
      return { ok: false, code: 'limite_salas', message: 'Esta conexão já está em uma sala.' };
    }
    const wasGone = !player.connected;
    player.connected = true;
    player.connectionId = connectionId ?? player.connectionId;
    room.emptySince = null;
    this.touch(room);
    if (wasGone && room.match && room.match.phase !== 'over') {
      player.reconnects += 1;
      if (player.reconnects > this.maxReconnects) this.forfeit(room, player);
    }
    const view = this.view(room, player);
    return { ok: true, sessionId, welcome: { sessionId, token, playerId: player.playerId, view }, view };
  }

  lobby(sessionId: string, ready?: boolean, base?: BaseId): HubResult {
    const found = this.require(sessionId);
    if (!found.ok) return found;
    const { room, player } = found;
    if (room.match && room.match.phase !== 'over') {
      return { ok: false, code: 'em_partida', message: 'A partida já começou.' };
    }
    if (base && player.seat === 'left' && !room.match) room.base = base;
    if (typeof ready === 'boolean') player.ready = ready;
    if (!room.match && room.players.length === 2 && room.players.every((item) => item.ready)) {
      this.beginMatch(room);
    }
    this.touch(room);
    return { ok: true, sessionId, view: this.view(room, player) };
  }

  command(sessionId: string, command: ClientCommand): HubResult {
    const found = this.require(sessionId);
    if (!found.ok) return found;
    const { room, player } = found;
    if (!room.match) return { ok: false, code: 'sem_partida', message: 'Ainda não há partida. Os dois jogadores precisam ficar prontos.' };
    const result = room.match.command(this.toIntent(player.seat, command));
    this.touch(room);
    this.maybeRecord(room);
    if (!result.ok) return { ok: false, code: 'comando', message: result.reason ?? 'Comando recusado.' };
    return { ok: true, sessionId, view: this.view(room, player) };
  }

  rematch(sessionId: string): HubResult {
    const found = this.require(sessionId);
    if (!found.ok) return found;
    const { room, player } = found;
    if (!room.match || room.match.phase !== 'over') {
      return { ok: false, code: 'rematch', message: 'A revanche fica disponível quando a partida termina.' };
    }
    room.match = null;
    room.recorded = false;
    room.endedAt = null;
    for (const item of room.players) {
      item.ready = false;
      item.pauses = 0;
      item.reconnects = 0;
      item.disconnectUntil = null;
    }
    this.touch(room);
    return { ok: true, sessionId, view: this.view(room, player) };
  }

  ranking(sessionId: string): HubResult {
    const found = this.require(sessionId);
    if (!found.ok) return found;
    return { ok: true, sessionId, view: this.view(found.room, found.player) };
  }

  disconnect(sessionId: string): void {
    const room = this.bySession.get(sessionId);
    const player = room?.players.find((item) => item.sessionId === sessionId);
    if (!room || !player || !player.connected) return;
    player.connected = false;
    this.release(player.connectionId, room.code);
    player.connectionId = null;
    this.touch(room);
    if (room.players.every((item) => !item.connected) && room.emptySince === null) {
      room.emptySince = this.now();
    }
    if (!room.match || room.match.phase === 'over') return;
    player.pauses += 1;
    if (player.disconnectUntil === null) player.disconnectUntil = this.now() + this.reconnectMs;
    if (player.pauses > this.maxPauses || player.disconnectUntil <= this.now()) this.forfeit(room, player);
  }

  tick(dt: number): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      this.expirePlayers(room, now);
      if (this.expireRoom(room, now)) continue;
      if (!room.match || room.match.phase === 'over') continue;
      if (room.players.some((player) => !player.connected)) continue;
      room.match.tick(dt);
      this.maybeRecord(room);
    }
  }

  views(): { sessionId: string; view: GameView }[] {
    const list: { sessionId: string; view: GameView }[] = [];
    for (const room of this.rooms.values()) {
      for (const player of room.players) {
        if (!player.connected) continue;
        list.push({ sessionId: player.sessionId, view: this.view(room, player) });
      }
    }
    return list;
  }

  private create(nick: string, connectionId: string | undefined, playerId: string): HubResult {
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    if (connectionId && !this.claim(connectionId, code)) {
      return { ok: false, code: 'limite_salas', message: 'Esta conexão já está em uma sala.' };
    }
    const player = this.player(nick, 'left', connectionId ?? null, playerId);
    const room: Room = {
      code,
      base: 'terra',
      players: [player],
      match: null,
      recorded: false,
      seed: 1,
      lastActivity: this.now(),
      endedAt: null,
      emptySince: null,
    };
    this.rooms.set(code, room);
    this.bySession.set(player.sessionId, room);
    const view = this.view(room, player);
    return { ok: true, sessionId: player.sessionId, welcome: { sessionId: player.sessionId, token: player.token, playerId: player.playerId, view }, view };
  }

  private join(nick: string, inviteCode: string, connectionId: string | undefined, playerId: string): HubResult {
    const code = inviteCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, code: 'convite', message: 'Código de convite não encontrado. Peça um link novo ao amigo.' };
    if (room.players.some((player) => player.nick.toLocaleLowerCase('pt-BR') === nick.toLocaleLowerCase('pt-BR'))) {
      return { ok: false, code: 'nick', message: 'Esse nick já está na sala. Escolha outro.' };
    }
    if (room.players.length >= 2) return { ok: false, code: 'cheia', message: 'A sala já tem dois jogadores.' };
    if (room.match && room.match.phase !== 'over') {
      return { ok: false, code: 'em_partida', message: 'A partida já começou. Use a reconexão se você caiu.' };
    }
    if (room.players.some((player) => player.playerId === playerId)) {
      return { ok: false, code: 'jogador', message: 'Essa conta já está na sala.' };
    }
    if (connectionId && !this.claim(connectionId, code)) {
      return { ok: false, code: 'limite_salas', message: 'Esta conexão já está em uma sala.' };
    }
    const player = this.player(nick, 'right', connectionId ?? null, playerId);
    room.players.push(player);
    this.bySession.set(player.sessionId, room);
    this.touch(room);
    const view = this.view(room, player);
    return { ok: true, sessionId: player.sessionId, welcome: { sessionId: player.sessionId, token: player.token, playerId: player.playerId, view }, view };
  }

  private resolvePlayerId(playerId?: string): string {
    if (playerId && PLAYER_ID_RE.test(playerId)) return playerId;
    return randomBytes(16).toString('hex');
  }

  private player(nick: string, seat: Seat, connectionId: string | null, playerId: string): SessionPlayer {
    return {
      sessionId: makeId(),
      token: randomBytes(24).toString('hex'),
      playerId,
      nick,
      seat,
      ready: false,
      connected: true,
      disconnectUntil: null,
      pauses: 0,
      reconnects: 0,
      connectionId,
    };
  }

  private beginMatch(room: Room): void {
    room.seed = randomBytes(4).readUInt32BE(0);
    room.match = new Match({ seed: room.seed, base: room.base, diff: 'normal' });
    room.recorded = false;
    room.endedAt = null;
    for (const item of room.players) {
      item.pauses = 0;
      item.reconnects = 0;
      item.disconnectUntil = null;
    }
  }

  private forfeit(room: Room, player: SessionPlayer): void {
    if (!room.match || room.match.phase === 'over') return;
    room.match.forfeit(player.seat);
    player.disconnectUntil = null;
    this.maybeRecord(room);
  }

  private touch(room: Room): void {
    room.lastActivity = this.now();
  }

  private claim(connectionId: string, code: string): boolean {
    const owned = this.roomsByConnection.get(connectionId) ?? new Set<string>();
    if (owned.has(code)) {
      this.roomsByConnection.set(connectionId, owned);
      return true;
    }
    if (owned.size >= this.maxRoomsPerConnection) return false;
    owned.add(code);
    this.roomsByConnection.set(connectionId, owned);
    return true;
  }

  private release(connectionId: string | null, code: string): void {
    if (!connectionId) return;
    const owned = this.roomsByConnection.get(connectionId);
    if (!owned) return;
    owned.delete(code);
    if (owned.size === 0) this.roomsByConnection.delete(connectionId);
  }

  private destroy(room: Room): void {
    this.rooms.delete(room.code);
    for (const player of room.players) {
      this.bySession.delete(player.sessionId);
      this.release(player.connectionId, room.code);
      player.connectionId = null;
      player.connected = false;
    }
  }

  private require(sessionId: string): { ok: true; room: Room; player: SessionPlayer } | { ok: false; code: string; message: string } {
    const room = this.bySession.get(sessionId);
    const player = room?.players.find((item) => item.sessionId === sessionId);
    if (!room || !player) return { ok: false, code: 'sessao', message: 'Sessão não encontrada.' };
    return { ok: true, room, player };
  }

  private expirePlayers(room: Room, now: number): void {
    if (!room.match || room.match.phase === 'over') return;
    for (const player of room.players) {
      if (player.connected || player.disconnectUntil === null) continue;
      if (player.disconnectUntil > now) continue;
      const opponent = room.players.find((item) => item.sessionId !== player.sessionId);
      if (opponent?.connected) this.forfeit(room, player);
      else player.disconnectUntil = null;
    }
  }

  private expireRoom(room: Room, now: number): boolean {
    const live = room.match !== null && room.match.phase !== 'over';
    const connected = room.players.some((player) => player.connected);
    if (!connected && !live) {
      const since = room.emptySince ?? now;
      if (room.emptySince === null) room.emptySince = now;
      if (now - since >= this.emptyTtlMs) {
        this.destroy(room);
        return true;
      }
      return false;
    }
    if (!room.match && now - room.lastActivity >= this.idleTtlMs) {
      this.destroy(room);
      return true;
    }
    if (room.match?.phase === 'over') {
      const ended = room.endedAt ?? now;
      if (room.endedAt === null) room.endedAt = now;
      if (now - ended >= this.finishedTtlMs) {
        this.destroy(room);
        return true;
      }
    }
    return false;
  }

  private maybeRecord(room: Room): void {
    if (room.match?.phase === 'over' && room.endedAt === null) room.endedAt = this.now();
    if (!room.match || room.match.phase !== 'over' || room.recorded) return;
    room.recorded = true;
    const snap = room.match.snapshot();
    this.store.record(room.code, room.players.map((player) => {
      const score = player.seat === 'left' ? snap.left.score : snap.right.score;
      let outcome: 'win' | 'loss' | 'draw' = 'draw';
      if (snap.winner === 'draw' || snap.winner === null) outcome = 'draw';
      else outcome = snap.winner === player.seat ? 'win' : 'loss';
      return { playerId: player.playerId, nick: player.nick, score, outcome };
    }), snap.wave);
  }

  private toIntent(seat: Seat, command: ClientCommand): Intent {
    switch (command.kind) {
      case 'place':
        return { seat, kind: 'place', tower: command.tower, x: mirrorX(command.x, seat), y: command.y };
      case 'pack':
        return { seat, kind: 'pack', pack: command.pack };
      case 'shield':
        return { seat, kind: 'shield' };
      case 'bomb':
        return { seat, kind: 'bomb', x: mirrorX(command.x, seat), y: command.y };
      case 'freeze':
        return { seat, kind: 'freeze' };
      case 'upgrade':
        return { seat, kind: 'upgrade', upgradeId: command.upgradeId };
      default: {
        const neverCommand: never = command;
        throw new Error(`Comando não tratado: ${JSON.stringify(neverCommand)}`);
      }
    }
  }

  private view(room: Room, player: SessionPlayer): GameView {
    const opponent = room.players.find((item) => item.sessionId !== player.sessionId) ?? null;
    const pause = this.pause(room);
    return {
      phase: room.match ? room.match.phase : 'lobby',
      inviteCode: room.code,
      youNick: player.nick,
      opponentNick: opponent?.nick ?? null,
      youReady: player.ready,
      opponentReady: opponent?.ready ?? false,
      base: room.base,
      ranking: this.store.ranking(room.code),
      pause,
      match: room.match ? this.matchView(room.match.snapshot(), player.seat) : null,
    };
  }

  private pause(room: Room): GameView['pause'] {
    if (!room.match || room.match.phase === 'over') return null;
    const gone = room.players.find((player) => !player.connected && player.disconnectUntil !== null);
    if (!gone || gone.disconnectUntil === null) return null;
    return {
      reason: 'disconnect',
      secondsLeft: Math.max(0, (gone.disconnectUntil - this.now()) / 1000),
    };
  }

  private matchView(snap: MatchSnap, seat: Seat): NonNullable<GameView['match']> {
    const mirror = seat === 'right';
    const youSnap = seat === 'left' ? snap.left : snap.right;
    const oppSnap = seat === 'left' ? snap.right : snap.left;
    const youPack = seat === 'left' ? snap.leftPack : snap.rightPack;
    const opponentPack = seat === 'left' ? snap.rightPack : snap.leftPack;
    const youNeedPack = seat === 'left' ? snap.leftNeedPack : snap.rightNeedPack;
    const opponentNeedPack = seat === 'left' ? snap.rightNeedPack : snap.leftNeedPack;
    let winner: 'you' | 'opponent' | 'draw' | null = null;
    if (snap.winner === 'draw') winner = 'draw';
    else if (snap.winner === seat) winner = 'you';
    else if (snap.winner) winner = 'opponent';
    const upgrade = snap.upgrade
      ? {
          forYou: snap.upgrade.seat === seat,
          options: snap.upgrade.options.map((option) => ({
            id: option.id,
            title: option.title,
            description: option.description,
          })),
        }
      : null;
    let resultText: string | null = null;
    if (snap.phase === 'over') {
      if (winner === 'you') resultText = `Sua base resistiu. ${youSnap.score} pts na onda ${snap.wave}.`;
      else if (winner === 'opponent') resultText = `Sua base caiu. ${youSnap.score} pts na onda ${snap.wave}.`;
      else resultText = `As duas bases caíram juntas na onda ${snap.wave}.`;
    }
    return {
      tick: snap.tick,
      wave: snap.wave,
      phase: snap.phase,
      winner,
      summarySeconds: snap.summaryLeft,
      you: this.sideView(youSnap, mirror),
      opponent: this.sideView(oppSnap, mirror),
      youPack,
      opponentPack,
      youNeedPack,
      opponentNeedPack,
      upgrade,
      resultText,
    };
  }

  private sideView(side: SideSnap, mirror: boolean): SideView {
    const mx = (x: number) => (mirror ? rules.mirrorX(x) : x);
    const laneOf = (lane: Seat): Seat => (mirror ? flip(lane) : lane);
    return {
      hp: side.hp,
      maxHp: side.maxHp,
      gold: side.gold,
      score: side.score,
      goldEarned: side.goldEarned,
      heroPlaced: side.heroPlaced,
      bombCd: side.bombCd,
      freezeCd: side.freezeCd,
      freezeLeft: side.freezeLeft,
      vidaBought: side.vidaBought,
      upgrades: side.upgrades,
      towers: side.towers.map((tower) => ({ x: mx(tower.x), y: tower.y, kind: tower.kind })),
      enemies: side.enemies.map((enemy) => {
        const lane = laneOf(enemy.lane);
        return { ...enemy, lane, pathKey: lane };
      }),
      bullets: side.bullets.map((bullet) => ({
        x: mx(bullet.x),
        y: bullet.y,
        tx: mx(bullet.tx),
        ty: bullet.ty,
        color: bullet.color,
        aoe: bullet.aoe,
      })),
    };
  }
}
