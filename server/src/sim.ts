import rules from '../../shared/rules.js';
import type { FallbackUpgrade, UpgradeStats, Vec } from '../../shared/rules.js';

export type Seat = 'left' | 'right';
export type BaseId = 'terra' | 'lunar';
export type DiffId = 'facil' | 'normal' | 'dificil';
export type PackId = 'leve' | 'mista' | 'pesada';
export type TowerKind = 'laser' | 'escudo' | 'sonda' | 'hero';
export type Phase = 'pack' | 'combat' | 'summary' | 'upgrade' | 'over';

export type Intent =
  | { seat: Seat; kind: 'place'; tower: TowerKind; x: number; y: number }
  | { seat: Seat; kind: 'pack'; pack: PackId }
  | { seat: Seat; kind: 'shield' }
  | { seat: Seat; kind: 'bomb'; x: number; y: number }
  | { seat: Seat; kind: 'freeze' }
  | { seat: Seat; kind: 'upgrade'; upgradeId: string };

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

interface Enemy {
  id: number;
  type: string;
  lane: Seat;
  hp: number;
  maxHp: number;
  armor: number;
  reward: number;
  dist: number;
  baseSpeed: number;
  alive: boolean;
  slowTimer: number;
  slowMul: number;
}

interface Bullet {
  x: number;
  y: number;
  tx: number;
  ty: number;
  targetId: number;
  damage: number;
  color: string;
  life: number;
  slow: number;
  aoe: number;
  dead: boolean;
}

interface Tower {
  x: number;
  y: number;
  cooldown: number;
  kind: TowerKind;
}

interface Side {
  hp: number;
  maxHp: number;
  gold: number;
  score: number;
  goldEarned: number;
  goldUpgradeLevel: number;
  upgrades: UpgradeStats;
  towers: Tower[];
  enemies: Enemy[];
  bullets: Bullet[];
  waveGold: number;
  waveScore: number;
  vidaBoughtThisWave: boolean;
  heroPlaced: boolean;
  bombCd: number;
  freezeCd: number;
  freezeLeft: number;
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  stat: boolean;
  effect?: 'gold' | 'heal';
  amount?: number;
}

interface PendingUpgrade {
  seat: Seat;
  options: Offer[];
}

export interface SideSnap {
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
  upgrades: UpgradeStats;
  towers: { x: number; y: number; kind: TowerKind }[];
  enemies: {
    id: number;
    type: string;
    dist: number;
    hp: number;
    maxHp: number;
    armor: number;
    slowMul: number;
    lane: Seat;
  }[];
  bullets: { x: number; y: number; tx: number; ty: number; color: string; aoe: number }[];
}

export interface MatchSnap {
  phase: Phase;
  tick: number;
  wave: number;
  winner: Seat | 'draw' | null;
  summaryLeft: number | null;
  left: SideSnap;
  right: SideSnap;
  leftPack: PackId | null;
  rightPack: PackId | null;
  leftNeedPack: boolean;
  rightNeedPack: boolean;
  upgrade: PendingUpgrade | null;
}

const PACKS: PackId[] = ['leve', 'mista', 'pesada'];
const TOWER_KINDS: TowerKind[] = ['laser', 'escudo', 'sonda', 'hero'];
const FREEZE_COOLDOWN = 8;
const BOMB_COOLDOWN = 2.5;

function emptyUpgrades(): UpgradeStats {
  return {
    laser: { range: 1, rate: 1, damage: 0 },
    escudo: { range: 1, rate: 1, damage: 0 },
    sonda: { range: 1, rate: 1, damage: 0 },
    hero: { range: 1, rate: 1, damage: 0 },
    global: { killGold: 1, maxHp: 0 },
    counts: {},
  };
}

function freshSide(base: BaseId): Side {
  const def = rules.BASES[base];
  return {
    hp: def.hp,
    maxHp: def.hp,
    gold: def.gold,
    score: 0,
    goldEarned: 0,
    goldUpgradeLevel: 0,
    upgrades: emptyUpgrades(),
    towers: [],
    enemies: [],
    bullets: [],
    waveGold: 0,
    waveScore: 0,
    vidaBoughtThisWave: false,
    heroPlaced: false,
    bombCd: 0,
    freezeCd: 0,
    freezeLeft: 0,
  };
}

