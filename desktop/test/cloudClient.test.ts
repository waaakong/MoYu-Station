import { describe, expect, it, vi } from "vitest";
import { CloudClient, boundedBytes } from "../src/main/cloud/client";
import { cloudMediaPath, validateChatFrame, validateCloudRequest } from "../src/main/cloud/policy";
import { IpcGuard } from "../src/main/ipc/guard";
import type { IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "@studyroom/contracts";

const json = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("desktop cloud policy", () => {
  it('allows only scoped read-only reliable-create queries',()=>{
    const path='/operations/FEEDBACK/11111111-1111-4111-8111-111111111111';
    expect(validateCloudRequest({method:'GET',path}).path).toBe(path);
    for(const bad of [path+'?ownerId=2',path.replace('FEEDBACK','ANY'),path.replace('11111111-1111-4111-8111-111111111111','../other')])expect(()=>validateCloudRequest({method:'GET',path:bad})).toThrow();
    expect(()=>validateCloudRequest({method:'POST',path})).toThrow();
    expect(()=>validateCloudRequest({method:'GET',path,json:'{}'})).toThrow();
  });
  it('allows exact message deletion and bounded visibility without rounding snowflake IDs',()=>{
    const message='2104509220480131074';
    expect(validateCloudRequest({method:'DELETE',path:`/chat/private/messages/${message}`}).path).toContain(message);
    expect(validateCloudRequest({method:'DELETE',path:'/chat/private/2/messages',json:JSON.stringify({throughId:message})}).json).toContain(message);
    expect(validateCloudRequest({method:'GET',path:`/chat/private/2/messages/visibility?ids=${message}%2C2104509220480131075`}).method).toBe('GET');
    for(const path of ['/chat/private/2/messages/visibility?ids=1&ownerId=3','/chat/private/2/messages/visibility?ids=-1','/chat/private/2/messages/visibility?ids='+Array(81).fill('1').join(','),'/chat/private/messages/1?ownerId=2'])expect(()=>validateCloudRequest({method:path.includes('visibility')?'GET':'DELETE',path})).toThrow();
    expect(()=>validateCloudRequest({method:'DELETE',path:'/chat/private/2/messages',json:JSON.stringify({throughId:Number(message)})})).toThrow();
    const path='/stickers/favorites/11111111-1111-4111-8111-111111111111';
    expect(validateCloudRequest({method:'PUT',path,json:JSON.stringify({messageId:message})}).method).toBe('PUT');
    expect(()=>validateCloudRequest({method:'PUT',path,json:JSON.stringify({messageId:Number(message)})})).toThrow();
  });
  it('keeps scene uploads, versioned configuration and display reads inside narrow contracts',()=>{
    const id='11111111-1111-4111-8111-111111111111';
    const upload={method:'POST',path:`/media/assets?clientUploadId=${id}&purpose=scene`,binary:{type:'image/png',bytes:new Uint8Array(20*1024*1024)}};
    expect(validateCloudRequest(upload).binary?.bytes.length).toBe(20*1024*1024);
    expect(()=>validateCloudRequest({...upload,path:`/media/assets?clientUploadId=${id}`})).toThrow();
    expect(()=>validateCloudRequest({...upload,binary:{...upload.binary,type:'image/gif'}})).toThrow();
    const picture={assetId:id,fit:'contain',focalX:.5,focalY:.5,zoom:1,dim:.2};
    const body={version:4,requestId:id,config:{name:'私人空间',defaultImage:picture,periods:{night:picture}}};
    expect(validateCloudRequest({method:'PUT',path:'/scenes/custom',json:JSON.stringify(body)}).method).toBe('PUT');
    for(const bad of [{...body,ownerId:2},{...body,version:-1},{...body,config:{...body.config,periods:{unknown:picture}}},{...body,config:{...body.config,defaultImage:{...picture,zoom:9}}}])expect(()=>validateCloudRequest({method:'PUT',path:'/scenes/custom',json:JSON.stringify(bad)})).toThrow();
    expect(()=>validateCloudRequest({method:'GET',path:'/scenes/custom?ownerId=2'})).toThrow();
    expect(cloudMediaPath(`/api/media/assets/${id}/display`)).toContain('/display');
    expect(()=>cloudMediaPath(`/api/media/assets/${id}/original`)).toThrow();
  });
  it('keeps GIF upload purpose and collection operations inside exact narrow contracts',()=>{
    const id='11111111-1111-4111-8111-111111111111';const base={method:'POST',path:`/media/assets?clientUploadId=${id}&purpose=sticker`,binary:{type:'image/gif',bytes:new Uint8Array(5*1024*1024)}};
    expect(validateCloudRequest(base).binary?.type).toBe('image/gif');
    for(const path of [`/media/assets?clientUploadId=${id}`,`${base.path}&ownerId=2`,`${base.path}&purpose=scene`,base.path.replace('sticker','scene')])expect(()=>validateCloudRequest({...base,path})).toThrow();
    expect(()=>validateCloudRequest({...base,binary:{...base.binary,bytes:new Uint8Array(5*1024*1024+1)}})).toThrow();
    expect(validateCloudRequest({method:'PUT',path:`/stickers/favorites/${id}`,json:JSON.stringify({messageId:5})}).method).toBe('PUT');
    expect(()=>validateCloudRequest({method:'PUT',path:`/stickers/favorites/${id}`,json:JSON.stringify({url:'https://example.invalid/private.png'})})).toThrow();
    expect(()=>validateCloudRequest({method:'PUT',path:'/stickers/favorites/order',json:JSON.stringify({version:0,ids:[id,id]})})).toThrow();
    expect(()=>validateCloudRequest({method:'GET',path:'/stickers/favorites?ownerId=2'})).toThrow();
  });
  it('allows only bounded conversation and exclusive history cursors', () => {
    for (const path of ['/chat/capabilities', '/chat/conversations', '/chat/conversations?cursor=500.100', '/chat/hall/messages?beforeId=20', '/chat/private/2/messages?afterId=19']) {
      expect(validateCloudRequest({ method: 'GET', path }).path).toBe(path);
    }
    for (const path of ['/chat/capabilities?owner=2', '/chat/conversations?owner=2', '/chat/conversations?cursor=bad', '/chat/hall/messages?beforeId=20&afterId=1', '/chat/private/2/messages?afterId=-1']) {
      expect(() => validateCloudRequest({ method: 'GET', path })).toThrow();
    }
  });
  it("only permits exact media binary/publication routes and protected variants", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const request = { method: "POST", path: `/media/assets?clientUploadId=${id}`, binary: { type: "image/png", bytes: new Uint8Array([1]) } };
    expect(validateCloudRequest(request).binary?.bytes).toEqual(new Uint8Array([1]));
    for (const extra of [{ path: "/auth/login" }, { path: "/media/assets" }, { path: request.path + "&ownerId=2" }, { json: "{}" },
      { binary: { type: "image/svg+xml", bytes: new Uint8Array([1]) } }, { binary: { type: "image/png", bytes: new Uint8Array(2097153) } }]) {
      expect(() => validateCloudRequest({ ...request, ...extra })).toThrow();
    }
    expect(validateCloudRequest({ method: "POST", path: "/media/publications", json: "{}" }).path).toBe("/media/publications");
    expect(() => validateCloudRequest({ method: "POST", path: "/media/publications", json: JSON.stringify({ text: "图".repeat(6000) }) })).toThrow();
    expect(() => validateCloudRequest({ method: "GET", path: `/media/uploads/${id}?ownerId=2` })).toThrow();
    for (const variant of ["clear", "thumb"]) expect(cloudMediaPath(`/api/media/assets/${id}/${variant}`)).toContain(variant);
    for (const suffix of ["original", "clear?accountId=2", "../clear"]) expect(() => cloudMediaPath(`/api/media/assets/${id}/${suffix}`)).toThrow();
  });
  it.each(["https://other.invalid/auth/me", "//other.invalid/auth/me", "/auth/csrf", "/internal/client-updates/import", "/admin/users/../settings", "/admin/users/%31/type", "/auth/me#fragment", "/auth/me\\extra", "/auth/me\r\nHeader: value"])("rejects unapproved path %s", path => {
    expect(() => validateCloudRequest({ method: "GET", path })).toThrow();
  });
  it("rejects methods, arbitrary headers, bodies on GET and mixed encodings", () => {
    expect(() => validateCloudRequest({ method: "DELETE", path: "/auth/me" })).toThrow();
    expect(() => validateCloudRequest({ method: "GET", path: "/auth/me", headers: { Cookie: "not-forwarded" } })).toThrow();
    expect(() => validateCloudRequest({ method: "GET", path: "/auth/me", json: "{}" })).toThrow();
    expect(() => validateCloudRequest({ method: "POST", path: "/auth/login", json: "{}", form: [] })).toThrow();
  });
  it("permits bounded app queries and exact multipart fields only", () => {
    expect(validateCloudRequest({ method: "GET", path: "/feed/posts?beforeId=11" }).path).toContain("beforeId=11");
    const form = [{ name: "file", file: { name: "image.webp", type: "image/webp", bytes: new Uint8Array([1, 2]) } }];
    expect(validateCloudRequest({ method: "POST", path: "/chat/images", form }).form).toHaveLength(1);
    expect(() => validateCloudRequest({ method: "POST", path: "/auth/login", form })).toThrow();
    expect(() => validateCloudRequest({ method: "POST", path: "/chat/images", json: "x".repeat(300000) })).toThrow();
    expect(() => validateCloudRequest({ method: "POST", path: "/chat/images", form: [{ name: "file", file: { ...form[0]!.file, name: "../../local.key" } }] })).toThrow();
  });
  it("only serves raster upload paths and known chat frames", () => {
    expect(cloudMediaPath("/uploads/chat/2/image.webp")).toBe("/uploads/chat/2/image.webp");
    for (const path of ["/etc/passwd", "/uploads/../../private.png", "/uploads/a.svg", "/uploads/a.png?url=https://other.invalid"]) expect(() => cloudMediaPath(path)).toThrow();
    expect(() => validateChatFrame('{"type":"PING","payload":{}}')).not.toThrow();
    expect(() => validateChatFrame('{"type":"ADMIN_EXECUTE"}')).toThrow();
  });
});

