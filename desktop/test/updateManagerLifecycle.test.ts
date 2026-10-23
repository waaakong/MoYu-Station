import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

// Isolated state-machine tests: no real network, disk installer, or app quit.
const doubles = vi.hoisted(() => ({ updaters: [] as any[], sockets: [] as any[] }));
vi.mock('electron', () => ({ net: { fetch: vi.fn(async()=>new Response(feedBytes)), WebSocket: class extends EventTarget {
  readyState = 1;
  constructor() { super(); doubles.sockets.push(this); }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
} } }));
vi.mock('electron-updater', () => ({ NsisUpdater: class {
  autoInstallOnAppQuit = true;
  handlers = new Map<string, (...args: any[]) => void>();
  netSession = { webRequest: { onBeforeRequest: vi.fn(), onBeforeSendHeaders: vi.fn() } };
  quitAndInstall = vi.fn();
  checkForUpdates = vi.fn().mockImplementation(async () => ({ updateInfo:info(),cancellationToken: { cancel: vi.fn() } }));
  downloadUpdate = vi.fn(async () => { this.emit('update-downloaded'); return [installerPath]; });
  constructor() { doubles.updaters.push(this); }
  addAuthHeader() {}
  on(name: string, handler: (...args: any[]) => void) { this.handlers.set(name, handler); }
  emit(name: string, ...args: any[]) { this.handlers.get(name)?.(...args); }
  removeAllListeners() { this.handlers.clear(); }
} }));
import { UpdateManager, safeUpdateErrorCode } from '../src/updater/updateManager';
// Lifecycle tests retain their isolated updater double; the native adapter's
// actual upstream NSIS logic is exercised separately, without replacing checks.
vi.mock('../src/updater/launchConfirmedNsisUpdater', async () => {
  const { NsisUpdater } = await import('electron-updater');
  return { LaunchConfirmedNsisUpdater: class extends NsisUpdater { readonly confirmedLaunchAdapter = true; } };
});
import { net } from 'electron';

const feedBytes=Buffer.from('fixture feed bytes'),installerBytes=Buffer.from('fixture installer bytes');
const testDirectory=mkdtempSync(join(tmpdir(),'moyu-update-binding-'));
const installerPath=join(testDirectory,'installer.exe');writeFileSync(installerPath,installerBytes);
afterAll(()=>rmSync(testDirectory,{recursive:true,force:true}));
const digest=(bytes:Buffer)=>createHash('sha512').update(bytes).digest('base64');
function info(){return {version:'0.3.0',files:[{url:'MoYu-Setup-0.3.0-win-x64.exe',size:installerBytes.length,sha512:digest(installerBytes)}]};}

const keys = generateKeyPairSync('ed25519');
const manifestJson = JSON.stringify({ schemaVersion: 1, releaseId: 'stable-0.3.0', channel: 'stable',
  version: '0.3.0', platform: 'win32', arch: 'x64', appId: 'xyz.moyustation.studyroom',
  artifactKey: 'stable/0.3.0', publishedAt: '2026-10-05T00:00:00Z', files: [
    {name:'latest.yml',size:feedBytes.length,sha512:digest(feedBytes),role:'feed'},
    {name:'MoYu-Setup-0.3.0-win-x64.exe',size:installerBytes.length,sha512:digest(installerBytes),role:'installer'}] });
function offer() { return {status:'available',currentVersion:'0.2.0',channel:'stable',mandatory:false,
  availableVersion:'0.3.0',feedUrl:'https://updates.test/private-updates/releases/stable/0.3.0/',
  accessToken:'isolated-fixture-token-not-a-real-session',accessTokenExpiresAt:new Date(Date.now()+600000).toISOString(),
  message:'测试更新',manifestJson,manifestKeyId:'fixture',
  manifestSignature:sign(null,Buffer.from(manifestJson),keys.privateKey).toString('base64')}; }
