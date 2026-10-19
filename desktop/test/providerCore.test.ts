import { describe, expect, it, vi } from "vitest";
import type { Track, ProviderTrackRef } from "@studyroom/contracts";
import type { ProviderAdapter, ProviderOperationContext } from "../src/providers/core/providerAdapter";
import { CircuitBreaker } from "../src/providers/core/circuitBreaker";
import { ProviderCoordinator } from "../src/providers/core/providerCoordinator";
import { ProviderError } from "../src/providers/core/providerErrors";
import { ProviderRegistry } from "../src/providers/core/providerRegistry";
import { RequestBudget } from "../src/providers/core/requestBudget";
import { SourcePolicy } from "../src/providers/core/sourcePolicy";
import { SearchOrchestrator } from "../src/providers/core/searchOrchestrator";

function adapter(search: ProviderAdapter["search"]): ProviderAdapter {
  return {
    providerId: "netease",
    capabilities: ["search"],
    accountSummary: async () => undefined,
    search,
    recommendations: async () => ({ providerId: "netease", items: [], fromCache: false }),
    playlists: async () => ({ providerId: "netease", items: [], fromCache: false }),
    favorites: async () => ({ providerId: "netease", items: [], fromCache: false }),
    playlistTracks: async () => ({ providerId: "netease", items: [], fromCache: false }),
    lyrics: async () => undefined,
    resolvePlayback: async () => { throw new ProviderError("PROVIDER_UNAVAILABLE"); },
    logout: async () => undefined,
    dispose: async () => undefined
  };
}

