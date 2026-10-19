import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,readFile,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProviderArtworkCache} from '../src/providers/core/artworkCache';
import {artworkSource,qqAlbumArtwork} from '../src/providers/core/artworkSource';
import {artworkImageType} from '../src/providers/core/artworkImage';
import {normalizeProviderTrack} from '../src/providers/core/trackNormalizer';

const source='https://p1.music.126.net/album.jpg';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGesAAAAASUVORK5CYII=','base64');
const response=()=>new Response(png,{headers:{'content-type':'image/png'}});
async function setup(fetcher:typeof fetch=vi.fn(async()=>response())){
 const directory=await mkdtemp(join(tmpdir(),'studyroom-artwork-'));let account:string|undefined='account-a';
 const cache=new ProviderArtworkCache({directory,scope:()=>account,fetcher});
 return{directory,cache,fetcher,setScope:(v:string|undefined)=>{account=v;}};
}
describe('provider artwork boundary',()=>{
 it('only accepts platform image CDN paths; normalizes transport and bounded size',()=>{
  expect(artworkSource('netease','http://p1.music.126.net/a.jpg')).toBe(source.replace('album','a')+'?param=480y480');
  expect(artworkSource('kugou','https://imge.kugou.com/stdmusic/{size}/a.jpg')).toContain('/480/');
  expect(qqAlbumArtwork('0026XoN00Y92BW')).toContain('T002R500x500M000');
  for(const bad of ['https://127.0.0.1/a.jpg','https://p1.music.126.net.evil.test/a.jpg','https://user@p1.music.126.net/a.jpg','file:///a.jpg','https://p1.music.126.net/a.svg','https://p1.music.126.net/a.jpg?token=secret'])expect(artworkSource('netease',bad)).toBeUndefined();
 });
 it('rejects HTML, animated/oversized images before decoding',()=>{
  expect(artworkImageType(png)).toBe('image/png');expect(artworkImageType(Buffer.from('<html>'))).toBeUndefined();
  const huge=Buffer.from(png);huge.writeUInt32BE(30000,16);expect(artworkImageType(huge)).toBeUndefined();
 });
 it('sanitizes nested worker data and never exposes remote URLs in tracks/playlists',async()=>{
  const {cache}=await setup();const ref=normalizeProviderTrack({providerId:'netease',trackId:'1',title:'Song',artists:['Artist'],artworkUrl:source});
  const page=cache.metadata('netease',{items:[{providerCandidates:[ref]}],playlists:[{artworkToken:source}]});
  expect(JSON.stringify(page)).not.toContain('126.net');expect(page.items[0]).toHaveProperty('artworkUrl',expect.stringMatching(/^studyroom-media:\/\/provider-artwork\/[a-f0-9]{64}$/));
  expect(page.playlists[0]?.artworkToken).toMatch(/^[a-f0-9]{64}$/);
 });
 it('deduplicates downloads and reuses disk after restart without network',async()=>{
  const {cache,fetcher,directory}=await setup();const url=cache.metadata('netease',{artworkUrl:source}).artworkUrl!;
  const results=await Promise.all([cache.response(new Request(url)),cache.response(new Request(url))]);expect(results.map(r=>r.status)).toEqual([200,200]);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(results[0]?.headers.get('cache-control')).toBe('no-store');
  const offline=vi.fn(async()=>{throw new Error('offline');});const restarted=new ProviderArtworkCache({directory,scope:()=> 'account-a',fetcher:offline});
  expect((await restarted.response(new Request(url))).status).toBe(200);expect(offline).not.toHaveBeenCalled();
 });
 it('rejects cross-account tokens, disabled access and malformed requests',async()=>{
  const {cache,setScope}=await setup();const url=cache.metadata('netease',{artworkUrl:source}).artworkUrl!;
  expect((await cache.response(new Request(url))).status).toBe(200);
  setScope('account-b');expect((await cache.response(new Request(url))).status).toBe(404);
  setScope(undefined);expect((await cache.response(new Request(url))).status).toBe(404);
  setScope('account-a');for(const request of [new Request(url+'?url=https://evil.test'),new Request(url,{method:'POST'}),new Request('studyroom-media://provider-artwork/../../private')])expect((await cache.response(request)).status).toBe(404);
 });
 it.each([()=>new Response('<html>',{headers:{'content-type':'text/html'}}),()=>new Response(png,{status:302,headers:{location:'https://evil.test'}}),()=>new Response(png,{headers:{'content-type':'image/png','content-length':String(3*1024*1024)}}),()=>new Response('<html>',{headers:{'content-type':'image/jpeg'}})])('falls back on invalid upstream and does not repeatedly retry',async factory=>{
  const fetcher=vi.fn(async()=>factory()),{cache}=await setup(fetcher);const url=cache.metadata('netease',{artworkUrl:source}).artworkUrl!;
  expect((await cache.response(new Request(url))).status).toBe(404);expect((await cache.response(new Request(url))).status).toBe(404);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('serves sniffed PNG when the upstream mislabels it image/jpg',async()=>{
  const {cache}=await setup(async()=>new Response(png,{headers:{'content-type':'image/jpg'}}));const url=cache.metadata('netease',{artworkUrl:source}).artworkUrl!;
  const result=await cache.response(new Request(url));expect(result.status).toBe(200);expect(result.headers.get('content-type')).toBe('image/png');
 });
 it('aborts late downloads on logout and clears only owned cached entries',async()=>{
  let finish!:(r:Response)=>void;const {cache,directory,setScope}=await setup(vi.fn(()=>new Promise<Response>(r=>{finish=r;})));
  const url=cache.metadata('netease',{artworkUrl:source}).artworkUrl!,job=cache.response(new Request(url));
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));cache.invalidate('netease');setScope(undefined);finish(response());expect((await job).status).toBe(404);
  expect((await readdir(directory)).length).toBe(0);
 });
 it('evicts within a fixed total byte budget',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'studyroom-artwork-quota-'));const cache=new ProviderArtworkCache({directory,scope:()=> 'a',fetcher:async()=>response(),maxBytes:400});
  for(let i=0;i<5;i++){const url=cache.metadata('netease',{artworkUrl:source.replace('album',String(i))}).artworkUrl!;await cache.response(new Request(url));}
  const size=(await Promise.all((await readdir(directory)).map(async n=>(await stat(join(directory,n))).size))).reduce((a,b)=>a+b,0);expect(size).toBeLessThanOrEqual(400);
 });
});