function githubOffer() {
  const base = offer(), json = JSON.stringify({...JSON.parse(manifestJson),schemaVersion:2,github:{repository:'waaakong/StudyRoom',tag:'v0.3.0'}});
  return {...base,feedUrl:'https://github.com/waaakong/StudyRoom/releases/download/v0.3.0/',manifestJson:json,
    manifestSignature:sign(null,Buffer.from(json),keys.privateKey).toString('base64')};
}
function response(data: unknown) { return new Response(JSON.stringify({success:true,data}),{status:200}); }
const managers: UpdateManager[] = [];
function setup(installEnabled=false, makeOffer=offer, extraConfig: Record<string, unknown>={}) {
  let deferred: number | undefined;
  const send=vi.fn(),fetcher=vi.fn().mockImplementation(async()=>response(makeOffer()));
  const manager=new UpdateManager({isDestroyed:()=>false,webContents:{send}} as any,
    {controlEnabled:true,installEnabled,channel:'stable',currentVersion:'0.2.0',apiBaseUrl:'https://updates.test/api',
      updateOrigin:'https://updates.test',publicKeys:{fixture:keys.publicKey.export({format:'der',type:'spki'}).toString('base64')},...extraConfig},
    {readDeferUntil:()=>deferred,writeDeferUntil:value=>{deferred=value;}},
    {session:{} as any,fetcher});
  managers.push(manager);return {manager,send,fetcher};
}
function setupManual() {
  let deferred: number | undefined;
  const send=vi.fn();
  const manager=new UpdateManager({isDestroyed:()=>false,webContents:{send}} as any,
    {controlEnabled:false,installEnabled:false,channel:'stable',currentVersion:'0.2.0-trial.20261010.2',
      apiBaseUrl:'https://moyustation.xyz/api',updateOrigin:'https://moyustation.xyz',publicKeys:{}},
    {readDeferUntil:()=>deferred,writeDeferUntil:value=>{deferred=value;}});
  managers.push(manager);return {manager,send};
}
beforeEach(()=>{vi.useFakeTimers();doubles.updaters.length=0;doubles.sockets.length=0;});
afterEach(()=>{for(const m of managers.splice(0))m.dispose();vi.useRealTimers();});

it('checks the public download status without login and offers only the fixed manual download page',async()=>{
  const {manager}=setupManual();
  vi.mocked(net.fetch).mockResolvedValueOnce(new Response(JSON.stringify({access:'login-required',release:{
    version:'0.2.0-trial.20261015.1',size:1234,sha256:'a'.repeat(64),filename:'MoYu-Setup-0.2.0-trial.20261015.1-win-x64.exe'
  }}),{status:200}));
  const status=await manager.setAuthState({authenticated:false});
  expect(status).toMatchObject({state:'manual-update-available',availableVersion:'0.2.0-trial.20261015.1',
    downloadPageUrl:'https://moyustation.xyz/download',mandatory:false});
  expect(vi.mocked(net.fetch).mock.calls.at(-1)?.[1]).toMatchObject({credentials:'omit',redirect:'error',cache:'no-store'});
});

it('reports latest when download page metadata is not newer than this build',async()=>{
  const {manager}=setupManual();
  vi.mocked(net.fetch).mockResolvedValueOnce(new Response(JSON.stringify({access:'login-required',release:{
    version:'0.2.0-trial.20261010.2',size:1234,sha256:'b'.repeat(64),filename:'MoYu-Setup-0.2.0-trial.20261010.2-win-x64.exe'
  }}),{status:200}));
  expect((await manager.setAuthState({authenticated:false})).state).toBe('not-available');
});

