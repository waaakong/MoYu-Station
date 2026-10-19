import { describe, it, expect } from 'vitest';
import { neteaseTrackBadges, qqTrackBadges, kugouTrackBadges } from '../src/providers/core/trackBadges';
import { NeteaseApi } from '../src/providers/adapters/netease/api';
import { QQPublicApi } from '../src/providers/adapters/qq/publicApi';
import { KugouPublicApi } from '../src/providers/adapters/kugou/publicApi';
import { queueItemsSchema } from '../src/main/ipc/validation';
const signal = () => new AbortController().signal;
describe('catalog badges do not grant playback rights', () => {
  it('only maps explicit catalog states', () => {
    expect(neteaseTrackBadges(1,0)).toEqual(['vip']);
    expect(neteaseTrackBadges(4,-200)).toEqual(['purchase','no-source']);
    expect(neteaseTrackBadges(8,0)).toEqual([]);
    expect(neteaseTrackBadges(99,-999)).toEqual([]);
    expect(qqTrackBadges({pay_play:1,pay_month:1})).toEqual(['vip']);
    expect(qqTrackBadges({pay_play:0,pay_month:1})).toEqual([]);
    expect(qqTrackBadges({pay_month:99})).toEqual([]);
    expect(qqTrackBadges({})).toEqual([]);
    expect(kugouTrackBadges(0)).toEqual(['no-source']);
    expect(kugouTrackBadges()).toEqual([]);
  });
  it('retains VIP even when the NetEase account has permission; persists in strict queue IPC', async () => {
    const song={id:1,name:'Song',ar:[{name:'Artist'}],fee:1,privilege:{pl:128000,st:0}};
    const api=new NeteaseApi(async()=>({code:200,result:{songCount:1,songs:[song]}}));
    const [candidate]=await api.search({query:'test',pageSize:1},undefined,signal());
    expect(candidate).toMatchObject({badges:['vip'],rights:'available',isAvailable:true});
    const items=[{id:'q1',queuedAt:1,track:{id:'n1',title:'Song',artist:'Artist',source:{kind:'provider',providerId:'netease',trackId:'1'},providerCandidates:[candidate]}}];
    expect(queueItemsSchema.parse(items)[0]?.track.providerCandidates?.[0]?.badges).toEqual(['vip']);
    delete candidate!.badges;
    expect(queueItemsSchema.safeParse(items).success).toBe(true);
    (candidate as any).badges=['invented'];
    expect(queueItemsSchema.safeParse(items).success).toBe(false);
  });
  it('extracts QQ monthly permission without claiming paid-only is always VIP', async () => {
    const song={mid:'0026XoN00Y92BW',name:'Song',singer:[{name:'Artist'}],interval:120,pay:{pay_play:1,pay_month:1 as number|undefined}};
    const api=new QQPublicApi(async()=>({code:0,req:{code:0,data:{track_info:song}}}));
    expect(await api.trackDetails({trackId:song.mid},signal())).toMatchObject({badges:['vip'],isAvailable:false});
    song.pay.pay_month=undefined;
    expect(await api.trackDetails({trackId:song.mid},signal())).toMatchObject({badges:[],isAvailable:false});
  });
  it('does not turn unknown Kugou privilege flags into VIP or missing source', async () => {
    const item={EMixSongID:'abc',SongName:'Song',SingerName:'Artist',Duration:120,Privilege:10,PayType:3,Publish:1};
    const api=new KugouPublicApi(async()=>({status:1,data:{lists:[item]}}));
    expect((await api.execute('search',{query:'test',pageSize:1},signal()))[0]).toMatchObject({badges:[],isAvailable:false});
    item.Publish=0;
    expect((await api.execute('search',{query:'test',pageSize:1},signal()))[0]?.badges).toEqual(['no-source']);
  });
});
