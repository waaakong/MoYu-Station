import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "@studyroom/contracts";
import { IpcGuard } from "../src/main/ipc/guard";
import { validateExternalUrl } from "../src/main/security/navigation";
import { MAIN_WINDOW_OPTIONS } from "../src/main/windowManager";
import { CredentialVault } from "../src/storage/credentialVault";
import { DirectoryTokenVault } from "../src/storage/directoryTokenVault";

function fakeEvent(senderId: number, mainFrame = true): IpcMainInvokeEvent {
  const frame = {};
  return {
    sender: { id: senderId, mainFrame: frame },
    senderFrame: mainFrame ? frame : {}
  } as unknown as IpcMainInvokeEvent;
}
function credentialUrlFixture(){const url=new URL('https://github.com/waaakong/MoYu-Station');url.username='synthetic-user';url.password='synthetic-test-value';return url.href;}

describe("Electron security boundaries", () => {
  it("locks down renderer web preferences", () => {
    expect(MAIN_WINDOW_OPTIONS.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    });
  });

  it("accepts only allow-listed HTTPS destinations", () => {
    expect(validateExternalUrl("https://8.163.29.26/download").hostname).toBe("8.163.29.26");
    expect(() => validateExternalUrl("http://8.163.29.26/download")).toThrow("EXTERNAL_URL_BLOCKED");
    expect(validateExternalUrl("https://moyustation.xyz/help").hostname).toBe("moyustation.xyz");
    expect(() => validateExternalUrl("http://moyustation.xyz/help")).toThrow("EXTERNAL_URL_BLOCKED");
    expect(() => validateExternalUrl("https://example.com")).toThrow("EXTERNAL_URL_BLOCKED");
    expect(() => validateExternalUrl("file:///C:/Windows/System32/calc.exe")).toThrow("EXTERNAL_URL_BLOCKED");
  });
  it.each([credentialUrlFixture(),'https://github.com:8443/','https://github.com/'+ 'a'.repeat(4096)])('rejects ambiguous or oversized external destination %#', value=>{
    expect(()=>validateExternalUrl(value)).toThrow('EXTERNAL_URL_BLOCKED');
  });

  it("rejects unknown senders and subframes", async () => {
    const guard = new IpcGuard(7);
    await expect(guard.invoke(IPC_CHANNELS.readQueue, fakeEvent(8), () => true))
      .rejects.toThrow("IPC_SENDER_REJECTED");
    await expect(guard.invoke(IPC_CHANNELS.readQueue, fakeEvent(7, false), () => true))
      .rejects.toThrow("IPC_SENDER_REJECTED");
  });

  it("limits calls per sender and channel", async () => {
    let now = 100;
    const guard = new IpcGuard(7, 1, 1, () => now);
    await expect(guard.invoke(IPC_CHANNELS.readQueue, fakeEvent(7), () => true)).resolves.toBe(true);
    await expect(guard.invoke(IPC_CHANNELS.readQueue, fakeEvent(7), () => true))
      .rejects.toThrow("IPC_RATE_LIMITED");
    now = 1_100;
    await expect(guard.invoke(IPC_CHANNELS.readQueue, fakeEvent(7), () => true)).resolves.toBe(true);
  });
});

describe("opaque local storage", () => {
  it("expires directory tokens without revealing paths", () => {
    const directory = mkdtempSync(join(tmpdir(), "studyroom-token-test-"));
    let now = 1_000;
    try {
      const vault = new DirectoryTokenVault(100, () => now);
      const token = vault.issue(directory);
      expect(token).not.toContain(directory);
      expect(vault.resolve(token)).toBe(directory);
      now = 1_101;
      expect(() => vault.resolve(token)).toThrow("DIRECTORY_TOKEN_INVALID");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("never writes provider credentials as plaintext", () => {
    const directory = mkdtempSync(join(tmpdir(), "studyroom-vault-test-"));
    const vaultPath = join(directory, "credentials.json");
    mkdirSync(directory, { recursive: true });
    try {
      const encryption = {
        isAvailable: () => true,
        encrypt: (value: string) => Buffer.from(`encrypted:${value.split("").reverse().join("")}`),
        decrypt: (value: Buffer) => value.toString().replace("encrypted:", "").split("").reverse().join("")
      };
      const vault = new CredentialVault(vaultPath, encryption);
      vault.store("netease", "provider-secret-value");
      expect(vault.has("netease")).toBe(true);
      expect(vault.readForProvider("netease")).toBe("provider-secret-value");
      expect(readFileSync(vaultPath, "utf8")).not.toContain("provider-secret-value");
      vault.clear("netease");
      expect(vault.has("netease")).toBe(false);

      vault.storeSession("qq", { version: 1, values: { sid: "private-session" }, expiresAt: 2_000, accountScopeHash: "scope" });
      expect(vault.readSession("qq")).toEqual({ version: 1, values: { sid: "private-session" }, expiresAt: 2_000, accountScopeHash: "scope" });
      expect(JSON.parse(readFileSync(vaultPath, "utf8"))).toMatchObject({ version: 2, providers: { qq: expect.any(String) } });
      expect(readFileSync(vaultPath, "utf8")).not.toContain("private-session");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
