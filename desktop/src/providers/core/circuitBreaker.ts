export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private halfOpenProbe = false;
  private rateLimitedUntil=0;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  state(): CircuitState {
    if(this.now()<this.rateLimitedUntil)return 'open';
    if (!this.openedAt) return "closed";
    return this.now() - this.openedAt >= this.cooldownMs ? "half-open" : "open";
  }

  retryAt(): number | undefined {
    return this.state() === "open" ? Math.max(this.rateLimitedUntil,this.openedAt?this.openedAt+this.cooldownMs:0) : undefined;
  }

  defer(delayMs:number):void { this.rateLimitedUntil=Math.max(this.rateLimitedUntil,this.now()+Math.max(1000,Math.min(7*86400_000,delayMs))); }

  acquire(): boolean {
    const state = this.state();
    if (state === "open") return false;
    if (state === "half-open") {
      if (this.halfOpenProbe) return false;
      this.halfOpenProbe = true;
    }
    return true;
  }

  succeed(): void {
    this.failures = 0;
    this.openedAt = 0;
    this.halfOpenProbe = false;
  }

  fail(retryable: boolean): void {
    if (!retryable) {
      this.halfOpenProbe = false;
      return;
    }
    if (this.state() === "half-open") {
      this.openedAt = this.now();
      this.halfOpenProbe = false;
      return;
    }
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openedAt = this.now();
      this.halfOpenProbe = false;
    }
  }
}
