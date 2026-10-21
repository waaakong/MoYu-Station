import { spawn, type StdioOptions } from 'node:child_process';
import { NsisUpdater } from 'electron-updater';
import type { InstallOptions } from 'electron-updater/out/BaseUpdater';

/** Per-user manifest-signed releases: keep the app alive until Windows confirms
 * the actual installer process has started. Download/hash/signature verification
 * and NSIS arguments remain the upstream implementation's responsibility. */
export class LaunchConfirmedNsisUpdater extends NsisUpdater {
  private launchPending = false;

  override quitAndInstall(isSilent = false, isForceRunAfter = false): void {
    if (this.launchPending) return;
    this.launchPending = true;
    // BaseUpdater.quitAndInstall schedules quit before asynchronous spawn errors
    // settle. Use its install validation, but quit only in the spawn callback.
    if (!this.install(isSilent, isSilent ? isForceRunAfter : this.autoRunAppAfterInstall)) {
      this.launchPending = false;
      this.quitAndInstallCalled = false;
    }
  }

  protected override doInstall(options: InstallOptions): boolean {
    // Our manifest-signed channel distributes per-user full installers. An OS
    // permission failure is not authorization to silently switch to elevation.
    // The existing trusted updater and Windows/UAC protections are unchanged.
    if (options.isAdminRightsRequired) {
      this.dispatchError(new Error('UPDATE_INSTALL_FAILED'));
      return false;
    }
    return super.doInstall(options);
  }

  protected override spawnLog(cmd: string, args: string[] = [], env?: NodeJS.ProcessEnv, stdio: StdioOptions = 'ignore'): Promise<boolean> {
    if (!this.launchPending || !this.installerPath || cmd !== this.installerPath) {
      return Promise.reject(new Error('UPDATE_INSTALL_FAILED'));
    }
    return new Promise((resolve, reject) => {
      const failed = (error: unknown) => {
        this.launchPending = false;
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        // Upstream retries EACCES/ENOENT through elevate.exe/shell.openPath.
        // Do not let that unobserved fallback run after this launch has failed.
        reject(new Error(code === 'ENOSPC' ? 'UPDATE_DISK_INSUFFICIENT' : 'UPDATE_INSTALL_FAILED', { cause: error }));
      };
      try {
        const child = spawn(cmd, args, { env, stdio, detached: true, shell: false });
        child.once('error', failed);
        child.once('spawn', () => {
          try {
            child.unref();
            this.app.quit();
            resolve(true);
          } catch (error) { failed(error); }
        });
      } catch (error) { failed(error); }
    });
  }
}