it('checks a signed offer after login and blocks unsigned installation',async()=>{
  const {manager}=setup();expect((await manager.setAuthState({authenticated:true})).state).toBe('available');
  expect((await manager.download()).errorCode).toBe('UPDATE_CODE_SIGNATURE_REQUIRED');
  expect(doubles.updaters).toHaveLength(0);
});
it.each(['manifest-signed','trusted'] as const)('uses the confirmed launch adapter only for manifest-signed mode: %s',async trustMode=>{
  const {manager}=setup(true,offer,{trustMode});await manager.setAuthState({authenticated:true});
  expect(doubles.updaters[0].confirmedLaunchAdapter===true).toBe(trustMode==='manifest-signed');
});
it('receives a push notification and coalesces repeated notifications',async()=>{
  const {manager,fetcher}=setup();await manager.setAuthState({authenticated:true});
  const socket=doubles.sockets[0];const push=()=>socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'CLIENT_UPDATE_AVAILABLE',payload:{channel:'stable',releaseId:'stable-0.3.0'}})}));
  push();push();await manager.check();expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rechecks each committed policy revision of the same release, including pause and resume',async()=>{
  const {manager,fetcher}=setup();await manager.setAuthState({authenticated:true});
  const push=(policyVersion:string)=>doubles.sockets[0].dispatchEvent(new MessageEvent('message',{data:JSON.stringify({
    type:'CLIENT_UPDATE_POLICY_CHANGED',payload:{channel:'stable',releaseId:'stable-0.3.0',policyVersion}
  })}));
  push('2');push('2');await vi.waitFor(()=>expect(manager.snapshot().state).toBe('available'));
  expect(fetcher).toHaveBeenCalledTimes(2);
  push('3');await vi.waitFor(()=>expect(manager.snapshot().state).toBe('available'));
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('rechecks authorization when the update socket reconnects after a missed policy change',async()=>{
  const {manager,fetcher}=setup();await manager.setAuthState({authenticated:true});
  doubles.sockets[0].close();await vi.advanceTimersByTimeAsync(1000);
  fetcher.mockResolvedValueOnce(response({status:'not-available',currentVersion:'0.2.0',channel:'stable',mandatory:false,message:'Paused'}));
  doubles.sockets[1].dispatchEvent(new Event('open'));
  await vi.waitFor(()=>expect(manager.snapshot().state).toBe('not-available'));
});
it('revokes an armed busy update after missed policy push even with automatic discovery disabled',async()=>{
  const {manager,fetcher}=setup(true,offer,{trustMode:'manifest-signed'});
  const prepare=vi.fn(async()=>vi.fn());manager.setInstallPreparation(prepare);
  await manager.setAuthState({authenticated:true,accountSession:'member-1:epoch-1'});
  manager.setAutomaticChecks(false);
  manager.setActivityState({focusActive:false,audioActive:false,draftsActive:true});
  await manager.start();expect(manager.snapshot().updateIntent).toBe(true);
  fetcher.mockResolvedValueOnce(response({status:'not-available',currentVersion:'0.2.0',channel:'stable',mandatory:false,message:'Paused'}));
  await vi.advanceTimersByTimeAsync(15000);
  expect(manager.snapshot()).toMatchObject({state:'not-available',updateIntent:false});
  expect(prepare).not.toHaveBeenCalled();expect(doubles.updaters[0].quitAndInstall).not.toHaveBeenCalled();
  const calls=fetcher.mock.calls.length;await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(calls);
});
it('keeps a draft-blocked intent scheduled after its periodic validation, and stops polling on cancel',async()=>{
  const {manager,fetcher}=setup(true,offer,{trustMode:'manifest-signed'});
  manager.setInstallPreparation(async()=>()=>{});
  await manager.setAuthState({authenticated:true,accountSession:'member-1:epoch-1'});
  manager.setAutomaticChecks(false);manager.setActivityState({focusActive:false,audioActive:false,draftsActive:true});
  await manager.start();
  for(let i=0;i<15;i++) {
    await vi.advanceTimersByTimeAsync(1000);
    manager.setActivityState({focusActive:false,audioActive:false,draftsActive:true});
  }
  expect(manager.snapshot()).toMatchObject({state:'scheduled',updateIntent:true,waitReasons:['drafts']});
  manager.cancelDownload();const calls=fetcher.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60000);expect(fetcher).toHaveBeenCalledTimes(calls);
});
it('downloads in the isolated double and defers installation while audio is active',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});manager.setActivityState({focusActive:false,audioActive:true});
  expect((await manager.download()).state).toBe('scheduled');await manager.install();
  expect(doubles.updaters[0].quitAndInstall).not.toHaveBeenCalled();
  manager.setActivityState({focusActive:false,audioActive:false});await manager.install();
  expect(doubles.updaters[0].quitAndInstall).toHaveBeenCalledTimes(1);
});

it('one click requires the host save-and-backup hook and cannot use the legacy manifest install route', async () => {
  const {manager}=setup(true, offer, {trustMode:'manifest-signed'});
  await manager.setAuthState({authenticated:true,accountSession:'member-1:epoch-1'});
  await expect(manager.start()).rejects.toThrow('UPDATE_SAVE_UNAVAILABLE');
  await manager.download();
  await expect(manager.install()).rejects.toThrow('UPDATE_SAVE_UNAVAILABLE');
  expect(doubles.updaters[0].quitAndInstall).not.toHaveBeenCalled();
});

