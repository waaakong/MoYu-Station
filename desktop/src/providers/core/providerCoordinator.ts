import { randomUUID } from "node:crypto";
import { PROVIDER_IDS } from "@studyroom/contracts";
import type {
  AggregatedSearchPage,
  ProviderCapability,
  ProviderCapabilityStatus,
  ProviderPlaybackRequest,
  ProviderId,
  ProviderRuntimeStatus,
  ProviderTrackRef
} from "@studyroom/contracts";
import { CircuitBreaker } from "./circuitBreaker";
import type { ProviderAdapter, ProviderOperationContext } from "./providerAdapter";
import { isCancellation, normalizeProviderError, ProviderError } from "./providerErrors";
import { ProviderRegistry } from "./providerRegistry";
import { GlobalRequestBudget, RequestBudget } from "./requestBudget";
import { SearchOrchestrator, type ProviderSearchProgress } from "./searchOrchestrator";
import { SourcePolicy } from "./sourcePolicy";

export interface ProviderCoordinatorOptions {
  authorize?: (id: ProviderId, mode: 'use' | 'login' | 'refresh') => Promise<() => void>;
  accountBound?: (id: ProviderId) => boolean;
  requireLogin?: boolean;
  experimentalBuild: boolean;
  consentGranted: boolean;
  enabledProviders: Partial<Record<ProviderId, boolean>>;
  enabledCapabilities?: Partial<Record<ProviderId, Partial<Record<ProviderCapability, boolean>>>>;
  registry?: ProviderRegistry;
  now?: () => number;
  onProgress?: (event: ProviderSearchProgress) => void;
  onSessionExpired?: (providerId:ProviderId) => void;
  mapMetadata?: <T>(providerId:ProviderId,value:T)=>T;
  onInvalidate?: (providerId:ProviderId)=>void;
}

export class ProviderCoordinator {
  private readonly registry: ProviderRegistry;
  private readonly budgets = new Map<ProviderId, RequestBudget>();
  private readonly breakers = new Map<ProviderId, CircuitBreaker>();
  private readonly globalBudget = new GlobalRequestBudget(4);
  private readonly sourcePolicy = new SourcePolicy();
  private readonly searcher: SearchOrchestrator;
  private readonly now: () => number;
  private readonly knownGroups = new Map<string, { expiresAt: number; candidates: ProviderTrackRef[] }>();
  private readonly lifetimes = new Map<ProviderId, AbortController>();
  private readonly suspended = new Set<ProviderId>();
  private readonly accountErrors = new Map<ProviderId, ProviderError["code"]>();
  private readonly logoutJobs = new Map<ProviderId, Promise<void>>();
  private disposed = false;

  constructor(private readonly options: ProviderCoordinatorOptions) {
    this.registry = options.registry ?? new ProviderRegistry();
    this.now = options.now ?? Date.now;
    this.searcher = new SearchOrchestrator(
      (providerId, query, pageSize, signal) => this.run(providerId, "search", "normal", signal, (adapter, context) => adapter.search({ query, pageSize }, context)),
      options.onProgress
    );
  }

  async setConsent(consentGranted: boolean, cleanup?: (providerId: ProviderId) => Promise<void>): Promise<void> {
    this.options.consentGranted = consentGranted;
    if (!consentGranted) {
      this.searcher.cancel();
      const results = await Promise.allSettled(PROVIDER_IDS.map(id => this.logout(id, () => cleanup?.(id) ?? Promise.resolve())));
      if (results.some(result => result.status === "rejected")) throw new ProviderError("PROVIDER_UNAVAILABLE");
    }
  }

  register(providerId: ProviderId, factory: () => ProviderAdapter): void {
    this.registry.register(providerId, factory);
  }

  enabled(providerId: ProviderId): boolean {
    return !this.disposed && !this.suspended.has(providerId) && this.options.experimentalBuild && this.options.consentGranted && this.options.enabledProviders[providerId] === true;
  }

