export class StrikeLimiter {
  private readonly buckets = new Map<string, { fails: number[]; blockedUntil: number }>();

  constructor(
    private readonly maxFails: number,
    private readonly windowMs: number,
    private readonly blockMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  blocked(key: string): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket) return false;
    return bucket.blockedUntil > this.now();
  }

  strike(key: string): void {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { fails: [], blockedUntil: 0 };
    this.buckets.set(key, bucket);
    if (bucket.blockedUntil > now) return;
    bucket.fails = bucket.fails.filter((at) => now - at < this.windowMs);
    bucket.fails.push(now);
    if (bucket.fails.length >= this.maxFails) {
      bucket.blockedUntil = now + this.blockMs;
      bucket.fails = [];
    }
  }

  prune(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      bucket.fails = bucket.fails.filter((at) => now - at < this.windowMs);
      if (bucket.blockedUntil <= now && bucket.fails.length === 0) this.buckets.delete(key);
    }
  }

  size(): number {
    return this.buckets.size;
  }
}

function headerIp(value: string): string | null {
  const trimmed = value.trim().replace(/^"|"$/g, '');
  const bracket = trimmed.startsWith('[') ? trimmed.slice(1, trimmed.indexOf(']')) : trimmed;
  const bare = bracket.split('%')[0] ?? '';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bare)) {
    const parts = bare.split('.').map((part) => Number(part));
    if (parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return bare;
    return null;
  }
  if (bare.includes(':') && /^[0-9a-f:.]+$/i.test(bare)) return bare.toLowerCase();
  return null;
}

export function isLoopback(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '').split('%')[0] ?? address;
  if (bare === '::1') return true;
  const v4 = bare.startsWith('::ffff:') ? bare.slice('::ffff:'.length) : bare;
  const parts = v4.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return nums[0] === 127;
}

export function clientIp(remoteAddress: string | undefined, forwardedFor?: string, realIp?: string): string {
  const remote = remoteAddress && remoteAddress.length > 0 ? remoteAddress : 'desconhecido';
  if (!isLoopback(remote)) return remote;
  const forwarded = forwardedFor?.split(',')[0];
  const header = forwarded && forwarded.trim() !== '' ? forwarded : realIp;
  if (!header) return remote;
  return headerIp(header) ?? remote;
}

export function clientTooSlow(bufferedAmount: number, maxBufferedBytes: number): boolean {
  return bufferedAmount > maxBufferedBytes;
}
