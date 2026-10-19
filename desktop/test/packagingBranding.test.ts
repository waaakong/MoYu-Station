import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.cjs');
it('uses a branded Windows setup filename and explicit installer icons', () => {
  expect(config.artifactName).toMatch(/^MoYu-Setup-.*\$\{version\}-win-\$\{arch\}\.\$\{ext\}$/);
  for (const key of ['installerIcon', 'uninstallerIcon', 'installerHeaderIcon']) {
    expect(config.nsis[key]).toBe(config.win.icon);
  }
  const icon = readFileSync(new URL('../resources/brand/app.ico', import.meta.url));
  expect(icon.readUInt16LE(0)).toBe(0);
  expect(icon.readUInt16LE(2)).toBe(1);
  expect(icon.readUInt16LE(4)).toBeGreaterThan(1);
  expect(config.nsis.deleteAppDataOnUninstall).toBe(false);
});
