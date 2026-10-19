import { app, BrowserWindow, session } from 'electron';
import { createServer } from 'node:https';
import { createHash, generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import type { Duplex } from 'node:stream';
import { UpdateManager } from '../src/updater/updateManager';
import { CloudClient } from '../src/main/cloud/client';
import { installUpdateNetworkGuard } from '../src/updater/updateNetworkGuard';
import { releaseManifestSchema } from '../src/updater/updateSecurity';

const root=process.env.STUDYROOM_UPDATE_LAB_ROOT!;
if(!root)throw new Error('LAB_ROOT_REQUIRED');
app.setName('MoYu Update Isolated Verification');
app.setPath('userData',join(root,'user-data'));
const certificate=readFileSync(join(root,'loopback.crt'),'utf8');
const pinned=new X509Certificate(certificate);
const keyPair=generateKeyPairSync('ed25519');
const fixtureCookie='STUDYROOM_SESSION=loopback-only-synthetic-session';
const connections=new Set<Duplex>();const sockets=new Set<Duplex>();
let origin='',version='0.3.0',mode='offer',checks=0,held:any;
let guardRedirect=false,blockedTargetHits=0,assetHeaders:Record<string,unknown>|undefined;
function data(){
  const manifestJson=JSON.stringify({schemaVersion:1,releaseId:`stable-${version}`,channel:'stable',version,
    platform:'win32',arch:'x64',appId:'xyz.moyustation.studyroom',artifactKey:`stable/${version}`,
    publishedAt:new Date().toISOString(),files:[
      {name:'latest.yml',size:100,sha512:Buffer.alloc(64,1).toString('base64'),role:'feed'},
      {name:`MoYu-Setup-${version}-win-x64.exe`,size:1000,sha512:Buffer.alloc(64,2).toString('base64'),role:'installer'}]});
  return {status:'available',currentVersion:'0.2.0',availableVersion:version,channel:'stable',mandatory:false,message:'隔离测试版本',
    feedUrl:`${origin}/private-updates/releases/stable/${version}/`,accessToken:'loopback-synthetic-update-token-not-for-install',
    accessTokenExpiresAt:new Date(Date.now()+300000).toISOString(),manifestJson,
    manifestSignature:mode==='tamper'?Buffer.alloc(64).toString('base64'):sign(null,Buffer.from(manifestJson),keyPair.privateKey).toString('base64'),manifestKeyId:'lab'};
}
function reply(res:any,status:number,payload:unknown){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}
const server=createServer({key:readFileSync(join(root,'loopback.key')),cert:certificate},(req,res)=>{
  if(req.url==='/blocked-target'){blockedTargetHits++;res.end('must not be fetched');return;}
  if(req.url==='/private-updates/releases/stable/0.3.0/latest.yml'){
    assetHeaders=req.headers;
    if(guardRedirect){res.writeHead(302,{Location:'/blocked-target'});res.end();return;}
    res.end('guarded feed');return;
  }
  if(req.url==='/api/auth/csrf'&&req.method==='GET'&&req.headers.cookie===fixtureCookie){reply(res,200,{data:{token:'loopback-csrf'}});return;}
  if(req.url!=='/api/client-updates/check'||req.method!=='POST'){reply(res,404,{success:false});return;}
  checks++;
  if(req.headers.cookie!==fixtureCookie||mode==='revoked'){reply(res,401,{success:false});return;}
  if(req.headers['x-csrf-token']!=='loopback-csrf'){reply(res,403,{success:false});return;}
  if(mode==='held'){held=res;return;}
  reply(res,200,{success:true,data:data()});
});
server.on('connection',socket=>{connections.add(socket);socket.once('close',()=>connections.delete(socket));});
server.on('upgrade',(req,socket)=>{
  if(req.url!=='/ws/client-updates'||req.headers.cookie!==fixtureCookie||mode==='revoked'){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}
  const key=req.headers['sec-websocket-key'];if(typeof key!=='string'){socket.destroy();return;}
  const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  socket.on('data',buffer=>{if((buffer[0]!&15)===8)socket.end(Buffer.from([0x88,0]));});
});
function push(id:string){
  const payload=Buffer.from(JSON.stringify({type:'CLIENT_UPDATE_AVAILABLE',payload:{channel:'stable',releaseId:id}}));
  const header=payload.length<126?Buffer.from([0x81,payload.length]):Buffer.from([0x81,126,payload.length>>8,payload.length&255]);
  for(const socket of sockets)socket.write(Buffer.concat([header,payload]));
}
async function waitFor(predicate:()=>boolean){const deadline=Date.now()+8000;while(!predicate()){if(Date.now()>deadline)throw new Error('LAB_STATE_TIMEOUT');await new Promise(r=>setTimeout(r,25));}}
let manager:UpdateManager|undefined,window:BrowserWindow|undefined;
const evidence:Record<string,unknown>={installEnabled:false,productionTouched:false,systemTrustChanged:false,businessBackend:'synthetic loopback fixture'};
(async()=>{
  await app.whenReady();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  origin=`https://127.0.0.1:${(server.address() as any).port}`;
  const untrusted=session.fromPartition('update-lab-untrusted');
  let rejected=false;try{await untrusted.fetch(origin+'/api/client-updates/check',{method:'POST'});}catch{rejected=true;}
  assert.equal(rejected,true);evidence.untrustedTlsRejected=true;
  const isolated=session.fromPartition('update-lab-pinned');
  isolated.setCertificateVerifyProc((request,done)=>{
    try{
      const presented=new X509Certificate(request.certificate.data);
      const valid=request.hostname==='127.0.0.1'&&presented.fingerprint256===pinned.fingerprint256&&
        !!presented.checkIP('127.0.0.1')&&Date.parse(presented.validFrom)<=Date.now()&&Date.parse(presented.validTo)>Date.now();
      done(valid?0:-2);
    }catch{done(-2);}
  });
  await isolated.cookies.set({url:origin,name:'STUDYROOM_SESSION',value:fixtureCookie.split('=')[1]!,secure:true,httpOnly:true,sameSite:'strict'});
  window=new BrowserWindow({show:false,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await window.loadURL('data:text/html,<title>Isolated update verification</title>');
  let defer:number|undefined;
  const cloud=new CloudClient(origin,(url,init)=>isolated.fetch(url,init),async()=>{},()=>{});
  manager=new UpdateManager(window,{controlEnabled:true,installEnabled:false,channel:'stable',currentVersion:'0.2.0',apiBaseUrl:origin+'/api',updateOrigin:origin,
    publicKeys:{lab:keyPair.publicKey.export({format:'der',type:'spki'}).toString('base64')}},
    {readDeferUntil:()=>defer,writeDeferUntil:value=>{defer=value;}},
    {session:isolated,fetcher:(url,init)=>cloud.updateCheck(url,init)});
  const baseline=await manager.setAuthState({authenticated:true});evidence.baseline={state:baseline.state,errorCode:baseline.errorCode,serverChecks:checks};
  assert.equal(baseline.state,'available');
  const guarded=session.fromPartition('update-lab-download-guard');
  guarded.setCertificateVerifyProc((request,done)=>{
    try{done(request.hostname==='127.0.0.1'&&new X509Certificate(request.certificate.data).fingerprint256===pinned.fingerprint256?0:-2);}catch{done(-2);}
  });
  const manifest=releaseManifestSchema.parse(JSON.parse(data().manifestJson));
  let grant='loopback-download-grant';
  const closeGuard=installUpdateNetworkGuard(guarded.webRequest,manifest,data().feedUrl,()=>grant);
  assert.equal(await (await guarded.fetch(data().feedUrl+'latest.yml',{headers:{Cookie:'not-allowed','X-User-Staging-Id':'not-allowed'}})).text(),'guarded feed');
  assert.equal(assetHeaders?.authorization,'Bearer loopback-download-grant');
  assert.equal(assetHeaders?.cookie,undefined);assert.equal(assetHeaders?.['x-user-staging-id'],undefined);
  grant='refreshed-loopback-grant';await guarded.fetch(data().feedUrl+'latest.yml');
  assert.equal(assetHeaders?.authorization,'Bearer refreshed-loopback-grant');
  guardRedirect=true;
  await assert.rejects(()=>guarded.fetch(data().feedUrl+'latest.yml'));
  assert.equal(blockedTargetHits,0);guardRedirect=false;
  await assert.rejects(()=>guarded.fetch('https://blocked.invalid/installer.exe'));
  closeGuard();await assert.rejects(()=>guarded.fetch(data().feedUrl+'latest.yml'));
  evidence.realElectronDownloadGuard={allowedPinnedFile:true,blockedRedirectBeforeTarget:true,blockedForeignHost:true,strippedCookieAndDeviceId:true,refreshedGrant:true,detachedRequestsBlocked:true};
  await waitFor(()=>sockets.size===1);evidence.httpsCookieCheck=true;evidence.csrfProtectedCloudAdapter=true;evidence.wssCookieHandshake=true;
  const before=checks;version='0.3.1';push('stable-0.3.1');
  await waitFor(()=>manager!.snapshot().availableVersion==='0.3.1');assert.equal(checks,before+1);evidence.realWssTriggersHttpsCheck=true;
  push('stable-0.3.1');await new Promise(r=>setTimeout(r,150));assert.equal(checks,before+1);evidence.duplicatePushCoalesced=true;
  assert.equal((await manager.download()).errorCode,'UPDATE_CODE_SIGNATURE_REQUIRED');evidence.unsignedInstallBlocked=true;
  mode='tamper';assert.equal((await manager.check(true)).errorCode,'UPDATE_MANIFEST_SIGNATURE_INVALID');evidence.tamperedManifestRejected=true;
  mode='revoked';assert.equal((await manager.check(true)).state,'unauthorized');await waitFor(()=>sockets.size===0);evidence.syntheticRevocationClosesWss=true;
  mode='offer';await manager.setAuthState({authenticated:true});await waitFor(()=>sockets.size===1);
  mode='held';const pending=manager.check(true);await waitFor(()=>!!held);
  await manager.setAuthState({authenticated:false});reply(held,200,{success:true,data:data()});await pending;
  assert.equal(manager.snapshot().state,'unauthorized');evidence.lateHttpsAfterLogoutIgnored=true;
  manager.dispose();window.destroy();for(const socket of connections)socket.destroy();for(const socket of sockets)socket.destroy();server.close();
  writeFileSync(join(root,'result.json'),JSON.stringify({passed:true,...evidence},null,2));console.log(JSON.stringify({passed:true,...evidence}));app.exit(0);
})().catch(error=>{
  manager?.dispose();window?.destroy();for(const socket of connections)socket.destroy();for(const socket of sockets)socket.destroy();server.close();
  writeFileSync(join(root,'result.json'),JSON.stringify({passed:false,...evidence,error:String(error.message)},null,2));console.error(String(error.message));app.exit(1);
});
