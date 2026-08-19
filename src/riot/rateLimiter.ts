interface RateWindow {
  maxRequests: number;
  windowMs: number;
  timestamps: number[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RiotRateLimiter {
  private windows: RateWindow[];
  private queue: Promise<void> = Promise.resolve();

  constructor(limits: { maxRequests: number; windowMs: number }[]) {
    this.windows = limits.map((limit) => ({ ...limit, timestamps: [] }));
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const turn = this.queue.then(() => this.waitForSlot());
    this.queue = turn;
    return turn.then(task);
  }

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      let waitMs = 0;

      for (const window of this.windows) {
        window.timestamps = window.timestamps.filter((t) => now - t < window.windowMs);
        if (window.timestamps.length >= window.maxRequests) {
          const oldest = window.timestamps[0];
          waitMs = Math.max(waitMs, window.windowMs - (now - oldest));
        }
      }

      if (waitMs <= 0) {
        const requestTime = Date.now();
        for (const window of this.windows) window.timestamps.push(requestTime);
        return;
      }

      await sleep(waitMs + 5);
    }
  }
}

// Limites da Development Key: 20 req/1s e 100 req/2min (CLAUDE.MD seção 3).
export const defaultRateLimiter = new RiotRateLimiter([
  { maxRequests: 20, windowMs: 1_000 },
  { maxRequests: 100, windowMs: 120_000 },
]);
