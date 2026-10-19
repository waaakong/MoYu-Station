import { describe, expect, it } from "vitest";
import { RemoteMediaSessionRegistry } from "../src/audio/protocol/remoteMediaProtocol";
import { RadioService } from "../src/providers/radio/radioService";
import { assertSafeRadioUrl, isPublicAddress } from "../src/providers/radio/ssrfGuard";

describe("public radio", () => {
  it("rejects local, private, mapped and unapproved destinations", async () => {
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("192.168.1.1")).toBe(false);
    expect(isPublicAddress("::1")).toBe(false);
    expect(isPublicAddress("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    await expect(assertSafeRadioUrl(new URL("https://radio.example.invalid/live"), ["example.invalid"], async () => [{ address: "10.0.0.2", family: 4 }]))
      .rejects.toThrow("RADIO_STREAM_REJECTED");
    await expect(assertSafeRadioUrl(new URL("https://attacker.invalid/live"), ["example.invalid"], async () => [{ address: "1.1.1.1", family: 4 }]))
      .rejects.toThrow("RADIO_STREAM_REJECTED");
  });

  it("lists only the audited catalog and returns safe playback tokens", async () => {
    const media = new RemoteMediaSessionRegistry();
    const service = new RadioService(media, async () => [{ address: "1.1.1.1", family: 4 }]);
    expect(service.list().items.map(({ id }) => id)).toEqual([
      "somafm-groove-salad", "somafm-drone-zone", "somafm-secret-agent"
    ]);
    expect(service.list({ query: "drone" }).items).toHaveLength(1);
    const playback = await service.prepare("somafm-drone-zone");
    expect(playback.mediaToken).toMatch(/^[0-9a-f]{64}$/);
    expect(media.resolve("radio", playback.mediaToken)?.url.hostname).toBe("ice5.somafm.com");
  });

  it("normalizes bounded now-playing metadata", async () => {
    const service = new RadioService(
      new RemoteMediaSessionRegistry(),
      async () => [{ address: "1.1.1.1", family: 4 }],
      async () => new Response(JSON.stringify({ songs: [{ title: "Quiet", artist: "Moyu" }] }), { headers: { "content-type": "application/json" } })
    );
    await expect(service.nowPlaying("somafm-groove-salad")).resolves.toMatchObject({ title: "Quiet", artist: "Moyu" });
  });
});
