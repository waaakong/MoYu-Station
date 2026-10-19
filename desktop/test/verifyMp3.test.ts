import {describe,it,expect} from 'vitest';
import {hasMp3Frames,verifyMp3Prefix} from '../src/audio/protocol/verifyMp3';
import {createRemoteMediaResponse,RemoteMediaSessionRegistry} from '../src/audio/protocol/remoteMediaProtocol';
function audio(){const b=new Uint8Array(834);b.set([255,251,144,0]);b.set([255,251,144,0],417);return b;}
describe('restricted octet-stream MP3 verification',()=>{
 it('requires two complete aligned MPEG frames, not a filename or ID3 marker',()=>{
 expect(hasMp3Frames(audio())).toBe(true);expect(hasMp3Frames(audio().subarray(0,500))).toBe(false);expect(hasMp3Frames(new TextEncoder().encode('ID3not music'))).toBe(false);
 const b=new Uint8Array(844);b.set([73,68,51,4,0,0,0,0,0,0]);b.set(audio(),10);expect(hasMp3Frames(b)).toBe(true);b[6]=128;expect(hasMp3Frames(b)).toBe(false);
 });
 it('bounds prefix reads and cancels the probe',async()=>{
 let canceled=false;const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array(65536));},cancel(){canceled=true;}});
 expect(await verifyMp3Prefix(new URL('https://webfs.kugou.com/a.mp3'),new AbortController().signal,async()=>new Response(body,{status:206,headers:{'content-range':'bytes 0-65535/100000'}}))).toBe(false);expect(canceled).toBe(true);
 });
 it.each(['kugou','qq'])('only normalizes verified Kugou CDN media (%s)',async(owner)=>{
 const registry=new RemoteMediaSessionRegistry(),token=registry.issue({kind:'provider',ownerId:owner,trackId:'test',playbackSessionId:'p',accountScope:'a',url:new URL('https://webfs.kugou.com/a.mp3'),expiresAt:Date.now()+60000,allowedHosts:['webfs.kugou.com']});let calls=0;
 const result=await createRemoteMediaResponse(new Request(`studyroom-media://provider/${token}`),registry,async()=>{calls++;return new Response(audio(),{status:206,headers:{'content-type':'application/octet-stream','content-range':'bytes 0-833/834'}});});
 expect(result.status).toBe(owner==='kugou'?206:415);expect(calls).toBe(owner==='kugou'?2:1);if(owner==='kugou')expect(result.headers.get('content-type')).toBe('audio/mpeg');await result.body?.cancel();
 });
 it('drops a late format probe after logout and cancels both response bodies',async()=>{
 const registry=new RemoteMediaSessionRegistry(),token=registry.issue({kind:'provider',ownerId:'kugou',trackId:'test',playbackSessionId:'p',accountScope:'a',url:new URL('https://webfs.kugou.com/a.mp3'),expiresAt:Date.now()+60000,allowedHosts:['webfs.kugou.com']});let calls=0,canceled=0;
 const result=await createRemoteMediaResponse(new Request(`studyroom-media://provider/${token}`),registry,async()=>{
 calls++;if(calls===2)registry.invalidateOwner('kugou');return new Response(new ReadableStream({start(c){c.enqueue(audio());},cancel(){canceled++;}}),{status:206,headers:{'content-type':'application/octet-stream','content-range':'bytes 0-833/834'}});
 });expect(result.status).not.toBe(206);expect(canceled).toBe(2);expect(registry.resolve('provider',token)).toBeUndefined();
 });
});