  statuses(providerIds: readonly ProviderId[]): ProviderRuntimeStatus[] {
    return providerIds.map((providerId) => {
      if (!this.enabled(providerId)) return {
        providerId,
        enabled: false,
        state: "unavailable",
        capabilities: [],
        errorCode: "PROVIDER_DISABLED"
      };
      const adapter = this.registry.get(providerId);
      if (!adapter) return {
        providerId,
        enabled: false,
        state: "unavailable",
        capabilities: [],
        errorCode: "PROVIDER_API_CHANGED"
      };
      if (adapter.blockedReason) return {
        providerId,
        enabled: false,
        state: "unavailable",
        capabilities: [],
        errorCode: adapter.blockedReason,
        capabilityStatuses: adapter.capabilities.map((capability) => ({
          capability,
          state: this.capabilityEnabled(providerId, capability) ? "externally-blocked" : "disabled",
          errorCode: this.capabilityEnabled(providerId, capability) ? adapter.blockedReason : "PROVIDER_DISABLED"
        }))
      };
      const breaker = this.breaker(providerId);
      const circuitState = breaker.state();
      const account = this.options.accountBound && !this.options.accountBound(providerId) ? undefined : adapter.cachedAccount?.();
      return {
        providerId,
        enabled: true,
        state: circuitState === "closed" ? this.accountErrors.get(providerId)==='PROVIDER_SESSION_EXPIRED'?'expired':account?.state ?? "signed-out" : "cooling-down",
        account,
        capabilities: [...adapter.capabilities],
        supportsLogin: adapter.supportsLogin !== false,
        capabilityStatuses: adapter.capabilities.map((capability):ProviderCapabilityStatus => ({
          capability,
          state: !this.capabilityEnabled(providerId, capability) ? 'disabled'
            : circuitState !== 'closed' ? 'cooling-down'
            : (this.options.requireLogin || ['playlists','favorites'].includes(capability)||providerId==='qq'&&capability==='search') && account?.state !== 'signed-in'
              ? account?.state === 'expired' ? 'expired' : 'login-required'
              : 'available'
        })),
        errorCode: circuitState === "closed" ? this.accountErrors.get(providerId) : "PROVIDER_CIRCUIT_OPEN",
        retryAt: breaker.retryAt()
      };
    });
  }

  async refreshAccounts():Promise<void> {
    await Promise.allSettled(PROVIDER_IDS.filter(id=>this.enabled(id)).map(async id=>{
      const adapter=this.registry.get(id);if(!adapter||adapter.blockedReason)return;
      try{
        await this.run(id,"search","normal",new AbortController().signal,(current,context)=>current.accountSummary(context), 'refresh');
        this.accountErrors.delete(id);
      }catch(error){if(!isCancellation(error))this.accountErrors.set(id,normalizeProviderError(error).code);}
    }));
  }

  async withLoginAdapter<T>(providerId:ProviderId,operation:(adapter:ProviderAdapter,context:ProviderOperationContext)=>Promise<T>):Promise<T>{
    return this.run(providerId,"search","normal",new AbortController().signal,(adapter,context)=>{
      if(adapter.supportsLogin===false)throw new ProviderError("PROVIDER_DISABLED");
      return operation(adapter,context);
    }, 'login');
  }

  async searchProvider(providerId: ProviderId, query: string, pageSize: number, signal = new AbortController().signal): Promise<ProviderTrackRef[]> {
    const refs=await this.run(providerId, "search", "normal", signal, (adapter, context) => adapter.search({ query, pageSize }, context));
    this.pruneKnownGroups();
    for(const ref of refs){
      if(this.knownGroups.size>=2000)this.knownGroups.delete(this.knownGroups.keys().next().value as string);
      this.knownGroups.set(ref.id,{expiresAt:this.now()+15*60_000,candidates:[ref]});
    }
    return refs;
  }

  async recommendations(providerId: ProviderId, cursor?: string, pageSize = 30) {
    return await this.run(providerId, "recommendations", "normal", new AbortController().signal, (adapter, context) => adapter.recommendations({ cursor, pageSize }, context));
  }

