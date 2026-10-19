import {it,expect} from 'vitest';import {validateCloudRequest} from '../src/main/cloud/policy';
it('restricts admin paging modules, filters and duplicate parameters',()=>{
  expect(validateCloudRequest({method:'GET',path:'/admin/pages/users?role=MUTED&cursor=YWJj'}).method).toBe('GET');
  for(const path of ['/admin/pages/passwords','/admin/pages/users?limit=999','/admin/pages/users?role=ALL&role=MUTED','/admin/pages/posts?role=ADMIN'])expect(()=>validateCloudRequest({method:'GET',path})).toThrow();
});
it('requires bounded string revisions on record writes and forbids extra fields',()=>{
  const role={method:'PATCH' as const,path:'/admin/users/3/type',json:JSON.stringify({userType:'MUTED',expectedVersion:'0'})};expect(validateCloudRequest(role)).toEqual(role);
  for(const body of [{userType:'MUTED'},{userType:'MUTED',expectedVersion:0},{userType:'MUTED',expectedVersion:'0',password:'x'}])expect(()=>validateCloudRequest({...role,json:JSON.stringify(body)})).toThrow();
  expect(()=>validateCloudRequest({method:'DELETE',path:'/admin/feedback/3'})).toThrow();expect(validateCloudRequest({method:'DELETE',path:'/admin/feedback/3',json:'{"expectedVersion":"0"}'}).method).toBe('DELETE');
});
