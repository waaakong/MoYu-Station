import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ApiError } from "../src/services/http";

const services = vi.hoisted(() => ({ reverifyAdmin: vi.fn() }));
vi.mock("../src/services/admin", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/services/admin")>()), reverifyAdmin: services.reverifyAdmin }));
vi.mock("../src/services/clientUpdates", () => ({ fetchClientReleases: vi.fn(), fetchUpdateMembers: vi.fn(), setUpdateMember: vi.fn(), updateClientRelease: vi.fn() }));

import { useAdminStore } from "../src/stores/admin";
import { useAuthStore } from '../src/stores/auth';

describe("administrator reverification coordinator", () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); useAuthStore().user={id:1,username:'admin',userType:'ADMIN'} as any; });

  it("replays only the explicitly requested operation once after verification", async () => {
    const store = useAdminStore();
    const action = vi.fn()
      .mockRejectedValueOnce(new ApiError("verify", { code: "ADMIN_REVERIFY_REQUIRED" }))
      .mockResolvedValueOnce(undefined);
    services.reverifyAdmin.mockResolvedValue({ expiresAt: Date.now() + 60_000 });

    await store.risky("更新角色", action);
    expect(store.reverifyOpen).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);

    await store.confirmReverification("correct password");
    expect(action).toHaveBeenCalledTimes(2);
    expect(store.pendingAction).toBeNull();
    expect(store.reverifyOpen).toBe(false);
  });

  it("never writes again when verification is cancelled or the network fails", async () => {
    const store = useAdminStore();
    const cancelled = vi.fn().mockRejectedValue(new ApiError("verify", { code: "ADMIN_REVERIFY_REQUIRED" }));
    await store.risky("删除动态", cancelled);
    store.cancelReverification();
    expect(cancelled).toHaveBeenCalledTimes(1);

    const blocked = vi.fn().mockRejectedValue(new ApiError("verify", { code: "ADMIN_REVERIFY_REQUIRED" }));
    services.reverifyAdmin.mockRejectedValueOnce(new ApiError("offline", { code: "NETWORK" }));
    await store.risky("撤回发布", blocked);
    await store.confirmReverification("password");
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(store.reverifyOpen).toBe(true);
    expect(store.reverifyError).toContain("offline");
  });
  it('does not replay a previous account action after switching accounts',async()=>{
    const store=useAdminStore(),action=vi.fn().mockRejectedValue(new ApiError('verify',{code:'ADMIN_REVERIFY_REQUIRED'}));
    await store.risky('创建邀请码',action);
    useAuthStore().clearLocalSession();useAuthStore().user={id:2,username:'other',userType:'ADMIN'} as any;
    services.reverifyAdmin.mockResolvedValue({});await store.confirmReverification('password');expect(action).toHaveBeenCalledTimes(1);expect(store.pendingAction).toBeNull();
  });
  it('keeps the actual operation failure visible after successful reverification',async()=>{
    const store=useAdminStore(),action=vi.fn().mockRejectedValueOnce(new ApiError('verify',{code:'ADMIN_REVERIFY_REQUIRED'})).mockRejectedValueOnce(new Error('提交结果未确认'));
    await store.risky('创建邀请码',action);services.reverifyAdmin.mockResolvedValue({});await store.confirmReverification('password');expect(store.errors.action).toBe('提交结果未确认');
  });
});
