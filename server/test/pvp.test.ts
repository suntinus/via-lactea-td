import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { startServer, type RunningServer } from '../src/server.js';

interface Welcome {
  type: 'welcome';
  sessionId: string;
  token: string;
  view: View;
}

interface View {
  phase: string;
  inviteCode: string;
  youNick: string;
  opponentNick: string | null;
  ranking: { nick: string; wins: number; points: number }[];
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

class Client {
  readonly inbox: Incoming[] = [];
  private socket: WebSocket | null = null;

  constructor(private readonly port: number) {}

  async connect(): Promise<void> {
    const socket = new WebSocket(`ws://127.0.0.1:${this.port}`);
    this.socket = socket;
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

  async wait<T extends Incoming>(predicate: (message: Incoming) => message is T, timeoutMs?: number): Promise<T>;
  async wait(predicate: (message: Incoming) => boolean, timeoutMs?: number): Promise<Incoming>;
  async wait(predicate: (message: Incoming) => boolean, timeoutMs = 3000): Promise<Incoming> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const found = this.inbox.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`timeout depois de ${this.inbox.length} mensagens`);
  }

  async close(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
  }
}

async function boot(stepSec = 0.05): Promise<{ server: RunningServer; dir: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'via-lactea-'));
  const server = await startServer({
    port: 0,
    dataDir: dir,
    staticRoot: process.cwd(),
    stepSec,
    intervalMs: 30,
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
