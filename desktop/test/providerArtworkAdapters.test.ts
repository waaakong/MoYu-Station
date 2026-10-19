import {describe,it,expect} from 'vitest';
import {NeteaseApi} from '../src/providers/adapters/netease/api';
import {QQPublicApi} from '../src/providers/adapters/qq/publicApi';
import {KugouPublicApi} from '../src/providers/adapters/kugou/publicApi';
const signal=()=>new AbortController().signal;
describe('optional provider artwork extraction',()=>{
 it('retains NetEase album images without changing entitlement',async()=>{
  const song={id:1,name:'Song',ar:[{name:'Artist'}],al:{name:'Album',picUrl:'http://p1.music.126.net/cover.jpg'},fee:1};
  const api=new NeteaseApi(async()=>({code:200,result:{songCount:1,songs:[song]}}));
  const [track]=await api.search({query:'test',pageSize:1},undefined,signal());expect(track?.artworkUrl).toBe('https://p1.music.126.net/cover.jpg?param=480y480');expect(track?.rights).toBe('subscription-required');
  song.al.picUrl='https://evil.test/a.jpg';expect((await api.search({query:'test',pageSize:1},undefined,signal()))[0]?.artworkUrl).toBeUndefined();
 });
 it('derives QQ images only from a valid exact album mid',async()=>{
  const song={mid:'0026XoN00Y92BW',name:'Song',singer:[{name:'Artist'}],album:{name:'Album',mid:'0026XoN00Y92BW'},interval:120,pay:{pay_play:0}};
  const api=new QQPublicApi(async()=>({code:0,req:{code:0,data:{track_info:song}}}));
  expect((await api.trackDetails({trackId:song.mid},signal()))?.artworkUrl).toContain('T002R500x500M0000026XoN00Y92BW.jpg');
  song.album.mid='../../wrong';expect((await api.trackDetails({trackId:song.mid},signal()))?.artworkUrl).toBeUndefined();
 });
 it('keeps Kugou search image templates optional and bounded',async()=>{
  const item={EMixSongID:'abc',SongName:'Song',SingerName:'Artist',Duration:120,Image:'https://imge.kugou.com/stdmusic/{size}/cover.jpg'};
  const api=new KugouPublicApi(async()=>({status:1,data:{lists:[item]}}));
  const [track]=await api.execute('search',{query:'test',pageSize:1},signal());expect(track?.artworkUrl).toContain('/480/');
  item.Image='invalid';expect((await api.execute('search',{query:'test',pageSize:1},signal()))[0]?.artworkUrl).toBeUndefined();
 });
});
