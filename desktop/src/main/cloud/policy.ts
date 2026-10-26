import { z } from "zod";
import type { CloudRequest } from "@studyroom/contracts";
import { activityKinds } from "@studyroom/contracts";

const id = "[1-9][0-9]{0,18}";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const rules: Record<CloudRequest["method"], RegExp[]> = {
  GET: [
    new RegExp(`^/feed/posts/${id}$`),
    /^\/activity\/(capabilities|live)$/,new RegExp(`^/activity/requests/${uuid}$`),
    /^\/operations\/capabilities$/,new RegExp(`^/operations/(COMMENT|FEEDBACK|INVITATION)/${uuid}$`),
    /^\/scenes\/custom$/,new RegExp(`^/scenes/custom/requests/${uuid}$`),
    /^\/media\/capabilities$/, /^\/stickers\/favorites$/,
    new RegExp(`^/media/(uploads|publications)/${uuid}$`),
    /^\/auth\/me$/, /^\/profile\/(me|stats|calendar|posts|share-card)$/,
    /^\/chat\/(capabilities|conversations|online-users|hall\/messages|private\/unread)$/,
    new RegExp(`^/chat/private/${id}/messages$`),
    new RegExp(`^/chat/private/${id}/messages/visibility$`),
    /^\/feed\/(posts|notifications|capabilities)$/, /^\/feed\/publications\/[a-zA-Z0-9_-]{16,64}$/, new RegExp(`^/feed/posts/${id}/comments$`),
    /^\/focus\/(overview|checkin\/today|audio)$/,
    /^\/admin\/(dashboard|users|posts|feedback|audits|invitations)$/,
    /^\/admin\/pages\/(users|posts|feedback)$/,
    /^\/admin\/invitations\/page$/,new RegExp(`^/admin/invitations/${id}$`),
    /^\/admin\/client-updates\/members\/page$/,new RegExp(`^/admin/client-updates/members/${id}$`),
    /^\/admin\/client-updates\/(members|releases)$/,
    /^\/admin\/client-updates\/releases\/page$/,new RegExp(`^/admin/client-updates/releases/${id}$`)
  ],
  POST: [
    /^\/activity\/intervals$/,
    /^\/media\/(assets|publications)$/,
    /^\/auth\/(login|register|logout)$/, /^\/profile\/(nickname|avatar|password|feedback)$/,
    /^\/chat\/images$/, new RegExp(`^/chat/private/${id}/read$`),
    new RegExp(`^/chat/private/messages/${id}/recall$`),
    /^\/feed\/posts$/, new RegExp(`^/feed/posts/${id}/(like|comments)$`),
    /^\/focus\/(start|finish|cancel|sync|checkin)$/,
    /^\/monitor\/heartbeat$/, /^\/admin\/(reverify|invitations)$/,
    new RegExp(`^/admin/invitations/${id}/disable$`)
  ],
  PATCH: [/^\/chat\/status$/, new RegExp(`^/admin/users/${id}/(type|password)$`),
    new RegExp(`^/admin/feedback/${id}/status$`), new RegExp(`^/admin/client-updates/releases/${id}$`)],
  PUT: [/^\/scenes\/custom$/,new RegExp(`^/feed/follows/${id}$`),new RegExp(`^/admin/client-updates/members/${id}$`), /^\/stickers\/favorites\/order$/,new RegExp(`^/stickers/favorites/${uuid}$`)],
  DELETE: [new RegExp(`^/chat/private/messages/${id}$`),/^\/scenes\/custom$/,new RegExp(`^/feed/follows/${id}$`),new RegExp(`^/chat/private/${id}/messages$`), new RegExp(`^/feed/posts/${id}(/like)?$`),
    new RegExp(`^/profile/posts/${id}$`), new RegExp(`^/admin/(posts|feedback)/${id}$`), new RegExp(`^/focus/audio/${id}$`),new RegExp(`^/stickers/favorites/${uuid}$`)]
};

const formPart = z.object({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/),
  value: z.string().max(16000).optional(),
  file: z.object({
    name: z.string().regex(/^[^/\\\r\n\x00-\x1f]{1,120}$/),
    type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    bytes: z.instanceof(Uint8Array).refine(b => b.byteLength > 0 && b.byteLength <= 2 * 1024 * 1024)
  }).strict().optional()
}).strict().refine(p => (p.value !== undefined) !== (p.file !== undefined));
const schema = z.object({
  method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
  path: z.string().min(1).max(2048),
  json: z.string().max(256 * 1024).optional(),
  binary: z.object({ type: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    bytes: z.instanceof(Uint8Array).refine(b => b.byteLength > 0 && b.byteLength <= 20 * 1024 * 1024) }).strict().optional(),
  form: z.array(formPart).max(16).optional()
}).strict();

