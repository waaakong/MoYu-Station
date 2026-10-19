/** Bounded protocol metadata only; never forward a raw response header. */
export function retryAfterMs(value:string|string[]|undefined,now=Date.now()):number{
  if(typeof value!=='string'||value.length>128)return 60_000;
  const seconds=/^\d{1,9}$/.test(value)?Number(value):undefined;
  const date=seconds===undefined&&/^[A-Za-z]{3}, /.test(value)?Date.parse(value):NaN;
  const delay=seconds!==undefined?seconds*1000:date-now;
  return Number.isFinite(delay)?Math.max(1000,Math.min(7*86400_000,Math.ceil(delay))):60_000;
}