it('one click binds the manifest, waits for drafts, saves and installs after a cancellable countdown', async () => {
  const {manager}=setup(true, offer, {trustMode:'manifest-signed'});
  const release=vi.fn(), prepare=vi.fn(async()=>release);
  manager.setInstallPreparation(prepare);
  await manager.setAuthState({authenticated:true,accountSession:'member-1:epoch-1'});
  manager.setActivityState({focusActive:false,audioActive:false,draftsActive:true});
  expect((await manager.start())).toMatchObject({state:'scheduled',updateIntent:true,waitReasons:['drafts']});
  await vi.advanceTimersByTimeAsync(6000);
  expect(prepare).not.toHaveBeenCalled();
  manager.setActivityState({focusActive:false,audioActive:false,draftsActive:false});
  expect(manager.snapshot()).toMatchObject({state:'countdown',countdownSeconds:5});
  await vi.advanceTimersByTimeAsync(5000);
  expect(prepare).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(doubles.updaters[0].quitAndInstall).toHaveBeenCalledOnce());
  expect(release).not.toHaveBeenCalled();
});

it('one-click countdown is revoked by a true-to-true account epoch switch', async () => {
  const {manager}=setup(true, offer, {trustMode:'manifest-signed'});
  const prepare=vi.fn(async()=>vi.fn()); manager.setInstallPreparation(prepare);
  await manager.setAuthState({authenticated:true,accountSession:'member-1:epoch-1'});
  await manager.start();
  await manager.setAuthState({authenticated:true,accountSession:'member-2:epoch-1'});
  await vi.advanceTimersByTimeAsync(6000);
  expect(prepare).not.toHaveBeenCalled();
  expect(manager.snapshot().updateIntent).toBe(false);
  for (const updater of doubles.updaters) expect(updater.quitAndInstall).not.toHaveBeenCalled();
});
it('does not revive an offer when a check finishes after logout',async()=>{
  const {manager,fetcher}=setup();let finish!:(r:Response)=>void;
  fetcher.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}));
  const pending=manager.setAuthState({authenticated:true});await manager.setAuthState({authenticated:false});
  finish(response(offer()));await pending;expect(manager.snapshot().state).toBe('unauthorized');
  expect(manager.snapshot().availableVersion).toBeUndefined();
});
it('turns off quit-triggered installation after logout',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});await manager.download();
  const updater=doubles.updaters[0];await manager.setAuthState({authenticated:false});
  expect(updater.autoInstallOnAppQuit).toBe(false);
});
it('honors a 24 hour deferral even when activity state changes',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});await manager.download();manager.defer();
  manager.setActivityState({focusActive:false,audioActive:false});
  expect(doubles.updaters[0].autoInstallOnAppQuit).toBe(false);
});
it('disarms a downloaded installer when a subsequent check no longer offers it',async()=>{
  const {manager,fetcher}=setup(true);await manager.setAuthState({authenticated:true});await manager.download();
  fetcher.mockResolvedValueOnce(response({status:'not-available',currentVersion:'0.2.0',channel:'stable',mandatory:false,message:'已撤回'}));
  await manager.check(true);expect(manager.snapshot().state).toBe('not-available');
  expect(doubles.updaters[0].autoInstallOnAppQuit).toBe(false);
  expect(manager.snapshot().availableVersion).toBeUndefined();
});
it('does not publish a late result after disposal',async()=>{
  const {manager,fetcher,send}=setup();let finish!:(r:Response)=>void;
  fetcher.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}));
  const pending=manager.setAuthState({authenticated:true});manager.dispose();send.mockClear();
  finish(response(offer()));await pending;expect(send).not.toHaveBeenCalled();
});

