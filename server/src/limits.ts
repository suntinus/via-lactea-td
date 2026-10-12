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
}

export function clientTooSlow(bufferedAmount: number, maxBufferedBytes: number): boolean {
  return bufferedAmount > maxBufferedBytes;
}