describe("cloud session client", () => {
  it('preserves verified ownership on temporary auth check failure, but clears on revocation', async () => {
    let response = {success:true,data:{id:'7',userType:'NORMAL'}} as any;
    let status = 200;
    const clear=vi.fn(),streams=vi.fn();
    const client=new CloudClient('https://cloud.invalid',async()=>json(response,status),clear,streams);
    await client.request({method:'GET',path:'/auth/me'});
    const epoch=client.identityEpoch;
    response={success:false,code:'SERVICE_UNAVAILABLE'}; status=503;
    await client.request({method:'GET',path:'/auth/me'});
    expect(client.authenticatedOwner).toBe('7'); expect(client.identityEpoch).toBe(epoch);
    expect(clear).not.toHaveBeenCalled(); expect(streams).not.toHaveBeenCalled();
    response={success:false,code:'AUTH_SESSION_EXPIRED'}; status=401;
    await client.request({method:'GET',path:'/auth/me'});
    expect(client.authenticatedOwner).toBeNull(); expect(streams).toHaveBeenCalledOnce();
  });
  it('never grants private-cache ownership to a rounded numeric account ID',async()=>{
    const identity=vi.fn(),fetcher=vi.fn(async()=>json({success:true,data:{id:Number('2104509220480131074'),userType:'NORMAL'}}));
    const client=new CloudClient('https://cloud.invalid',fetcher,vi.fn(),vi.fn(),identity);
    await client.request({method:'GET',path:'/auth/me'});expect(identity).toHaveBeenLastCalledWith(null);
  });
  it("sends bounded binary bytes with Main-owned CSRF and no multipart encoding", async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => url.endsWith("/csrf") ? json({ data: { token: "fixture" } }) : json({ success: true }));
    const client = new CloudClient("https://cloud.invalid", fetcher, vi.fn(), vi.fn());
    await client.request({ method: "POST", path: "/media/assets?clientUploadId=11111111-1111-4111-8111-111111111111",
      binary: { type: "image/webp", bytes: new Uint8Array([1, 2, 3]) } });
    expect(fetcher.mock.calls[1]![1]).toMatchObject({ body: new Uint8Array([1, 2, 3]), headers: { "Content-Type": "image/webp", "X-CSRF-Token": "fixture" }, redirect: "error" });
  });
  it("blocks writes after session change while waiting for CSRF", async () => {
    let resolve!: (response: Response) => void; const pending = new Promise<Response>(r => resolve = r);
    const fetcher = vi.fn(() => pending); const client = new CloudClient("https://cloud.invalid", fetcher, vi.fn(), vi.fn());
    const request = client.request({ method: "POST", path: "/media/publications", json: "{}" });
    client.invalidate(); resolve(json({ data: { token: "old" } }));
    await expect(request).rejects.toThrow("SESSION_CHANGED"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("drops a late private-media response after session invalidation", async () => {
    let resolve!: (response: Response) => void; const pending = new Promise<Response>(r => resolve = r);
    const client = new CloudClient("https://cloud.invalid", () => pending, vi.fn(), vi.fn());
    const request = client.media("/api/media/assets/11111111-1111-4111-8111-111111111111/clear");
    client.invalidate(); resolve(new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }));
    expect((await request).status).toBe(404);
  });
  it("discards old JSON responses before they can terminate the new session", async () => {
    let resolve!: (response: Response) => void;
    const close = vi.fn(); const clear = vi.fn();
    const client = new CloudClient("https://cloud.invalid", () => new Promise<Response>(done => { resolve = done; }), clear, close);
    const request = client.request({ method: "GET", path: "/media/uploads/11111111-1111-4111-8111-111111111111" });
    client.invalidate(); resolve(json({ code: "AUTH_SESSION_EXPIRED" }, 401));
    await expect(request).rejects.toThrow("SESSION_CHANGED");
    expect(close).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
  });
  it("keeps updater offer tokens Main-only and rejects arbitrary updater destinations", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("/csrf") ? json({ data: { token: "test-csrf" } }) : json({ success: true, data: { accessToken: "synthetic-offer" } }));
    const client = new CloudClient("https://cloud.invalid", fetcher, vi.fn(), vi.fn());
    await expect(client.request({ method: "POST", path: "/client-updates/check", json: "{}" })).rejects.toThrow();
    await expect(client.updateCheck("https://other.invalid/api/client-updates/check", { method: "POST", body: "{}" })).rejects.toThrow();
    const response = await client.updateCheck("https://cloud.invalid/api/client-updates/check", { method: "POST", body: "{}" });
    expect((await response.json()).data.accessToken).toBe("synthetic-offer");
  });
  it("coalesces CSRF in Main, restricts origin/redirects and only exposes safe response fields", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("/csrf") ? json({ data: { token: "test-csrf" } }) : json({ success: true }, 200, { "Set-Cookie": "sensitive", "Retry-After": "2" }));
    const client = new CloudClient("https://cloud.invalid", fetcher, vi.fn(), vi.fn());
    const results = await Promise.all([1, 2].map(() => client.request({ method: "POST", path: "/chat/status", json: "{}" }).catch(() => null)));
    expect(results).toEqual([null, null]); // status is PATCH, not POST
    const output = await Promise.all([1, 2].map(() => client.request({ method: "PATCH", path: "/chat/status", json: "{}" })));
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/csrf"))).toHaveLength(1);
    expect(output[0]).toEqual({ status: 200, data: { success: true }, retryAfter: "2" });
    const write = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>).find(([url]) => url.endsWith("/status"))!;
    expect(write[1]).toMatchObject({ credentials: "include", redirect: "error", headers: { "X-CSRF-Token": "test-csrf" } });
  });
  it("does not automatically replay a rejected write; invalidates CSRF for the next explicit attempt", async () => {
    let tokens = 0; let writes = 0;
    const client = new CloudClient("https://cloud.invalid", async url => url.endsWith("/csrf")
      ? json({ data: { token: `csrf-${++tokens}` } })
      : (++writes, json({ success: false, code: "AUTH_CSRF_INVALID" }, 403)), vi.fn(), vi.fn());
    const request = { method: "POST", path: "/auth/login", json: "{}" };
    expect((await client.request(request)).status).toBe(403); expect(writes).toBe(1);
    await client.request(request); expect(tokens).toBe(2); expect(writes).toBe(2);
  });
  it("clears the dedicated cookie jar and streams even when logout cannot reach the server", async () => {
    const clear = vi.fn(async () => {}); const close = vi.fn();
    const client = new CloudClient("https://cloud.invalid", async url => {
      if (url.endsWith("/csrf")) return json({ data: { token: "test-csrf" } });
      throw new Error("network unavailable");
    }, clear, close);
    await expect(client.request({ method: "POST", path: "/auth/logout" })).rejects.toThrow();
    expect(clear).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledTimes(2); // Close immediately, then enforce cleanup in finally.
  });
  it("invalidates state and closes streams on session expiration", async () => {
    const close = vi.fn();
    const client = new CloudClient("https://cloud.invalid", async () => json({ code: "AUTH_SESSION_EXPIRED" }, 401), vi.fn(), close);
    expect((await client.request({ method: "GET", path: "/auth/me" })).status).toBe(401);
    expect(close).toHaveBeenCalledOnce();
  });
  it("limits streamed responses and rejects HTML or SVG disguised as cloud media", async () => {
    await expect(boundedBytes(new Response("123456"), 5)).rejects.toThrow("CLOUD_RESPONSE_TOO_LARGE");
    const client = new CloudClient("https://cloud.invalid", async () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }), vi.fn(), vi.fn());
    expect((await client.media("/uploads/a.png")).status).toBe(404);
  });
});

it("keeps in-flight IPC counts across a new rate window and rejects subframes", async () => {
  let now = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const frame = {};
  const event = { sender: { id: 1, mainFrame: frame }, senderFrame: frame } as IpcMainInvokeEvent;
  const guard = new IpcGuard(1, 60, 1, () => now);
  const first = guard.invoke(IPC_CHANNELS.cloudRequest, event, () => gate);
  now = 1001;
  await expect(guard.invoke(IPC_CHANNELS.cloudRequest, event, () => {})).rejects.toThrow("IPC_CONCURRENCY_LIMITED");
  release(); await first;
  await expect(guard.invoke(IPC_CHANNELS.cloudRequest, event, () => "ok")).resolves.toBe("ok");
  await expect(guard.invoke(IPC_CHANNELS.cloudRequest, { ...event, senderFrame: {} } as IpcMainInvokeEvent, () => {})).rejects.toThrow("IPC_SENDER_REJECTED");
});