it('a new login checks independently while the old login request is still pending',async()=>{
  const {manager,fetcher}=setup();let finish!:(r:Response)=>void;
  fetcher.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}));
  const old=manager.setAuthState({authenticated:true});await manager.setAuthState({authenticated:false});
  await manager.setAuthState({authenticated:true});expect(fetcher).toHaveBeenCalledTimes(2);
  finish(new Response('',{status:401}));await old;
  expect(manager.snapshot().state).toBe('available');
});
it('cancels an old download and ignores its completion after logout',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});
  const updater=doubles.updaters[0];let finish!:()=>void;
  updater.downloadUpdate.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const pending=manager.download();await vi.waitFor(()=>expect(updater.downloadUpdate).toHaveBeenCalled());
  const token=updater.downloadUpdate.mock.calls[0][0];
  await manager.setAuthState({authenticated:false});expect(token.cancel).toHaveBeenCalledTimes(1);
  updater.emit('update-downloaded');finish();await pending;
  expect(manager.snapshot().state).toBe('unauthorized');
  manager.dispose(true);expect(updater.quitAndInstall).not.toHaveBeenCalled();
});
it('does not download when logout happens during update metadata resolution',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});
  const updater=doubles.updaters[0],cancel=vi.fn();let finish!:(r:any)=>void;
  updater.checkForUpdates.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=manager.download();await manager.setAuthState({authenticated:false});
  if(finish)finish({cancellationToken:{cancel}});await pending;
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
});

it('rejects modified feed before invoking the updater',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});
  vi.mocked(net.fetch).mockResolvedValueOnce(new Response('tampered'));
  expect((await manager.download()).errorCode).toBe('UPDATE_ARTIFACT_HASH_FAILED');
  expect(doubles.updaters[0].checkForUpdates).not.toHaveBeenCalled();
  manager.dispose(true);expect(doubles.updaters[0].quitAndInstall).not.toHaveBeenCalled();
});
it('rejects metadata changed between the preflight and updater fetch',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});
  const updater=doubles.updaters[0];updater.checkForUpdates.mockResolvedValueOnce({updateInfo:{...info(),version:'0.4.0'},cancellationToken:{cancel:vi.fn()}});
  expect((await manager.download()).state).toBe('error');expect(updater.downloadUpdate).not.toHaveBeenCalled();
});
it('does not arm installation on an early update-downloaded event',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});
  const updater=doubles.updaters[0];updater.emit('update-downloaded');
  expect(manager.snapshot().state).toBe('available');manager.dispose(true);expect(updater.quitAndInstall).not.toHaveBeenCalled();
});
it('rejects a cached installer whose bytes differ from the signed manifest',async()=>{
  const wrong=join(testDirectory,'wrong.exe');writeFileSync(wrong,'different bytes');
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});
  const updater=doubles.updaters[0];updater.downloadUpdate.mockResolvedValueOnce([wrong]);
  expect((await manager.download()).errorCode).toBe('UPDATE_ARTIFACT_HASH_FAILED');
  manager.dispose(true);expect(updater.quitAndInstall).not.toHaveBeenCalled();
});
it('prioritizes structured signature failure over hash names in certificate metadata',()=>{
  const error=Object.assign(new Error('not signed by the application owner: SignatureAlgorithm SHA256'),{code:'ERR_UPDATER_INVALID_SIGNATURE'});
  expect(safeUpdateErrorCode(error)).toBe('UPDATE_CODE_SIGNATURE_INVALID');
  expect(safeUpdateErrorCode(new Error('sha512 checksum mismatch'))).toBe('UPDATE_ARTIFACT_HASH_FAILED');
});
it.each(['net::ERR_CONTENT_LENGTH_MISMATCH','net::ERR_INCOMPLETE_CHUNKED_ENCODING','net::ERR_CONNECTION_RESET'])('keeps interrupted transport retryable instead of misclassifying it as a channel mismatch: %s',async raw=>{
  expect(safeUpdateErrorCode(new Error(raw))).toBe('UPDATE_NETWORK_FAILED');
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});
  const updater=doubles.updaters[0];updater.downloadUpdate.mockRejectedValueOnce(new Error(raw));
  expect(await manager.download()).toMatchObject({state:'error',errorCode:'UPDATE_NETWORK_FAILED',canRetry:true,updateIntent:false});
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
});
it('keeps actual manifest/channel and artifact integrity mismatches blocked',()=>{
  expect(safeUpdateErrorCode(new Error('UPDATE_MANIFEST_MISMATCH'))).toBe('UPDATE_CHANNEL_MISMATCH');
  expect(safeUpdateErrorCode(new Error('sha512 checksum mismatch'))).toBe('UPDATE_ARTIFACT_HASH_FAILED');
});
it('recognizes structured interrupted transport codes without overriding signature verification',()=>{
  expect(safeUpdateErrorCode(Object.assign(new Error('Download interrupted'),{code:'ERR_CONTENT_LENGTH_MISMATCH'}))).toBe('UPDATE_NETWORK_FAILED');
  expect(safeUpdateErrorCode(Object.assign(new Error('net::ERR_CONTENT_LENGTH_MISMATCH'),{code:'ERR_UPDATER_INVALID_SIGNATURE'}))).toBe('UPDATE_CODE_SIGNATURE_INVALID');
  expect(safeUpdateErrorCode(new Error('sha512 checksum mismatch; net::ERR_CONTENT_LENGTH_MISMATCH'))).toBe('UPDATE_ARTIFACT_HASH_FAILED');
});
it('forced checks preserve a user deferral and the already downloaded release',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});await manager.download();
  const until=manager.defer().deferredUntil;await manager.check(true);
  expect(manager.snapshot()).toMatchObject({state:'scheduled',deferredUntil:until});
  expect(doubles.updaters).toHaveLength(1);manager.dispose(true);
  expect(doubles.updaters[0].quitAndInstall).not.toHaveBeenCalled();
});
it('normal quit never silently installs an already downloaded release',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});await manager.download();
  manager.dispose(true);manager.dispose(true);
  expect(doubles.updaters[0].quitAndInstall).not.toHaveBeenCalled();
});
it('ordinary disposal, busy quit and expired authorization never install',async()=>{
  for(const mode of ['dispose','busy','expired']){
    const {manager}=setup(true);await manager.setAuthState({authenticated:true});await manager.download();
    const updater=doubles.updaters.at(-1);
    if(mode==='busy')manager.setActivityState({focusActive:true,audioActive:false});
    if(mode==='expired')vi.setSystemTime(Date.now()+700000);
    manager.dispose(mode!=='dispose');expect(updater.quitAndInstall).not.toHaveBeenCalled();
  }
});
it('an old socket close cannot detach or reconnect the new session socket',async()=>{
  const {manager,fetcher}=setup();await manager.setAuthState({authenticated:true});const old=doubles.sockets[0];
  await manager.setAuthState({authenticated:false});await manager.setAuthState({authenticated:true});
  old.dispatchEvent(new Event('close'));old.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'CLIENT_UPDATE_AVAILABLE',payload:{channel:'stable',releaseId:'old'}})}));
  await vi.advanceTimersByTimeAsync(1000);expect(doubles.sockets).toHaveLength(2);expect(fetcher).toHaveBeenCalledTimes(2);
});

