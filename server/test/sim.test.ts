import assert from 'node:assert/strict';
import test from 'node:test';
import { Match } from '../src/sim.js';

test('moedas só mudam por comando válido do servidor', () => {
  const match = new Match({ seed: 7, base: 'terra' });
  assert.equal(match.snapshot().left.gold, 60);
  const rejected = match.command({ seat: 'left', kind: 'place', tower: 'laser', x: 8, y: 8 });
  assert.equal(rejected.ok, false);
  assert.equal(match.snapshot().left.gold, 60);
  const placed = match.command({ seat: 'left', kind: 'place', tower: 'laser', x: 320, y: 40 });
  assert.equal(placed.ok, true);
  assert.equal(match.snapshot().left.gold, 35);
  const broke = match.command({ seat: 'left', kind: 'place', tower: 'sonda', x: 300, y: 80 });
  assert.equal(broke.ok, false);
  assert.equal(match.snapshot().left.gold, 35);
});

test('monstros só nascem depois que os dois packs foram enviados', () => {
  const match = new Match({ seed: 3, base: 'lunar' });
  assert.equal(match.command({ seat: 'left', kind: 'pack', pack: 'pesada' }).ok, true);
  match.tick(3);
  const waiting = match.snapshot();
  assert.equal(waiting.phase, 'pack');
  assert.equal(waiting.left.enemies.length + waiting.right.enemies.length, 0);
  assert.equal(match.command({ seat: 'right', kind: 'pack', pack: 'leve' }).ok, true);
  match.tick(1);
  const live = match.snapshot();
  assert.equal(live.phase, 'combat');
  assert.ok(live.left.enemies.length + live.right.enemies.length > 0);
  assert.ok(live.right.enemies.some((enemy) => enemy.type === 'boss' || enemy.type === 'predador' || enemy.type === 'alien'));
});

test('a bomba recusa coordenada fora do mapa e não gasta moedas', () => {
  const match = new Match({ seed: 5, base: 'lunar' });
  const far = match.command({ seat: 'left', kind: 'bomb', x: 5000, y: 40 });
  assert.equal(far.ok, false);
  assert.equal(far.reason, 'Fora do mapa.');
  const negative = match.command({ seat: 'left', kind: 'bomb', x: -1, y: 40 });
  assert.equal(negative.ok, false);
  assert.equal(match.snapshot().left.gold, 90);
  assert.equal(match.snapshot().left.bombCd, 0);
  const boom = match.command({ seat: 'left', kind: 'bomb', x: 40, y: 40 });
  assert.equal(boom.ok, true);
  assert.equal(match.snapshot().left.gold, 40);
});

test('o lado que recebe o enxame leve perde a base', () => {
  const match = new Match({ seed: 11, base: 'terra' });
  let guard = 0;
  while (match.snapshot().phase !== 'over' && guard < 5000) {
    const snap = match.snapshot();
    if (snap.phase === 'pack') {
      match.command({ seat: 'left', kind: 'pack', pack: 'leve' });
      match.command({ seat: 'right', kind: 'pack', pack: 'pesada' });
    } else if (snap.phase === 'upgrade' && snap.upgrade) {
      match.command({ seat: snap.upgrade.seat, kind: 'upgrade', upgradeId: snap.upgrade.options[0].id });
    } else {
      match.tick(0.5);
    }
    guard += 1;
  }
  const end = match.snapshot();
  assert.equal(end.phase, 'over');
  assert.equal(end.winner, 'left');
  assert.ok(end.left.hp > 0);
  assert.equal(end.right.hp, 0);
});
