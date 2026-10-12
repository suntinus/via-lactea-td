import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { DEFAULT_HEARTBEAT_MS, startServer, type RunningServer, type StartOptions } from '../src/server.js';

interface Welcome {
  type: 'welcome';
  sessionId: string;
  token: string;
  playerId?: string;
  view: View;
}

interface View {
  phase: string;
  inviteCode: string;
  youNick: string;
  opponentNick: string | null;
  ranking: { nick: string; wins: number; points: number }[];
  pause: { reason: string; secondsLeft: number } | null;
  match: null | {
    phase: string;
    winner: string | null;
    you: { gold: number; hp: number; enemies: unknown[] };
    opponent: { enemies: unknown[] };
    youNeedPack: boolean;
    upgrade: { forYou: boolean; options: { id: string }[] } | null;
  };
}

interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

type Incoming = Welcome | { type: 'state'; view: View } | ErrorMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface MutableSocket extends WebSocket {
  _autoPong?: boolean;
  pong: (...args: unknown[]) => void;
}

class Client {
  readonly inbox: Incoming[] = [];
  private socket: WebSocket | null = null;
  private cursor = 0;

  constructor(
    private readonly port: number,
    private readonly headers: Record<string, string> = {},
  ) {}

  async connect(): Promise<void> {
    const socket = new WebSocket(`ws://127.0.0.1:${this.port}`, { headers: this.headers });
    this.socket = socket;
    socket.on('error', () => undefined);
    socket.on('message', (data) => {
      const parsed: unknown = JSON.parse(data.toString());
      if (isRecord(parsed) && typeof parsed.type === 'string') this.inbox.push(parsed as Incoming);
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
  }

  send(message: unknown): void {
    this.socket?.send(JSON.stringify(message));
  }

  rawSend(payload: string): void {
    this.socket?.send(payload);
  }

  silencePong(): void {
    const socket = this.socket as MutableSocket | null;
    if (!socket) return;
    socket._autoPong = false;
    socket.pong = () => undefined;
  }

  onceClose(): Promise<number> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new Error('sem socket'));
    if (socket.readyState === socket.CLOSED) return Promise.resolve(1006);
    return new Promise((resolve) => {
      socket.once('close', (code: number) => resolve(code));
    });
  }

  async wait<T extends Incoming>(predicate: (message: Incoming) => message is T, timeoutMs?: number): Promise<T>;
  async wait(predicate: (message: Incoming) => boolean, timeoutMs?: number): Promise<Incoming>;
  async wait(predicate: (message: Incoming) => boolean, timeoutMs = 3000): Promise<Incoming> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      while (this.cursor < this.inbox.length) {
        const message = this.inbox[this.cursor];
        this.cursor += 1;
        if (predicate(message)) return message;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`timeout depois de ${this.inbox.length} mensagens`);
  }

  async close(): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.readyState === socket.CLOSED) return;
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
  }
}

async function boot(stepSec = 0.05, extra: Partial<StartOptions> = {}): Promise<{ server: RunningServer; dir: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'via-lactea-'));
  const server = await startServer({
    port: 0,
    dataDir: dir,
    staticRoot: process.cwd(),
    stepSec,
    intervalMs: 30,
    ...extra,
  });
  return { server, dir };
}

