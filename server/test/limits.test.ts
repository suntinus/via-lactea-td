import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Hub, type HubOptions } from '../src/hub.js';
import { StrikeLimiter, clientIp, clientTooSlow } from '../src/limits.js';
import { RankStore } from '../src/store.js';

async function openHub(options: HubOptions = {}): Promise<{ dir: string; hub: Hub }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'via-lactea-hub-'));
  const hub = new Hub(new RankStore(path.join(dir, 'circles.json')), options);
  return { dir, hub };
}

test('o limitador bloqueia por chave e solta quando o prazo acaba', () => {
  let now = 0;
  const limiter = new StrikeLimiter(3, 10_000, 5_000, () => now);
  limiter.strike('ip:a');
  limiter.strike('ip:a');
  assert.equal(limiter.blocked('ip:a'), false);
  limiter.strike('conn:1');
  assert.equal(limiter.blocked('conn:1'), false);
  limiter.strike('ip:a');
  assert.equal(limiter.blocked('ip:a'), true);
  assert.equal(limiter.blocked('conn:1'), false);
  now = 4_999;
  assert.equal(limiter.blocked('ip:a'), true);
  now = 5_000;
  assert.equal(limiter.blocked('ip:a'), false);

  const windowed = new StrikeLimiter(3, 10_000, 5_000, () => now);
  now = 0;
  windowed.strike('conn:2');
  now = 10_000;
  windowed.strike('conn:2');
  windowed.strike('conn:2');
  assert.equal(windowed.blocked('conn:2'), false);
  windowed.strike('conn:2');
  assert.equal(windowed.blocked('conn:2'), true);
  assert.equal(windowed.blocked('ip:a'), false);
});

test('falhas de convite expiradas saem do mapa', () => {
  let now = 0;
  const limiter = new StrikeLimiter(3, 1_000, 5_000, () => now);
  limiter.strike('ip:a');
  assert.equal(limiter.size(), 1);
  now = 1_000;
  limiter.prune();
  assert.equal(limiter.size(), 0);
  limiter.strike('ip:b');
  limiter.strike('ip:b');
  limiter.strike('ip:b');
  assert.equal(limiter.blocked('ip:b'), true);
  now = 5_999;
  limiter.prune();
  assert.equal(limiter.size(), 1);
  now = 6_000;
  limiter.prune();
  assert.equal(limiter.size(), 0);
});

test('header de IP só vale quando o peer é loopback', () => {
  assert.equal(clientIp('127.0.0.1', '203.0.113.10, 10.0.0.1'), '203.0.113.10');
  assert.equal(clientIp('::ffff:127.0.0.1', undefined, '203.0.113.20'), '203.0.113.20');
  assert.equal(clientIp('::1'), '::1');
  assert.equal(clientIp('203.0.113.9', '198.51.100.8', '203.0.113.20'), '203.0.113.9');
  assert.equal(clientIp('127.0.0.1', 'nao-e-ip'), '127.0.0.1');
});

test('cliente lento é quem passa do bufferedAmount', () => {
  assert.equal(clientTooSlow(1_048_576, 1_048_576), false);
  assert.equal(clientTooSlow(1_048_577, 1_048_576), true);
});

