import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { Hub } from './hub.js';
import { parseClientMessage } from './protocol.js';
import { RankStore } from './store.js';

export interface RunningServer {
  port: number;
  host: '127.0.0.1';
  close: () => Promise<void>;
}

export interface StartOptions {
  port: number;
  dataDir: string;
  staticRoot: string;
  stepSec?: number;
  intervalMs?: number;
}

const STATIC: Record<string, string> = {
  '/': 'game.html',
  '/game.html': 'game.html',
  '/online.js': 'online.js',
  '/shared/rules.js': 'shared/rules.js',
  '/popup.html': 'popup.html',
  '/manifest.json': 'manifest.json',
};

interface SockState {
  sessionId: string | null;
  windowStart: number;
  count: number;
}

function contentType(file: string): string {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function resolveStatic(root: string, urlPath: string): string | null {
  const mapped = STATIC[urlPath];
  if (mapped) return path.join(root, mapped);
  if (/^\/icons\/icon(?:16|48|128)\.png$/.test(urlPath)) return path.join(root, urlPath.slice(1));
  return null;
}

function byteLength(data: RawData): number {
  if (typeof data === 'string') return Buffer.byteLength(data);
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (Array.isArray(data)) return data.reduce((sum, chunk) => sum + chunk.length, 0);
  return data.length;
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

export function startServer(options: StartOptions): Promise<RunningServer> {
  const host = '127.0.0.1' as const;
  const stepSec = options.stepSec ?? 0.05;
  const intervalMs = options.intervalMs ?? 50;
  const store = new RankStore(path.join(options.dataDir, 'circles.json'));
  const hub = new Hub(store);
  const sockets = new Map<string, WebSocket>();
  const states = new Map<WebSocket, SockState>();

  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, service: 'via-lactea-td', host }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const filePath = resolveStatic(options.staticRoot, url.pathname);
    if (!filePath || !filePath.startsWith(path.resolve(options.staticRoot))) {
      res.writeHead(404).end('Não encontrado');
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        res.writeHead(404).end('Não encontrado');
        return;
      }
      res.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
  });

  const wss = new WebSocketServer({ server: httpServer });

  const broadcast = () => {
    for (const item of hub.views()) {
      const socket = sockets.get(item.sessionId);
      if (!socket) continue;
      sendJson(socket, { type: 'state', view: item.view });
    }
  };

  wss.on('connection', (socket) => {
    states.set(socket, { sessionId: null, windowStart: Date.now(), count: 0 });
    socket.on('message', (data, isBinary) => {
      const state = states.get(socket);
      if (!state) return;
      const now = Date.now();
      if (now - state.windowStart > 1000) {
        state.windowStart = now;
        state.count = 0;
      }
      state.count += 1;
      if (isBinary || state.count > 40 || byteLength(data) > 8192) {
        sendJson(socket, { type: 'error', code: 'limite', message: 'Mensagem recusada.' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString('utf8'));
      } catch {
        sendJson(socket, { type: 'error', code: 'json', message: 'JSON inválido.' });
        return;
      }
      const message = parseClientMessage(parsed);
      if (!message) {
        sendJson(socket, { type: 'error', code: 'protocolo', message: 'Mensagem não reconhecida.' });
        return;
      }
      if (message.type === 'magic') {
        sendJson(socket, {
          type: 'error',
          code: 'magic_link_futuro',
          message: 'Magic link fica para uma versão futura. Entre com código de convite e nick.',
        });
        return;
      }
      if (!state.sessionId && message.type !== 'hello' && message.type !== 'resume') {
        sendJson(socket, { type: 'error', code: 'auth', message: 'Entre com nick e código de convite.' });
        return;
      }
      const result = dispatch(message, state.sessionId);
      if (!result.ok) {
        sendJson(socket, { type: 'error', code: result.code, message: result.message });
        broadcast();
        return;
      }
      if (state.sessionId && state.sessionId !== result.sessionId) sockets.delete(state.sessionId);
      state.sessionId = result.sessionId;
      sockets.set(result.sessionId, socket);
      if (result.welcome) {
        sendJson(socket, { type: 'welcome', sessionId: result.welcome.sessionId, token: result.welcome.token, view: result.welcome.view });
      }
      broadcast();
    });
    socket.on('close', () => {
      const state = states.get(socket);
      states.delete(socket);
      if (!state?.sessionId) return;
      if (sockets.get(state.sessionId) === socket) {
        sockets.delete(state.sessionId);
        hub.disconnect(state.sessionId);
        broadcast();
      }
    });
  });

  function dispatch(message: Exclude<ReturnType<typeof parseClientMessage>, null>, sessionId: string | null) {
    switch (message.type) {
      case 'hello':
        return hub.hello(message.nick, message.inviteCode);
      case 'resume':
        return hub.resume(message.sessionId, message.token);
      case 'magic':
        return { ok: false as const, code: 'magic_link_futuro', message: 'Magic link fica para uma versão futura.' };
      case 'lobby':
        return hub.lobby(sessionId ?? '', message.ready, message.base);
      case 'command':
        return hub.command(sessionId ?? '', message.command);
      case 'rematch':
        return hub.rematch(sessionId ?? '');
      case 'ranking':
        return hub.ranking(sessionId ?? '');
      default: {
        const neverMessage: never = message;
        return { ok: false as const, code: 'protocolo', message: `Mensagem não tratada: ${JSON.stringify(neverMessage)}` };
      }
    }
  }

  const timer = setInterval(() => {
    hub.tick(stepSec);
    broadcast();
  }, intervalMs);

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, host, () => {
      const address = httpServer.address();
      const port = address && typeof address === 'object' ? address.port : options.port;
      resolve({
        port,
        host,
        close: () => new Promise((done, fail) => {
          clearInterval(timer);
          wss.close();
          httpServer.close((error) => (error ? fail(error) : done()));
        }),
      });
    });
  });
}