it('a deferral before download cannot become a downloaded state on idle',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});manager.defer();
  manager.setActivityState({focusActive:false,audioActive:false});
  expect(manager.snapshot().state).toBe('scheduled');
  await expect(manager.install()).rejects.toThrow('UPDATE_NOT_DOWNLOADED');
  manager.dispose(true);expect(doubles.updaters[0].quitAndInstall).not.toHaveBeenCalled();
});
it('a recheck preserves an in-progress download and removes installation eligibility on failure',async()=>{
  const {manager,fetcher}=setup(true);await manager.setAuthState({authenticated:true});
  const updater=doubles.updaters[0];let finish!:()=>void;
  updater.downloadUpdate.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const pending=manager.download();await vi.waitFor(()=>expect(updater.downloadUpdate).toHaveBeenCalled());
  updater.emit('download-progress',{percent:40});await manager.check(true);
  expect(manager.snapshot()).toMatchObject({state:'downloading',progressPercent:40});
  fetcher.mockResolvedValueOnce(new Response('',{status:503}));await manager.check(true);
  finish();await pending;manager.dispose(true);
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
});

it('uses a pinned GitHub release without transmitting the application grant and verifies installer redirects',async()=>{
  const {manager}=setup(true,githubOffer);await manager.setAuthState({authenticated:true});
  const before=vi.mocked(net.fetch).mock.calls.length;
  expect((await manager.download()).state).toBe('downloaded');
  expect(vi.mocked(net.fetch).mock.calls[before]?.[0]).toBe(githubOffer().feedUrl+'latest.yml');
  expect(vi.mocked(net.fetch).mock.calls[before]?.[1]).toMatchObject({credentials:'omit',headers:{}});
  const updater=doubles.updaters[0], callback=vi.fn();
  updater.netSession.webRequest.onBeforeRequest.mock.calls[0][1]({url:'https://evil.test/installer.exe'},callback);
  expect(callback).toHaveBeenCalledWith({cancel:true});
  const headers=vi.fn();
  updater.netSession.webRequest.onBeforeSendHeaders.mock.calls[0][1]({url:'https://release-assets.githubusercontent.com/github-production-release-asset/123/file',requestHeaders:{Authorization:'secret',Cookie:'private','X-User-Staging-Id':'device',Range:'bytes=0-100'}},headers);
  expect(headers).toHaveBeenCalledWith({requestHeaders:{Range:'bytes=0-100'}});
  await manager.install();
  expect(doubles.updaters).toHaveLength(1);
  expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true,true);
});

