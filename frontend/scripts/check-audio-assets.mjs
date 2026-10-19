import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const assetDirectory = resolve(scriptDirectory, "../src/assets/audio/ambient");
const limitBytes = 25_000_000;
const expected = Object.freeze({
  "rain.ogg": "C34D12243125C28F09426C076019F8321B602347A8564C38BE771CB997C1A152",
  "cafe.ogg": "6360791FDCEE1F64638F0FC9ABD6D2C7A1AA75FD3D2B80033170A02D025099DC",
  "fireplace.ogg": "0FB9FB4A44FE378CEFFB2B80D0CF420E28404E04F5F200B7BC0205EADEEBC8D4",
  "waves.ogg": "F2B05ED99FC40F51D629BF07D583472404F9AB77084AD3099BB04A0F6CEAEFF7"
});

const licenseText = await readFile(join(assetDirectory, "LICENSES.md"), "utf8");
const entries = (await readdir(assetDirectory)).sort();
const unexpected = entries.filter((name) => name !== "LICENSES.md" && !(name in expected));
if (unexpected.length) throw new Error(`Unexpected ambient assets: ${unexpected.join(", ")}`);

let totalBytes = 0;
for (const [name, expectedHash] of Object.entries(expected)) {
  const path = join(assetDirectory, name);
  const bytes = await readFile(path);
  totalBytes += (await stat(path)).size;
  const actualHash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (actualHash !== expectedHash) throw new Error(`${name} SHA-256 does not match LICENSES.md`);
  if (!licenseText.includes(name) || !licenseText.includes(expectedHash)) {
    throw new Error(`${name} is missing its license or checksum entry`);
  }
}

if (totalBytes > limitBytes) {
  throw new Error(`Ambient assets use ${totalBytes} bytes, exceeding ${limitBytes}`);
}
console.log(`Ambient assets verified: ${totalBytes} / ${limitBytes} bytes`);
