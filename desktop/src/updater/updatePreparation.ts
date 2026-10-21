import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS, type UpdatePreparationResult } from '@studyroom/contracts';

/** The renderer can acknowledge only this process's current, one-use save request. */
export class UpdatePreparation {
  private pending?: { id: string; complete(value: UpdatePreparationResult): void; reject(error: Error): void };
  constructor(private readonly window: BrowserWindow,
    private readonly backup: (state: Record<string, string>) => () => void) {}

  prepare(signal: AbortSignal): Promise<() => void> {
    if (this.pending || signal.aborted || this.window.isDestroyed()) return Promise.reject(new Error('UPDATE_SAVE_UNAVAILABLE'));
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const cleanup = () => {
        clearTimeout(timeout); signal.removeEventListener('abort', abort);
        if (this.pending?.id === id) this.pending = undefined;
      };
      const fail = (error: Error) => { cleanup(); reject(error); };
      const abort = () => fail(new Error('UPDATE_CANCELLED'));
      const timeout = setTimeout(() => fail(new Error('UPDATE_SAVE_UNAVAILABLE')), 15_000);
      this.pending = { id, reject: fail, complete: value => {
        if (!value.ready || signal.aborted) { fail(new Error('UPDATE_SAVE_UNAVAILABLE')); return; }
        cleanup();
        try { resolve(this.backup(value.rendererState || {})); }
        catch (error) {
          const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
          const message = error instanceof Error ? error.message : '';
          const full = /ENOSPC|SQLITE_FULL|UPDATE_DISK_INSUFFICIENT|database or disk is full/i.test(`${code} ${message}`);
          // This boundary only saves local data; filesystem and integrity errors
          // must not escape as an unrelated download/network failure.
          reject(new Error(full ? 'UPDATE_DISK_INSUFFICIENT' : 'UPDATE_SAVE_UNAVAILABLE'));
        }
      } };
      signal.addEventListener('abort', abort, { once: true });
      try { this.window.webContents.send(IPC_CHANNELS.prepareUpdate, { id }); }
      catch { fail(new Error('UPDATE_SAVE_UNAVAILABLE')); }
    });
  }

  complete(value: UpdatePreparationResult) {
    if (!this.pending || this.pending.id !== value.id) throw new Error('UPDATE_SAVE_UNAVAILABLE');
    this.pending.complete(value);
  }

  dispose() { this.pending?.reject(new Error('UPDATE_SAVE_UNAVAILABLE')); }
}
