import type { BaseId, PackId, TowerKind } from './sim.js';

export type ClientCommand =
  | { kind: 'place'; tower: TowerKind; x: number; y: number }
  | { kind: 'pack'; pack: PackId }
  | { kind: 'shield' }
  | { kind: 'bomb'; x: number; y: number }
  | { kind: 'freeze' }
  | { kind: 'upgrade'; upgradeId: string };

export type ClientMessage =
  | { type: 'hello'; nick: string; inviteCode?: string; playerId?: string }
  | { type: 'resume'; sessionId: string; token: string }
  | { type: 'magic' }
  | { type: 'lobby'; ready?: boolean; base?: BaseId }
  | { type: 'command'; command: ClientCommand }
  | { type: 'rematch' }
  | { type: 'ranking' };

const TOWERS = new Set(['laser', 'escudo', 'sonda', 'hero']);
const PACKS = new Set(['leve', 'mista', 'pesada']);
const BASES = new Set(['terra', 'lunar']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseCommand(value: unknown): ClientCommand | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  switch (value.kind) {
    case 'place':
      if (typeof value.tower !== 'string' || !TOWERS.has(value.tower) || !finite(value.x) || !finite(value.y)) return null;
      return { kind: 'place', tower: value.tower as TowerKind, x: value.x, y: value.y };
    case 'pack':
      if (typeof value.pack !== 'string' || !PACKS.has(value.pack)) return null;
      return { kind: 'pack', pack: value.pack as PackId };
    case 'shield':
      return { kind: 'shield' };
    case 'bomb':
      if (!finite(value.x) || !finite(value.y)) return null;
      return { kind: 'bomb', x: value.x, y: value.y };
    case 'freeze':
      return { kind: 'freeze' };
    case 'upgrade':
      if (typeof value.upgradeId !== 'string' || value.upgradeId.length > 40) return null;
      return { kind: 'upgrade', upgradeId: value.upgradeId };
    default:
      return null;
  }
}

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'hello': {
      if (typeof value.nick !== 'string') return null;
      if (value.inviteCode !== undefined && typeof value.inviteCode !== 'string') return null;
      if (value.playerId !== undefined && typeof value.playerId !== 'string') return null;
      return {
        type: 'hello',
        nick: value.nick,
        inviteCode: typeof value.inviteCode === 'string' ? value.inviteCode : undefined,
        playerId: typeof value.playerId === 'string' ? value.playerId : undefined,
      };
    }
    case 'resume':
      if (typeof value.sessionId !== 'string' || typeof value.token !== 'string') return null;
      return { type: 'resume', sessionId: value.sessionId, token: value.token };
    case 'magic':
      return { type: 'magic' };
    case 'lobby': {
      if (value.ready !== undefined && typeof value.ready !== 'boolean') return null;
      if (value.base !== undefined && (typeof value.base !== 'string' || !BASES.has(value.base))) return null;
      return {
        type: 'lobby',
        ready: typeof value.ready === 'boolean' ? value.ready : undefined,
        base: value.base === 'terra' || value.base === 'lunar' ? value.base : undefined,
      };
    }
    case 'command': {
      const command = parseCommand(value.command);
      if (!command) return null;
      return { type: 'command', command };
    }
    case 'rematch':
      return { type: 'rematch' };
    case 'ranking':
      return { type: 'ranking' };
    default:
      return null;
  }
}
