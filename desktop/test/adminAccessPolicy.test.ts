import{it,expect}from'vitest';import{validateCloudRequest}from'../src/main/cloud/policy';
it('allows only bounded access cursors and exact member channel reads',()=>{
  for(const path of['/admin/invitations/page?cursor=cGFnZQ','/admin/invitations/9','/admin/client-updates/members/page','/admin/client-updates/members/3?channel=stable'])expect(validateCloudRequest({method:'GET',path}).path).toBe(path);
  for(const path of['/admin/invitations/page?limit=999','/admin/invitations/9?code=true','/admin/client-updates/members/3?channel=stable&channel=beta','/admin/client-updates/members/3?channel=all','/admin/client-updates/members/3'])expect(()=>validateCloudRequest({method:'GET',path})).toThrow();
});
it('requires exact expected version and rejects unexpected mutation properties',()=>{
  const value={channel:'stable',enabled:false,reason:'test',expectedVersion:'1'};
  expect(validateCloudRequest({method:'PUT',path:'/admin/client-updates/members/3',json:JSON.stringify(value)})).toBeTruthy();
  for(const body of[{...value,expectedVersion:1},{...value,expectedVersion:undefined},{...value,expectedVersion:'9223372036854775807'},{...value,role:'ADMIN'}])expect(()=>validateCloudRequest({method:'PUT',path:'/admin/client-updates/members/3',json:JSON.stringify(body)})).toThrow();
  expect(validateCloudRequest({method:'POST',path:'/admin/invitations/1/disable',json:'{"expectedVersion":"0"}'})).toBeTruthy();
  expect(()=>validateCloudRequest({method:'POST',path:'/admin/invitations/1/disable',json:'{}'})).toThrow();
});