function isPack(value: string): value is PackId {
  return PACKS.some((pack) => pack === value);
}

function isTower(value: string): value is TowerKind {
  return TOWER_KINDS.some((kind) => kind === value);
}

function fail(reason: string): CommandResult {
  return { ok: false, reason };
}

export class Match {
  readonly base: BaseId;
  readonly diff: DiffId;
  phase: Phase = 'pack';
  wave = 0;
  winner: Seat | 'draw' | null = null;
  tickCount = 0;
  summaryLeft = 0;
  leftPack: PackId | null = null;
  rightPack: PackId | null = null;
  upgrade: PendingUpgrade | null = null;
  private readonly left: Side;
  private readonly right: Side;
  private readonly rng: () => number;
  private readonly upgradeQueue: PendingUpgrade[] = [];
  private resumePhase: Phase = 'combat';
  private spawner: { leftQueue: string[]; rightQueue: string[]; timer: number; next: Seat } | null = null;
  private cleared = false;
  private nextId = 1;
  private nestingGold = false;

  constructor(options: { seed: number; base?: BaseId; diff?: DiffId }) {
    this.base = options.base ?? 'terra';
    this.diff = options.diff ?? 'normal';
    if (!rules.BASES[this.base] || !rules.DIFFS[this.diff]) {
      throw new Error('Base ou dificuldade inválida.');
    }
    this.left = freshSide(this.base);
    this.right = freshSide(this.base);
    this.rng = rules.mulberry32(options.seed);
  }

  command(intent: Intent): CommandResult {
    if (this.phase === 'over') return fail('A partida já terminou.');
    switch (intent.kind) {
      case 'place':
        return this.place(intent.seat, intent.tower, intent.x, intent.y);
      case 'pack':
        return this.choosePack(intent.seat, intent.pack);
      case 'shield':
        return this.buyShield(intent.seat);
      case 'bomb':
        return this.detonate(intent.seat, intent.x, intent.y);
      case 'freeze':
        return this.freeze(intent.seat);
      case 'upgrade':
        return this.chooseUpgrade(intent.seat, intent.upgradeId);
      default: {
        const neverIntent: never = intent;
        return fail(`Comando não tratado: ${JSON.stringify(neverIntent)}`);
      }
    }
  }

