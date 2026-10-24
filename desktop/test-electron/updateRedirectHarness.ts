import {app,session} from 'electron';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {fetchElectronUpdateFeedResponse} from '../src/updater/electronUpdateFeed';
const root=process.env.STUDYROOM_REDIRECT_TEST_ROOT;if(!root)throw Error('Isolated test directory required');
app.setName('MoYu Isolated Redirect Test');app.setPath('userData',join(root,'user-data'));
app.whenReady().then(async()=>{
 let targetHits=0,feedHeaders:any,slowReceived!:()=>void;const slow=new Promise<void>(resolve=>{slowReceived=resolve;});
 const server=createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/target'});res.end();}
  else if(req.url==='/target'){targetHits++;res.end('must not follow');}
  else if(req.url==='/feed'){feedHeaders=req.headers;res.end('bounded feed');}
  else if(req.url==='/large')res.end(Buffer.alloc(128*1024+1));
  else if(req.url==='/slow'){slowReceived();}
  else if(req.url==='/truncated'){res.writeHead(200,{'Content-Length':'500'});res.write('short');res.destroy();}
  else {res.writeHead(404);res.end();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');const origin='http://127.0.0.1:'+address.port;
 const isolated=session.fromPartition('moyu-redirect-fixture',{cache:false});
 try{
  await isolated.cookies.set({url:origin,name:'synthetic-cookie',value:'must-not-send'});
  const response=await fetchElectronUpdateFeedResponse(origin+'/redirect',{signal:AbortSignal.timeout(5000)},isolated);assert.equal(response.status,302);assert.equal(response.headers.get('location'),origin+'/target');assert.equal(targetHits,0);
  const feed=await fetchElectronUpdateFeedResponse(origin+'/feed',{signal:AbortSignal.timeout(5000)},isolated);assert.equal(await feed.text(),'bounded feed');assert.equal(feedHeaders.cookie,undefined);assert.equal(feedHeaders.authorization,undefined);assert.equal(targetHits,0);
  await assert.rejects(fetchElectronUpdateFeedResponse(origin+'/large',{signal:AbortSignal.timeout(5000)},isolated),/UPDATE_ARTIFACT_HASH_FAILED/);
  await assert.rejects(fetchElectronUpdateFeedResponse(origin+'/truncated',{signal:AbortSignal.timeout(5000)},isolated));
  const controller=new AbortController(),pending=fetchElectronUpdateFeedResponse(origin+'/slow',{signal:controller.signal},isolated);const cancelled=assert.rejects(pending,/fixture cancelled/);await slow;controller.abort(Error('fixture cancelled'));await cancelled;
  console.log('STUDYROOM_NATIVE_REDIRECT_OK manual302 no-follow no-cookies bounded-body abort truncated-response');
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
