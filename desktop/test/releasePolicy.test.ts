import {it,expect} from 'vitest';
import {validateCloudRequest} from '../src/main/cloud/policy';
it('only allows the exact bounded release read paths and cursor',()=>{
  for(const path of ['/admin/client-updates/releases/page','/admin/client-updates/releases/page?cursor=YWJj','/admin/client-updates/releases/2104509220480131074'])expect(validateCloudRequest({method:'GET',path}).path).toBe(path);
  for(const path of ['/admin/client-updates/releases/page?limit=999','/admin/client-updates/releases/page?cursor=a&cursor=b','/admin/client-updates/releases/1?cursor=a','/admin/client-updates/releases/1/anything'])expect(()=>validateCloudRequest({method:'GET',path})).toThrow();
});
it('requires an exact versioned policy body without unsafe extra fields',()=>{
  const body={status:'FULL',rolloutPercentage:100,mandatory:false,reason:'explicit confirmation',expectedVersion:'0'};
  const request=(data:unknown)=>({method:'PATCH' as const,path:'/admin/client-updates/releases/1',json:JSON.stringify(data)});
  expect(validateCloudRequest(request(body)).method).toBe('PATCH');
  for(const bad of [{...body,expectedVersion:0},{...body,expectedVersion:undefined},{...body,expectedVersion:'9223372036854775807'},{...body,reason:''},{...body,url:'https://example.org'}])expect(()=>validateCloudRequest(request(bad))).toThrow();
});
