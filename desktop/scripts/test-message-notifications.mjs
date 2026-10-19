import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const output = await mkdtemp(resolve(tmpdir(), 'moyu-notifications-'));
await mkdir(resolve(output, 'profile'));
await build({ entryPoints: ['desktop/test-electron/notification-harness.ts'], outfile: resolve(output, 'harness.cjs'), bundle: true,
  platform: 'node', format: 'cjs', target: 'node24', external: ['electron'] });
const env = { ...process.env, STUDYROOM_NOTIFICATION_EVIDENCE: output }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(resolve('node_modules/electron/dist/electron.exe'), [resolve(output, 'harness.cjs')], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 25000);
child.once('exit', async code => {
  clearTimeout(timer); console.log(`Notification evidence: ${output}`);
  try { const results = JSON.parse(await readFile(resolve(output, 'electron-results.json'), 'utf8')); console.log(JSON.stringify(results)); process.exitCode = results.passed ? 0 : 1; }
  catch { process.exitCode = code || 1; }
});
