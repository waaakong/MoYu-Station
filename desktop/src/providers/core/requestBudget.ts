type Release = () => void;

class Semaphore {
  private active = 0;
  private readonly waiters: Array<(release: Release) => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(signal?: AbortSignal): Promise<Release> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (this.active < this.limit) {
      this.active += 1;
      return this.releaseFactory();
    }
    return await new Promise<Release>((resolve, reject) => {
      const waiter = (release: Release) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(release);
      };
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  count(): number { return this.active; }

  private releaseFactory(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const waiter = this.waiters.shift();
      if (waiter) waiter(this.releaseFactory());
      else this.active = Math.max(0, this.active - 1);
    };
  }
}

export class RequestBudget {
  private readonly normal = new Semaphore(2);
  private readonly playback = new Semaphore(1);

  acquire(kind: "normal" | "playback", signal?: AbortSignal): Promise<Release> {
    return (kind === "playback" ? this.playback : this.normal).acquire(signal);
  }

  active(kind: "normal" | "playback"): number {
    return (kind === "playback" ? this.playback : this.normal).count();
  }
}

export class GlobalRequestBudget {
  private readonly semaphore: Semaphore;
  constructor(limit = 4) { this.semaphore = new Semaphore(limit); }
  acquire(signal?: AbortSignal): Promise<Release> { return this.semaphore.acquire(signal); }
  active(): number { return this.semaphore.count(); }
}
