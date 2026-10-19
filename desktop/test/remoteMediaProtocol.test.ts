import { describe, expect, it } from "vitest";
import { createRemoteMediaResponse, RemoteMediaSessionRegistry } from "../src/audio/protocol/remoteMediaProtocol";
import { audioCorsHeaders } from "../src/audio/protocol/audioCors";

describe("short-lived remote media sessions", () => {
  it("grants anonymous audio CORS only to the packaged opaque origin", () => {
    for (const origin of [undefined, "https://example.com", "file://", "*"]) {
      const request = new Request("studyroom-media://provider/token", { headers: origin ? { Origin: origin } : {} });
      expect(audioCorsHeaders(request)).toEqual({});
    }
    expect(audioCorsHeaders(new Request("studyroom-media://provider/token", { headers: { Origin: "null" } })))
      .toEqual({ "Access-Control-Allow-Origin": "null", "Vary": "Origin" });
  });
  it("aborts in-flight media on platform logout and drops late responses",async()=>{
    const registry=new RemoteMediaSessionRegistry(()=>1000);
    const token=registry.issue({kind:"provider",ownerId:"netease",trackId:"1",playbackSessionId:"p",accountScope:"a",url:new URL("https://media.example.invalid/a"),expiresAt:2000,allowedHosts:["example.invalid"]});
    let finish!:(response:Response)=>void,signal!:AbortSignal;
    const pending=createRemoteMediaResponse(new Request(`studyroom-media://provider/${token}`),registry,async(_url,init)=>{
      signal=init!.signal!;return new Promise(resolve=>{finish=resolve;});
    });
    registry.invalidateOwner("netease");expect(signal.aborted).toBe(true);
    finish(new Response("audio",{headers:{"content-type":"audio/mpeg"}}));
    expect((await pending).status).toBe(404);expect(registry.resolve("provider",token)).toBeUndefined();
  });
  it("issues opaque scoped tokens and forwards only safe media headers", async () => {
    let now = 1_000;
    const registry = new RemoteMediaSessionRegistry(() => now);
    const token = registry.issue({
      kind: "provider", ownerId: "netease", trackId: "track-1", playbackSessionId: "session-1",
      accountScope: "scope-a", url: new URL("https://media.example.invalid/audio"), expiresAt: 999_999,
      allowedHosts: ["example.invalid"]
    });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const response = await createRemoteMediaResponse(
      new Request(`studyroom-media://provider/${token}`, { headers: { Range: "bytes=0-3", Authorization: "renderer-value", Origin: "null" } }),
      registry,
      async (_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("range")).toBe("bytes=0-3");
        expect(headers.has("authorization")).toBe(false);
        return new Response("abcd", { status: 206, headers: { "content-type": "audio/mpeg", "content-range": "bytes 0-3/4", "accept-ranges": "bytes" } });
      }
    );
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("abcd");
    expect(response.headers.get("content-range")).toBe("bytes 0-3/4");
    expect(response.headers.get("access-control-allow-origin")).toBe("null");
    expect(response.headers.has("access-control-allow-credentials")).toBe(false);
    now += 5 * 60_000 + 1;
    expect((await createRemoteMediaResponse(new Request(`studyroom-media://provider/${token}`), registry)).status).toBe(404);
  });

  it("rejects unknown hosts, cross-kind use and invalid ranges", async () => {
    const registry = new RemoteMediaSessionRegistry(() => 1_000);
    expect(() => registry.issue({
      kind: "radio", ownerId: "station", trackId: "station", playbackSessionId: "session",
      accountScope: "public", url: new URL("https://localhost/audio"), expiresAt: 2_000, allowedHosts: ["example.invalid"]
    })).toThrow("REMOTE_MEDIA_SOURCE_REJECTED");
    const token = registry.issue({
      kind: "radio", ownerId: "station", trackId: "station", playbackSessionId: "session",
      accountScope: "public", url: new URL("https://radio.example.invalid/live"), expiresAt: 2_000, allowedHosts: ["example.invalid"]
    });
    expect((await createRemoteMediaResponse(new Request(`studyroom-media://provider/${token}`), registry)).status).toBe(404);
    expect((await createRemoteMediaResponse(new Request(`studyroom-media://radio/${token}`, { headers: { Range: "items=0-2" } }), registry)).status).toBe(416);
    registry.invalidateSession("session");
    expect((await createRemoteMediaResponse(new Request(`studyroom-media://radio/${token}`), registry)).status).toBe(404);
  });
});
