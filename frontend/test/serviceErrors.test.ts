import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn()
}));

vi.mock("../src/services/http", () => ({ http: request }));
vi.mock('../src/stores/auth',()=>({useAuthStore:()=>({user:{id:1},sessionGeneration:0,authTransition:false})}));

import { fetchAdminDashboard } from "../src/services/admin";
import { deleteOwnPost, fetchProfileOverview, submitFeedback } from "../src/services/profile";

describe("service error propagation", () => {
  beforeEach(() => vi.resetAllMocks());

  it("does not replace failed admin reads with a zero dashboard", async () => {
    request.get.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchAdminDashboard()).rejects.toThrow("offline");
  });

  it("does not replace failed profile reads with demo account data", async () => {
    request.get.mockRejectedValue(new Error("offline"));
    await expect(fetchProfileOverview()).rejects.toThrow("offline");
  });

  it("does not report post deletion or feedback submission as successful on failure", async () => {
    request.delete.mockRejectedValueOnce(new Error("delete failed"));
    request.post.mockRejectedValueOnce(new Error("feedback failed"));
    request.get.mockResolvedValueOnce({data:{data:{reliableCreate:true}}});
    await expect(deleteOwnPost(9)).rejects.toThrow("delete failed");
    await expect(submitFeedback({ title: "x", content: "details", feedbackType: "SUGGESTION" })).rejects.toThrow("提交结果未确认");
  });
});