export function validateCloudRequest(input: unknown): CloudRequest {
  const request = schema.parse(input);
  const pathname = request.path.split("?")[0]!;
  if (!rules[request.method].some(rule => rule.test(pathname)) || /[\\#\r\n]/.test(request.path)) {
    throw new Error("CLOUD_REQUEST_BLOCKED");
  }
  const url = new URL(request.path, "https://policy.invalid");
  if(pathname.startsWith('/activity/')){
    if(url.search||request.form||request.binary)throw new Error('CLOUD_REQUEST_BLOCKED');
    if(request.method==='POST'){
      if(!request.json||request.json.length>16384)throw new Error('CLOUD_REQUEST_BLOCKED');
      z.object({requestId:z.string().uuid(),sessionId:z.string().uuid(),sequence:z.number().int().min(1).max(1000000),partial:z.boolean(),segments:z.array(z.object({startMs:z.number().int().positive().safe(),endMs:z.number().int().positive().safe(),state:z.enum(activityKinds)}).strict().refine(s=>s.endMs>s.startMs&&s.endMs-s.startMs<=30000)).min(1).max(64)}).strict().parse(JSON.parse(request.json));
    }else if(request.json)throw new Error('CLOUD_REQUEST_BLOCKED');
  }
  if(pathname==='/profile/share-card' && url.search && !/^\?date=\d{4}-\d{2}-\d{2}$/.test(url.search))throw new Error('CLOUD_REQUEST_BLOCKED');
  if(new RegExp(`^/chat/private/${id}/messages/visibility$`).test(pathname)){
    if(request.method!=='GET' || !new RegExp(`^\\?ids=${id}(?:%2C${id}|,${id}){0,79}$`,'i').test(url.search) || request.json || request.form || request.binary)throw new Error('CLOUD_REQUEST_BLOCKED');
    return request;
  }
  if(request.method==='DELETE' && new RegExp(`^/chat/private/${id}/messages$`).test(pathname) && request.json){
    const body=JSON.parse(request.json);z.object({throughId:z.union([z.string().regex(new RegExp(`^${id}$`)),z.number().int().positive().max(Number.MAX_SAFE_INTEGER)])}).strict().parse(body);
  }
  if (url.pathname !== pathname || url.origin !== "https://policy.invalid") throw new Error("CLOUD_REQUEST_BLOCKED");
  // FocusController requires one drawType query; all other write queries remain blocked.
  if (request.method === "POST" && pathname === "/focus/checkin") {
    if (!/^\?drawType=(FORTUNE|TAROT)$/.test(url.search)
      || request.json !== undefined || request.form !== undefined || request.binary !== undefined) {
      throw new Error("CLOUD_REQUEST_BLOCKED");
    }
    return request;
  }
  const mediaUpload = request.method === "POST" && pathname === "/media/assets";
  if (request.method !== "GET" && url.search && !mediaUpload) throw new Error("CLOUD_REQUEST_BLOCKED");
  if (pathname.startsWith("/media/")) {
    if (mediaUpload) {
      if (!new RegExp(`^\\?clientUploadId=${uuid}(&purpose=(sticker|scene))?$`).test(url.search) || !request.binary) throw new Error("CLOUD_REQUEST_BLOCKED");
      const gif = request.binary.type === 'image/gif';
      const purpose=url.searchParams.get('purpose');
      if (gif && (purpose !== 'sticker' || request.binary.bytes.byteLength>5*1024*1024) || !gif && request.binary.bytes.byteLength > (purpose==='scene'?20:2)*1024*1024) throw new Error('CLOUD_REQUEST_BLOCKED');
    } else if (url.search) throw new Error("CLOUD_REQUEST_BLOCKED");
    if (pathname === "/media/publications" && (request.json === undefined || new TextEncoder().encode(request.json).length > 16384)) throw new Error("CLOUD_REQUEST_BLOCKED");
  }
  if (request.binary && !mediaUpload) throw new Error("CLOUD_REQUEST_BLOCKED");
  if (pathname.startsWith('/scenes/')) {
    if (url.search || request.form || request.binary) throw new Error('CLOUD_REQUEST_BLOCKED');
    if(request.method==='PUT' || request.method==='DELETE'){
      if(!request.json || new TextEncoder().encode(request.json).length>16384)throw new Error('CLOUD_REQUEST_BLOCKED');
      const picture=z.object({assetId:z.string().uuid(),fit:z.enum(['cover','contain']),focalX:z.number().min(0).max(1),focalY:z.number().min(0).max(1),zoom:z.number().min(1).max(3),dim:z.number().min(0).max(.8)}).strict();
      const base=z.object({version:z.number().int().nonnegative().safe(),requestId:z.string().uuid()}).strict();
      const periods=z.object({morning:picture.optional(),forenoon:picture.optional(),noon:picture.optional(),afternoon:picture.optional(),dusk:picture.optional(),night:picture.optional(),midnight:picture.optional()}).strict();
      const payload=request.method==='PUT'?base.extend({config:z.object({name:z.string().trim().min(1).max(80).refine(value=>[...value].length<=40 && !/[\x00-\x1f\x7f]/.test(value)),defaultImage:picture,periods}).strict()}):base;
      payload.parse(JSON.parse(request.json));
    } else if(request.json!==undefined)throw new Error('CLOUD_REQUEST_BLOCKED');
  }
  if (pathname.startsWith('/stickers/')) {
    if (url.search || request.form || request.binary) throw new Error('CLOUD_REQUEST_BLOCKED');
    if (request.method === 'PUT') {
      if (!request.json || request.json.length > 16384) throw new Error('CLOUD_REQUEST_BLOCKED');
      const body = JSON.parse(request.json);
      if (pathname.endsWith('/order')) z.object({ version:z.number().int().nonnegative().safe(), ids:z.array(z.string().uuid()).max(200).refine(ids=>new Set(ids).size===ids.length) }).strict().parse(body);
      else z.union([z.object({assetId:z.string().uuid()}).strict(),z.object({messageId:z.union([z.string().regex(new RegExp(`^${id}$`)),z.number().int().positive().safe()])}).strict()]).parse(body);
    } else if (request.json !== undefined) throw new Error('CLOUD_REQUEST_BLOCKED');
  }
  if (pathname === '/chat/capabilities' && url.search) throw new Error('CLOUD_REQUEST_BLOCKED');
  if (pathname.startsWith('/operations/') && (url.search || request.json!==undefined || request.form || request.binary)) throw new Error('CLOUD_REQUEST_BLOCKED');
  if(pathname.startsWith('/admin/pages/')){
    const params=[...url.searchParams];if(new Set(params.map(([key])=>key)).size!==params.length || params.some(([key,value])=>key==='cursor'?!/^[A-Za-z0-9_-]{1,192}$/.test(value):key==='role'?pathname!=='/admin/pages/users'||!['ALL','NORMAL','MUTED','BANNED','ADMIN'].includes(value):true))throw new Error('CLOUD_REQUEST_BLOCKED');
  }
  if(pathname==='/admin/invitations/page'||pathname==='/admin/client-updates/members/page'){
    const params=[...url.searchParams];if(params.length>1||params.some(([key,value])=>key!=='cursor'||!/^[A-Za-z0-9_-]{1,192}$/.test(value)))throw new Error('CLOUD_REQUEST_BLOCKED');
  }
  if(new RegExp(`^/admin/invitations/${id}(/disable)?$`).test(pathname)&&url.search)throw new Error('CLOUD_REQUEST_BLOCKED');
  if(request.method==='GET'&&new RegExp(`^/admin/client-updates/members/${id}$`).test(pathname)){
    const params=[...url.searchParams];if(params.length!==1||params[0]![0]!=='channel'||!['stable','beta','provider-experimental'].includes(params[0]![1]))throw new Error('CLOUD_REQUEST_BLOCKED');
  }
  if(request.method==='POST'&&new RegExp(`^/admin/invitations/${id}/disable$`).test(pathname)||request.method==='PUT'&&new RegExp(`^/admin/client-updates/members/${id}$`).test(pathname)){
    if(!request.json||request.form||request.binary)throw new Error('CLOUD_REQUEST_BLOCKED');
    const version=z.object({expectedVersion:z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(v=>BigInt(v)<9223372036854775807n)});
    (request.method==='PUT'?version.extend({channel:z.enum(['stable','beta','provider-experimental']),enabled:z.boolean(),reason:z.string().trim().min(1).max(300)}):version).strict().parse(JSON.parse(request.json));
  }
  if(request.method==='PATCH' && new RegExp(`^/admin/(users/${id}/(type|password)|feedback/${id}/status)$`).test(pathname) || request.method==='DELETE' && new RegExp(`^/admin/feedback/${id}$`).test(pathname)){
    if(!request.json||request.form||request.binary)throw new Error('CLOUD_REQUEST_BLOCKED');
    const version=z.object({expectedVersion:z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(v=>BigInt(v)<9223372036854775807n)});
    const body=pathname.endsWith('/type')?version.extend({userType:z.enum(['NORMAL','MUTED','BANNED','ADMIN'])}):pathname.endsWith('/password')?version.extend({password:z.string().min(1).max(128)}):pathname.endsWith('/status')?version.extend({status:z.enum(['PENDING','PROCESSING','RECORDED','RESOLVED'])}):version;
    body.strict().parse(JSON.parse(request.json));
  }
  if (pathname.startsWith('/admin/client-updates/releases/')) {
    if (pathname.endsWith('/page')) {
      const params=[...url.searchParams];
      if(params.length>1 || params.some(([key,value])=>key!=='cursor'||!/^[A-Za-z0-9_-]{1,160}$/.test(value)))throw new Error('CLOUD_REQUEST_BLOCKED');
    } else if(url.search)throw new Error('CLOUD_REQUEST_BLOCKED');
    if(request.method==='PATCH') {
      if(!request.json || request.form || request.binary)throw new Error('CLOUD_REQUEST_BLOCKED');
      z.object({status:z.enum(['DRAFT','PILOT','ROLLING','FULL','PAUSED','WITHDRAWN']),rolloutPercentage:z.union([z.literal(0),z.literal(10),z.literal(30),z.literal(50),z.literal(100)]),mandatory:z.boolean(),minimumSupportedVersion:z.string().max(100).nullable().optional(),releaseNotes:z.string().max(1000).nullable().optional(),reason:z.string().trim().min(1).max(300),expectedVersion:z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(v=>BigInt(v)<9223372036854775807n)}).strict().parse(JSON.parse(request.json));
    }
  }
  if (/^\/feed\/follows\//.test(pathname) && (request.json !== undefined || request.form || request.binary)) throw new Error('CLOUD_REQUEST_BLOCKED');
  if (/^\/feed\/(capabilities|publications\/)/.test(pathname) && url.search) throw new Error('CLOUD_REQUEST_BLOCKED');
  if (pathname === '/feed/posts' && request.method === 'GET') {
    const params = [...url.searchParams];
    if (new Set(params.map(([key]) => key)).size !== params.length || params.some(([key, value]) =>
      key === 'beforeId' ? !/^[1-9][0-9]{0,18}$/.test(value) : key === 'stream' ? !['square','following'].includes(value) : key === 'cursor' ? !/^[A-Za-z0-9_-]{1,256}$/.test(value) : true)
      || url.searchParams.has('beforeId') && params.length !== 1 || url.searchParams.has('cursor') && !url.searchParams.has('stream')) throw new Error('CLOUD_REQUEST_BLOCKED');
  }
  if (pathname === '/chat/conversations' && ([...url.searchParams].length > 1 || [...url.searchParams].some(([key, value]) => key !== 'cursor' || !/^[1-9][0-9]{0,18}\.[1-9][0-9]{0,18}$/.test(value)))) throw new Error('CLOUD_REQUEST_BLOCKED');
  if (/^\/chat\/(hall\/messages|private\/[1-9][0-9]*\/messages)$/.test(pathname) && request.method === 'GET') {
    const params = [...url.searchParams];
    if (params.length > 1 || params.some(([key, value]) => !['afterId', 'beforeId'].includes(key) || !/^[1-9][0-9]{0,18}$/.test(value))) throw new Error('CLOUD_REQUEST_BLOCKED');
  }
  if ([...url.searchParams].length > 16) throw new Error("CLOUD_REQUEST_BLOCKED");
  if (request.method === "GET" && (request.json !== undefined || request.form || request.binary)) throw new Error("CLOUD_REQUEST_BLOCKED");
  if ([request.json, request.form, request.binary].filter(value => value !== undefined).length > 1) throw new Error("CLOUD_REQUEST_BLOCKED");
  if (request.json !== undefined) JSON.parse(request.json);
  const multipartFields: Record<string, string[]> = {
    "/chat/images": ["file"], "/profile/avatar": ["file"], "/feed/posts": ["content", "sceneCode", "clientRequestId", "images"]
  };
  if (request.form && (request.method !== "POST" || !multipartFields[pathname]
    || request.form.some(part => !multipartFields[pathname]!.includes(part.name)))) throw new Error("CLOUD_REQUEST_BLOCKED");
  return request;
}

export function cloudMediaPath(value: string): string {
  if (new RegExp(`^/api/media/assets/${uuid}/(clear|thumb|display)$`).test(value)) return value;
  if (!/^\/uploads\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(value) || value.length > 512) {
    throw new Error("CLOUD_MEDIA_BLOCKED");
  }
  return value;
}

export const streamRequestSchema = z.object({ id: z.string().uuid(), kind: z.enum(["chat", "notifications", "dashboard"]) }).strict();
export const streamIdSchema = z.string().uuid();
export const chatSendSchema = z.object({ id: streamIdSchema, data: z.string().max(64 * 1024) }).strict();
export function validateChatFrame(data: string): void {
  const frame = JSON.parse(data);
  if (!frame || !["PING", "STATUS_UPDATE", "HALL_MESSAGE_SEND", "PRIVATE_MESSAGE_SEND", "PRIVATE_MESSAGE_RECALL"].includes(frame.type)) {
    throw new Error("CLOUD_MESSAGE_BLOCKED");
  }
}
