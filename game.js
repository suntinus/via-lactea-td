/**
 * Via Láctea TD by Suntinus v0.6.0
 * Solo = clássico (ondas scriptadas). Multijogador = vs IA (packs de ataque, tela dividida).
 * Modos separados — regras não se misturam.
 */
(() => {
  const R = globalThis.ViaLacteaRules;
  if (!R) throw new Error('shared/rules.js precisa carregar antes de game.js');

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const statsEl = document.getElementById('stats');
  const hpFill = document.getElementById('hpFill');
  const hpHearts = document.getElementById('hpHearts');
  const hpFillAi = document.getElementById('hpFillAi');
  const hpHeartsAi = document.getElementById('hpHeartsAi');
  const baseLabel = document.getElementById('baseLabel');
  const hpBarWrap = document.getElementById('hpBarWrap');
  const vsHpWrap = document.getElementById('vsHpWrap');
  const headerHint = document.getElementById('headerHint');
  const rankList = document.getElementById('rankList');
  const recordeEl = document.getElementById('recorde');
  const towerCard = document.getElementById('towerCard');
  const mapSelect = document.getElementById('mapSelect');
  const showRangeEl = document.getElementById('showRange');
  const btnVida = document.getElementById('btnVida');
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnHero = document.getElementById('btnHero');
  const btnBomb = document.getElementById('btnBomb');
  const btnFreeze = document.getElementById('btnFreeze');
  const waveSummary = document.getElementById('waveSummary');
  const waveSummaryStats = document.getElementById('waveSummaryStats');
  const waveSummaryCountdown = document.getElementById('waveSummaryCountdown');
  const btnNow = document.getElementById('btnNow');
  const upgradeModal = document.getElementById('upgradeModal');
  const upgradeChoicesEl = document.getElementById('upgradeChoices');
  const upgradeProgressEl = document.getElementById('upgradeProgress');
  const startScreen = document.getElementById('startScreen');
  const packModal = document.getElementById('packModal');
  const winnerOverlay = document.getElementById('winnerOverlay');
  const winnerTitle = document.getElementById('winnerTitle');
  const winnerBody = document.getElementById('winnerBody');
  const setupSolo = document.getElementById('setupSolo');
  const setupMp = document.getElementById('setupMp');
  const stepMpKind = document.getElementById('stepMpKind');

  const W = canvas.width;
  const H = canvas.height;
  const RANK_KEY = 'viaLacteaTdRank';
  const VIDA_COST = R.VIDA_COST;
  const VIDA_BONUS = R.VIDA_BONUS;
  const BOMB_COST = R.BOMB_COST;
  const BOMB_RADIUS = R.BOMB_RADIUS;
  const FREEZE_COST = R.FREEZE_COST;
  const FREEZE_DURATION = R.FREEZE_DURATION;
  const HERO_COST = R.HERO_COST;
  const UPGRADE_MILESTONE = R.UPGRADE_MILESTONE;
  const UPGRADE_CAP = R.UPGRADE_CAP;
  const MID = W / 2;

  const BASES = R.BASES;
  const DIFFS = R.DIFFS;
  const TOWERS = R.TOWERS;
  const UPGRADE_OPTIONS = R.STAT_UPGRADES.map((option) => ({
    id: option.id,
    title: option.title,
    description: option.description,
    apply(side) { R.applyUpgradeStat(side, option.id); },
  }));

  const FALLBACK_OPTIONS = [
    { id: 'bonus-gold', title: 'Bônus · Ouro', description: '+$25 ouro agora', apply(side) { addGoldTo(side, 25); } },
    { id: 'heal-hp', title: 'Bônus · Cura', description: 'Cura +2 HP da base', apply(side) { side.hp = Math.min(side.maxHp, side.hp + 2); } },
  ];

  const ATTACK_PACKS = R.ATTACK_PACKS;
  const ENEMY_TYPES = R.ENEMY_TYPES;
  const MAPS = R.MAPS;
  const VS_PATHS = R.VS_PATHS;

  const AI_BUILD_SPOTS = [
    { x: 480, y: 100 }, { x: 500, y: 180 }, { x: 470, y: 260 }, { x: 510, y: 340 },
    { x: 460, y: 400 }, { x: 490, y: 460 }, { x: 580, y: 80 }, { x: 600, y: 200 },
    { x: 590, y: 300 }, { x: 610, y: 380 }, { x: 580, y: 460 }, { x: 440, y: 150 },
  ];

  let selectedTower = 'laser';
  let mapKey = 'orbita';
  let PATHS = { a: [], b: [] };
  let PATH_LENS = { a: 0, b: 0 };
  let vsPaths = { left: [], right: [] };
  let vsPathLens = { left: 0, right: 0 };
  let missionStarted = false;
  let baseKey = 'terra';
  let diffKey = 'normal';
  let gameMode = 'solo';
  let uiBranch = 'solo';
  let state = null;
  let last = performance.now();
  let paused = false;
  let mouse = { x: 0, y: 0, on: false };
  let hitFlash = 0;
  let hitFlashAi = 0;
  let rankSaved = false;
  let bombMode = false;
  let freezeTimer = 0;
  let fx = [];
  let aiBuildTimer = 0;
  let onlineActive = false;
  let onlineSend = null;
  let onlinePause = null;
  let uiMp = 'vsia';

  function emptyUpgrades() {
    return {
      laser: { range: 1, rate: 1, damage: 0 },
      escudo: { range: 1, rate: 1, damage: 0 },
      sonda: { range: 1, rate: 1, damage: 0 },
      hero: { range: 1, rate: 1, damage: 0 },
      global: { killGold: 1, maxHp: 0 },
      counts: Object.fromEntries(UPGRADE_OPTIONS.map((option) => [option.id, 0])),
    };
  }

  function freshSide() {
    const base = BASES[baseKey];
    return {
      hp: base.hp,
      maxHp: base.hp,
      gold: base.gold,
      score: 0,
      goldEarned: 0,
      goldUpgradeLevel: 0,
      upgrades: emptyUpgrades(),
      pendingUpgrade: null,
      towers: [],
      enemies: [],
      bullets: [],
      waveGold: 0,
      waveScore: 0,
      vidaBoughtThisWave: false,
      heroPlaced: false,
      bombCd: 0,
      freezeCd: 0,
    };
  }

  function freshSoloState() {
    const side = freshSide();
    return {
      mode: 'solo',
      wave: 0,
      over: false,
      wonWave: false,
      nextWaveSummary: null,
      spawning: null,
      player: side,
      get hp() { return this.player.hp; },
      set hp(v) { this.player.hp = v; },
      get maxHp() { return this.player.maxHp; },
      set maxHp(v) { this.player.maxHp = v; },
      get gold() { return this.player.gold; },
      set gold(v) { this.player.gold = v; },
      get score() { return this.player.score; },
      set score(v) { this.player.score = v; },
      get goldEarned() { return this.player.goldEarned; },
      set goldEarned(v) { this.player.goldEarned = v; },
      get goldUpgradeLevel() { return this.player.goldUpgradeLevel; },
      set goldUpgradeLevel(v) { this.player.goldUpgradeLevel = v; },
      get upgrades() { return this.player.upgrades; },
      get pendingUpgrade() { return this.player.pendingUpgrade; },
      set pendingUpgrade(v) { this.player.pendingUpgrade = v; },
      get towers() { return this.player.towers; },
      get enemies() { return this.player.enemies; },
      set enemies(v) { this.player.enemies = v; },
      get bullets() { return this.player.bullets; },
      set bullets(v) { this.player.bullets = v; },
      get waveGold() { return this.player.waveGold; },
      set waveGold(v) { this.player.waveGold = v; },
      get waveScore() { return this.player.waveScore; },
      set waveScore(v) { this.player.waveScore = v; },
      get vidaBoughtThisWave() { return this.player.vidaBoughtThisWave; },
      set vidaBoughtThisWave(v) { this.player.vidaBoughtThisWave = v; },
      get heroPlaced() { return this.player.heroPlaced; },
      set heroPlaced(v) { this.player.heroPlaced = v; },
      get bombCd() { return this.player.bombCd; },
      set bombCd(v) { this.player.bombCd = v; },
      get freezeCd() { return this.player.freezeCd; },
      set freezeCd(v) { this.player.freezeCd = v; },
    };
  }

  function freshVsState() {
    return {
      mode: 'vsia',
      wave: 0,
      over: false,
      winner: null,
      wonWave: false,
      nextWaveSummary: null,
      pendingPack: false,
      playerPack: null,
      aiPack: null,
      spawning: null,
      player: freshSide(),
      ai: freshSide(),
    };
  }

  function isVs() {
    if (onlineActive && state && state.mode === 'online') return true;
    return gameMode === 'vsia' && state && state.mode === 'vsia';
  }

  function activeSide() {
    return state.player;
  }

  function towerStats(kind, side) {
    const def = TOWERS[kind];
    const up = (side || activeSide()).upgrades[kind] || { range: 1, rate: 1, damage: 0 };
    return {
      range: def.range * up.range,
      rate: def.rate * up.rate,
      damage: def.damage + up.damage,
      slow: def.slow || 0,
      aoe: def.aoe || 0,
    };
  }

  function pathLength(path) {
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return len;
  }

  function recomputePath() {
    const m = MAPS[mapKey];
    PATHS = { a: m.a.map((p) => ({ ...p })), b: m.b.map((p) => ({ ...p })) };
    PATH_LENS = { a: pathLength(PATHS.a), b: pathLength(PATHS.b) };
  }

  function recomputeVsPaths() {
    vsPaths = {
      left: VS_PATHS.left.map((p) => ({ ...p })),
      right: VS_PATHS.right.map((p) => ({ ...p })),
    };
    vsPathLens = { left: pathLength(vsPaths.left), right: pathLength(vsPaths.right) };
  }

  recomputePath();
  recomputeVsPaths();

  function canChangeMap() {
    if (!missionStarted || isVs()) return false;
    return state.wave === 0 && state.towers.length === 0 && !state.spawning && state.enemies.length === 0;
  }

  function syncModeUi() {
    const vs = isVs();
    vsHpWrap.style.display = vs ? 'flex' : 'none';
    mapSelect.disabled = vs || !canChangeMap();
    mapSelect.style.opacity = vs ? '0.4' : '';
    headerHint.textContent = onlineActive
      ? 'Amigo online · moedas e envios de monstros decididos no servidor. Você à esquerda.'
      : vs
        ? 'Multijogador vs IA · você à esquerda, IA à direita. Antes de cada onda escolha o pack de ataque.'
        : 'Torres fora dos dois caminhos. Espaço = pausa. Rank salva as 10 melhores partidas.';
    baseLabel.textContent = vs ? 'Você' : BASES[baseKey].label;
  }

  function syncStartBranch() {
    const solo = uiBranch === 'solo';
    const amigo = !solo && uiMp === 'amigo';
    setupSolo.classList.toggle('show', solo);
    setupMp.classList.toggle('show', !solo && !amigo);
    const onlineBox = document.getElementById('setupOnline');
    if (onlineBox) onlineBox.classList.toggle('show', amigo);
    stepMpKind.style.display = solo ? 'none' : 'block';
    document.getElementById('pickSolo').classList.toggle('active', solo);
    document.getElementById('pickMulti').classList.toggle('active', !solo);
    document.querySelectorAll('[data-mp]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mp') === uiMp);
    });
  }

  document.querySelectorAll('[data-mp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiMp = btn.getAttribute('data-mp') || 'vsia';
      syncStartBranch();
    });
  });

  document.querySelectorAll('[data-branch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiBranch = btn.getAttribute('data-branch');
      syncStartBranch();
    });
  });

  document.querySelectorAll('[data-tower]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTower = btn.getAttribute('data-tower');
      bombMode = false;
      syncTowerChips();
      updateTowerCard();
    });
  });

  document.querySelectorAll('[data-base]').forEach((btn) => {
    btn.addEventListener('click', () => {
      baseKey = btn.getAttribute('data-base');
      document.querySelectorAll('[data-base]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('[data-base-mp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      baseKey = btn.getAttribute('data-base-mp');
      document.querySelectorAll('[data-base-mp]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('[data-diff]').forEach((btn) => {
    btn.addEventListener('click', () => {
      diffKey = btn.getAttribute('data-diff');
      document.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('[data-diff-mp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      diffKey = btn.getAttribute('data-diff-mp');
      document.querySelectorAll('[data-diff-mp]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('[data-pack]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state || !state.pendingPack) return;
      choosePlayerPack(btn.getAttribute('data-pack'));
    });
  });

  document.getElementById('btnWinnerOk').onclick = () => {
    winnerOverlay.classList.remove('open');
    if (onlineActive && onlineSend) {
      onlineSend({ type: 'rematch' });
      return;
    }
    resetGame();
  };

  function loadRank() {
    try {
      const raw = localStorage.getItem(RANK_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((e) => e && typeof e.score === 'number')
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    } catch {
      return [];
    }
  }

  function saveRankEntry(score, wave) {
    if (wave <= 0 || score <= 0) return;
    const list = loadRank();
    list.push({
      score,
      wave,
      base: BASES[baseKey].label,
      mode: isVs() ? 'vsIA' : 'solo',
      date: new Date().toISOString().slice(0, 10),
    });
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, 10);
    try { localStorage.setItem(RANK_KEY, JSON.stringify(top)); } catch { /* ignore */ }
    renderRank();
  }

  function bestScore() {
    const list = loadRank();
    return list.length ? list[0].score : 0;
  }

  function renderRank() {
    const list = loadRank();
    if (!list.length) {
      rankList.innerHTML = '<li class="empty">Sem partidas ainda</li>';
    } else {
      rankList.innerHTML = list
        .slice(0, 10)
        .map((e, i) => `<li>#${i + 1} ${e.score} pts · onda ${e.wave} <span style="opacity:.5">${e.mode === 'vsIA' ? 'vsIA' : e.base || ''} ${e.date || ''}</span></li>`)
        .join('');
    }
    recordeEl.textContent = `Recorde: ${bestScore()}`;
  }

  function pointOnPath(pathKey, dist, sideLane) {
    const PATH = isVs() ? vsPaths[sideLane || pathKey] : PATHS[pathKey];
    let left = Math.max(0, dist);
    for (let i = 1; i < PATH.length; i++) {
      const a = PATH[i - 1], b = PATH[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (left <= seg) {
        const t = left / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      left -= seg;
    }
    const end = PATH[PATH.length - 1];
    return { x: end.x, y: end.y };
  }

  function dist2(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function nearSinglePath(path, x, y, tol) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const len2 = dist2(a, b) || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / len2));
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      if (Math.hypot(x - px, y - py) < tol) return true;
    }
    return false;
  }

  function nearPath(x, y, tol = 26) {
    if (isVs()) return nearSinglePath(vsPaths.left, x, y, tol);
    return nearSinglePath(PATHS.a, x, y, tol) || nearSinglePath(PATHS.b, x, y, tol);
  }

  function towerUnderMouse() {
    if (!mouse.on || !state) return null;
    const towers = isVs() ? state.player.towers : state.towers;
    let best = null;
    let bestD = 18;
    for (const t of towers) {
      const d = Math.hypot(t.x - mouse.x, t.y - mouse.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  function placeOk(x, y) {
    if (nearPath(x, y)) return false;
    const towers = isVs() ? state.player.towers : state.towers;
    if (towers.some((t) => Math.hypot(t.x - x, t.y - y) < 40)) return false;
    if (x < 16 || y < 16 || x > W - 16 || y > H - 16) return false;
    if (isVs() && x >= MID - 8) return false;
    return true;
  }

  function syncTowerChips() {
    document.querySelectorAll('[data-tower]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tower') === selectedTower && !bombMode);
    });
    btnHero.classList.toggle('active', selectedTower === 'hero' && !bombMode);
  }

  function updateTowerCard() {
    const def = TOWERS[selectedTower];
    if (!def) return;
    const bar = (n) => '●'.repeat(n) + '○'.repeat(Math.max(0, 5 - n));
    towerCard.innerHTML =
      `<strong>${def.glyph} ${def.name}</strong><br />` +
      `Força ${bar(def.forca)} (${def.forca})<br />` +
      `Alcance ${bar(def.alcance)} (${def.alcance})<br />` +
      `Cadência ${bar(def.cadencia)} (${def.cadencia})` +
      (def.slow ? `<br />Efeito: lentidão` : '') +
      (def.aoe ? `<br />Efeito: AOE` : '');
  }

  function placeTower(x, y) {
    if (onlineActive) {
      if (!onlineSend || !state || state.over) return;
      if (bombMode) {
        onlineSend({ type: 'command', command: { kind: 'bomb', x, y } });
        bombMode = false;
        updatePowerBtns();
        return;
      }
      onlineSend({ type: 'command', command: { kind: 'place', tower: selectedTower, x, y } });
      return;
    }
    if (!missionStarted || !state || state.over || activeSide().pendingUpgrade) return;
    if (isVs() && state.pendingPack) return;
    if (bombMode) { detonateBomb(x, y); return; }
    const side = state.player;
    const kind = selectedTower;
    const def = TOWERS[kind];
    if (!def) return;
    if (kind === 'hero') {
      if (side.heroPlaced || side.gold < HERO_COST || !placeOk(x, y)) return;
      side.gold -= HERO_COST;
      side.towers.push({ x, y, cooldown: 0, kind: 'hero' });
      side.heroPlaced = true;
      selectedTower = 'laser';
      syncTowerChips();
      updateHeroBtn();
      return;
    }
    if (side.gold < def.cost || !placeOk(x, y)) return;
    side.gold -= def.cost;
    side.towers.push({ x, y, cooldown: 0, kind });
  }

  function enemyHpBonus(wave) {
    let bonus = Math.floor(wave / 2);
    if (wave > 8) bonus += (wave - 8) * 2;
    return bonus;
  }

  function difficultyForWave(wave) {
    if (wave <= 3) return 'Fácil';
    if (wave <= 6) return 'Média';
    if (wave <= 9) return 'Difícil';
    return 'Brutal';
  }

  function enemyCountForWave(wave) {
    let count = 5 + wave * 2;
    if (wave >= 3) count += 2;
    if (wave >= 8) count += 3;
    return count;
  }

  function createWaveQueue(wave) {
    const queue = [];
    const pattern = ['ufo', 'alien', 'virus', 'ufo', 'predador', 'alien', 'virus'];
    const count = enemyCountForWave(wave);
    for (let i = 0; i < count; i++) {
      let type = pattern[i % pattern.length];
      if (wave >= 3 && Math.random() < Math.min(0.35, 0.05 + wave * 0.03)) type = 'predador';
      queue.push(type);
    }
    const bosses = R.bossCount(wave);
    for (let i = 0; i < bosses; i += 1) queue.push('boss');
    return queue;
  }

  function startWave() {
    if (!missionStarted || !state) return;
    if (isVs()) {
      if (state.nextWaveSummary) { beginNextWave(); return; }
      if (state.spawning || state.player.enemies.length || state.ai.enemies.length || state.over || state.pendingPack) return;
      if (state.player.pendingUpgrade) return;
      openPackModal();
      return;
    }
    if (state.nextWaveSummary) { beginNextWave(); return; }
    if (state.spawning || state.enemies.length || state.over || state.pendingUpgrade) return;
    state.wave += 1;
    state.wonWave = false;
    state.waveGold = 0;
    state.waveScore = 0;
    state.vidaBoughtThisWave = false;
    updateVidaBtn();
    state.spawning = { queue: createWaveQueue(state.wave), timer: 0 };
  }

  function beginNextWave() {
    if (onlineActive) return;
    if (!state || !state.nextWaveSummary || state.over) return;
    if (!isVs() && state.pendingUpgrade) return;
    if (isVs() && state.player.pendingUpgrade) return;
    state.nextWaveSummary = null;
    waveSummary.classList.remove('open');
    paused = false;
    if (isVs()) openPackModal();
    else startWave();
  }

  function openPackModal() {
    if (!isVs() || state.over) return;
    state.pendingPack = true;
    paused = true;
    packModal.classList.add('open');
    updateActionButtons();
  }

  function aiPickPack() {
    const towers = state.player.towers;
    const counts = { laser: 0, escudo: 0, sonda: 0, hero: 0 };
    for (const t of towers) counts[t.kind] = (counts[t.kind] || 0) + 1;
    const total = towers.length;
    if (total === 0) return 'mista';
    if (counts.laser >= counts.escudo + counts.sonda) return 'pesada';
    if (counts.escudo > counts.sonda && counts.escudo >= counts.laser) return 'leve';
    if (counts.sonda >= 2 && counts.laser < 2) return 'leve';
    if (state.player.hp <= state.player.maxHp * 0.4) return 'pesada';
    return 'mista';
  }

  function choosePlayerPack(packId) {
    if (onlineActive) {
      if (onlineSend && ATTACK_PACKS[packId]) onlineSend({ type: 'command', command: { kind: 'pack', pack: packId } });
      return;
    }
    if (!isVs() || !state.pendingPack || !ATTACK_PACKS[packId]) return;
    state.playerPack = packId;
    state.aiPack = aiPickPack();
    state.pendingPack = false;
    packModal.classList.remove('open');
    launchVsWave();
  }

  function launchVsWave() {
    state.wave += 1;
    state.wonWave = false;
    state.player.waveGold = 0;
    state.player.waveScore = 0;
    state.ai.waveGold = 0;
    state.ai.waveScore = 0;
    state.player.vidaBoughtThisWave = false;
    state.ai.vidaBoughtThisWave = false;
    updateVidaBtn();
    const pQueue = ATTACK_PACKS[state.playerPack].build(state.wave);
    const aQueue = ATTACK_PACKS[state.aiPack].build(state.wave);
    state.spawning = {
      playerLaneQueue: aQueue.slice(),
      aiLaneQueue: pQueue.slice(),
      timer: 0,
      nextSide: 'player',
    };
    paused = false;
    aiBuildTimer = 0.5;
    updateActionButtons();
  }

  function updateWaveSummaryDisplay() {
    const summary = state.nextWaveSummary;
    if (!summary) return;
    if (isVs()) {
      waveSummaryStats.innerHTML = [
        `<div class="summary-stat">Seu ouro<strong>+$${summary.gold}</strong></div>`,
        `<div class="summary-stat">Sua pontuação<strong>+${summary.score}</strong></div>`,
        `<div class="summary-stat">Pack IA<strong>${summary.aiPack || '—'}</strong></div>`,
        `<div class="summary-stat">Próxima<strong>${summary.difficulty}</strong></div>`,
      ].join('');
    } else {
      waveSummaryStats.innerHTML = [
        `<div class="summary-stat">Ouro ganho<strong>+$${summary.gold}</strong></div>`,
        `<div class="summary-stat">Pontuação<strong>+${summary.score}</strong></div>`,
        `<div class="summary-stat">Próxima dificuldade<strong>${summary.difficulty}</strong></div>`,
        `<div class="summary-stat">Inimigos<strong>${summary.enemyCount}</strong></div>`,
      ].join('');
    }
    const seconds = Math.max(0, Math.ceil(summary.remaining));
    waveSummaryCountdown.textContent = `${paused ? 'Pausado · ' : ''}Próxima onda em ${seconds}s`;
  }

  function openWaveSummary() {
    if (!state || state.over || state.nextWaveSummary) return;
    if (!isVs() && state.pendingUpgrade) return;
    if (isVs() && state.player.pendingUpgrade) return;
    const nextWave = state.wave + 1;
    if (isVs()) {
      state.nextWaveSummary = {
        remaining: 5,
        gold: state.player.waveGold,
        score: state.player.waveScore,
        difficulty: difficultyForWave(nextWave),
        aiPack: ATTACK_PACKS[state.aiPack]?.name || state.aiPack,
      };
    } else {
      const enemyCount = R.previewEnemyCount(nextWave);
      state.nextWaveSummary = {
        remaining: 5,
        gold: state.waveGold,
        score: state.waveScore,
        difficulty: difficultyForWave(nextWave),
        enemyCount,
      };
    }
    paused = false;
    updateWaveSummaryDisplay();
    waveSummary.classList.add('open');
    updateActionButtons();
  }

  function spawnOneSolo(typeKey) {
    const t = ENEMY_TYPES[typeKey];
    const diff = DIFFS[diffKey];
    const strength = 0.9 + Math.random() * 0.2;
    const hp = Math.max(1, Math.round((t.hp + enemyHpBonus(state.wave)) * strength * diff.hpMul));
    const pathKey = Math.random() < 0.5 ? 'a' : 'b';
    state.enemies.push({
      type: typeKey, pathKey, lane: null, strength, hp, maxHp: hp,
      speed: t.speed * (1 + state.wave * 0.05) * (0.96 + strength * 0.04) * diff.speedMul,
      baseSpeed: 0,
      reward: Math.max(1, Math.round(t.reward * (0.9 + strength * 0.1) * diff.goldMul)),
      armor: t.armor, dist: 0, alive: true, slowTimer: 0, slowMul: 1,
    });
    const e = state.enemies[state.enemies.length - 1];
    e.baseSpeed = e.speed;
  }

  function spawnOneVs(typeKey, lane) {
    const t = ENEMY_TYPES[typeKey];
    const diff = DIFFS[diffKey];
    const strength = 0.9 + Math.random() * 0.2;
    const hp = Math.max(1, Math.round((t.hp + enemyHpBonus(state.wave)) * strength * diff.hpMul));
    const side = lane === 'left' ? state.player : state.ai;
    side.enemies.push({
      type: typeKey, pathKey: lane, lane, strength, hp, maxHp: hp,
      speed: t.speed * (1 + state.wave * 0.05) * (0.96 + strength * 0.04) * diff.speedMul,
      baseSpeed: 0,
      reward: Math.max(1, Math.round(t.reward * (0.9 + strength * 0.1) * diff.goldMul)),
      armor: t.armor, dist: 0, alive: true, slowTimer: 0, slowMul: 1,
    });
    const e = side.enemies[side.enemies.length - 1];
    e.baseSpeed = e.speed;
  }

  function upgradeStacks(id, side) {
    return (side || activeSide()).upgrades.counts[id] || 0;
  }

  function shuffledOptions(side) {
    const available = [...UPGRADE_OPTIONS]
      .filter((option) => upgradeStacks(option.id, side) < UPGRADE_CAP)
      .sort(() => Math.random() - 0.5);
    const choices = available.slice(0, 3);
    if (choices.length < 3) {
      choices.push(...[...FALLBACK_OPTIONS].sort(() => Math.random() - 0.5).slice(0, 3 - choices.length));
    }
    return choices;
  }

  function openUpgradeModal() {
    const side = activeSide();
    if (!state || state.over || side.pendingUpgrade) return;
    side.pendingUpgrade = shuffledOptions(side);
    paused = true;
    upgradeChoicesEl.replaceChildren();
    const progress = side.goldEarned % UPGRADE_MILESTONE;
    upgradeProgressEl.textContent = `Ouro ganho nesta run: $${side.goldEarned}. Próximo progresso: $${progress}/${UPGRADE_MILESTONE}.`;
    for (const option of side.pendingUpgrade) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'upgrade-choice';
      const title = document.createElement('strong');
      const stacks = document.createElement('span');
      stacks.textContent = `${option.title}${UPGRADE_OPTIONS.includes(option) ? ` · ${upgradeStacks(option.id, side)}/${UPGRADE_CAP}` : ''}`;
      title.append(stacks);
      const description = document.createElement('span');
      description.textContent = option.description;
      button.append(title, description);
      button.addEventListener('click', () => chooseUpgrade(option.id));
      upgradeChoicesEl.append(button);
    }
    upgradeModal.classList.add('open');
    updateActionButtons();
  }

  function chooseUpgrade(id) {
    if (onlineActive) {
      if (onlineSend) onlineSend({ type: 'command', command: { kind: 'upgrade', upgradeId: id } });
      return;
    }
    const side = activeSide();
    if (!side.pendingUpgrade) return;
    const option = side.pendingUpgrade.find((candidate) => candidate.id === id);
    if (!option) return;
    if (UPGRADE_OPTIONS.includes(option)) {
      if (upgradeStacks(option.id, side) >= UPGRADE_CAP) return;
      option.apply(side);
      side.upgrades.counts[option.id] += 1;
    } else {
      option.apply(side);
    }
    side.pendingUpgrade = null;
    upgradeModal.classList.remove('open');
    if (Math.floor(side.goldEarned / UPGRADE_MILESTONE) > side.goldUpgradeLevel) {
      side.goldUpgradeLevel += 1;
      openUpgradeModal();
    } else {
      paused = false;
      const clear = isVs()
        ? (!state.spawning && state.player.enemies.length === 0 && state.ai.enemies.length === 0)
        : (!state.spawning && state.enemies.length === 0);
      if (state.wonWave && !state.nextWaveSummary && clear) openWaveSummary();
    }
    updateActionButtons();
  }

  function recordGoldEarned(side, amount) {
    if (amount <= 0) return;
    side.goldEarned += amount;
    if (state.wave > 0) side.waveGold += amount;
    if (side === state.player && Math.floor(side.goldEarned / UPGRADE_MILESTONE) > side.goldUpgradeLevel && !side.pendingUpgrade) {
      side.goldUpgradeLevel += 1;
      openUpgradeModal();
    } else if (state.ai && side === state.ai && gameMode === 'vsia') {
      aiResolveUpgrades();
    }
  }

  let aiUpgrading = false;
  function aiResolveUpgrades() {
    if (aiUpgrading || !state || !state.ai || gameMode !== 'vsia') return;
    aiUpgrading = true;
    try {
      const ai = state.ai;
      while (Math.floor(ai.goldEarned / UPGRADE_MILESTONE) > ai.goldUpgradeLevel && !state.over) {
        ai.goldUpgradeLevel += 1;
        const choices = shuffledOptions(ai);
        const option = choices[0];
        if (!option) break;
        option.apply(ai);
        if (UPGRADE_OPTIONS.includes(option)) {
          ai.upgrades.counts[option.id] = (ai.upgrades.counts[option.id] || 0) + 1;
        }
      }
    } finally {
      aiUpgrading = false;
    }
  }

  function addGoldTo(side, amount) {
    side.gold += amount;
    recordGoldEarned(side, amount);
  }

  function addGold(amount) { addGoldTo(activeSide(), amount); }

  function killEnemy(e, side) {
    if (!e.alive) return;
    e.alive = false;
    const reward = Math.round(e.reward * side.upgrades.global.killGold);
    addGoldTo(side, reward);
    side.score += e.reward;
    side.waveScore += e.reward;
  }

  function applyDamage(e, rawDamage, side) {
    if (!e.alive) return;
    const damage = Math.max(1, rawDamage - (e.armor || 0));
    e.hp -= damage;
    if (e.hp <= 0) killEnemy(e, side);
  }

  function detonateBomb(x, y) {
    if (onlineActive) return;
    const side = state.player;
    if (side.gold < BOMB_COST || side.bombCd > 0) return;
    if (isVs() && x >= MID) return;
    side.gold -= BOMB_COST;
    side.bombCd = 2.5;
    bombMode = false;
    fx.push({ x, y, r: 0, maxR: BOMB_RADIUS, life: 0.35, color: 'rgba(251,146,60,0.45)' });
    for (const e of side.enemies) {
      if (!e.alive) continue;
      const p = pointOnPath(e.pathKey, e.dist, e.lane);
      if (Math.hypot(p.x - x, p.y - y) <= BOMB_RADIUS) applyDamage(e, 8, side);
    }
    updatePowerBtns();
  }

  function activateFreeze() {
    if (onlineActive) {
      if (onlineSend) onlineSend({ type: 'command', command: { kind: 'freeze' } });
      return;
    }
    if (!missionStarted || !state || state.over || activeSide().pendingUpgrade) return;
    const side = state.player;
    if (side.gold < FREEZE_COST || side.freezeCd > 0) return;
    side.gold -= FREEZE_COST;
    side.freezeCd = 8;
    freezeTimer = FREEZE_DURATION;
    fx.push({ x: isVs() ? MID / 2 : W / 2, y: H / 2, r: 0, maxR: isVs() ? 160 : 220, life: 0.4, color: 'rgba(125,211,252,0.25)' });
    updatePowerBtns();
  }

  function buyVida() {
    if (onlineActive) {
      if (onlineSend) onlineSend({ type: 'command', command: { kind: 'shield' } });
      return;
    }
    if (!missionStarted || !state || state.over || activeSide().pendingUpgrade) return;
    const side = state.player;
    if (side.vidaBoughtThisWave || side.gold < VIDA_COST) return;
    side.gold -= VIDA_COST;
    side.hp += VIDA_BONUS;
    side.maxHp = Math.max(side.maxHp, side.hp);
    side.vidaBoughtThisWave = true;
    updateVidaBtn();
  }

  function updateVidaBtn() {
    const side = state ? state.player : null;
    const busy = !missionStarted || !side || state.over || !!side.pendingUpgrade || (isVs() && state.pendingPack);
    btnVida.disabled = busy || !side || side.vidaBoughtThisWave || side.gold < VIDA_COST;
    btnVida.textContent = side && side.vidaBoughtThisWave ? '+Escudo (usado)' : `+Escudo ($${VIDA_COST})`;
  }

  function updateHeroBtn() {
    const side = state ? state.player : null;
    const busy = !missionStarted || !side || state.over || !!side.pendingUpgrade || (isVs() && state.pendingPack);
    btnHero.disabled = busy || !side || side.heroPlaced;
    btnHero.textContent = side && side.heroPlaced ? '🚀 Herói (no mapa)' : `🚀 Herói ($${HERO_COST})`;
  }

  function updatePowerBtns() {
    const side = state ? state.player : null;
    const busy = !missionStarted || !side || state.over || !!side.pendingUpgrade || (isVs() && state.pendingPack);
    btnBomb.disabled = busy || !side || side.gold < BOMB_COST || side.bombCd > 0;
    btnFreeze.disabled = busy || !side || side.gold < FREEZE_COST || side.freezeCd > 0;
    btnBomb.textContent = side && side.bombCd > 0
      ? `💣 Bomba (${Math.ceil(side.bombCd)}s)`
      : bombMode ? '💣 Clique no mapa!' : `💣 Bomba ($${BOMB_COST})`;
    btnFreeze.textContent = side && side.freezeCd > 0
      ? `❄ Congelar (${Math.ceil(side.freezeCd)}s)`
      : freezeTimer > 0 ? `❄ Congelado…` : `❄ Congelar ($${FREEZE_COST})`;
  }

  function updateActionButtons() {
    const side = state ? state.player : null;
    const pending = side && side.pendingUpgrade;
    const pack = isVs() && state && state.pendingPack;
    btnStart.disabled = !missionStarted || !state || state.over || !!pending || !!state.nextWaveSummary || !!pack;
    btnPause.disabled = !missionStarted || !state || state.over || !!pending || !!pack;
    btnPause.textContent = paused ? 'Retomar' : 'Pausar';
    btnStart.textContent = isVs() ? 'Onda / Pack' : 'Onda';
    updateVidaBtn();
    updateHeroBtn();
    updatePowerBtns();
  }

  function togglePause() {
    if (onlineActive) return;
    if (!missionStarted || !state || state.over || activeSide().pendingUpgrade) return;
    if (isVs() && state.pendingPack) return;
    paused = !paused;
    if (state.nextWaveSummary) updateWaveSummaryDisplay();
    updateActionButtons();
  }

  function maybeSaveRank() {
    if (rankSaved || !state || state.wave <= 0) return;
    rankSaved = true;
    saveRankEntry(state.player.score, state.wave);
  }

  function showWinner(winner) {
    state.over = true;
    state.winner = winner;
    maybeSaveRank();
    if (winner === 'player') {
      winnerTitle.textContent = 'Vitória!';
      winnerBody.textContent = `A base da IA caiu. Você: ${state.player.score} pts · Onda ${state.wave}.`;
    } else {
      winnerTitle.textContent = 'Derrota';
      winnerBody.textContent = `Sua base caiu. IA: ${state.ai.score} pts · Você: ${state.player.score} pts · Onda ${state.wave}.`;
    }
    winnerOverlay.classList.add('open');
    updateActionButtons();
  }

  function beginMissionSolo() {
    gameMode = 'solo';
    missionStarted = true;
    startScreen.classList.remove('open');
    state = freshSoloState();
    paused = false; hitFlash = 0; hitFlashAi = 0; rankSaved = false;
    bombMode = false; freezeTimer = 0; fx = [];
    upgradeModal.classList.remove('open');
    waveSummary.classList.remove('open');
    packModal.classList.remove('open');
    winnerOverlay.classList.remove('open');
    selectedTower = 'laser';
    syncTowerChips(); updateTowerCard(); syncModeUi(); updateActionButtons();
    mapSelect.disabled = !canChangeMap();
  }

  function beginMissionVs() {
    gameMode = 'vsia';
    missionStarted = true;
    startScreen.classList.remove('open');
    state = freshVsState();
    paused = false; hitFlash = 0; hitFlashAi = 0; rankSaved = false;
    bombMode = false; freezeTimer = 0; fx = []; aiBuildTimer = 0;
    recomputeVsPaths();
    upgradeModal.classList.remove('open');
    waveSummary.classList.remove('open');
    packModal.classList.remove('open');
    winnerOverlay.classList.remove('open');
    selectedTower = 'laser';
    syncTowerChips(); updateTowerCard(); syncModeUi(); updateActionButtons();
    openPackModal();
  }

  function resetGame() {
    if (missionStarted && state && state.wave > 0 && !rankSaved) maybeSaveRank();
    missionStarted = false;
    gameMode = 'solo';
    startScreen.classList.add('open');
    state = freshSoloState();
    paused = false; hitFlash = 0; hitFlashAi = 0; rankSaved = false;
    bombMode = false; freezeTimer = 0; fx = [];
    upgradeModal.classList.remove('open');
    waveSummary.classList.remove('open');
    packModal.classList.remove('open');
    winnerOverlay.classList.remove('open');
    syncStartBranch(); syncModeUi(); updateActionButtons();
    mapSelect.disabled = true;
  }

  function aiTryBuild() {
    if (!isVs() || state.over || paused || gameMode !== 'vsia') return;
    const ai = state.ai;
    if (R.shouldBuyShield(ai)) {
      ai.gold -= VIDA_COST;
      ai.hp += VIDA_BONUS;
      ai.maxHp = Math.max(ai.maxHp, ai.hp);
      ai.vidaBoughtThisWave = true;
    }
    let prefer = 'laser';
    if (state.playerPack === 'pesada') prefer = 'sonda';
    else if (state.playerPack === 'leve') prefer = 'escudo';
    else prefer = Math.random() < 0.5 ? 'laser' : 'escudo';
    const order = [prefer, 'laser', 'escudo', 'sonda'];
    if (!ai.heroPlaced && ai.gold >= HERO_COST && state.wave >= 3) order.unshift('hero');
    for (const kind of order) {
      const def = TOWERS[kind];
      const cost = kind === 'hero' ? HERO_COST : def.cost;
      if (ai.gold < cost) continue;
      if (kind === 'hero' && ai.heroPlaced) continue;
      const free = AI_BUILD_SPOTS.filter((s) =>
        !ai.towers.some((t) => Math.hypot(t.x - s.x, t.y - s.y) < 40) &&
        !nearSinglePath(vsPaths.right, s.x, s.y, 26)
      );
      if (!free.length) continue;
      const spot = free[Math.floor(Math.random() * free.length)];
      ai.gold -= cost;
      ai.towers.push({ x: spot.x, y: spot.y, cooldown: 0, kind });
      if (kind === 'hero') ai.heroPlaced = true;
      break;
    }
  }

  function updateSideCombat(side, dt, frozen) {
    for (const e of side.enemies) {
      if (!e.alive) continue;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slowMul = 1;
      }
      const thisFrozen = frozen && (!isVs() || e.lane === 'left' || e.lane == null);
      const mul = thisFrozen ? 0 : e.slowMul;
      e.dist += e.baseSpeed * mul * dt;
      const pathLen = isVs() ? vsPathLens[e.lane] : PATH_LENS[e.pathKey];
      if (e.dist >= pathLen) {
        e.alive = false;
        side.hp -= e.type === 'boss' ? 3 : 1;
        if (side === state.player) hitFlash = 0.35;
        else hitFlashAi = 0.35;
        if (side.hp <= 0) {
          side.hp = 0;
          if (isVs()) showWinner(side === state.player ? 'ai' : 'player');
          else { state.over = true; maybeSaveRank(); }
        }
      }
    }
    side.enemies = side.enemies.filter((e) => e.alive);

    for (const t of side.towers) {
      const def = TOWERS[t.kind];
      const stats = towerStats(t.kind, side);
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      let target = null;
      let best = -1;
      for (const e of side.enemies) {
        const p = pointOnPath(e.pathKey, e.dist, e.lane);
        if (dist2(t, p) <= stats.range * stats.range && e.dist >= best) {
          best = e.dist;
          target = e;
        }
      }
      if (target) {
        const p = pointOnPath(target.pathKey, target.dist, target.lane);
        side.bullets.push({
          x: t.x, y: t.y, tx: p.x, ty: p.y,
          target, damage: stats.damage, color: def.color, life: 0.28,
          slow: stats.slow, aoe: stats.aoe, kind: t.kind,
        });
        t.cooldown = 1 / stats.rate;
      }
    }

    for (const b of side.bullets) {
      b.life -= dt;
      const p = b.target.alive
        ? pointOnPath(b.target.pathKey, b.target.dist, b.target.lane)
        : { x: b.tx, y: b.ty };
      b.tx = p.x; b.ty = p.y;
      const dx = b.tx - b.x, dy = b.ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const spd = 400 * dt;
      if (d <= spd || b.life <= 0) {
        if (b.aoe > 0) {
          fx.push({ x: b.tx, y: b.ty, r: 0, maxR: b.aoe, life: 0.28, color: 'rgba(240,193,74,0.35)' });
          for (const e of side.enemies) {
            if (!e.alive) continue;
            const ep = pointOnPath(e.pathKey, e.dist, e.lane);
            if (Math.hypot(ep.x - b.tx, ep.y - b.ty) <= b.aoe) {
              applyDamage(e, b.damage, side);
              if (b.slow > 0 && e.alive) {
                e.slowMul = Math.min(e.slowMul, 1 - b.slow);
                e.slowTimer = 1.2;
              }
            }
          }
        } else if (b.target.alive) {
          applyDamage(b.target, b.damage, side);
          if (b.slow > 0 && b.target.alive) {
            b.target.slowMul = Math.min(b.target.slowMul, 1 - b.slow);
            b.target.slowTimer = 1.4;
          }
        }
        b.dead = true;
      } else {
        b.x += (dx / d) * spd;
        b.y += (dy / d) * spd;
      }
    }
    side.bullets = side.bullets.filter((b) => !b.dead);
    side.enemies = side.enemies.filter((e) => e.alive);
  }

  function update(dt) {
    if (!state) return;
    if (onlineActive) {
      for (const f of fx) f.life -= dt;
      fx = fx.filter((item) => item.life > 0);
      return;
    }
    if (hitFlash > 0) hitFlash = Math.max(0, hitFlash - dt);
    if (hitFlashAi > 0) hitFlashAi = Math.max(0, hitFlashAi - dt);
    const side = state.player;
    if (side.bombCd > 0) side.bombCd = Math.max(0, side.bombCd - dt);
    if (side.freezeCd > 0) side.freezeCd = Math.max(0, side.freezeCd - dt);
    if (freezeTimer > 0) freezeTimer = Math.max(0, freezeTimer - dt);

    for (const f of fx) f.life -= dt;
    fx = fx.filter((f) => f.life > 0);

    if (state.nextWaveSummary) {
      if (!paused) {
        state.nextWaveSummary.remaining = Math.max(0, state.nextWaveSummary.remaining - dt);
        if (state.nextWaveSummary.remaining <= 0) beginNextWave();
        else updateWaveSummaryDisplay();
      } else {
        updateWaveSummaryDisplay();
      }
    }
    if (!missionStarted || paused || state.over || side.pendingUpgrade) return;
    if (isVs() && state.pendingPack) return;

    if (isVs()) {
      if (state.spawning) {
        state.spawning.timer -= dt;
        if (state.spawning.timer <= 0) {
          const sp = state.spawning;
          const tryPlayer = sp.playerLaneQueue.length > 0;
          const tryAi = sp.aiLaneQueue.length > 0;
          if (!tryPlayer && !tryAi) {
            state.spawning = null;
          } else {
            if (sp.nextSide === 'player' && tryPlayer) {
              spawnOneVs(sp.playerLaneQueue.shift(), 'left');
              sp.nextSide = 'ai';
            } else if (tryAi) {
              spawnOneVs(sp.aiLaneQueue.shift(), 'right');
              sp.nextSide = 'player';
            } else if (tryPlayer) {
              spawnOneVs(sp.playerLaneQueue.shift(), 'left');
            }
            sp.timer = 0.42;
          }
        }
      }

      aiBuildTimer -= dt;
      if (aiBuildTimer <= 0) {
        aiTryBuild();
        aiBuildTimer = 1.8 + Math.random();
      }

      const frozen = freezeTimer > 0;
      updateSideCombat(state.player, dt, frozen);
      if (state.over) return;
      updateSideCombat(state.ai, dt, false);
      if (state.over) return;

      if (!state.player.pendingUpgrade && !state.spawning &&
          state.player.enemies.length === 0 && state.ai.enemies.length === 0 &&
          state.wave > 0 && !state.wonWave) {
        state.wonWave = true;
        const bonus = 12 + state.wave * 3;
        addGoldTo(state.player, bonus);
        state.player.score += bonus;
        state.player.waveScore += bonus;
        addGoldTo(state.ai, bonus);
        state.ai.score += bonus;
        if (!state.player.pendingUpgrade) openWaveSummary();
        updateVidaBtn();
      }
    } else {
      if (state.spawning) {
        state.spawning.timer -= dt;
        if (state.spawning.timer <= 0) {
          if (state.spawning.queue.length) {
            spawnOneSolo(state.spawning.queue.shift());
            state.spawning.timer = 0.48;
          } else {
            state.spawning = null;
          }
        }
      }

      updateSideCombat(state.player, dt, freezeTimer > 0);

      if (!state.pendingUpgrade && !state.spawning && state.enemies.length === 0 && state.wave > 0 && !state.wonWave) {
        state.wonWave = true;
        const bonus = 12 + state.wave * 3;
        addGold(bonus);
        state.score += bonus;
        state.waveScore += bonus;
        if (!state.pendingUpgrade) openWaveSummary();
        updateVidaBtn();
      }

      mapSelect.disabled = !canChangeMap();
    }
  }

  function drawHearts() {
    if (!state) return;
    const side = state.player;
    const full = Math.max(0, Math.min(10, Math.ceil(side.hp / 2)));
    const empty = Math.max(0, 10 - full);
    hpHearts.textContent = '◆'.repeat(full) + '◇'.repeat(empty);
    const pct = Math.max(0, Math.min(1, side.hp / Math.max(1, side.maxHp)));
    hpFill.style.width = `${pct * 100}%`;
    hpFill.style.background = side.hp <= 5 ? '#ff6b6b' : side.hp <= 10 ? '#f0c14a' : '#4ade80';
    if (isVs()) {
      const ai = state.ai;
      const fullA = Math.max(0, Math.min(10, Math.ceil(ai.hp / 2)));
      hpHeartsAi.textContent = '◆'.repeat(fullA) + '◇'.repeat(Math.max(0, 10 - fullA));
      const pctA = Math.max(0, Math.min(1, ai.hp / Math.max(1, ai.maxHp)));
      hpFillAi.style.width = `${pctA * 100}%`;
      hpFillAi.style.background = ai.hp <= 5 ? '#ff6b6d' : ai.hp <= 10 ? '#f0c14a' : '#f472b6';
    }
  }

  function drawRangeRing(x, y, range, ok) {
    ctx.strokeStyle = ok ? 'rgba(125,211,252,0.35)' : 'rgba(255,100,100,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ok ? 'rgba(125,211,252,0.08)' : 'rgba(255,100,100,0.08)';
    ctx.fill();
  }

  function drawPath(path, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.stroke();
  }

  function drawStars() {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + 13) % W;
      const y = (i * 53 + 29) % H;
      ctx.fillRect(x, y, (i % 3) + 1, (i % 3) + 1);
    }
  }

  function drawEnemy(e) {
    const p = pointOnPath(e.pathKey, e.dist, e.lane);
    const typ = ENEMY_TYPES[e.type];
    const size = typ.size;
    ctx.fillStyle = typ.color;
    ctx.strokeStyle = freezeTimer > 0 && (!isVs() || e.lane === 'left' || e.lane == null) ? '#7dd3fc' : typ.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = `${Math.max(12, size)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(typ.emoji, p.x, p.y + 4);
    ctx.fillStyle = '#111';
    ctx.fillRect(p.x - size, p.y - size - 7, size * 2, 3);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(p.x - size, p.y - size - 7, size * 2 * (e.hp / e.maxHp), 3);
    if (e.armor > 0) {
      const chipX = p.x + size + 3;
      const chipY = p.y - size - 8;
      ctx.fillStyle = '#172033';
      ctx.fillRect(chipX, chipY, 21, 11);
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 1;
      ctx.strokeRect(chipX, chipY, 21, 11);
      ctx.fillStyle = '#dbeafe';
      ctx.font = 'bold 8px system-ui';
      ctx.fillText(`A${e.armor}`, chipX + 10.5, chipY + 8);
    }
    if (e.slowMul < 1) {
      ctx.fillStyle = '#a78bfa';
      ctx.font = '9px system-ui';
      ctx.fillText('❄', p.x - size - 6, p.y);
    }
  }

  function drawTowers(towers, side) {
    const hovered = towerUnderMouse();
    const showAll = showRangeEl.checked;
    for (const t of towers) {
      const def = TOWERS[t.kind];
      const stats = towerStats(t.kind, side);
      if (showAll || t === hovered) drawRangeRing(t.x, t.y, stats.range, true);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.kind === 'hero' ? 16 : 13, 0, Math.PI * 2);
      ctx.fill();
      if (t.kind === 'hero') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = '#0b0e18';
      ctx.font = t.kind === 'hero' ? '14px system-ui' : '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(def.glyph, t.x, t.y + 4);
    }
  }

  function drawBaseAt(x, y, side, emoji, accent) {
    const lowHp = side.hp <= 5;
    ctx.fillStyle = lowHp ? '#ff4d6d' : accent;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = lowHp ? '#ffb3c1' : '#a5b4ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * side.hp) / Math.max(1, side.maxHp));
    ctx.stroke();
    ctx.font = '15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(emoji, x, y + 2);
    ctx.font = '9px system-ui';
    ctx.fillText(String(side.hp), x, y + 16);
  }

  function drawBullets(list) {
    for (const b of list) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.aoe ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.tx, b.ty);
      ctx.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawStars();

    if (!isVs()) {
      if (mapKey === 'asteroides') {
        ctx.fillStyle = 'rgba(40,25,20,0.3)';
        ctx.fillRect(0, 0, W, H);
      } else if (mapKey === 'nebulosa') {
        ctx.fillStyle = 'rgba(40,20,60,0.28)';
        ctx.fillRect(0, 0, W, H);
      }
      drawPath(PATHS.a, '#3a4160', 22);
      drawPath(PATHS.b, '#3a4160', 22);
      drawPath(PATHS.a, '#1a2240', 14);
      drawPath(PATHS.b, '#1a2240', 14);
      ctx.fillStyle = 'rgba(165,180,255,0.5)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'left';
      if (PATHS.a[2]) ctx.fillText('A', PATHS.a[2].x - 6, PATHS.a[2].y - 12);
      if (PATHS.b[2]) ctx.fillText('B', PATHS.b[2].x - 6, PATHS.b[2].y - 12);
      const start = PATHS.a[0];
      ctx.fillStyle = '#3a4160';
      ctx.beginPath(); ctx.arc(start.x, start.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a5b4ff';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('IN', start.x, start.y - 14);
      const base = PATHS.a[PATHS.a.length - 1];
      drawBaseAt(base.x, base.y, state ? state.player : { hp: 1, maxHp: 1 }, BASES[baseKey].emoji, '#6b5cff');
      if (state) {
        drawTowers(state.towers, state.player);
        for (const e of state.enemies) drawEnemy(e);
        drawBullets(state.bullets);
      }
    } else {
      ctx.fillStyle = 'rgba(30,40,80,0.35)';
      ctx.fillRect(0, 0, MID, H);
      ctx.fillStyle = 'rgba(60,20,40,0.28)';
      ctx.fillRect(MID, 0, MID, H);
      ctx.strokeStyle = 'rgba(165,180,255,0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(MID, 0); ctx.lineTo(MID, H); ctx.stroke();
      ctx.setLineDash([]);
      drawPath(vsPaths.left, '#3a4160', 22);
      drawPath(vsPaths.right, '#3a4160', 22);
      drawPath(vsPaths.left, '#1a2240', 14);
      drawPath(vsPaths.right, '#1a2240', 14);
      ctx.fillStyle = '#a5b4ff';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('VOCÊ', MID / 2, 16);
      ctx.fillStyle = '#f9a8d4';
      ctx.fillText(onlineActive ? (state && state.opponentNick) || 'Amigo' : 'IA', MID + MID / 2, 16);
      const ls = vsPaths.left[0];
      const rs = vsPaths.right[0];
      ctx.fillStyle = '#3a4160';
      ctx.beginPath(); ctx.arc(ls.x, ls.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rs.x, rs.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a5b4ff';
      ctx.font = '9px system-ui';
      ctx.fillText('IN', ls.x, ls.y - 12);
      ctx.fillText('IN', rs.x, rs.y - 12);
      if (state) {
        const le = vsPaths.left[vsPaths.left.length - 1];
        const re = vsPaths.right[vsPaths.right.length - 1];
        drawBaseAt(le.x, le.y, state.player, BASES[baseKey].emoji, '#6b5cff');
        drawBaseAt(re.x, re.y, state.ai, onlineActive ? BASES[baseKey].emoji : '🤖', '#db2777');
        drawTowers(state.player.towers, state.player);
        drawTowers(state.ai.towers, state.ai);
        for (const e of state.player.enemies) drawEnemy(e);
        for (const e of state.ai.enemies) drawEnemy(e);
        drawBullets([...state.player.bullets, ...state.ai.bullets]);
        if (state.playerPack || state.aiPack) {
          ctx.font = '10px system-ui';
          ctx.fillStyle = 'rgba(240,193,74,0.85)';
          ctx.textAlign = 'left';
          if (state.aiPack) ctx.fillText(`← ${ATTACK_PACKS[state.aiPack].emoji} ${ATTACK_PACKS[state.aiPack].name}`, 8, H - 8);
          ctx.textAlign = 'right';
          if (state.playerPack) ctx.fillText(`${ATTACK_PACKS[state.playerPack].emoji} ${ATTACK_PACKS[state.playerPack].name} →`, W - 8, H - 8);
        }
      }
    }

    if (missionStarted && state && mouse.on && !state.over && !(isVs() && state.pendingPack)) {
      if (bombMode) {
        ctx.strokeStyle = 'rgba(251,146,60,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, BOMB_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(251,146,60,0.12)';
        ctx.fill();
        ctx.font = '18px system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fb923c';
        ctx.fillText('💣', mouse.x, mouse.y + 6);
      } else {
        const def = TOWERS[selectedTower];
        const selectedStats = towerStats(selectedTower, state.player);
        const costOk = selectedTower === 'hero'
          ? (!state.player.heroPlaced && state.player.gold >= HERO_COST)
          : state.player.gold >= def.cost;
        const ok = placeOk(mouse.x, mouse.y) && costOk;
        drawRangeRing(mouse.x, mouse.y, selectedStats.range, ok);
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = ok ? def.color : '#ff6b6b';
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0b0e18';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(def.glyph, mouse.x, mouse.y + 4);
        ctx.globalAlpha = 1;
      }
    }

    for (const f of fx) {
      const t = 1 - f.life / 0.4;
      const r = f.maxR * Math.min(1, t + 0.2);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (freezeTimer > 0) {
      ctx.fillStyle = `rgba(125,211,252,${0.08 + 0.06 * Math.sin(performance.now() / 120)})`;
      if (isVs()) ctx.fillRect(0, 0, MID, H);
      else ctx.fillRect(0, 0, W, H);
    }

    if (hitFlash > 0 || (state && state.player.hp <= 5)) {
      const a = hitFlash > 0 ? 0.25 * (hitFlash / 0.35) : (state && state.player.hp <= 5 ? 0.08 : 0);
      if (a > 0) {
        ctx.fillStyle = `rgba(180,20,40,${a})`;
        if (isVs()) ctx.fillRect(0, 0, MID, H);
        else ctx.fillRect(0, 0, W, H);
      }
    }
    if (isVs() && state && (hitFlashAi > 0 || state.ai.hp <= 5)) {
      const a = hitFlashAi > 0 ? 0.25 * (hitFlashAi / 0.35) : (state.ai.hp <= 5 ? 0.08 : 0);
      if (a > 0) {
        ctx.fillStyle = `rgba(180,20,40,${a})`;
        ctx.fillRect(MID, 0, MID, H);
      }
    }

    if (!missionStarted) {
      // start screen
    } else if (state && state.pendingPack) {
      // pack modal
    } else if (paused) {
      overlay(onlinePause
        ? `Amigo reconectando… ${Math.ceil(onlinePause.secondsLeft)}s`
        : 'Pausado');
    } else if (state && state.over && !isVs()) {
      overlay(`Base caiu — ${state.score} pts · Reset`);
    } else if (state && state.wonWave && !state.nextWaveSummary && !state.player.pendingUpgrade) {
      overlay(`Onda ${state.wave} concluída`, false);
    }

    if (missionStarted && state) {
      const sel = TOWERS[selectedTower];
      const goldProgress = state.player.goldEarned % UPGRADE_MILESTONE;
      const modeLabel = bombMode ? 'Bomba' : sel.name;
      if (isVs()) {
        const other = onlineActive ? (state.opponentNick || 'Amigo') : 'IA';
        statsEl.textContent =
          `Você HP ${state.player.hp} $${state.player.gold} · ${other} HP ${state.ai.hp} $${state.ai.gold} · Onda ${state.wave} · Pts ${state.player.score} · ${modeLabel}`;
      } else {
        statsEl.textContent =
          `HP ${state.hp} · $${state.gold} · Ouro $${goldProgress}/${UPGRADE_MILESTONE} → upgrade · Onda ${state.wave} · Pts ${state.score} · ${modeLabel}`;
      }
      drawHearts();
      updateActionButtons();
    }
  }

  function overlay(text, dark = true) {
    if (dark) {
      ctx.fillStyle = 'rgba(10,12,20,0.45)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, H / 2);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function canvasPos(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * W,
      y: ((ev.clientY - r.top) / r.height) * H,
    };
  }

  canvas.addEventListener('click', (ev) => {
    const p = canvasPos(ev);
    placeTower(p.x, p.y);
  });
  canvas.addEventListener('mousemove', (ev) => {
    const p = canvasPos(ev);
    mouse.x = p.x; mouse.y = p.y; mouse.on = true;
  });
  canvas.addEventListener('mouseleave', () => { mouse.on = false; });

  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space') {
      ev.preventDefault();
      if (state && !state.player.pendingUpgrade) togglePause();
    }
    if (ev.key === '1') { selectedTower = 'laser'; bombMode = false; }
    if (ev.key === '2') { selectedTower = 'escudo'; bombMode = false; }
    if (ev.key === '3') { selectedTower = 'sonda'; bombMode = false; }
    if (ev.key === 'h' || ev.key === 'H') {
      if (state && !state.player.heroPlaced) { selectedTower = 'hero'; bombMode = false; }
    }
    if (ev.key === 'b' || ev.key === 'B') {
      if (!btnBomb.disabled) { bombMode = !bombMode; if (bombMode) selectedTower = 'laser'; }
    }
    if (ev.key === 'f' || ev.key === 'F') activateFreeze();
    syncTowerChips();
    updateTowerCard();
    updatePowerBtns();
  });

  btnStart.onclick = startWave;
  btnPause.onclick = togglePause;
  btnNow.onclick = beginNextWave;
  document.getElementById('btnReset').onclick = resetGame;
  btnVida.onclick = buyVida;
  document.getElementById('btnBeginSolo').onclick = beginMissionSolo;
  document.getElementById('btnBeginMp').onclick = beginMissionVs;

  btnHero.onclick = () => {
    if (state && state.player.heroPlaced) return;
    selectedTower = 'hero';
    bombMode = false;
    syncTowerChips();
    updateTowerCard();
  };

  btnBomb.onclick = () => {
    if (btnBomb.disabled) return;
    bombMode = !bombMode;
    syncTowerChips();
    updatePowerBtns();
  };

  btnFreeze.onclick = activateFreeze;

  mapSelect.addEventListener('change', () => {
    if (!canChangeMap()) {
      mapSelect.value = mapKey;
      return;
    }
    mapKey = mapSelect.value;
    recomputePath();
  });

  function copySideFromNet(viewSide, previous) {
    const side = previous || freshSide();
    side.hp = viewSide.hp;
    side.maxHp = viewSide.maxHp;
    side.gold = viewSide.gold;
    side.score = viewSide.score;
    side.goldEarned = viewSide.goldEarned || 0;
    side.upgrades = viewSide.upgrades || side.upgrades;
    side.towers = (viewSide.towers || []).map((tower) => ({ x: tower.x, y: tower.y, cooldown: 0, kind: tower.kind }));
    side.enemies = (viewSide.enemies || []).map((enemy) => ({
      type: enemy.type,
      pathKey: enemy.pathKey || enemy.lane,
      lane: enemy.lane,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      armor: enemy.armor || 0,
      dist: enemy.dist,
      alive: true,
      slowMul: enemy.slowMul || 1,
      slowTimer: enemy.slowMul < 1 ? 0.4 : 0,
      strength: 1,
      speed: 0,
      baseSpeed: 0,
      reward: 0,
    }));
    side.bullets = (viewSide.bullets || []).map((bullet) => ({
      x: bullet.x, y: bullet.y, tx: bullet.tx, ty: bullet.ty,
      color: bullet.color, aoe: bullet.aoe || 0, life: 1, target: { alive: false },
    }));
    side.heroPlaced = !!viewSide.heroPlaced;
    side.bombCd = viewSide.bombCd || 0;
    side.freezeCd = viewSide.freezeCd || 0;
    side.vidaBoughtThisWave = !!viewSide.vidaBought;
    side.pendingUpgrade = null;
    return side;
  }

  function showServerUpgrade(options, goldEarned) {
    state.player.pendingUpgrade = options;
    upgradeChoicesEl.replaceChildren();
    upgradeProgressEl.textContent = `Ouro ganho nesta run: $${goldEarned || 0}. O servidor oferece estas cartas.`;
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'upgrade-choice';
      const title = document.createElement('strong');
      title.textContent = option.title;
      const description = document.createElement('span');
      description.textContent = option.description;
      button.append(title, description);
      button.addEventListener('click', () => chooseUpgrade(option.id));
      upgradeChoicesEl.append(button);
    }
    upgradeModal.classList.add('open');
  }

  function renderFriendRank(rows) {
    const box = document.getElementById('friendRankBox');
    const list = document.getElementById('friendRank');
    if (!box || !list) return;
    if (!onlineActive || !rows) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    if (!rows.length) {
      list.innerHTML = '<li class="empty">Sem partidas entre amigos</li>';
      return;
    }
    list.innerHTML = rows.slice(0, 10).map((row, index) => (
      `<li>#${index + 1} ${row.nick} · ${row.wins}V ${row.losses}D · ${row.points} pts</li>`
    )).join('');
  }

  function applyOnlineSnapshot(view) {
    onlineActive = true;
    gameMode = 'online';
    if (view.base) baseKey = view.base;
    renderFriendRank(view.ranking || []);
    if (!view.match) {
      missionStarted = false;
      startScreen.classList.add('open');
      uiBranch = 'multi';
      uiMp = 'amigo';
      syncStartBranch();
      packModal.classList.remove('open');
      upgradeModal.classList.remove('open');
      winnerOverlay.classList.remove('open');
      waveSummary.classList.remove('open');
      syncModeUi();
      return;
    }
    missionStarted = true;
    startScreen.classList.remove('open');
    if (!state || state.mode !== 'online') {
      state = freshVsState();
      state.mode = 'online';
    }
    const match = view.match;
    state.youNick = view.youNick;
    state.opponentNick = view.opponentNick || 'Amigo';
    state.wave = match.wave;
    state.over = match.phase === 'over';
    state.pendingPack = !!match.youNeedPack;
    state.playerPack = match.youPack;
    state.aiPack = match.opponentPack;
    state.player = copySideFromNet(match.you, state.player);
    state.ai = copySideFromNet(match.opponent, state.ai);
    state.winner = match.winner === 'you' ? 'player' : match.winner === 'opponent' ? 'ai' : match.winner;
    freezeTimer = match.you.freezeLeft || 0;
    if (match.youNeedPack && match.phase !== 'over') packModal.classList.add('open');
    else packModal.classList.remove('open');
    if (match.upgrade && match.upgrade.forYou) {
      const current = state.player.pendingUpgrade;
      const same = Array.isArray(current)
        && current.length === match.upgrade.options.length
        && current.every((item, index) => item.id === match.upgrade.options[index].id);
      if (!same) showServerUpgrade(match.upgrade.options, match.you.goldEarned);
    } else {
      upgradeModal.classList.remove('open');
      state.player.pendingUpgrade = null;
    }
    if (match.phase === 'summary' && match.summarySeconds != null) {
      state.nextWaveSummary = { remaining: match.summarySeconds };
      waveSummary.classList.add('open');
      waveSummaryCountdown.textContent = `Próxima onda em ${Math.ceil(match.summarySeconds)}s`;
      waveSummaryStats.innerHTML = `<div class="summary-stat">Onda<strong>${match.wave}</strong></div><div class="summary-stat">Seu ouro<strong>$${match.you.gold}</strong></div>`;
    } else {
      state.nextWaveSummary = null;
      waveSummary.classList.remove('open');
    }
    if (match.phase === 'over') {
      winnerTitle.textContent = match.winner === 'you' ? 'Vitória!' : match.winner === 'draw' ? 'Empate' : 'Derrota';
      winnerBody.textContent = match.resultText || '';
      document.getElementById('btnWinnerOk').textContent = 'Voltar ao lobby';
      winnerOverlay.classList.add('open');
    } else {
      winnerOverlay.classList.remove('open');
    }
    const packSub = document.querySelector('#packModal .sub');
    if (packSub) packSub.textContent = 'O pack que você enviar ataca a pista do amigo. O dele ataca a sua.';
    paused = !!view.pause;
    onlinePause = view.pause || null;
    recomputeVsPaths();
    syncModeUi();
    updateActionButtons();
  }

  function showFriendSetup(code) {
    uiBranch = 'multi';
    uiMp = 'amigo';
    const input = document.getElementById('onlineCode');
    if (input && code) input.value = code;
    syncStartBranch();
  }

  function leaveOnline() {
    onlineActive = false;
    onlineSend = null;
    onlinePause = null;
    rankSaved = true;
    const box = document.getElementById('friendRankBox');
    if (box) box.hidden = true;
    document.getElementById('btnWinnerOk').textContent = 'Voltar ao menu';
    resetGame();
  }

  window.ViaLacteaGame = {
    setOnlineSender(fn) { onlineSend = fn; },
    applyOnline: applyOnlineSnapshot,
    showFriendSetup,
    leaveOnline,
    isOnline() { return onlineActive; },
  };

  state = freshSoloState();
  syncStartBranch();
  syncModeUi();
  renderRank();
  updateTowerCard();
  updateActionButtons();
  mapSelect.disabled = true;
  requestAnimationFrame(loop);
})();
