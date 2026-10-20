/** Process-local authorization. Never serialize this state into preferences or a queue. */
export interface UpdateTarget {
  accountSession: string;
  version: string;
  manifestDigest: string;
}
export type UpdateWaitReason = 'focus' | 'audio' | 'drafts';
export interface UpdateIntentView {
  phase: 'idle' | 'downloading' | 'waiting' | 'countdown' | 'preparing' | 'installing' | 'error';
  waitReasons: UpdateWaitReason[];
  countdownSeconds?: number;
  error?: string;
}
export interface UpdateIntentOperations {
  currentTarget(): UpdateTarget | undefined;
  download(signal: AbortSignal): Promise<void>;
  revalidate(signal: AbortSignal): Promise<void>;
  /** Freeze new work, use the shared local save path, then create a consistent backup.
   * Return a release function even on a subsequently cancelled install. On failure,
   * this operation must undo its own partial freeze before rejecting. */
  prepare(signal: AbortSignal): Promise<() => void>;
  verifyArtifact(signal: AbortSignal): Promise<void>;
  install(): Promise<void>;
  changed(view: UpdateIntentView): void;
}

const matches = (a: UpdateTarget, b?: UpdateTarget) => !!b && a.accountSession === b.accountSession
  && a.version === b.version && a.manifestDigest === b.manifestDigest;

export class UpdateIntent {
  private ticket?: { target: UpdateTarget; controller: AbortController };
  private view: UpdateIntentView = { phase: 'idle', waitReasons: [] };
  private busy: UpdateWaitReason[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private deadline?: number;
  private release?: () => void;
  private working = false;
  private disposed = false;

  constructor(private readonly operations: UpdateIntentOperations) {}

  snapshot(): UpdateIntentView { return { ...this.view, waitReasons: [...this.view.waitReasons] }; }

  private publish(patch: UpdateIntentView) {
    this.view = patch;
    this.operations.changed(this.snapshot());
  }

  private valid(ticket: NonNullable<UpdateIntent['ticket']>): boolean {
    return !this.disposed && this.ticket === ticket && !ticket.controller.signal.aborted
      && matches(ticket.target, this.operations.currentTarget());
  }

  /** Call on logout, account epoch change, withdrawal, replacement and ordinary quit. */
  cancel() {
    this.ticket?.controller.abort();
    this.ticket = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.deadline = undefined;
    this.release?.(); this.release = undefined;
    this.publish({ phase: 'idle', waitReasons: [] });
  }

  dispose() { this.disposed = true; this.cancel(); }

  setBusy(input: { focus: boolean; audio: boolean; drafts: boolean }) {
    this.busy = (['focus', 'audio', 'drafts'] as const).filter(key => input[key]);
    if (this.ticket && ['waiting', 'countdown'].includes(this.view.phase)) this.advance(this.ticket);
  }

  async start() {
    if (this.disposed || this.working || this.ticket) return;
    const target = this.operations.currentTarget();
    if (!target?.accountSession || !target.version || !/^[a-f0-9]{64}$/.test(target.manifestDigest)) throw new Error('UPDATE_INTENT_TARGET_INVALID');
    const ticket = { target: { ...target }, controller: new AbortController() };
    this.ticket = ticket;
    this.publish({ phase: 'downloading', waitReasons: [] });
    try {
      await this.operations.download(ticket.controller.signal);
      if (!this.valid(ticket)) { if (this.ticket === ticket) this.cancel(); return; }
      this.advance(ticket);
    } catch (error) { this.failed(ticket, error); }
  }

  private advance(ticket: NonNullable<UpdateIntent['ticket']>) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.valid(ticket)) { this.cancel(); return; }
    if (this.busy.length) {
      this.deadline = undefined;
      this.publish({ phase: 'waiting', waitReasons: [...this.busy] });
      return;
    }
    // A newly busy period resets the entire countdown, never resumes a stale deadline.
    this.deadline ??= Date.now() + 5_000;
    const remaining = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1_000));
    if (!remaining) { void this.finish(ticket); return; }
    this.publish({ phase: 'countdown', waitReasons: [], countdownSeconds: remaining });
    this.timer = setTimeout(() => this.advance(ticket), Math.min(1_000, this.deadline - Date.now()));
  }

  private async finish(ticket: NonNullable<UpdateIntent['ticket']>) {
    if (!this.valid(ticket) || this.working) return;
    this.working = true;
    const signal = ticket.controller.signal;
    try {
      this.publish({ phase: 'preparing', waitReasons: [] });
      await this.operations.revalidate(signal);
      if (!this.valid(ticket)) { if (this.ticket === ticket) this.cancel(); return; }
      if (this.busy.length) { this.deadline = undefined; this.advance(ticket); return; }
      const release = await this.operations.prepare(signal);
      if (!this.valid(ticket)) { release(); if (this.ticket === ticket) this.cancel(); return; }
      this.release = release;
      await this.operations.verifyArtifact(signal);
      await this.operations.revalidate(signal);
      if (!this.valid(ticket)) { if (this.ticket === ticket) this.cancel(); return; }
      if (this.busy.length) {
        this.release?.(); this.release = undefined;
        this.deadline = undefined; this.advance(ticket); return;
      }
      this.publish({ phase: 'installing', waitReasons: [] });
      await this.operations.install();
      // Hold the write freeze until real exit. Failed startup goes through failed().
    } catch (error) { this.failed(ticket, error); }
    finally {
      this.working = false;
      if (!this.valid(ticket)) { this.release?.(); this.release = undefined; }
    }
  }

  private failed(ticket: NonNullable<UpdateIntent['ticket']>, error: unknown) {
    if (this.ticket !== ticket || ticket.controller.signal.aborted) return;
    this.cancel();
    this.publish({ phase: 'error', waitReasons: [], error: error instanceof Error ? error.message : 'UPDATE_INSTALL_FAILED' });
  }
}