describe("provider coordination core", () => {
  it("revalidates an exact persisted queue identity after restart without trusting saved rights",async()=>{
    const coordinator=new ProviderCoordinator({experimentalBuild:true,consentGranted:true,enabledProviders:{netease:true}});
    const fresh={providerId:"netease",trackId:"1",rights:"available",isAvailable:true} as ProviderTrackRef;
    const details=vi.fn(async()=>fresh),resolve=vi.fn(async()=>({providerId:"netease" as const,trackId:"1",url:new URL("https://m701.music.126.net/a"),expiresAt:Date.now()+10000,allowedHosts:["m701.music.126.net"]}));
    coordinator.register("netease",()=>({...adapter(async()=>[]),capabilities:['search','playback'],trackDetails:details,resolvePlayback:resolve}));
    const request={providerId:"netease" as const,trackId:"aggregate:netease:1",providerTrackId:"1",playbackSessionId:"session-12345678"};
    const queued={id:request.trackId,title:"Saved",artist:"Saved",source:{kind:"provider",providerId:"netease",trackId:"1"}} as Track;
    await expect(coordinator.resolveKnownPlayback(request)).rejects.toMatchObject({code:"PROVIDER_UNAVAILABLE"});
    await expect(coordinator.resolveKnownPlayback(request,{...queued,source:{kind:"provider",providerId:"qq",trackId:"1"}})).rejects.toMatchObject({code:"PROVIDER_UNAVAILABLE"});
    expect(details).not.toHaveBeenCalled();
    expect((await coordinator.resolveKnownPlayback(request,queued)).trackId).toBe("1");
    expect(details).toHaveBeenCalledTimes(1);expect(resolve).toHaveBeenCalledTimes(1);
    details.mockResolvedValue({...fresh,rights:"subscription-required",isAvailable:false});
    await expect(coordinator.resolveKnownPlayback(request,queued)).rejects.toMatchObject({code:"PROVIDER_RIGHTS_RESTRICTED"});
    expect(resolve).toHaveBeenCalledTimes(1);
    details.mockResolvedValue({...fresh,trackId:"2"});
    await expect(coordinator.resolveKnownPlayback(request,queued)).rejects.toMatchObject({code:"PROVIDER_UNAVAILABLE"});
    await coordinator.dispose();
  });
  it("cannot finish queue revalidation after platform logout",async()=>{
    const coordinator=new ProviderCoordinator({experimentalBuild:true,consentGranted:true,enabledProviders:{netease:true}});
    let finish!:(value:ProviderTrackRef)=>void;
    const resolve=vi.fn();
    coordinator.register("netease",()=>({...adapter(async()=>[]),capabilities:['search','playback'],trackDetails:()=>new Promise(done=>finish=done),resolvePlayback:resolve}));
    const pending=coordinator.resolveKnownPlayback({providerId:"netease",trackId:"netease:1",providerTrackId:"1",playbackSessionId:"session-12345678"},{id:"netease:1",title:"Saved",artist:"Saved",source:{kind:"provider",providerId:"netease",trackId:"1"}});
    const outcome=expect(pending).rejects.toMatchObject({name:"AbortError"});
    await new Promise(done=>setTimeout(done,0));await coordinator.logout("netease");
    finish({providerId:"netease",trackId:"1",rights:"available",isAvailable:true} as ProviderTrackRef);
    await outcome;expect(resolve).not.toHaveBeenCalled();await coordinator.dispose();
  });
  it('distinguishes implemented capabilities from gated playback and private login requirements',async()=>{
    const coordinator=new ProviderCoordinator({experimentalBuild:true,consentGranted:true,enabledProviders:{netease:true},enabledCapabilities:{netease:{search:true,playlists:true,playback:false}}});
    coordinator.register('netease',()=>({...adapter(async()=>[]),capabilities:['search','playlists','playback']}));
    expect(coordinator.statuses(['netease'])[0]?.capabilityStatuses).toEqual([
      {capability:'search',state:'available'},{capability:'playlists',state:'login-required'},{capability:'playback',state:'disabled'}
    ]);await coordinator.dispose();
  });
  it("logout aborts running and queued requests and drops adapters that ignore abort", async () => {
    const coordinator = new ProviderCoordinator({ experimentalBuild:true, consentGranted:true, enabledProviders:{netease:true} });
    const finishes: (() => void)[] = [], signals: AbortSignal[] = [];
    coordinator.register("netease", () => adapter(async (_input, context) => {
      signals.push(context.signal);await new Promise<void>(resolve => finishes.push(resolve));return [];
    }));
    const pending = Array.from({length:3}, () => coordinator.searchProvider("netease", "rain", 30));
    const outcomes = Promise.allSettled(pending);
    await new Promise(resolve => setTimeout(resolve, 0));expect(signals).toHaveLength(2);
    await coordinator.logout("netease");expect(signals.every(signal=>signal.aborted)).toBe(true);
    finishes.forEach(finish=>finish());
    const results = await outcomes;
    expect(results.every(result => result.status === "rejected" && result.reason.name === "AbortError")).toBe(true);
    expect(signals).toHaveLength(2);await coordinator.dispose();
  });

  it("blocks while cleanup is pending or failed and permits a retry without replaying requests", async () => {
    const coordinator = new ProviderCoordinator({ experimentalBuild:true, consentGranted:true, enabledProviders:{netease:true} });
    coordinator.register("netease", () => adapter(async()=>[]));
    let finish!: () => void;
    const cleanup = coordinator.logout("netease", () => new Promise<void>(resolve=>{finish=resolve;}));
    expect(coordinator.enabled("netease")).toBe(false);
    await Promise.resolve();finish();await cleanup;expect(coordinator.enabled("netease")).toBe(true);
    await expect(coordinator.logout("netease",async()=>{throw new Error("disk");})).rejects.toMatchObject({code:"PROVIDER_UNAVAILABLE"});
    await expect(coordinator.searchProvider("netease","rain",30)).rejects.toMatchObject({code:"PROVIDER_DISABLED"});
    await coordinator.logout("netease",async()=>undefined);expect(coordinator.enabled("netease")).toBe(true);
    await coordinator.dispose();
  });

  it("revoking consent cleans every platform and disposal prevents reopening work", async () => {
    const coordinator = new ProviderCoordinator({ experimentalBuild:true, consentGranted:true, enabledProviders:{netease:true} });
    coordinator.register("netease", () => adapter(async()=>[]));
    const cleaned:string[]=[];
    await coordinator.setConsent(false,async id=>{cleaned.push(id);});
    expect(cleaned.sort()).toEqual(["kugou","netease","qq"]);
    expect(coordinator.enabled("netease")).toBe(false);
    await coordinator.setConsent(true);await coordinator.dispose();
    await expect(coordinator.searchProvider("netease","rain",30)).rejects.toMatchObject({code:"PROVIDER_DISABLED"});
  });

  it("does not instantiate disabled providers", async () => {
    let created = 0;
    const registry = new ProviderRegistry();
    registry.register("netease", () => { created += 1; return adapter(async () => []); });
    const coordinator = new ProviderCoordinator({
      experimentalBuild: false,
      consentGranted: true,
      enabledProviders: { netease: true },
      registry
    });
    await expect(coordinator.searchProvider("netease", "rain", 30)).rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
    expect(created).toBe(0);
  });

  it("rejects a renderer-supplied playback reference that was never returned by search", async () => {
    const coordinator = new ProviderCoordinator({
      experimentalBuild: true,
      consentGranted: true,
      enabledProviders: { netease: true }
    });
    coordinator.register("netease", () => adapter(async () => []));
    await expect(coordinator.resolveKnownPlayback({
      providerId: "netease",
      trackId: "aggregate:forged",
      providerTrackId: "forged",
      playbackSessionId: "session-12345678"
    })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("limits one provider to two normal requests", async () => {
    const budget = new RequestBudget();
    const first = await budget.acquire("normal");
    const second = await budget.acquire("normal");
    let thirdAcquired = false;
    const third = budget.acquire("normal").then((release) => { thirdAcquired = true; release(); });
    await Promise.resolve();
    expect(budget.active("normal")).toBe(2);
    expect(thirdAcquired).toBe(false);
    first();
    await third;
    expect(thirdAcquired).toBe(true);
    second();
  });

  it("opens after three retryable failures and allows one half-open probe", () => {
    let now = 1_000;
    const breaker = new CircuitBreaker({ now: () => now });
    breaker.fail(true); breaker.fail(true); breaker.fail(true);
    expect(breaker.state()).toBe("open");
    expect(breaker.acquire()).toBe(false);
    now += 60_000;
    expect(breaker.state()).toBe("half-open");
    expect(breaker.acquire()).toBe(true);
    expect(breaker.acquire()).toBe(false);
    breaker.succeed();
    expect(breaker.state()).toBe("closed");
  });

  it("does not open for rights failures", async () => {
    let calls = 0;
    const coordinator = new ProviderCoordinator({
      experimentalBuild: true,
      consentGranted: true,
      enabledProviders: { netease: true }
    });
    coordinator.register("netease", () => adapter(async (_input, _context: ProviderOperationContext) => {
      calls += 1;
      throw new ProviderError("PROVIDER_RIGHTS_RESTRICTED", "blocked", false);
    }));
    for (let index = 0; index < 4; index += 1) {
      await expect(coordinator.searchProvider("netease", "rain", 30)).rejects.toMatchObject({ code: "PROVIDER_RIGHTS_RESTRICTED" });
    }
    expect(calls).toBe(4);
  });

  it("only falls back for safe transient reasons and high-confidence matches", () => {
    const policy = new SourcePolicy(["qq", "netease", "kugou"]);
    const from = { id: "n:1", providerId: "netease" as const, trackId: "1", title: "Rain", artists: ["A"], versionTags: [], quality: "standard" as const, rights: "available" as const, isAvailable: true, matchScore: 1 };
    const to = { ...from, id: "q:1", providerId: "qq" as const, matchScore: 0.96 };
    expect(policy.canFallback("timeout", from, to)).toBe(true);
    expect(policy.canFallback("timeout", from, { ...to, matchScore: 0.9 })).toBe(false);
    expect(policy.candidates([from, to])[0]?.providerId).toBe("qq");
  });

  it("cancels stale searches and reports the bounded overall timeout", async () => {
    let finishOld: (() => void) | undefined;
    const progress: string[] = [];
    const orchestrator = new SearchOrchestrator(async (_providerId, query, _pageSize, signal) => {
      if (query === "old") await new Promise<void>((resolve) => { finishOld = resolve; });
      if (query === "slow") await new Promise<void>((resolve) => setTimeout(resolve, 20));
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      return [];
    }, (event) => progress.push(`${event.providerId}:${event.errorCode ?? "ok"}`), 5);
    const old = orchestrator.search("old", ["netease"]);
    await Promise.resolve();
    const current = await orchestrator.search("new", ["qq"]);
    finishOld?.();
    expect((await old).items).toEqual([]);
    expect(current.completedProviders).toEqual(["qq"]);
    expect(progress).not.toContain("netease:ok");
    const timedOut = await orchestrator.search("slow", ["kugou"]);
    expect(timedOut.failedProviders).toEqual({ kugou: "PROVIDER_TIMEOUT" });
  });
});
