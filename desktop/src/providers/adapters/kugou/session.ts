import {z} from 'zod';
export const kugouSessionSchema=z.object({
  userid:z.string().regex(/^[1-9]\d{4,19}$/), token:z.string().regex(/^[a-fA-F0-9]{64}$/),
  appid:z.string().regex(/^\d{1,8}$/), clienttime:z.string().regex(/^\d{9,12}$/),
  dfid:z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  mid:z.string().regex(/^[a-fA-F0-9]{32}$/).optional()
}).strict();
export type KugouSession=z.infer<typeof kugouSessionSchema>;
export function selectKugouSession(cookies:readonly {name:string;value:string}[]):KugouSession|undefined {
  const get=(name:string)=>cookies.find(c=>c.name===name)?.value;
  // Do not decode/copy the complete legacy cookie: it also contains password fields.
  const raw=get('KuGoo');if(!raw)return undefined;
  const legacy=new URLSearchParams(raw);
  if(['KugooID','t','a_id','ct'].some(key=>legacy.getAll(key).length!==1))return undefined;
  const candidate={userid:legacy.get('KugooID'),token:legacy.get('t'),appid:legacy.get('a_id'),clienttime:legacy.get('ct'),dfid:get('kg_dfid')??get('dfid'),...(get('kg_mid')?{mid:get('kg_mid')}: {})};
  if(get('KugooID')&&get('KugooID')!==candidate.userid||get('t')&&get('t')!==candidate.token)return undefined;
  const parsed=kugouSessionSchema.safeParse(candidate);return parsed.success?parsed.data:undefined;
}