  async searchProviderPage(providerId:ProviderId,query:string,cursor?:string,pageSize=30):Promise<import('@studyroom/contracts').ProviderSearchPage>{
    const page=await this.run(providerId,'search','normal',new AbortController().signal,async(adapter,context)=>{
      if(adapter.searchPage)return adapter.searchPage({query,cursor,pageSize},context);
      if(cursor)throw new ProviderError('PROVIDER_UNAVAILABLE');
      const refs=await adapter.search({query,pageSize},context);
      return{providerId,fromCache:false,items:refs.map(item=>({id:item.id,title:item.title,artist:item.artists.join(' / '),album:item.album,durationMs:item.durationMs,source:{kind:'provider' as const,providerId:item.providerId,trackId:item.trackId},providerCandidates:[item],selectedProviderId:item.providerId}))};
    });
    if(page.providerId!==providerId||page.items.some(t=>t.source.kind!=='provider'||t.source.providerId!==providerId))throw new ProviderError('PROVIDER_API_CHANGED');
    this.rememberPage(page);return page;
  }

  async playlists(providerId: ProviderId, cursor?: string, pageSize = 30) {
    return await this.run(providerId, "playlists", "normal", new AbortController().signal, (adapter, context) => adapter.playlists({ cursor, pageSize }, context));
  }

  async favorites(providerId: ProviderId, cursor?: string, pageSize = 30) {
    const page=await this.run(providerId, "favorites", "normal", new AbortController().signal, (adapter, context) => adapter.favorites({ cursor, pageSize }, context));
    this.rememberPage(page);return page;
  }

  async playlistTracks(providerId: ProviderId, playlistId: string, cursor?: string, pageSize = 30) {
    const page=await this.run(providerId, "playlists", "normal", new AbortController().signal, (adapter, context) => adapter.playlistTracks(playlistId, { cursor, pageSize }, context));
    this.rememberPage(page);return page;
  }

  async lyrics(providerId: ProviderId, trackId: string) {
    return await this.run(providerId, "lyrics", "normal", new AbortController().signal, (adapter, context) => adapter.lyrics(trackId, context));
  }

  async artwork(providerId:ProviderId,trackId:string):Promise<string|undefined>{
    const ref=await this.run(providerId,'search','normal',new AbortController().signal,(adapter,context)=>adapter.trackDetails?.(trackId,context)??Promise.resolve(undefined));
    return ref?.providerId===providerId&&ref.trackId===trackId?ref.artworkUrl:undefined;
  }

  async resolvePlayback(providerId: ProviderId, trackId: string, playbackSessionId: string, accountScope: string) {
    return await this.run(providerId, "playback", "playback", new AbortController().signal, (adapter, context) => adapter.resolvePlayback({ trackId, playbackSessionId, accountScope }, context));
  }

  async searchAggregated(query: string, providers: ProviderId[], pageSize = 30): Promise<AggregatedSearchPage> {
    const result = await this.searcher.search(query, providers.filter((providerId) => this.enabled(providerId)), pageSize);
    this.pruneKnownGroups();
    for (const item of result.items) {
      if (this.knownGroups.size >= 2_000) this.knownGroups.delete(this.knownGroups.keys().next().value as string);
      this.knownGroups.set(item.id, { expiresAt: this.now() + 15 * 60_000, candidates: item.candidates.map((candidate) => ({ ...candidate })) });
    }
    return result;
  }