it('falls back from an unavailable GitHub feed to the identical protected server copy',async()=>{
  const {manager}=setup(true,githubOffer);await manager.setAuthState({authenticated:true});
  vi.mocked(net.fetch).mockResolvedValueOnce(new Response('',{status:429}));
  expect((await manager.download()).state).toBe('downloaded');
  const call=vi.mocked(net.fetch).mock.calls.at(-1)!;
  expect(call[0]).toBe('https://updates.test/private-updates/releases/stable/0.3.0/latest.yml');
  expect(call[1]?.headers).toMatchObject({Authorization:expect.stringContaining('Bearer ')});
  // Fresh policy confirmation must retain the verified fallback installer.
  await manager.install();expect(doubles.updaters.at(-1).quitAndInstall).toHaveBeenCalledExactlyOnceWith(true,true);
});

it('falls back once for an installer network failure but never for tampering',async()=>{
  const {manager}=setup(true,githubOffer);await manager.setAuthState({authenticated:true});
  doubles.updaters[0].downloadUpdate.mockRejectedValueOnce(new Error('net::ERR_NETWORK_CHANGED'));
  expect((await manager.download()).state).toBe('downloaded');expect(doubles.updaters).toHaveLength(2);
  manager.dispose();
  const next=setup(true,githubOffer);await next.manager.setAuthState({authenticated:true});
  const count=doubles.updaters.length;
  vi.mocked(net.fetch).mockResolvedValueOnce(new Response('tampered feed'));
  expect((await next.manager.download()).errorCode).toBe('UPDATE_ARTIFACT_HASH_FAILED');
  expect(doubles.updaters).toHaveLength(count);
});

it('cancels a download without allowing a late result to install',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});
  const updater=doubles.updaters[0];let finish!:(files:string[])=>void;
  updater.downloadUpdate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=manager.download();await vi.waitFor(()=>expect(updater.downloadUpdate).toHaveBeenCalled());
  expect(manager.cancelDownload()).toMatchObject({state:'idle',canInstall:false});
  finish([installerPath]);await pending;
  expect(manager.snapshot().state).toBe('idle');
  await expect(manager.install()).rejects.toThrow('UPDATE_NOT_DOWNLOADED');
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
});

it('rechecks withdrawal immediately before explicit installation',async()=>{
  const {manager,fetcher}=setup(true);await manager.setAuthState({authenticated:true});await manager.download();
  fetcher.mockResolvedValueOnce(response({status:'not-available',currentVersion:'0.2.0',channel:'stable',mandatory:false,message:'已撤回'}));
  await expect(manager.install()).rejects.toThrow('UPDATE_NOT_DOWNLOADED');
  expect(doubles.updaters[0].quitAndInstall).not.toHaveBeenCalled();
});

it('delays startup checks and allows manual checks with automatic polling disabled',async()=>{
  const {manager,fetcher}=setup(false,offer,{startupCheckDelayMs:10_000});
  expect((await manager.setAuthState({authenticated:true})).state).toBe('idle');expect(fetcher).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(10_000);expect(fetcher).toHaveBeenCalledTimes(1);
  manager.setAutomaticChecks(false);await vi.advanceTimersByTimeAsync(7*60*60*1000);
  expect(fetcher).toHaveBeenCalledTimes(1);expect(manager.snapshot().automaticChecks).toBe(false);
  await manager.check(true);expect(fetcher).toHaveBeenCalledTimes(2);
});

