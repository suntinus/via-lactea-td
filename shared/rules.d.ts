export interface Vec {
  x: number;
  y: number;
}

export interface TowerDef {
  name: string;
  cost: number;
  range: number;
  rate: number;
  damage: number;
  color: string;
  glyph: string;
  slow: number;
  aoe?: number;
}

export interface UpgradeVector {
  range: number;
  rate: number;
  damage: number;
}

export interface UpgradeStats {
  laser: UpgradeVector;
  escudo: UpgradeVector;
  sonda: UpgradeVector;
  hero: UpgradeVector;
  global: { killGold: number; maxHp: number };
  counts: Record<string, number>;
}

export interface SideLike {
  maxHp: number;
  upgrades: UpgradeStats;
}

export interface StatUpgrade {
  id: string;
  title: string;
  description: string;
}

export interface FallbackUpgrade {
  id: string;
  title: string;
  description: string;
  effect: 'gold' | 'heal';
  amount: number;
}

export interface PlacementOptions {
  seat?: 'left' | 'right' | 'solo';
  towers?: Vec[];
  map?: string;
  width?: number;
  height?: number;
  tol?: number;
}

export interface Rules {
  W: number;
  H: number;
  MID: number;
  VIDA_COST: number;
  VIDA_BONUS: number;
  BOMB_COST: number;
  BOMB_RADIUS: number;
  BOMB_DAMAGE: number;
  FREEZE_COST: number;
  FREEZE_DURATION: number;
  HERO_COST: number;
  UPGRADE_MILESTONE: number;
  UPGRADE_CAP: number;
  TOWERS: Record<string, TowerDef>;
  ENEMY_TYPES: Record<string, { hp: number; speed: number; reward: number; armor: number }>;
  ATTACK_PACKS: Record<string, { id: string; name: string; build: (wave: number) => string[] }>;
  BASES: Record<string, { hp: number; gold: number; emoji: string; label: string }>;
  DIFFS: Record<string, { hpMul: number; speedMul: number; goldMul: number; label: string }>;
  VS_PATHS: { left: Vec[]; right: Vec[] };
  STAT_UPGRADES: StatUpgrade[];
  FALLBACK_UPGRADES: FallbackUpgrade[];
  pathLength: (path: Vec[]) => number;
  pointOnPath: (path: Vec[], dist: number) => Vec;
  placementOk: (x: number, y: number, options?: PlacementOptions) => boolean;
  applyUpgradeStat: (side: SideLike, id: string) => boolean;
  waveClearBonus: (wave: number) => number;
  leakDamage: (type: string) => number;
  enemyHpBonus: (wave: number) => number;
  mulberry32: (seed: number) => () => number;
  mirrorX: (x: number, width?: number) => number;
}

declare const rules: Rules;
export default rules;
