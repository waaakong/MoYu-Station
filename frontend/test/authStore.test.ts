import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const accountApi = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  loginAccount: vi.fn(),
  registerAccount: vi.fn(),
  logoutAccount: vi.fn()
}));

vi.mock("../src/services/auth", () => accountApi);

import { useAuthStore } from "../src/stores/auth";
import { chatMemory, textOutbox } from '../src/chat/chatMemory';
import { sessionMediaDrafts } from '../src/media/sessionDrafts';

const member = {
  id: 7,
  username: "member",
  nickname: "Member",
  userType: "NORMAL",
  onlineStatus: "IDLE",
  passwordChangeRequired: false
};

describe("auth store", () => {
  it('keeps a previously verified account on temporary failures without inventing an offline identity', async () => {
    const store = useAuthStore(); store.user = member; const generation = store.sessionGeneration;
    accountApi.fetchCurrentUser.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
    await store.loadCurrentUser(); expect(store.user?.id).toBe(member.id); expect(store.sessionGeneration).toBe(generation);
    expect(store.sessionCheckError).toContain('重试');
    store.clearLocalSession(); accountApi.fetchCurrentUser.mockRejectedValueOnce(new Error('network'));
    await store.loadCurrentUser(); expect(store.user).toBeNull();
  });
  it.each(['AUTH_REQUIRED', 'AUTH_SESSION_EXPIRED', 'ACCOUNT_LOGGED_IN_ELSEWHERE'])('clears a revoked session on %s', async code => {
    const store = useAuthStore(); store.user = member;
    accountApi.fetchCurrentUser.mockRejectedValueOnce(Object.assign(new Error('expired'), { code }));
    await store.loadCurrentUser(); expect(store.user).toBeNull(); expect(store.sessionCheckError).toBe('');
  });
  it('recovers a lost login response only for the expected username without replaying login',async()=>{
    accountApi.loginAccount.mockRejectedValueOnce(Object.assign(new Error('desktop response lost'), { code: 'CLOUD_REQUEST_FAILED' }));
    accountApi.fetchCurrentUser.mockResolvedValueOnce(member);
    const store=useAuthStore();await store.login({username:'member',password:'fixture',rememberMe:false});
    expect(store.user?.id).toBe(member.id);expect(accountApi.loginAccount).toHaveBeenCalledOnce();
  });
  it('never adopts an unrelated old session as a successful login',async()=>{
    accountApi.loginAccount.mockRejectedValueOnce(new Error('network'));
    accountApi.fetchCurrentUser.mockResolvedValueOnce({...member,username:'another',id:8});
    const store=useAuthStore();await expect(store.login({username:'member',password:'fixture',rememberMe:false})).rejects.toThrow('network');
    expect(store.user).toBeNull();
  });
  it('clears private text drafts, pending messages and their timers before logout completes', async () => {
    vi.useFakeTimers();
    try {
      setActivePinia(createPinia());
      const store = useAuthStore(); store.user = member;
      const dispose=vi.fn(); sessionMediaDrafts.set('private:3',{dispose} as any);
      chatMemory.hallDraft = 'private draft'; chatMemory.privateDrafts['3'] = 'recipient draft';
      textOutbox.enqueue(member.id, { channelType: 'PRIVATE', receiverId: 3 }, 'pending', () => true);
      let release!: () => void;
      accountApi.logoutAccount.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
      const logout = store.logout();
      expect(chatMemory.hallDraft).toBe(''); expect(chatMemory.privateDrafts).toEqual({}); expect(chatMemory.pending).toHaveLength(0);
      expect(dispose).toHaveBeenCalledOnce(); expect(sessionMediaDrafts.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0); release(); await logout;
    } finally { vi.useRealTimers(); }
  });
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("forwards the real desktop remember-me choice without local fake state", async () => {
    accountApi.loginAccount.mockResolvedValue(member);
    const store = useAuthStore();

    await store.login({ username: "member", password: "long-password", rememberMe: true });

    expect(accountApi.loginAccount).toHaveBeenCalledWith({
      username: "member",
      password: "long-password",
      rememberMe: true
    });
    expect(store.isLoggedIn).toBe(true);
  });

  it("exposes forced password changes from the server profile", async () => {
    accountApi.fetchCurrentUser.mockResolvedValue({ ...member, passwordChangeRequired: true });
    const store = useAuthStore();

    await store.loadCurrentUser();

    expect(store.passwordChangeRequired).toBe(true);
  });

  it("keeps a banned restriction available for local-route decisions", () => {
    const store = useAuthStore();
    store.markBanned();

    expect(store.isBanned).toBe(true);
    expect(store.loaded).toBe(true);
  });

  it("registers only with an invitation-bound payload", async () => {
    accountApi.registerAccount.mockResolvedValue(member);
    const store = useAuthStore();
    const payload = {
      username: "member",
      password: "long-password",
      nickname: "member",
      invitationCode: "private-invitation"
    };

    await store.register(payload);

    expect(accountApi.registerAccount).toHaveBeenCalledWith(payload);
  });
  it("invalidates the media generation immediately on logout, before the request resolves", async () => {
    let finish!: () => void; accountApi.logoutAccount.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const store = useAuthStore(); store.user = member;
    const generation = store.sessionGeneration, pending = store.logout();
    expect(store.user).toBeNull(); expect(store.sessionGeneration).toBeGreaterThan(generation);
    expect(store.authTransition).toBe(true); finish(); await pending; expect(store.authTransition).toBe(false);
  });
  it("cannot restore a logged-out account from a late profile response", async () => {
    let finish!: (value: typeof member) => void;
    accountApi.fetchCurrentUser.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const store = useAuthStore(), pending = store.loadCurrentUser(); store.clearLocalSession(); finish(member); await pending;
    expect(store.user).toBeNull(); expect(store.loaded).toBe(true);
  });
  it("same-account relogin uses a fresh generation and rejects concurrent login", async () => {
    let finish!: (value: typeof member) => void;
    accountApi.loginAccount.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const store = useAuthStore(); store.user = member; const generation = store.sessionGeneration;
    const payload = { username: 'member', password: 'fixture-only', rememberMe: false };
    const pending = store.login(payload);
    expect(store.user).toBeNull(); expect(store.sessionGeneration).toBeGreaterThan(generation);
    await expect(store.login(payload)).rejects.toThrow('正在变更'); finish(member); await pending;
    expect(store.user?.id).toBe(member.id);
  });
  it("a late login response cannot undo an explicit session invalidation", async () => {
    let finish!: (value: typeof member) => void;
    accountApi.loginAccount.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const store = useAuthStore(), pending = store.login({ username: 'member', password: 'fixture', rememberMe: false });
    store.clearLocalSession(); finish(member); await expect(pending).rejects.toThrow('失效'); expect(store.user).toBeNull();
  });
});
