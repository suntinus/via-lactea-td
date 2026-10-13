const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./rules.js');

test('chefão extra entra no preview: 1 na onda 5 e 2 a partir da 10', () => {
  assert.equal(R.bossCount(4), 0);
  assert.equal(R.bossCount(5), 1);
  assert.equal(R.bossCount(10), 2);
  assert.equal(R.previewEnemyCount(5), R.enemyCountForWave(5) + 1);
  assert.equal(R.previewEnemyCount(10), R.enemyCountForWave(10) + 2);
  assert.equal(R.previewEnemyCount(3), R.enemyCountForWave(3));
});

test('dano respeita armadura e nunca zera', () => {
  assert.equal(R.mitigatedDamage(1, 2), 1);
  assert.equal(R.mitigatedDamage(8, 2), 6);
  assert.equal(R.leakDamage('boss'), 3);
  assert.equal(R.leakDamage('ufo'), 1);
});

test('pack pesado inclui boss e o leve não', () => {
  const pesada = R.ATTACK_PACKS.pesada.build(8);
  const leve = R.ATTACK_PACKS.leve.build(3);
  assert.ok(pesada.filter((type) => type === 'boss').length >= 2);
  assert.equal(leve.includes('boss'), false);
  assert.ok(leve.every((type) => type === 'ufo' || type === 'virus'));
});

test('plantio rejeita caminho, margem e metade errada', () => {
  assert.equal(R.placementOk(320, 40, { seat: 'left', towers: [] }), true);
  assert.equal(R.placementOk(180, 36, { seat: 'left', towers: [] }), false);
  assert.equal(R.placementOk(400, 100, { seat: 'left', towers: [] }), false);
  assert.equal(R.placementOk(8, 40, { seat: 'left', towers: [] }), false);
  assert.equal(R.placementOk(320, 40, {
    seat: 'left',
    towers: [{ x: 320, y: 40 }],
  }), false);
});

test('upgrade de ouro empilha no máximo +15% e escudo só com HP baixo', () => {
  const side = {
    hp: 10,
    maxHp: 24,
    gold: 100,
    vidaBoughtThisWave: false,
    upgrades: {
      laser: { range: 1, rate: 1, damage: 0 },
      escudo: { range: 1, rate: 1, damage: 0 },
      sonda: { range: 1, rate: 1, damage: 0 },
      global: { killGold: 1, maxHp: 0 },
    },
  };
  assert.equal(R.shouldBuyShield(side), true);
  side.hp = 20;
  assert.equal(R.shouldBuyShield(side), false);
  side.hp = 10;
  side.gold = 10;
  assert.equal(R.shouldBuyShield(side), false);

  const rich = {
    maxHp: 24,
    upgrades: {
      laser: { range: 1, rate: 1, damage: 0 },
      global: { killGold: 1, maxHp: 0 },
    },
  };
  R.applyUpgradeStat(rich, 'kill-gold');
  R.applyUpgradeStat(rich, 'kill-gold');
  R.applyUpgradeStat(rich, 'kill-gold');
  R.applyUpgradeStat(rich, 'kill-gold');
  assert.equal(rich.upgrades.global.killGold, 1.15);
  R.applyUpgradeStat(rich, 'max-hp');
  assert.equal(rich.maxHp, 25);
  assert.equal(R.applyUpgradeStat(rich, 'inexistente'), false);
});

test('pista da direita é o espelho da esquerda', () => {
  assert.equal(R.VS_PATHS.left.length, R.VS_PATHS.right.length);
  for (let i = 0; i < R.VS_PATHS.left.length; i += 1) {
    assert.equal(R.mirrorX(R.VS_PATHS.left[i].x), R.VS_PATHS.right[i].x);
    assert.equal(R.VS_PATHS.left[i].y, R.VS_PATHS.right[i].y);
  }
  assert.ok(R.pathLength(R.VS_PATHS.left) > 500);
});

test('rng semeado é estável', () => {
  const a = R.mulberry32(456);
  const b = R.mulberry32(456);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notEqual(seqA[0], R.mulberry32(1)());
});
