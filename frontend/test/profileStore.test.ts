import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const localApi = vi.hoisted(() => ({ readLocalProfileSummary: vi.fn() }));
const cloudApi = vi.hoisted(() => ({
  fetchProfile: vi.fn(), fetchProfileStats: vi.fn(), fetchProfileCalendar: vi.fn(), fetchProfilePosts: vi.fn(), fetchShareCard: vi.fn(),
  deleteOwnPost: vi.fn(), submitFeedback: vi.fn(), updateNickname: vi.fn(), updateOwnPassword: vi.fn(), uploadAvatar: vi.fn()
}));
vi.mock("../src/services/localProfile", () => localApi);
vi.mock("../src/services/profile", () => cloudApi);

import { useProfileStore } from "../src/stores/profile";
import { useAuthStore } from '../src/stores/auth';

describe("profile store local/cloud boundary", () => {
  beforeEach(() => {
    setActivePinia(createPinia()); vi.clearAllMocks();
    localApi.readLocalProfileSummary.mockResolvedValue({ status: "desktop-required" });
    cloudApi.fetchProfile.mockResolvedValue({ id: 2, username: "member", nickname: "Member", userType: "NORMAL", passwordChangeRequired: false });
    cloudApi.fetchProfileStats.mockResolvedValue({ todayFocusMinutes: 20 });
    cloudApi.fetchProfileCalendar.mockResolvedValue([]); cloudApi.fetchProfilePosts.mockResolvedValue([]); cloudApi.fetchShareCard.mockResolvedValue({});
  });

  it("loads only the local summary for an unauthenticated visitor", async () => {
    const store = useProfileStore(); await store.initialize(false);
    expect(localApi.readLocalProfileSummary).toHaveBeenCalledOnce();
    expect(cloudApi.fetchProfile).not.toHaveBeenCalled();
    expect(cloudApi.fetchProfileStats).not.toHaveBeenCalled();
    expect(store.local).toEqual({ status: "desktop-required" });
  });

  it("keeps successful cloud modules when one module fails", async () => {
    useAuthStore().user = { id: 2, username: 'member', nickname: 'Member', userType: 'NORMAL', passwordChangeRequired: false };
    cloudApi.fetchProfileStats.mockRejectedValueOnce(new Error("stats offline"));
    const store = useProfileStore(); await store.initialize(true);
    expect(store.account?.username).toBe("member");
    expect(store.errors.stats).toBe("stats offline");
    expect(store.posts).toEqual([]);
  });
  it('discards late reads and errors across an account change', async () => {
    const auth=useAuthStore(),store=useProfileStore();
    auth.user={id:2,username:'member',nickname:'Member',userType:'NORMAL',passwordChangeRequired:false};
    let finish!: (value: any)=>void;
    const pending=store.loadModule('stats',()=>new Promise(resolve=>{finish=resolve;}),value=>{store.stats=value as any;});
    auth.clearLocalSession();
    auth.user={id:3,username:'next',nickname:'Next',userType:'NORMAL',passwordChangeRequired:false};
    finish({todayFocusMinutes:999});await pending;
    expect(store.stats).toBeNull();expect(store.loading.has('stats')).toBe(false);
  });
  it('keeps the latest module result when requests finish out of order',async()=>{
    const auth=useAuthStore(),store=useProfileStore();
    auth.user={id:2,username:'member',nickname:'Member',userType:'NORMAL',passwordChangeRequired:false};
    let finish!: (value:any)=>void;
    const first=store.loadModule('calendar',()=>new Promise(resolve=>{finish=resolve;}),value=>{store.calendar=value as any;});
    await store.loadModule('calendar',async()=>[{date:'2026-09-28'}],value=>{store.calendar=value as any;});
    finish([{date:'2026-08-01'}]);await first;
    expect(store.calendar[0]).toEqual({date:'2026-09-28'});
  });
  it('cannot replace the new account with a late nickname save',async()=>{
    const auth=useAuthStore(),store=useProfileStore();
    auth.user={id:2,username:'member',nickname:'Member',userType:'NORMAL',passwordChangeRequired:false};
    let finish!: (value:any)=>void;
    cloudApi.updateNickname.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=store.saveNickname('old');const rejected=expect(pending).rejects.toThrow('账号已变化');
    auth.clearLocalSession();auth.user={id:3,username:'next',nickname:'Next',userType:'NORMAL',passwordChangeRequired:false};
    finish({id:2,username:'member',nickname:'old'});await rejected;
    expect(auth.user.id).toBe(3);expect(store.account).toBeNull();
  });
  it('does not report a successful password write as failed when profile reload fails',async()=>{
    const auth=useAuthStore(),store=useProfileStore();
    auth.user={id:2,username:'member',nickname:'Member',userType:'NORMAL',passwordChangeRequired:true};
    cloudApi.updateOwnPassword.mockResolvedValueOnce(undefined);
    cloudApi.fetchProfile.mockRejectedValueOnce(new Error('offline'));
    await expect(store.changePassword({oldPassword:'old-fixture',newPassword:'new-fixture'})).resolves.toBeUndefined();
    expect(auth.passwordChangeRequired).toBe(false);expect(store.errors.account).toBe('offline');
  });
});