it('continues polling after a transient failed check instead of silently disabling updates',async()=>{
  const {manager,fetcher}=setup(false,offer,{startupCheckDelayMs:10_000});
  fetcher.mockRejectedValueOnce(new Error('network failure'));
  await manager.setAuthState({authenticated:true});await vi.advanceTimersByTimeAsync(10_000);
  expect(manager.snapshot().state).toBe('error');
  await vi.advanceTimersByTimeAsync(7*60*60*1000);
  expect(fetcher).toHaveBeenCalledTimes(2);expect(manager.snapshot().state).toBe('available');
});

it('keeps installer failure visible and prevents duplicate installation requests',async()=>{
  const {manager}=setup(true);await manager.setAuthState({authenticated:true});await manager.download();
  const updater=doubles.updaters[0];
  await manager.install();await manager.install();
  expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);expect(manager.snapshot().state).toBe('installing');
  updater.emit('error',new Error('spawn failed'));
  expect(manager.snapshot()).toMatchObject({state:'error',canInstall:false,canRetry:true});
});

it('one-click disk exhaustion cancels installation before any save or native launch',async()=>{
  const {manager}=setup(true,offer,{trustMode:'manifest-signed'});
  const prepare=vi.fn(async()=>vi.fn());manager.setInstallPreparation(prepare);
  await manager.setAuthState({authenticated:true,accountSession:'disk-fixture:epoch-1'});
  const updater=doubles.updaters[0];
  updater.downloadUpdate.mockRejectedValueOnce(Object.assign(new Error('ENOSPC: no space left on device'),{code:'ENOSPC'}));
  await manager.start();
  expect(manager.snapshot()).toMatchObject({state:'error',errorCode:'UPDATE_DISK_INSUFFICIENT',canInstall:false,canRetry:true,updateIntent:false});
  expect(prepare).not.toHaveBeenCalled();expect(updater.quitAndInstall).not.toHaveBeenCalled();
  manager.dispose(true);expect(updater.quitAndInstall).not.toHaveBeenCalled();
});

it('one-click native launch failure releases the save freeze and keeps the current app usable',async()=>{
  const {manager}=setup(true,offer,{trustMode:'manifest-signed'});
  const release=vi.fn();manager.setInstallPreparation(vi.fn(async()=>release));
  await manager.setAuthState({authenticated:true,accountSession:'spawn-fixture:epoch-1'});
  const updater=doubles.updaters[0];updater.quitAndInstall.mockImplementation(()=>{throw new Error('synthetic native spawn failure');});
  await manager.start();await vi.advanceTimersByTimeAsync(5000);
  await vi.waitFor(()=>expect(manager.snapshot().state).toBe('error'));
  expect(manager.snapshot()).toMatchObject({errorCode:'UPDATE_INSTALL_FAILED',canInstall:false,canRetry:true,updateIntent:false});
  expect(updater.quitAndInstall).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();
  manager.dispose(true);expect(updater.quitAndInstall).toHaveBeenCalledOnce();
});

it.each([
  [new Error('synthetic asynchronous spawn failure'),'UPDATE_INSTALL_FAILED'],
  [Object.assign(new Error('certificate validation failed'),{code:'ERR_UPDATER_INVALID_SIGNATURE'}),'UPDATE_CODE_SIGNATURE_INVALID'],
  [new Error('ENOSPC: no space left on device'),'UPDATE_DISK_INSUFFICIENT']
])('preserves the cause and releases the save freeze after a native install error: %s',async(error,errorCode)=>{
  const {manager}=setup(true,offer,{trustMode:'manifest-signed'});
  const release=vi.fn();manager.setInstallPreparation(vi.fn(async()=>release));
  await manager.setAuthState({authenticated:true,accountSession:'async-spawn-fixture:epoch-1'});
  const updater=doubles.updaters[0];
  await manager.start();await vi.advanceTimersByTimeAsync(5000);
  await vi.waitFor(()=>expect(manager.snapshot().state).toBe('installing'));
  updater.emit('error',error);
  expect(manager.snapshot()).toMatchObject({state:'error',errorCode,canInstall:false,updateIntent:false});
  expect(release).toHaveBeenCalledOnce();
  manager.dispose(true);expect(updater.quitAndInstall).toHaveBeenCalledOnce();
});