  forfeit(seat: Seat): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.winner = seat === 'left' ? 'right' : 'left';
    this.spawner = null;
  }

  tick(dt: number): void {
    let left = dt;
    while (left > 0 && this.phase !== 'over') {
      const step = Math.min(0.05, left);
      this.step(step);
      left -= step;
    }
  }

  snapshot(): MatchSnap {
    return {
      phase: this.phase,
      tick: this.tickCount,
      wave: this.wave,
      winner: this.winner,
      summaryLeft: this.phase === 'summary' ? this.summaryLeft : null,
      left: this.snapSide(this.left),
      right: this.snapSide(this.right),
      leftPack: this.leftPack,
      rightPack: this.rightPack,
      leftNeedPack: this.phase === 'pack' && this.leftPack === null,
      rightNeedPack: this.phase === 'pack' && this.rightPack === null,
      upgrade: this.upgrade,
    };
  }

  private side(seat: Seat): Side {
    return seat === 'left' ? this.left : this.right;
  }

  private place(seat: Seat, tower: string, x: number, y: number): CommandResult {
    if (this.phase === 'upgrade') return fail('Escolha o upgrade antes de construir.');
    if (!isTower(tower)) return fail('Torre desconhecida.');
    const side = this.side(seat);
    const def = rules.TOWERS[tower];
    if (!rules.placementOk(x, y, { seat, towers: side.towers })) return fail('Não dá para construir aí.');
    const cost = tower === 'hero' ? rules.HERO_COST : def.cost;
    if (tower === 'hero' && side.heroPlaced) return fail('O herói já está no mapa.');
    if (side.gold < cost) return fail('Moedas insuficientes.');
    side.gold -= cost;
    side.towers.push({ x, y, cooldown: 0, kind: tower });
    if (tower === 'hero') side.heroPlaced = true;
    return { ok: true };
  }

  private choosePack(seat: Seat, pack: string): CommandResult {
    if (this.phase !== 'pack') return fail('Não é hora de escolher o pack.');
    if (!isPack(pack)) return fail('Pack desconhecido.');
    if (seat === 'left' && this.leftPack) return fail('Você já escolheu o pack.');
    if (seat === 'right' && this.rightPack) return fail('Você já escolheu o pack.');
    if (seat === 'left') this.leftPack = pack;
    else this.rightPack = pack;
    if (this.leftPack && this.rightPack) this.launchWave();
    return { ok: true };
  }

  private buyShield(seat: Seat): CommandResult {
    if (this.phase === 'upgrade') return fail('Escolha o upgrade antes.');
    const side = this.side(seat);
    if (side.vidaBoughtThisWave) return fail('Escudo já comprado nesta onda.');
    if (side.gold < rules.VIDA_COST) return fail('Moedas insuficientes.');
    side.gold -= rules.VIDA_COST;
    side.hp += rules.VIDA_BONUS;
    side.maxHp = Math.max(side.maxHp, side.hp);
    side.vidaBoughtThisWave = true;
    return { ok: true };
  }

  private detonate(seat: Seat, x: number, y: number): CommandResult {
    if (this.phase !== 'combat' && this.phase !== 'summary' && this.phase !== 'pack') {
      return fail('A bomba não pode ser usada agora.');
    }
    if (x < 0 || y < 0 || x > rules.W || y > rules.H) return fail('Fora do mapa.');
    const side = this.side(seat);
    if (side.gold < rules.BOMB_COST || side.bombCd > 0) return fail('Bomba indisponível.');
    const onOwnHalf = seat === 'left' ? x < rules.MID : x > rules.MID;
    if (!onOwnHalf) return fail('A bomba só explode na sua metade.');
    side.gold -= rules.BOMB_COST;
    side.bombCd = BOMB_COOLDOWN;
    const path = rules.VS_PATHS[seat];
    for (const enemy of side.enemies) {
      if (!enemy.alive) continue;
      const point = rules.pointOnPath(path, enemy.dist);
      if (Math.hypot(point.x - x, point.y - y) <= rules.BOMB_RADIUS) {
        this.hurt(enemy, rules.BOMB_DAMAGE, side, seat);
      }
    }
    side.enemies = side.enemies.filter((enemy) => enemy.alive);
    this.checkDefeat();
    return { ok: true };
  }

  private freeze(seat: Seat): CommandResult {
    if (this.phase === 'upgrade' || this.phase === 'over') return fail('Congelar não está disponível.');
    const side = this.side(seat);
    if (side.gold < rules.FREEZE_COST || side.freezeCd > 0) return fail('Congelar indisponível.');
    side.gold -= rules.FREEZE_COST;
    side.freezeCd = FREEZE_COOLDOWN;
    side.freezeLeft = rules.FREEZE_DURATION;
    return { ok: true };
  }

  private chooseUpgrade(seat: Seat, upgradeId: string): CommandResult {
    if (!this.upgrade || this.upgrade.seat !== seat) return fail('Não há upgrade para você.');
    const option = this.upgrade.options.find((item) => item.id === upgradeId);
    if (!option) return fail('Essa opção não está disponível.');
    const side = this.side(seat);
    if (option.stat && (side.upgrades.counts[option.id] ?? 0) >= rules.UPGRADE_CAP) {
      return fail('Esse upgrade já está no máximo.');
    }
    if (!option.stat && option.effect !== 'gold' && option.effect !== 'heal') {
      return fail('Efeito de upgrade desconhecido.');
    }
    this.upgrade = null;
    if (option.stat) {
      if (!rules.applyUpgradeStat(side, option.id)) return fail('Upgrade inválido.');
      side.upgrades.counts[option.id] = (side.upgrades.counts[option.id] ?? 0) + 1;
    } else if (option.effect === 'gold') {
      this.addGold(side, seat, option.amount ?? 0);
    } else {
      side.hp = Math.min(side.maxHp, side.hp + (option.amount ?? 0));
    }
    this.promoteUpgrade();
    return { ok: true };
  }

  private launchWave(): void {
    if (!this.leftPack || !this.rightPack) return;
    this.wave += 1;
    this.cleared = false;
    this.phase = 'combat';
    for (const side of [this.left, this.right]) {
      side.waveGold = 0;
      side.waveScore = 0;
      side.vidaBoughtThisWave = false;
    }
    const attackingLeft = rules.ATTACK_PACKS[this.rightPack].build(this.wave);
    const attackingRight = rules.ATTACK_PACKS[this.leftPack].build(this.wave);
    this.spawner = {
      leftQueue: attackingLeft.slice(),
      rightQueue: attackingRight.slice(),
      timer: 0,
      next: 'left',
    };
  }

  private step(dt: number): void {
    this.tickCount += 1;
    for (const side of [this.left, this.right]) {
      if (side.bombCd > 0) side.bombCd = Math.max(0, side.bombCd - dt);
      if (side.freezeCd > 0) side.freezeCd = Math.max(0, side.freezeCd - dt);
      if (side.freezeLeft > 0) side.freezeLeft = Math.max(0, side.freezeLeft - dt);
    }
    if (this.phase === 'summary') {
      this.summaryLeft = Math.max(0, this.summaryLeft - dt);
      if (this.summaryLeft <= 0) {
        this.leftPack = null;
        this.rightPack = null;
        this.phase = 'pack';
      }
      return;
    }
    if (this.phase !== 'combat') return;

    this.spawn(dt);
    this.fight(this.left, 'left', dt);
    this.fight(this.right, 'right', dt);
    this.checkDefeat();
    if (this.phase !== 'combat') return;
    const spawning = this.spawner !== null;
    const alive = this.left.enemies.some((enemy) => enemy.alive) || this.right.enemies.some((enemy) => enemy.alive);
    if (!spawning && !alive && this.wave > 0 && !this.cleared) {
      this.cleared = true;
      const bonus = rules.waveClearBonus(this.wave);
      this.grantClear(this.left, 'left', bonus);
      this.grantClear(this.right, 'right', bonus);
      this.finishWave();
    }
  }

  private grantClear(side: Side, seat: Seat, bonus: number): void {
    side.score += bonus;
    side.waveScore += bonus;
    this.addGold(side, seat, bonus);
  }

  private finishWave(): void {
    if (this.phase === 'upgrade') {
      this.resumePhase = 'summary';
      this.summaryLeft = 5;
      return;
    }
    this.beginSummary();
  }

  private beginSummary(): void {
    this.phase = 'summary';
    this.summaryLeft = 5;
  }

  private spawn(dt: number): void {
    const spawner = this.spawner;
    if (!spawner) return;
    spawner.timer -= dt;
    if (spawner.timer > 0) return;
    const hasLeft = spawner.leftQueue.length > 0;
    const hasRight = spawner.rightQueue.length > 0;
    if (!hasLeft && !hasRight) {
      this.spawner = null;
      return;
    }
    const queued = spawner.next === 'left' && hasLeft
      ? { lane: 'left' as const, type: spawner.leftQueue.shift() }
      : hasRight
        ? { lane: 'right' as const, type: spawner.rightQueue.shift() }
        : { lane: 'left' as const, type: spawner.leftQueue.shift() };
    if (queued.type) this.spawnOne(queued.type, queued.lane);
    spawner.next = queued.lane === 'left' ? 'right' : 'left';
    spawner.timer = 0.42;
  }

  private spawnOne(typeKey: string, lane: Seat): void {
    const type = rules.ENEMY_TYPES[typeKey];
    const diff = rules.DIFFS[this.diff];
    const strength = 0.9 + this.rng() * 0.2;
    const hp = Math.max(1, Math.round((type.hp + rules.enemyHpBonus(this.wave)) * strength * diff.hpMul));
    const speed = type.speed * (1 + this.wave * 0.05) * (0.96 + strength * 0.04) * diff.speedMul;
    const enemy: Enemy = {
      id: this.nextId,
      type: typeKey,
      lane,
      hp,
      maxHp: hp,
      armor: type.armor,
      reward: Math.max(1, Math.round(type.reward * (0.9 + strength * 0.1) * diff.goldMul)),
      dist: 0,
      baseSpeed: speed,
      alive: true,
      slowTimer: 0,
      slowMul: 1,
    };
    this.nextId += 1;
    this.side(lane).enemies.push(enemy);
  }

  private fight(side: Side, seat: Seat, dt: number): void {
    const path = rules.VS_PATHS[seat];
    const pathLen = rules.pathLength(path);
    const frozen = side.freezeLeft > 0;
    for (const enemy of side.enemies) {
      if (!enemy.alive) continue;
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= dt;
        if (enemy.slowTimer <= 0) enemy.slowMul = 1;
      }
      enemy.dist += enemy.baseSpeed * (frozen ? 0 : enemy.slowMul) * dt;
      if (enemy.dist >= pathLen) {
        enemy.alive = false;
        side.hp -= rules.leakDamage(enemy.type);
      }
    }
    side.enemies = side.enemies.filter((enemy) => enemy.alive);

    for (const tower of side.towers) {
      const def = rules.TOWERS[tower.kind];
      const up = side.upgrades[tower.kind];
      const range = def.range * up.range;
      const rate = def.rate * up.rate;
      const damage = def.damage + up.damage;
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      let target: Enemy | null = null;
      let best = -1;
      for (const enemy of side.enemies) {
        const point = rules.pointOnPath(path, enemy.dist);
        const dx = tower.x - point.x;
        const dy = tower.y - point.y;
        if (dx * dx + dy * dy <= range * range && enemy.dist >= best) {
          best = enemy.dist;
          target = enemy;
        }
      }
      if (!target) continue;
      const point = rules.pointOnPath(path, target.dist);
      side.bullets.push({
        x: tower.x,
        y: tower.y,
        tx: point.x,
        ty: point.y,
        targetId: target.id,
        damage,
        color: def.color,
        life: 0.28,
        slow: def.slow || 0,
        aoe: def.aoe || 0,
        dead: false,
      });
      tower.cooldown = 1 / rate;
    }

    for (const bullet of side.bullets) {
      bullet.life -= dt;
      const target = side.enemies.find((enemy) => enemy.id === bullet.targetId && enemy.alive);
      const point = target ? rules.pointOnPath(path, target.dist) : { x: bullet.tx, y: bullet.ty };
      bullet.tx = point.x;
      bullet.ty = point.y;
      const dx = bullet.tx - bullet.x;
      const dy = bullet.ty - bullet.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = 400 * dt;
      if (dist <= speed || bullet.life <= 0) {
        if (bullet.aoe > 0) {
          for (const enemy of side.enemies) {
            if (!enemy.alive) continue;
            const at = rules.pointOnPath(path, enemy.dist);
            if (Math.hypot(at.x - bullet.tx, at.y - bullet.ty) <= bullet.aoe) {
              this.hurt(enemy, bullet.damage, side, seat);
              if (bullet.slow > 0 && enemy.alive) {
                enemy.slowMul = Math.min(enemy.slowMul, 1 - bullet.slow);
                enemy.slowTimer = 1.2;
              }
            }
          }
        } else if (target) {
          this.hurt(target, bullet.damage, side, seat);
          if (bullet.slow > 0 && target.alive) {
            target.slowMul = Math.min(target.slowMul, 1 - bullet.slow);
            target.slowTimer = 1.4;
          }
        }
        bullet.dead = true;
      } else {
        bullet.x += (dx / dist) * speed;
        bullet.y += (dy / dist) * speed;
      }
    }
    side.bullets = side.bullets.filter((bullet) => !bullet.dead);
    side.enemies = side.enemies.filter((enemy) => enemy.alive);
  }

  private hurt(enemy: Enemy, raw: number, side: Side, seat: Seat): void {
    if (!enemy.alive) return;
    const damage = Math.max(1, raw - enemy.armor);
    enemy.hp -= damage;
    if (enemy.hp <= 0) {
      enemy.alive = false;
      const reward = Math.round(enemy.reward * side.upgrades.global.killGold);
      side.score += enemy.reward;
      side.waveScore += enemy.reward;
      this.addGold(side, seat, reward);
    }
  }

  private checkDefeat(): void {
    if (this.phase === 'over') return;
    const leftDead = this.left.hp <= 0;
    const rightDead = this.right.hp <= 0;
    if (!leftDead && !rightDead) return;
    this.left.hp = Math.max(0, this.left.hp);
    this.right.hp = Math.max(0, this.right.hp);
    this.phase = 'over';
    this.spawner = null;
    if (leftDead && rightDead) this.winner = 'draw';
    else this.winner = leftDead ? 'right' : 'left';
  }

  private addGold(side: Side, seat: Seat, amount: number): void {
    if (amount <= 0) return;
    side.gold += amount;
    side.goldEarned += amount;
    side.waveGold += amount;
    if (this.nestingGold) return;
    this.nestingGold = true;
    try {
      while (Math.floor(side.goldEarned / rules.UPGRADE_MILESTONE) > side.goldUpgradeLevel) {
        side.goldUpgradeLevel += 1;
        this.upgradeQueue.push({ seat, options: this.rollOptions(side) });
      }
      this.promoteUpgrade();
    } finally {
      this.nestingGold = false;
    }
  }

  private promoteUpgrade(): void {
    if (this.phase === 'over' || this.upgrade || this.upgradeQueue.length === 0) return;
    const next = this.upgradeQueue.shift();
    if (!next) return;
    if (this.phase !== 'upgrade') {
      this.resumePhase = this.phase === 'summary' ? 'summary' : 'combat';
    }
    this.upgrade = next;
    this.phase = 'upgrade';
  }

  private rollOptions(side: Side): Offer[] {
    const available = rules.STAT_UPGRADES.filter((option) => (side.upgrades.counts[option.id] ?? 0) < rules.UPGRADE_CAP);
    const shuffled = available.slice().sort(() => this.rng() - 0.5);
    const choices: Offer[] = shuffled.slice(0, 3).map((option) => ({
      id: option.id,
      title: option.title,
      description: option.description,
      stat: true,
    }));
    const fallbacks = rules.FALLBACK_UPGRADES.slice().sort(() => this.rng() - 0.5);
    let index = 0;
    while (choices.length < 3 && fallbacks.length > 0) {
      const fallback: FallbackUpgrade = fallbacks[index % fallbacks.length];
      choices.push({
        id: fallback.id,
        title: fallback.title,
        description: fallback.description,
        stat: false,
        effect: fallback.effect,
        amount: fallback.amount,
      });
      index += 1;
      if (index > 6) break;
    }
    return choices;
  }

  private snapSide(side: Side): SideSnap {
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
      vidaBought: side.vidaBoughtThisWave,
      upgrades: side.upgrades,
      towers: side.towers.map((tower) => ({ x: tower.x, y: tower.y, kind: tower.kind })),
      enemies: side.enemies.filter((enemy) => enemy.alive).map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        dist: enemy.dist,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        armor: enemy.armor,
        slowMul: enemy.slowMul,
        lane: enemy.lane,
      })),
      bullets: side.bullets.map((bullet) => ({
        x: bullet.x,
        y: bullet.y,
        tx: bullet.tx,
        ty: bullet.ty,
        color: bullet.color,
        aoe: bullet.aoe,
      })),
    };
  }
}

export function mirrorPoint(point: Vec): Vec {
  return { x: rules.mirrorX(point.x), y: point.y };
}