  async resolveKnownPlayback(request: ProviderPlaybackRequest, queuedTrack?: import("@studyroom/contracts").Track) {
    this.pruneKnownGroups();
    const group = this.knownGroups.get(request.trackId);
    const target = group?.candidates.find((candidate) =>
      candidate.providerId === request.providerId && candidate.trackId === request.providerTrackId
    );
    // The queue is read by the main process, never accepted as an IPC argument.
    // Persisted metadata is identity only, not an enduring playback entitlement.
    if (!target && queuedTrack?.id === request.trackId && queuedTrack.source.kind === "provider"
      && queuedTrack.source.providerId === request.providerId && queuedTrack.source.trackId === request.providerTrackId
      && !request.fallbackReason && !request.fromProviderId) {
      return this.run(request.providerId,"playback","playback",new AbortController().signal,async(adapter,context)=>{
        if (!adapter.trackDetails) throw new ProviderError("PROVIDER_UNAVAILABLE");
        const fresh = await adapter.trackDetails(request.providerTrackId,context);
        context.signal.throwIfAborted();
        if (!fresh || fresh.providerId !== request.providerId || fresh.trackId !== request.providerTrackId)
          throw new ProviderError("PROVIDER_UNAVAILABLE");
        if (!fresh.isAvailable || fresh.rights !== "available") throw new ProviderError("PROVIDER_RIGHTS_RESTRICTED");
        return adapter.resolvePlayback({trackId:request.providerTrackId,playbackSessionId:request.playbackSessionId,accountScope:"local"},context);
      });
    }
    if (!target || !target.isAvailable || target.rights !== "available") throw new ProviderError("PROVIDER_UNAVAILABLE");
    if (request.fallbackReason || request.fromProviderId) {
      if(request.fromProviderId!==request.providerId)throw new ProviderError("PROVIDER_RIGHTS_RESTRICTED");
      if (!request.fallbackReason || !request.fromProviderId) throw new ProviderError("PROVIDER_UNAVAILABLE");
      const source = group?.candidates.find((candidate) => candidate.providerId === request.fromProviderId);
      if (!source || !this.sourcePolicy.canFallback(request.fallbackReason, source, target)) {
        throw new ProviderError("PROVIDER_RIGHTS_RESTRICTED");
      }
    }
    return await this.resolvePlayback(request.providerId, request.providerTrackId, request.playbackSessionId, "local");
  }

  setPreferredOrder(order: ProviderId[]): ProviderId[] {
    this.sourcePolicy.setPreferredOrder(order);
    return this.sourcePolicy.order();
  }

