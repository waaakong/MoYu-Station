export interface StartupSurface {
  readonly active?: boolean;
  stage(message: string): void;
  ready(): void;
  fail(message: string): void;
  bindRestart(handler: () => Promise<void>): void;
  dispose(): void;
}

export interface StartupStep { label: string; run(): void | Promise<unknown> }

/** One boot, one set of service instances; skipping visuals never skips these steps. */
export function createStartupRunner(surface?: StartupSurface) {
  let operation: Promise<boolean> | undefined;
  let cancelled = false;
  return {
    cancel() { cancelled = true; },
    run(steps: StartupStep[]): Promise<boolean> {
      if (operation) return operation;
      operation = (async () => {
        for (const step of steps) {
          if (cancelled) return false;
          surface?.stage(step.label);
          try { await step.run(); }
          catch {
            if (!cancelled) surface?.fail(`${step.label}未完成`);
            return false;
          }
        }
        if (cancelled) return false;
        surface?.ready();
        return true;
      })();
      return operation;
    }
  };
}
