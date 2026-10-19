import { sameEntityId } from "@studyroom/contracts";
import { parseSceneCacheRecord, SCENE_DISPLAY_LIMIT, type PrivateSceneSnapshot, type SceneCacheRecord } from '@studyroom/contracts';
import { WebSceneCache } from './privateCacheStorage';
import { privateScene as state, privateSceneController, onPrivateSceneClear } from './privateSession';
import { cloudMediaUrl } from '../utils/cloudMedia';
import { useAuthStore } from '../stores/auth';

let web: WebSceneCache | undefined;
const storage = () => web ||= new WebSceneCache();
let epoch = 0, warm = 0;
let metadataHealthy = true;
const cleanupPending = new Set<string>();
const urls = new Set<string>();
const markerKey = 'studyroom:private-cache-pending-clear';
function markers(): string[] {
  try { const value = JSON.parse(localStorage.getItem(markerKey) || '[]'); return Array.isArray(value) ? value.filter(owner => typeof owner === 'string' && /^[1-9][0-9]{0,18}$/.test(owner)) : []; }
  catch { throw new Error('无法核对私人缓存清理状态'); }
}
function mark(owner: string) { const owners = new Set([...markers(), owner]); localStorage.setItem(markerKey, JSON.stringify([...owners])); }
function unmark(owner: string) { localStorage.setItem(markerKey, JSON.stringify(markers().filter(value => value !== owner))); }
function release() { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); state.cachedUrls = {}; }
function apply(record: SceneCacheRecord) {
  const replacements: Record<string, string> = {};
  try { for (const image of record.images) { const url = URL.createObjectURL(new Blob([new Uint8Array(image.bytes)], { type: image.mime })); urls.add(url); replacements[image.assetId] = url; } }
  catch (error) { for (const url of Object.values(replacements)) { URL.revokeObjectURL(url); urls.delete(url); } throw error; }
  const previous = state.cachedUrls; state.cachedUrls = replacements;
  for (const url of Object.values(previous)) { URL.revokeObjectURL(url); urls.delete(url); }
}
async function clearDisk(owner: string) {
  const bridge = window.studyRoomDesktop?.cloud;
  if (bridge) { if (!bridge.sceneCache) throw new Error('当前桌面版本不支持私人缓存'); await bridge.sceneCache({ action: 'clear', owner }); }
  else await storage().clear(owner);
}
async function retryCleanup() {
  try { for (const owner of markers()) cleanupPending.add(owner); metadataHealthy=true; }
  catch { metadataHealthy=false;state.cacheError='无法核对私人缓存清理状态，已禁止读取缓存。';return; }
  for (const owner of cleanupPending) {
    try { await clearDisk(owner); unmark(owner); cleanupPending.delete(owner); }
    catch { state.cacheError = '私人缓存清理未完成，旧私人图片已停止展示；稍后将重试清理。'; }
  }
}

export function startPrivateSceneCache() {
  const auth = useAuthStore();
  const stop = onPrivateSceneClear(() => {
    epoch++; warm++; release();
    const owner = String(state.owner || auth.user?.id || '');
    if (!owner) return;
    cleanupPending.add(owner);
    try { mark(owner); } catch { state.cacheError = '无法保存清理标记，私人缓存已禁止读取。'; }
    void retryCleanup();
  });
  // A logout in another tab revokes this tab as well; no credentials are broadcast or persisted.
  const crossTab = (event: StorageEvent) => {
    if (event.key !== markerKey || !event.newValue) return;
    try { if ((JSON.parse(event.newValue) as string[]).includes(String(auth.user?.id))) auth.clearLocalSession(); } catch { /* Invalid metadata never grants access. */ }
  };
  window.addEventListener('storage', crossTab);
  window.addEventListener('online', retryCleanup); window.addEventListener('focus', retryCleanup);
  void retryCleanup();
  return () => { stop(); epoch++; warm++; release(); window.removeEventListener('storage', crossTab); window.removeEventListener('online', retryCleanup); window.removeEventListener('focus', retryCleanup); };
}

