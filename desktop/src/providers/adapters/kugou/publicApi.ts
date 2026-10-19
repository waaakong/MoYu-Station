import { z } from "zod";
import { ProviderError } from "../../core/providerErrors";
import { kugouTrackBadges } from "../../core/trackBadges";
import { normalizeProviderTrack } from "../../core/trackNormalizer";
import { requestPublicWeb, type PublicWebTransport } from "../publicWebTransport";
import { signKugouWeb } from "./webSignature";
const inputSchema=z.object({query:z.string().trim().min(1).max(120),pageSize:z.number().int().min(1).max(50),cursor:z.string().optional()}).strict();
const resultSchema=z.object({status:z.number(),error_code:z.number().optional(),data:z.object({lists:z.array(z.object({EMixSongID:z.string().regex(/^[a-zA-Z0-9]{1,64}$/),SongName:z.string().min(1).max(512),SingerName:z.string().min(1).max(512),AlbumName:z.string().max(512).optional(),Image:z.string().max(2048).optional().catch(undefined),Duration:z.number().nonnegative(),Privilege:z.number().int().optional(),PayType:z.number().int().optional(),Publish:z.number().int().optional()})).max(50)}).optional()});
export class KugouPublicApi {
  constructor(private readonly transport:PublicWebTransport=requestPublicWeb,private readonly now=Date.now){}
  async execute(operation:string,input:unknown,signal:AbortSignal){
    if(operation!=="search")throw new ProviderError("PROVIDER_DISABLED");
    const parsed=inputSchema.safeParse(input);if(!parsed.success)throw new ProviderError("PROVIDER_API_CHANGED");
    const q=parsed.data;if(q.cursor)throw new ProviderError("PROVIDER_UNAVAILABLE");
    const params:Record<string,string>={srcappid:"2919",clientver:"1000",clienttime:String(Math.floor(this.now()/1000)),mid:"0",uuid:"-",dfid:"-",keyword:q.query,page:"1",pagesize:String(q.pageSize),bitrate:"0",isfuzzy:"0",inputtype:"0",platform:"WebFilter",userid:"0",iscorrection:"1",privilege_filter:"0",filter:"10",token:"",appid:"1014"};
    params.signature=signKugouWeb(params);
    const raw=await this.transport("kugouSearch",params,undefined,signal);signal.throwIfAborted();
    const envelope=z.object({status:z.number(),error_code:z.number().optional(),data:z.unknown().optional()}).safeParse(raw);
    if(!envelope.success)throw new ProviderError('PROVIDER_API_CHANGED');
    const metadata=envelope.data;
    if(metadata.error_code===20028||metadata.status===0&&metadata.data&&typeof metadata.data==='object'&&'SSA-CODE' in metadata.data)throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
    if(metadata.status!==1||metadata.error_code)throw new ProviderError('PROVIDER_UNAVAILABLE');
    const response=resultSchema.safeParse(raw);if(!response.success)throw new ProviderError("PROVIDER_API_CHANGED");
    const value=response.data;
    if(value.error_code===20028)throw new ProviderError("PROVIDER_LOGIN_REQUIRED");
    if(value.status!==1||value.error_code||!value.data)throw new ProviderError("PROVIDER_UNAVAILABLE");
    // Only explicit free/published metadata is eligible for a playback attempt.
    // The authenticated song endpoint must revalidate full rights before issuing media.
    return value.data.lists.map(s=>{const available=s.Privilege===0&&s.PayType===0&&s.Publish===1;return normalizeProviderTrack({providerId:"kugou",trackId:s.EMixSongID,title:s.SongName,artists:s.SingerName.split('、'),album:s.AlbumName,artworkUrl:s.Image,durationMs:s.Duration*1000,available,badges:kugouTrackBadges(s.Publish),rights:available?'available':'unavailable'});});
  }
}
