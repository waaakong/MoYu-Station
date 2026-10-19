import { z } from 'zod';

const secret=z.string().regex(/^[\x21-\x7e]{1,4096}$/).refine(value=>!/[;,]/.test(value));
export const qqSessionSchema=z.object({
  qqmusic_uin:z.string().regex(/^[1-9]\d{4,12}$/),
  qqmusic_key:secret,
  uin:z.string().regex(/^o?\d{5,13}$/).optional(),
  skey:secret.optional(),
  login_type:z.literal('1').optional()
}).strict();
export type QQSession=z.infer<typeof qqSessionSchema>;
export function qqToken(value:string):string {
  let hash=5381;for(const char of value)hash=(hash*33+char.charCodeAt(0))|0;
  return String(hash&0x7fffffff);
}
export function selectQQSession(cookies:readonly {name:string;value:string}[]):QQSession|undefined {
  const values=Object.fromEntries(cookies.filter(c=>['qqmusic_uin','qqmusic_key','uin','skey','login_type'].includes(c.name)).map(c=>[c.name,c.value]));
  // QQ login only; do not misidentify a WeChat account or reuse a QQ OAuth token.
  if(values.login_type==='2')return undefined;
  // The current official web login sets `uin`, not necessarily qqmusic_uin.
  // Normalize only the same QQ identity; never reuse OAuth or WeChat cookies.
  if(!values.qqmusic_uin&&values.uin)values.qqmusic_uin=values.uin.replace(/^o0*/,'').replace(/^0+/,'');
  if(values.uin&&values.qqmusic_uin!==values.uin.replace(/^o0*/,'').replace(/^0+/,''))return undefined;
  const parsed=qqSessionSchema.safeParse(values);return parsed.success?parsed.data:undefined;
}
