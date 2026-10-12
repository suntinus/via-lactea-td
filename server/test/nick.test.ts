import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import WebSocket from 'ws';
import rules from '../../shared/rules.js';
import { startServer, type RunningServer } from '../src/server.js';

const HTML_NICK = '<img src=x onerror=alert(1)>';

class FakeEl {
  tagName: string;
  children: FakeEl[] = [];
  style: { opacity?: string } = {};
  className = '';
  hidden = false;
  disabled = false;
  width = 720;
  height = 520;
  text = '';
  onclick: (() => void) | null = null;
  readonly classList = {
    toggle: () => undefined,
    add: () => undefined,
    remove: () => undefined,
    contains: () => false,
  };

  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
  }

  get textContent(): string {
    if (this.children.length === 0) return this.text;
    return this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.text = String(value);
    this.children = [];
  }

  set innerHTML(value: string) {
    const html = String(value);
    this.children = [];
    this.text = html.replace(/<[^>]*>/g, '');
    for (const match of html.matchAll(/<([a-zA-Z][\w-]*)\b/g)) {
      const name = match[1].toLowerCase();
      if (name === 'li' || name === 'div' || name === 'span' || name === 'strong' || name === 'br') continue;
      this.children.push(new FakeEl(name));
    }
  }

  append(...nodes: Array<FakeEl | { textContent?: string }>): void {
    for (const node of nodes) {
      if (node instanceof FakeEl) {
        this.children.push(node);
        continue;
      }
      const text = new FakeEl('#text');
      text.text = String(node.textContent ?? '');
      this.children.push(text);
    }
    this.text = '';
  }

  replaceChildren(...nodes: FakeEl[]): void {
    this.children = [];
    this.text = '';
    if (nodes.length > 0) this.append(...nodes);
  }

  addEventListener(): void {}

  getContext(): unknown {
    return new Proxy({}, { get: () => () => undefined });
  }

  getAttribute(): string {
    return '';
  }

  setAttribute(): void {}

  querySelector(selector: string): FakeEl | null {
    const tag = selector.replace(/[^a-zA-Z].*$/, '').toLowerCase();
    const stack = [...this.children];
    while (stack.length > 0) {
      const node = stack.shift();
      if (!node) continue;
      if (node.tagName.toLowerCase() === tag) return node;
      stack.push(...node.children);
    }
    return null;
  }

  querySelectorAll(): FakeEl[] {
    return [];
  }
}

function installDom(): { byId: Map<string, FakeEl>; loadGame: () => { applyOnline: (view: unknown) => void } } {
  const byId = new Map<string, FakeEl>();
  const document = {
    getElementById(id: string): FakeEl {
      const found = byId.get(id);
      if (found) return found;
      const created = new FakeEl(id === 'game' ? 'canvas' : 'div');
      byId.set(id, created);
      return created;
    },
    createElement(tag: string): FakeEl {
      return new FakeEl(tag);
    },
    createTextNode(text: string): FakeEl {
      const node = new FakeEl('#text');
      node.text = String(text);
      return node;
    },
    querySelector(): FakeEl | null {
      return null;
    },
    querySelectorAll(): FakeEl[] {
      return [];
    },
  };
  const storage = new Map<string, string>();
  const sandbox: Record<string, unknown> = {
    document,
    ViaLacteaRules: rules,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, String(value)); },
      removeItem: (key: string) => { storage.delete(key); },
    },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    addEventListener: () => undefined,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  return {
    byId,
    loadGame() {
      const source = readFileSync(path.join(process.cwd(), 'game.js'), 'utf8');
      runInContext(source, sandbox);
      const game = sandbox.ViaLacteaGame as { applyOnline: (view: unknown) => void } | undefined;
      if (!game) throw new Error('ViaLacteaGame não carregou');
      return game;
    },
  };
}

test('nick com HTML é recusado no servidor e renderizado como texto', async () => {
  const dom = installDom();
  const game = dom.loadGame();
  const dir = await mkdtemp(path.join(tmpdir(), 'via-lactea-nick-'));
  let server: RunningServer | null = null;
  try {
    server = await startServer({ port: 0, dataDir: dir, staticRoot: process.cwd(), intervalMs: 200, heartbeatMs: 60_000 });
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
    socket.on('error', () => undefined);
    const messages: { type?: string; code?: string }[] = [];
    socket.on('message', (data) => {
      messages.push(JSON.parse(data.toString()) as { type?: string; code?: string });
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'hello', nick: HTML_NICK }));
    const started = Date.now();
    let error: { type?: string; code?: string } | undefined;
    while (Date.now() - started < 3000) {
      error = messages.find((message) => message.type === 'error');
      if (error) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(error?.code, 'nick');
    socket.close();

    game.applyOnline({
      base: 'terra',
      youNick: 'Ana',
      opponentNick: null,
      youReady: false,
      opponentReady: false,
      ranking: [{ nick: HTML_NICK, wins: 1, losses: 0, draws: 0, points: 4 }],
      pause: null,
      match: null,
    });
    const list = dom.byId.get('friendRank');
    assert.ok(list);
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].textContent, `#1 ${HTML_NICK} · 1V 0D · 4 pts`);
    assert.equal(list.querySelector('img'), null);
    assert.equal(list.querySelector('script'), null);
  } finally {
    if (server) await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