test('escuta em 127.0.0.1, serve o jogo e recusa magic link', async () => {
  const { server, dir } = await boot();
  try {
    assert.equal(server.host, '127.0.0.1');
    const health = await fetch(`http://127.0.0.1:${server.port}/health`);
    const body: unknown = await health.json();
    assert.equal(isRecord(body) && body.host, '127.0.0.1');
    const page = await fetch(`http://127.0.0.1:${server.port}/game.html`);
    assert.match(await page.text(), /by Suntinus/);
    const client = new Client(server.port);
    await client.connect();
    client.send({ type: 'magic', email: 'amigo@example.com' });
    const error = await client.wait((message) => message.type === 'error');
    assert.equal(error.type, 'error');
    if (error.type === 'error') assert.equal(error.code, 'magic_link_futuro');
    await client.close();
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('convite, lobby, moedas autoritativas e reconexão', async () => {
  const { server, dir } = await boot();
  try {
    const host = new Client(server.port);
    const guest = new Client(server.port);
    await host.connect();
    await guest.connect();
    host.send({ type: 'hello', nick: 'Ana' });
    const welcome = await host.wait((message) => message.type === 'welcome');
    assert.equal(welcome.type, 'welcome');
    if (welcome.type !== 'welcome') return;
    guest.send({ type: 'hello', nick: 'Bia', inviteCode: 'NOPE00' });
    const missing = await guest.wait((message) => message.type === 'error');
    assert.equal(missing.type, 'error');
    guest.send({ type: 'hello', nick: 'Bia', inviteCode: welcome.view.inviteCode });
    const joined = await guest.wait((message): message is Welcome => message.type === 'welcome' && message.view.youNick === 'Bia');
    assert.equal(joined.type, 'welcome');
    host.send({ type: 'lobby', ready: true, base: 'lunar' });
    guest.send({ type: 'lobby', ready: true });
    const started = await host.wait((message) => message.type === 'state' && message.view.match !== null);
    assert.equal(started.type, 'state');
    if (started.type !== 'state' || !started.view.match) return;
    assert.equal(started.view.match.you.gold, 90);
    host.send({ type: 'command', command: { kind: 'place', tower: 'laser', x: 320, y: 40 } });
    const spent = await host.wait((message) => message.type === 'state' && message.view.match !== null && message.view.match.you.gold === 65);
    assert.equal(spent.type, 'state');
    host.send({ type: 'command', command: { kind: 'spawn', lane: 'right' } });
    const rejected = await host.wait((message) => message.type === 'error' && message.code === 'protocolo');
    assert.equal(rejected.type, 'error');
    await host.close();
    const again = new Client(server.port);
    await again.connect();
    again.send({ type: 'resume', sessionId: welcome.sessionId, token: welcome.token });
    const resumed = await again.wait((message): message is Welcome => message.type === 'welcome');
    assert.equal(resumed.view.match?.you.gold, 65);
    await guest.close();
    await again.close();
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('partida sincronizada grava ranking entre amigos', async () => {
  const { server, dir } = await boot(1);
  try {
    const host = new Client(server.port);
    const guest = new Client(server.port);
    await host.connect();
    await guest.connect();
    host.send({ type: 'hello', nick: 'Ana' });
    const welcome = await host.wait((message): message is Welcome => message.type === 'welcome');
    guest.send({ type: 'hello', nick: 'Bia', inviteCode: welcome.view.inviteCode });
    await guest.wait((message): message is Welcome => message.type === 'welcome' && message.view.opponentNick === 'Ana');
    host.send({ type: 'lobby', ready: true, base: 'terra' });
    guest.send({ type: 'lobby', ready: true });

    let hostPack = false;
    let guestPack = false;
    let hostUpgrade = '';
    let guestUpgrade = '';
    const pump = () => {
      for (const message of host.inbox) {
        if (message.type !== 'state' && message.type !== 'welcome') continue;
        const match = message.view.match;
        if (!match) continue;
        if (match.youNeedPack && !hostPack) {
          hostPack = true;
          host.send({ type: 'command', command: { kind: 'pack', pack: 'leve' } });
        }
        if (match.phase !== 'pack') hostPack = false;
        if (match.upgrade?.forYou) {
          const id = match.upgrade.options[0]?.id ?? '';
          if (id && hostUpgrade !== `${match.phase}:${id}:${message.view.match?.you.hp}`) {
            hostUpgrade = `${match.phase}:${id}:${message.view.match?.you.hp}`;
            host.send({ type: 'command', command: { kind: 'upgrade', upgradeId: id } });
          }
        }
      }
      for (const message of guest.inbox) {
        if (message.type !== 'state' && message.type !== 'welcome') continue;
        const match = message.view.match;
        if (!match) continue;
        if (match.youNeedPack && !guestPack) {
          guestPack = true;
          guest.send({ type: 'command', command: { kind: 'pack', pack: 'pesada' } });
        }
        if (match.phase !== 'pack') guestPack = false;
        if (match.upgrade?.forYou) {
          const id = match.upgrade.options[0]?.id ?? '';
          const key = `${id}:${match.you.hp}:${match.you.gold}`;
          if (id && guestUpgrade !== key) {
            guestUpgrade = key;
            guest.send({ type: 'command', command: { kind: 'upgrade', upgradeId: id } });
          }
        }
      }
    };

    const started = Date.now();
    let finished: View | null = null;
    while (Date.now() - started < 20000) {
      pump();
      const latest = [...host.inbox].reverse().find((message) => (message.type === 'state' || message.type === 'welcome') && message.view.match?.phase === 'over');
      if (latest && (latest.type === 'state' || latest.type === 'welcome') && latest.view.match?.phase === 'over') {
        finished = latest.view;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    assert.ok(finished, 'a partida não terminou');
    assert.equal(finished?.match?.winner, 'you');
    assert.ok((finished?.ranking ?? []).some((row) => row.nick === 'Ana' && row.wins >= 1));
    await host.close();
    await guest.close();
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('maxPayload 8192 recusa mensagem grande', async () => {
  const { server, dir } = await boot();
  try {
    const client = new Client(server.port);
    await client.connect();
    client.rawSend('x'.repeat(8192));
    const accepted = await client.wait((message): message is ErrorMessage => message.type === 'error');
    assert.equal(accepted.code, 'json');
    const closed = client.onceClose();
    client.rawSend('y'.repeat(8193));
    assert.equal(await closed, 1009);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('heartbeat de 25s encerra quem não responde pong e a queda vira pausa e W.O.', async () => {
  assert.equal(DEFAULT_HEARTBEAT_MS, 25_000);
  const { server, dir } = await boot(0.05, { heartbeatMs: 300, reconnectMs: 900, intervalMs: 40 });
  try {
    const host = new Client(server.port);
    const guest = new Client(server.port);
    await host.connect();
    await guest.connect();
    host.send({ type: 'hello', nick: 'Ana' });
    const welcome = await host.wait((message): message is Welcome => message.type === 'welcome');
    guest.send({ type: 'hello', nick: 'Bia', inviteCode: welcome.view.inviteCode });
    await guest.wait((message): message is Welcome => message.type === 'welcome');
    host.send({ type: 'lobby', ready: true, base: 'terra' });
    guest.send({ type: 'lobby', ready: true });
    await host.wait((message) => message.type === 'state' && message.view.match !== null);
    guest.silencePong();
    const paused = await host.wait((message) => message.type === 'state' && message.view.pause !== null, 5000);
    assert.equal(paused.type, 'state');
    if (paused.type === 'state') {
      assert.equal(paused.view.pause?.reason, 'disconnect');
      assert.ok((paused.view.pause?.secondsLeft ?? 0) > 0);
    }
    const ended = await host.wait((message) => message.type === 'state' && message.view.match?.winner === 'you', 5000);
    assert.equal(ended.type, 'state');
    if (ended.type === 'state') assert.equal(ended.view.match?.winner, 'you');
    await host.close();
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('limite de conexões por IP e de salas por conexão', async () => {
  const { server, dir } = await boot(0.05, { maxConnectionsPerIp: 2 });
  try {
    const first = new Client(server.port);
    const second = new Client(server.port);
    await first.connect();
    await second.connect();
    const third = new WebSocket(`ws://127.0.0.1:${server.port}`);
    third.on('error', () => undefined);
    const code = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('a terceira conexão não fechou')), 3000);
      third.once('close', (closeCode: number) => {
        clearTimeout(timer);
        resolve(closeCode);
      });
    });
    assert.equal(code, 1008);
    await first.close();
    await second.close();

    const host = new Client(server.port);
    await host.connect();
    host.send({ type: 'hello', nick: 'Ana' });
    await host.wait((message): message is Welcome => message.type === 'welcome');
    host.send({ type: 'hello', nick: 'Outra' });
    const limited = await host.wait((message): message is ErrorMessage => message.type === 'error' && message.code === 'limite_salas');
    assert.equal(limited.code, 'limite_salas');
    await host.close();
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('dois clientes atrás do mesmo proxy usam IPs diferentes do header', async () => {
  const { server, dir } = await boot(0.05, {
    maxConnectionsPerIp: 1,
    inviteMaxFails: 1,
    inviteWindowMs: 60_000,
    inviteBlockMs: 60_000,
  });
  try {
    const left = new Client(server.port, { 'x-forwarded-for': '203.0.113.10, 127.0.0.1' });
    const right = new Client(server.port, { 'x-real-ip': '203.0.113.20' });
    await left.connect();
    await right.connect();
    const sameIp = new WebSocket(`ws://127.0.0.1:${server.port}`, {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    sameIp.on('error', () => undefined);
    const closed = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('a conexão repetida não fechou')), 3000);
      sameIp.once('close', (code: number) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    assert.equal(closed, 1008);
    const playerId = 'ab'.repeat(16);
    left.send({ type: 'hello', nick: 'Ana', inviteCode: 'NOPE00', playerId });
    const first = await left.wait((message): message is ErrorMessage => message.type === 'error');
    assert.equal(first.code, 'convite');
    left.send({ type: 'hello', nick: 'Ana', inviteCode: 'NOPE01', playerId });
    const blocked = await left.wait((message): message is ErrorMessage => message.type === 'error');
    assert.equal(blocked.code, 'convite_bloqueado');
    right.send({ type: 'hello', nick: 'Bia', inviteCode: 'NOPE00' });
    const other = await right.wait((message): message is ErrorMessage => message.type === 'error');
    assert.equal(other.code, 'convite');
    await left.close();
    await right.close();
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('convites errados bloqueiam a conexão e o IP', async () => {
  const { server, dir } = await boot(0.05, { inviteMaxFails: 2, inviteWindowMs: 60_000, inviteBlockMs: 60_000 });
  try {
    const host = new Client(server.port);
    const guest = new Client(server.port);
    await host.connect();
    await guest.connect();
    host.send({ type: 'hello', nick: 'Ana' });
    const welcome = await host.wait((message): message is Welcome => message.type === 'welcome');
    guest.send({ type: 'hello', nick: 'Bia', inviteCode: 'NOPE00' });
    const first = await guest.wait((message): message is ErrorMessage => message.type === 'error');
    assert.equal(first.code, 'convite');
    guest.send({ type: 'hello', nick: 'Bia', inviteCode: 'NOPE01' });
    const second = await guest.wait((message): message is ErrorMessage => message.type === 'error');
    assert.equal(second.code, 'convite');
    guest.send({ type: 'hello', nick: 'Bia', inviteCode: welcome.view.inviteCode });
    const blocked = await guest.wait((message): message is ErrorMessage => message.type === 'error');
    assert.equal(blocked.code, 'convite_bloqueado');
    const other = new Client(server.port);
    await other.connect();
    other.send({ type: 'hello', nick: 'Caio', inviteCode: welcome.view.inviteCode });
    const byIp = await other.wait((message): message is ErrorMessage => message.type === 'error');
    assert.equal(byIp.code, 'convite_bloqueado');
    await host.close();
    await guest.close();
    await other.close();
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