export async function readPrivateSceneCache(current: () => boolean, owner: string) {
  // Legacy numeric account DTOs cannot identify an offline cache after precision loss.
  // Reject invalid/rounded legacy IDs and a requested owner different from the current account.
  if(!sameEntityId(useAuthStore().user?.id, owner)) { state.cacheError='账号标识需要更新后才能使用离线缓存；请保持联网。';return; }
  const stamp = epoch;
  try {
    await retryCleanup();
    if (!current() || stamp !== epoch || cleanupPending.size || !metadataHealthy) return;
    const bridge = window.studyRoomDesktop?.cloud;
    const record = bridge ? await bridge.sceneCache?.({ action: 'read', owner }) : (await storage().read(owner)).record;
    if (!record || !current() || stamp !== epoch || cleanupPending.size || !metadataHealthy) return;
    const clean = parseSceneCacheRecord(record);
    if (state.saved && state.saved.version > clean.snapshot.version) return;
    state.owner = owner; state.saved = clean.snapshot; state.enabled = true; apply(clean);
  } catch { if (current()) state.cacheError = '私人缓存暂不可用；仍可使用内置场景。'; }
}

async function download(path: string, signal: AbortSignal): Promise<{ mime: string; bytes: Uint8Array }> {
  const response = await fetch(cloudMediaUrl(path), { credentials: 'include', redirect: 'error', cache: 'no-store', signal });
  if (!response.ok || Number(response.headers.get('content-length')) > SCENE_DISPLAY_LIMIT) { await response.body?.cancel(); throw new Error('私人显示图不可缓存'); }
  const mime = response.headers.get('content-type')?.split(';')[0] || '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) { await response.body?.cancel(); throw new Error('私人显示图类型无效'); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('私人显示图为空');
  const chunks: Uint8Array[] = []; let total = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; total += next.value.length; if (total > SCENE_DISPLAY_LIMIT) throw new Error('私人显示图超出预算'); chunks.push(next.value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return { mime, bytes };
}

export async function cachePrivateScene(snapshot: PrivateSceneSnapshot, current: () => boolean, owner: string) {
  if(!sameEntityId(useAuthStore().user?.id, owner)) { state.cacheError='账号标识需要更新后才能使用离线缓存；云端保存不受影响。';return; }
  const stamp = epoch, operation = ++warm;
  const valid = () => current() && stamp === epoch && operation === warm && !cleanupPending.size && metadataHealthy;
  const { controller, release: finish } = privateSceneController();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    await retryCleanup(); if (!valid()) return;
    const bridge = window.studyRoomDesktop?.cloud;
    let record: SceneCacheRecord | null;
    if (bridge) {
      if (!bridge.sceneCache) throw new Error('当前桌面版本不支持私人缓存');
      record = await bridge.sceneCache({ action: 'refresh', owner });
      if (!record || record.snapshot.version !== snapshot.version) throw new Error('另一端场景版本已变化，请重新同步');
    } else {
      const previous = await storage().read(owner); if (!valid()) return;
      const images: SceneCacheRecord['images'] = [];
      for (const item of snapshot.media) {
        const old = previous.record?.images.find(image => image.assetId === item.assetId);
        images.push(old || { assetId: item.assetId, ...await download(item.displayUrl, controller.signal) });
        if (!valid()) return;
      }
      record = parseSceneCacheRecord({ snapshot, images });
      await storage().write(owner, previous.epoch, record, valid);
    }
    if (!valid()) return;
    apply(parseSceneCacheRecord(record)); state.cacheError = '';
  } catch { if (valid()) state.cacheError = '云端配置不受影响，但本机离线缓存未完成。联网后可重新同步。'; }
  finally { window.clearTimeout(timer); finish(); }
}