test('ranking fica em memória e circles.json só é gravado quando muda', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'via-lactea-rank-'));
  const file = path.join(dir, 'circles.json');
  try {
    const ana = 'a'.repeat(32);
    const bia = 'b'.repeat(32);
    const store = new RankStore(file);
    store.ranking('SALA');
    assert.equal(existsSync(file), false);
    store.record('SALA', [
      { playerId: ana, nick: 'Ana', score: 10, outcome: 'win' },
      { playerId: bia, nick: 'Bia', score: 4, outcome: 'loss' },
    ], 2);
    assert.equal(existsSync(file), true);
    const written = statSync(file).mtimeMs;
    assert.equal(store.ranking('SALA')[0]?.nick, 'Ana');
    store.ranking('SALA');
    assert.equal(statSync(file).mtimeMs, written);
    unlinkSync(file);
    assert.equal(store.ranking('SALA')[0]?.wins, 1);
    assert.equal(existsSync(file), false);
    store.record('SALA', [
      { playerId: ana, nick: 'Ana', score: 3, outcome: 'win' },
      { playerId: bia, nick: 'Bia', score: 1, outcome: 'loss' },
    ], 3);
    assert.equal(existsSync(file), true);
    const persisted = new RankStore(file);
    assert.equal(persisted.ranking('SALA')[0]?.wins, 2);
    persisted.record('SALA', [
      { playerId: ana, nick: 'Ana Nova', score: 1, outcome: 'win' },
      { playerId: 'c'.repeat(32), nick: 'Ana Nova', score: 0, outcome: 'loss' },
    ], 4);
    const rows = persisted.ranking('SALA');
    assert.equal(rows.length, 3);
    assert.equal(rows.filter((row) => row.nick === 'Ana Nova').length, 2);
    assert.equal(rows.find((row) => row.wins === 3)?.nick, 'Ana Nova');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('o prazo da pausa não reinicia e a queda seguinte vira W.O.', async () => {
  let now = 1_000_000;
  const { dir, hub } = await openHub({
    now: () => now,
    reconnectMs: 45_000,
    maxPauses: 3,
    maxReconnects: 3,
    emptyTtlMs: 999_999,
    idleTtlMs: 999_999,
    finishedTtlMs: 999_999,
  });
  try {
    const created = hub.hello('Ana', undefined, 'c1');
    assert.equal(created.ok, true);
    if (!created.ok || !created.welcome) return;
    const joined = hub.hello('Bia', created.view.inviteCode, 'c2');
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    hub.lobby(created.sessionId, true);
    hub.lobby(joined.sessionId, true);
    hub.disconnect(created.sessionId);
    const paused = hub.views().find((item) => item.sessionId === joined.sessionId)?.view;
    assert.equal(paused?.pause?.secondsLeft, 45);
    now += 10_000;
    const back = hub.resume(created.sessionId, created.welcome.token, 'c3');
    assert.equal(back.ok, true);
    hub.disconnect(created.sessionId);
    const again = hub.views().find((item) => item.sessionId === joined.sessionId)?.view;
    assert.equal(again?.pause?.secondsLeft, 35);
    assert.equal(again?.match?.winner, null);
    now = 1_000_000 + 45_000;
    hub.tick(0.05);
    const ended = hub.views().find((item) => item.sessionId === joined.sessionId)?.view;
    assert.equal(ended?.match?.winner, 'you');
    assert.equal(ended?.pause, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a quarta pausa e a quarta reconexão são W.O. imediato', async () => {
  let now = 5_000;
  const { dir, hub } = await openHub({
    now: () => now,
    reconnectMs: 45_000,
    maxPauses: 3,
    maxReconnects: 3,
    emptyTtlMs: 999_999,
    idleTtlMs: 999_999,
    finishedTtlMs: 999_999,
  });
  try {
    const created = hub.hello('Ana', undefined, 'p1');
    assert.equal(created.ok, true);
    if (!created.ok || !created.welcome) return;
    const joined = hub.hello('Bia', created.view.inviteCode, 'p2');
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    hub.lobby(created.sessionId, true);
    hub.lobby(joined.sessionId, true);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      hub.disconnect(created.sessionId);
      const back = hub.resume(created.sessionId, created.welcome.token, `p${attempt + 3}`);
      assert.equal(back.ok, true);
      if (back.ok) assert.notEqual(back.view.match?.phase, 'over');
    }
    hub.disconnect(created.sessionId);
    const byPause = hub.views().find((item) => item.sessionId === joined.sessionId)?.view;
    assert.equal(byPause?.match?.winner, 'you');
    assert.ok(now < 5_000 + 45_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  now = 80_000;
  const again = await openHub({
    now: () => now,
    reconnectMs: 45_000,
    maxPauses: 20,
    maxReconnects: 3,
    emptyTtlMs: 999_999,
    idleTtlMs: 999_999,
    finishedTtlMs: 999_999,
  });
  try {
    const created = again.hub.hello('Ana', undefined, 'r1');
    assert.equal(created.ok, true);
    if (!created.ok || !created.welcome) return;
    const joined = again.hub.hello('Bia', created.view.inviteCode, 'r2');
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    again.hub.lobby(created.sessionId, true);
    again.hub.lobby(joined.sessionId, true);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      again.hub.disconnect(created.sessionId);
      const back = again.hub.resume(created.sessionId, created.welcome.token, `r${attempt + 3}`);
      assert.equal(back.ok, true);
      if (back.ok) assert.notEqual(back.view.match?.phase, 'over');
    }
    again.hub.disconnect(created.sessionId);
    const fourth = again.hub.resume(created.sessionId, created.welcome.token, 'r9');
    assert.equal(fourth.ok, true);
    if (fourth.ok) assert.equal(fourth.view.match?.winner, 'opponent');
    assert.ok(now < 80_000 + 45_000);
  } finally {
    await rm(again.dir, { recursive: true, force: true });
  }
});

test('salas vazias, paradas e encerradas expiram', async () => {
  let now = 0;
  const { dir, hub } = await openHub({
    now: () => now,
    reconnectMs: 60_000,
    maxPauses: 0,
    emptyTtlMs: 1_000,
    idleTtlMs: 2_000,
    finishedTtlMs: 500,
  });
  try {
    const emptyHost = hub.hello('Ana', undefined, 'e1');
    assert.equal(emptyHost.ok, true);
    if (!emptyHost.ok) return;
    const emptyCode = emptyHost.view.inviteCode;
    hub.disconnect(emptyHost.sessionId);
    now = 1_000;
    hub.tick(0.05);
    const missed = hub.hello('Bia', emptyCode, 'e2');
    assert.equal(missed.ok, false);
    if (!missed.ok) assert.equal(missed.code, 'convite');

    now = 10_000;
    const idleHost = hub.hello('Caio', undefined, 'i1');
    assert.equal(idleHost.ok, true);
    if (!idleHost.ok) return;
    const idleCode = idleHost.view.inviteCode;
    now = 12_000;
    hub.tick(0.05);
    const idleJoin = hub.hello('Duda', idleCode, 'i2');
    assert.equal(idleJoin.ok, false);
    if (!idleJoin.ok) assert.equal(idleJoin.code, 'convite');

    now = 30_000;
    const host = hub.hello('Eva', undefined, 'f1');
    assert.equal(host.ok, true);
    if (!host.ok) return;
    const guest = hub.hello('Fio', host.view.inviteCode, 'f2');
    assert.equal(guest.ok, true);
    if (!guest.ok) return;
    hub.lobby(host.sessionId, true);
    hub.lobby(guest.sessionId, true);
    hub.disconnect(host.sessionId);
    const ended = hub.views().find((item) => item.sessionId === guest.sessionId)?.view;
    assert.equal(ended?.match?.phase, 'over');
    now = 30_500;
    hub.tick(0.05);
    const late = hub.hello('Gio', host.view.inviteCode, 'f3');
    assert.equal(late.ok, false);
    if (!late.ok) assert.equal(late.code, 'convite');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('o exemplo de nginx documenta wss e timeouts e não está aplicado', () => {
  const file = path.join(process.cwd(), 'docs', 'nginx-wss.example.conf');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /listen 443 ssl/);
  assert.match(text, /proxy_pass http:\/\/127\.0\.0\.1:8030/);
  assert.match(text, /X-Real-IP/);
  assert.match(text, /Upgrade/);
  assert.match(text, /proxy_read_timeout 3600s/);
  assert.match(text, /proxy_send_timeout 3600s/);
  assert.match(text, /NÃO está aplicado/);
  assert.equal(existsSync(path.join(process.cwd(), 'nginx.conf')), false);
});