  logout(providerId: ProviderId, cleanup?: () => Promise<void>): Promise<void> {
    const existing = this.logoutJobs.get(providerId);
    if (existing) return existing;
    this.suspended.add(providerId);
    this.options.onInvalidate?.(providerId);
    this.accountErrors.delete(providerId);
    this.lifetimes.get(providerId)?.abort();
    this.lifetimes.delete(providerId);
    this.searcher.cancel();
    this.knownGroups.clear();
    const job = (async () => {
      const adapter = this.registry.get(providerId);
      const results = await Promise.allSettled([
        Promise.resolve().then(async () => { if (adapter) await adapter.logout(); }),
        Promise.resolve().then(async () => { await this.registry.dispose(providerId); }),
        Promise.resolve().then(async () => { await cleanup?.(); })
      ]);
      if (results.some(result => result.status === "rejected")) throw new ProviderError("PROVIDER_UNAVAILABLE");
      this.suspended.delete(providerId);
    })().finally(() => this.logoutJobs.delete(providerId));
    this.logoutJobs.set(providerId, job);
    return job;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const lifetime of this.lifetimes.values()) lifetime.abort();
    this.lifetimes.clear();
    this.searcher.cancel();
    this.knownGroups.clear();
    await this.registry.dispose();
  }

  invalidateApplicationSession(): void {
    for (const lifetime of this.lifetimes.values()) lifetime.abort();
    this.lifetimes.clear(); this.searcher.cancel(); this.knownGroups.clear();
    for (const id of PROVIDER_IDS) this.options.onInvalidate?.(id);
  }

  private pruneKnownGroups(): void {
    const now = this.now();
    for (const [id, group] of this.knownGroups) if (group.expiresAt <= now) this.knownGroups.delete(id);
  }

  private rememberPage(page:import("@studyroom/contracts").ProviderSearchPage):void{
    this.pruneKnownGroups();
    for(const item of page.items){
      if(this.knownGroups.size>=2000)this.knownGroups.delete(this.knownGroups.keys().next().value as string);
      this.knownGroups.set(item.id,{expiresAt:this.now()+15*60_000,candidates:item.providerCandidates??[]});
    }
  }

  private async run<T>(
    providerId: ProviderId,
    capability: ProviderCapability,
    kind: "normal" | "playback",
    signal: AbortSignal,
    operation: (adapter: ProviderAdapter, context: { signal: AbortSignal; correlationId: string }) => Promise<T>,
    mode: 'use' | 'login' | 'refresh' = 'use'
  ): Promise<T> {
    if (!this.enabled(providerId)) throw new ProviderError("PROVIDER_DISABLED");
    if (!this.capabilityEnabled(providerId, capability)) throw new ProviderError("PROVIDER_DISABLED");
    const assertIdentity = await this.options.authorize?.(providerId, mode);
    assertIdentity?.();
    const adapter = this.registry.get(providerId);
    if (!adapter) throw new ProviderError("PROVIDER_API_CHANGED");
    if (adapter.blockedReason) throw new ProviderError(adapter.blockedReason);
    if (!adapter.capabilities.includes(capability)) throw new ProviderError("PROVIDER_DISABLED");
    let lifetime = this.lifetimes.get(providerId);
    if (!lifetime) { lifetime = new AbortController();this.lifetimes.set(providerId, lifetime); }
    const currentSignal = AbortSignal.any([signal, lifetime.signal]);
    currentSignal.throwIfAborted();
    const breaker = this.breaker(providerId);
    if (!breaker.acquire()) throw new ProviderError("PROVIDER_CIRCUIT_OPEN", "PROVIDER_CIRCUIT_OPEN", true);
    const globalRelease = kind === "normal" ? await this.globalBudget.acquire(currentSignal) : undefined;
    let providerRelease: (() => void) | undefined;
    try {
      providerRelease = await this.budget(providerId).acquire(kind, currentSignal);
      currentSignal.throwIfAborted();
      if(breaker.state()==='open')throw new ProviderError('PROVIDER_CIRCUIT_OPEN');
      const context = { signal: currentSignal, correlationId: randomUUID() };
      if (mode === 'use' && this.options.requireLogin) {
        const account = await adapter.accountSummary(context);
        currentSignal.throwIfAborted(); assertIdentity?.();
        if (account?.state !== 'signed-in') throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
      }
      const value = await operation(adapter, context);
      currentSignal.throwIfAborted();
      assertIdentity?.();
      breaker.succeed();
      return this.options.mapMetadata?.(providerId,value) ?? value;
    } catch (error) {
      if (isCancellation(error)) throw error;
      const normalized = normalizeProviderError(error);
      if(normalized.code==='PROVIDER_SESSION_EXPIRED'){
        this.accountErrors.set(providerId,normalized.code);
        this.lifetimes.get(providerId)?.abort();this.lifetimes.delete(providerId);
        this.searcher.cancel();this.knownGroups.clear();
        this.options.onSessionExpired?.(providerId);
      }
      if(normalized.code==='PROVIDER_RATE_LIMITED')breaker.defer(normalized.retryAfterMs??60_000);
      breaker.fail(normalized.retryable);
      throw normalized;
    } finally {
      providerRelease?.();
      globalRelease?.();
    }
  }

  private budget(providerId: ProviderId): RequestBudget {
    let budget = this.budgets.get(providerId);
    if (!budget) {
      budget = new RequestBudget();
      this.budgets.set(providerId, budget);
    }
    return budget;
  }

  private breaker(providerId: ProviderId): CircuitBreaker {
    let breaker = this.breakers.get(providerId);
    if (!breaker) {
      breaker = new CircuitBreaker({ now: this.now });
      this.breakers.set(providerId, breaker);
    }
    return breaker;
  }

  private capabilityEnabled(providerId: ProviderId, capability: ProviderCapability): boolean {
    const configured = this.options.enabledCapabilities?.[providerId];
    return configured ? configured[capability] === true : true;
  }
}
