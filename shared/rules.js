/**
 * Regras compartilhadas do Via Láctea TD by Suntinus.
 * O cliente (extensão / página) e o servidor autoritativo usam este módulo.
 */
(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.ViaLacteaRules = api;
}(globalThis, function createRules() {
  const W = 720;
  const H = 520;
  const MID = W / 2;

  const VIDA_COST = 80;
  const VIDA_BONUS = 5;
  const BOMB_COST = 50;
  const BOMB_RADIUS = 70;
  const BOMB_DAMAGE = 8;
  const FREEZE_COST = 40;
  const FREEZE_DURATION = 3;
  const HERO_COST = 100;
  const UPGRADE_MILESTONE = 150;
  const UPGRADE_CAP = 3;
  const PATH_TOLERANCE = 26;
  const TOWER_GAP = 40;

  const BASES = {
    terra: { name: 'Planeta Terra', label: 'Terra', emoji: '🌍', hp: 24, gold: 60 },
    lunar: { name: 'Base Lunar', label: 'Lunar', emoji: '🌙', hp: 16, gold: 90 },
  };

  const DIFFS = {
    facil: { label: 'Fácil', hpMul: 0.75, speedMul: 0.85, goldMul: 1.15 },
    normal: { label: 'Normal', hpMul: 1, speedMul: 1, goldMul: 1 },
    dificil: { label: 'Difícil', hpMul: 1.35, speedMul: 1.15, goldMul: 0.9 },
  };

  const TOWERS = {
    laser: {
      name: 'Laser', cost: 25, range: 95, rate: 0.6, damage: 1,
      color: '#7dd3fc', glyph: '⚡', forca: 2, alcance: 4, cadencia: 4, slow: 0,
    },
    escudo: {
      name: 'Escudo', cost: 35, range: 72, rate: 0.4, damage: 2,
      color: '#a78bfa', glyph: '🛡', forca: 4, alcance: 2, cadencia: 2, slow: 0.45,
    },
    sonda: {
      name: 'Sonda', cost: 45, range: 115, rate: 0.28, damage: 3,
      color: '#4ade80', glyph: '📡', forca: 5, alcance: 5, cadencia: 1, slow: 0,
    },
    hero: {
      name: 'Herói', cost: HERO_COST, range: 90, rate: 0.22, damage: 4,
      color: '#f0c14a', glyph: '🚀', forca: 5, alcance: 3, cadencia: 1, slow: 0, aoe: 55,
    },
  };

  const STAT_UPGRADES = [
    { id: 'laser-range', title: 'Laser · Alcance', description: '+5% alcance para todas as torres Laser' },
    { id: 'laser-rate', title: 'Laser · Cadência', description: '+5% cadência para todas as torres Laser' },
    { id: 'laser-damage', title: 'Laser · Força', description: '+1 dano para todas as torres Laser' },
    { id: 'escudo-range', title: 'Escudo · Alcance', description: '+5% alcance para todas as torres Escudo' },
    { id: 'escudo-rate', title: 'Escudo · Cadência', description: '+5% cadência para todas as torres Escudo' },
    { id: 'escudo-damage', title: 'Escudo · Força', description: '+1 dano para todas as torres Escudo' },
    { id: 'sonda-range', title: 'Sonda · Alcance', description: '+5% alcance para todas as torres Sonda' },
    { id: 'sonda-rate', title: 'Sonda · Cadência', description: '+5% cadência para todas as torres Sonda' },
    { id: 'sonda-damage', title: 'Sonda · Força', description: '+1 dano para todas as torres Sonda' },
    { id: 'kill-gold', title: 'Global · Ouro', description: '+5% ouro recebido de kills (máx. +15%)' },
    { id: 'max-hp', title: 'Global · Base', description: '+1 HP máximo para a base (máx. 3 vezes)' },
  ];

  const FALLBACK_UPGRADES = [
    { id: 'bonus-gold', title: 'Bônus · Ouro', description: '+$25 ouro agora', effect: 'gold', amount: 25 },
    { id: 'heal-hp', title: 'Bônus · Cura', description: 'Cura +2 HP da base', effect: 'heal', amount: 2 },
  ];

  const ENEMY_TYPES = {
    ufo: {
      label: 'Disco voador', emoji: '🛸', letter: 'U', color: '#60a5fa', outline: '#bfdbfe',
      hp: 3, speed: 58, reward: 10, size: 11, armor: 0, trait: 'rush',
    },
    alien: {
      label: 'Alienígena', emoji: '👽', letter: 'A', color: '#4ade80', outline: '#bbf7d0',
      hp: 5, speed: 44, reward: 12, size: 12, armor: 0, trait: 'glass',
    },
    predador: {
      label: 'Predador', emoji: '👾', letter: 'P', color: '#f472b6', outline: '#fbcfe8',
      hp: 9, speed: 30, reward: 16, size: 14, armor: 1, trait: 'tank',
    },
    virus: {
      label: 'Vírus', emoji: '🦠', letter: 'V', color: '#c084fc', outline: '#e9d5ff',
      hp: 2, speed: 72, reward: 14, size: 8, armor: 0, trait: 'glass',
    },
    boss: {
      label: 'Asteroide Boss', emoji: '☄️', letter: 'B', color: '#f97316', outline: '#fed7aa',
      hp: 28, speed: 22, reward: 45, size: 20, armor: 2, trait: 'armored',
    },
  };

  const ATTACK_PACKS = {
    leve: {
      id: 'leve', name: 'Força leve', emoji: '💨',
      build(wave) {
        const n = 6 + wave * 2;
        const queue = [];
        for (let i = 0; i < n; i += 1) queue.push(i % 3 === 2 ? 'virus' : 'ufo');
        return queue;
      },
    },
    mista: {
      id: 'mista', name: 'Força mista', emoji: '⚖️',
      build(wave) {
        const pattern = ['ufo', 'alien', 'virus', 'ufo', 'predador', 'alien'];
        const n = 5 + wave * 2;
        const queue = [];
        for (let i = 0; i < n; i += 1) queue.push(pattern[i % pattern.length]);
        if (wave >= 4 && wave % 5 !== 0) queue.push('predador');
        return queue;
      },
    },
    pesada: {
      id: 'pesada', name: 'Força pesada', emoji: '🪨',
      build(wave) {
        const n = 4 + Math.floor(wave * 1.2);
        const queue = [];
        for (let i = 0; i < n; i += 1) queue.push(i % 2 === 0 ? 'predador' : 'alien');
        queue.push('boss');
        if (wave >= 8) queue.push('boss');
        return queue;
      },
    },
  };

  const MAPS = {
    orbita: {
      a: [
        { x: 40, y: 80 }, { x: 200, y: 80 }, { x: 320, y: 140 }, { x: 420, y: 200 },
        { x: 540, y: 220 }, { x: 640, y: 280 }, { x: 680, y: 380 },
      ],
      b: [
        { x: 40, y: 80 }, { x: 160, y: 200 }, { x: 220, y: 340 }, { x: 360, y: 400 },
        { x: 500, y: 420 }, { x: 620, y: 400 }, { x: 680, y: 380 },
      ],
    },
    nebulosa: {
      a: [
        { x: 30, y: 40 }, { x: 280, y: 40 }, { x: 400, y: 100 }, { x: 520, y: 60 },
        { x: 640, y: 140 }, { x: 680, y: 260 }, { x: 600, y: 380 }, { x: 680, y: 480 },
      ],
      b: [
        { x: 30, y: 40 }, { x: 100, y: 160 }, { x: 80, y: 300 }, { x: 200, y: 420 },
        { x: 360, y: 460 }, { x: 520, y: 440 }, { x: 620, y: 480 }, { x: 680, y: 480 },
      ],
    },
    asteroides: {
      a: [
        { x: 50, y: 60 }, { x: 300, y: 60 }, { x: 300, y: 180 }, { x: 480, y: 180 },
        { x: 480, y: 300 }, { x: 640, y: 300 }, { x: 640, y: 440 }, { x: 690, y: 440 },
      ],
      b: [
        { x: 50, y: 60 }, { x: 120, y: 200 }, { x: 120, y: 360 }, { x: 280, y: 420 },
        { x: 420, y: 360 }, { x: 560, y: 420 }, { x: 690, y: 440 },
      ],
    },
  };

  const VS_PATHS = {
    left: [
      { x: 180, y: 36 }, { x: 90, y: 110 }, { x: 170, y: 190 }, { x: 70, y: 280 },
      { x: 150, y: 360 }, { x: 100, y: 440 }, { x: 180, y: 500 },
    ],
    right: [
      { x: 540, y: 36 }, { x: 630, y: 110 }, { x: 550, y: 190 }, { x: 650, y: 280 },
      { x: 570, y: 360 }, { x: 620, y: 440 }, { x: 540, y: 500 },
    ],
  };

  function pathLength(path) {
    let len = 0;
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return len;
  }

  function pointOnPath(path, dist) {
    let left = Math.max(0, dist);
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (left <= seg) {
        const t = seg === 0 ? 0 : left / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      left -= seg;
    }
    const end = path[path.length - 1];
    return { x: end.x, y: end.y };
  }

  function nearSinglePath(path, x, y, tol) {
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      const len2 = ((b.x - a.x) ** 2) + ((b.y - a.y) ** 2) || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / len2));
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      if (Math.hypot(x - px, y - py) < tol) return true;
    }
    return false;
  }

  function placementOk(x, y, options) {
    const opts = options || {};
    const width = opts.width || W;
    const height = opts.height || H;
    const mid = width / 2;
    const towers = opts.towers || [];
    const seat = opts.seat || 'solo';
    if (x < 16 || y < 16 || x > width - 16 || y > height - 16) return false;
    if (seat === 'left' && x >= mid - 8) return false;
    if (seat === 'right' && x <= mid + 8) return false;
    let paths;
    if (seat === 'left') paths = [VS_PATHS.left];
    else if (seat === 'right') paths = [VS_PATHS.right];
    else {
      const map = MAPS[opts.map || 'orbita'];
      paths = [map.a, map.b];
    }
    if (paths.some((path) => nearSinglePath(path, x, y, opts.tol || PATH_TOLERANCE))) return false;
    if (towers.some((tower) => Math.hypot(tower.x - x, tower.y - y) < TOWER_GAP)) return false;
    return true;
  }

  function enemyHpBonus(wave) {
    let bonus = Math.floor(wave / 2);
    if (wave > 8) bonus += (wave - 8) * 2;
    return bonus;
  }

  function enemyCountForWave(wave) {
    let count = 5 + wave * 2;
    if (wave >= 3) count += 2;
    if (wave >= 8) count += 3;
    return count;
  }

  function bossCount(wave) {
    if (wave <= 0 || wave % 5 !== 0) return 0;
    return wave >= 10 ? 2 : 1;
  }

  function previewEnemyCount(wave) {
    return enemyCountForWave(wave) + bossCount(wave);
  }

  function difficultyForWave(wave) {
    if (wave <= 3) return 'Fácil';
    if (wave <= 6) return 'Média';
    if (wave <= 9) return 'Difícil';
    return 'Brutal';
  }

  function mitigatedDamage(rawDamage, armor) {
    return Math.max(1, rawDamage - (armor || 0));
  }

  function applyUpgradeStat(side, id) {
    switch (id) {
      case 'laser-range': side.upgrades.laser.range *= 1.05; break;
      case 'laser-rate': side.upgrades.laser.rate *= 1.05; break;
      case 'laser-damage': side.upgrades.laser.damage += 1; break;
      case 'escudo-range': side.upgrades.escudo.range *= 1.05; break;
      case 'escudo-rate': side.upgrades.escudo.rate *= 1.05; break;
      case 'escudo-damage': side.upgrades.escudo.damage += 1; break;
      case 'sonda-range': side.upgrades.sonda.range *= 1.05; break;
      case 'sonda-rate': side.upgrades.sonda.rate *= 1.05; break;
      case 'sonda-damage': side.upgrades.sonda.damage += 1; break;
      case 'kill-gold':
        side.upgrades.global.killGold = Math.min(1.15, side.upgrades.global.killGold + 0.05);
        break;
      case 'max-hp':
        side.upgrades.global.maxHp += 1;
        side.maxHp += 1;
        break;
      default:
        return false;
    }
    return true;
  }

  function shouldBuyShield(side) {
    if (!side || side.vidaBoughtThisWave || side.hp <= 0) return false;
    if (side.gold < VIDA_COST) return false;
    return side.hp <= side.maxHp * 0.5;
  }

  function waveClearBonus(wave) {
    return 12 + wave * 3;
  }

  function leakDamage(type) {
    return type === 'boss' ? 3 : 1;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mirrorX(x, width) {
    return (width || W) - x;
  }

  return {
    W,
    H,
    MID,
    VIDA_COST,
    VIDA_BONUS,
    BOMB_COST,
    BOMB_RADIUS,
    BOMB_DAMAGE,
    FREEZE_COST,
    FREEZE_DURATION,
    HERO_COST,
    UPGRADE_MILESTONE,
    UPGRADE_CAP,
    PATH_TOLERANCE,
    TOWER_GAP,
    BASES,
    DIFFS,
    TOWERS,
    STAT_UPGRADES,
    FALLBACK_UPGRADES,
    ENEMY_TYPES,
    ATTACK_PACKS,
    MAPS,
    VS_PATHS,
    pathLength,
    pointOnPath,
    nearSinglePath,
    placementOk,
    enemyHpBonus,
    enemyCountForWave,
    bossCount,
    previewEnemyCount,
    difficultyForWave,
    mitigatedDamage,
    applyUpgradeStat,
    shouldBuyShield,
    waveClearBonus,
    leakDamage,
    mulberry32,
    mirrorX,
  };
}));
