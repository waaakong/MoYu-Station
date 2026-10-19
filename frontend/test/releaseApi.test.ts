import {beforeEach,it,expect,vi} from 'vitest';
const http=vi.hoisted(()=>({get:vi.fn(),patch:vi.fn()}));vi.mock('../src/services/http',()=>({http}));
import {fetchReleasePage,fetchClientRelease,updateClientRelease} from '../src/services/clientUpdates';
beforeEach(()=>vi.resetAllMocks());
const row={id:'2104509220480131074',status:'PILOT',policyVersion:'0'};
const response=(value:unknown)=>({data:{data:value}});
it('does not report a malformed or wrong-target ACK as success',async()=>{
  http.patch.mockResolvedValueOnce(response(null)).mockResolvedValueOnce(response({...row,id:'2',policyVersion:'1'})).mockResolvedValueOnce(response({...row,policyVersion:'1'}));
  await expect(updateClientRelease(row,{},()=>{})).rejects.toThrow();await expect(updateClientRelease(row,{},()=>{})).rejects.toThrow();await expect(updateClientRelease(row,{},()=>{})).resolves.toMatchObject({policyVersion:'1'});
});
it('rejects an unversioned list without legacy fallback and mismatched lookup',async()=>{
  http.get.mockResolvedValueOnce(response([row])).mockResolvedValueOnce(response({...row,id:'2'}));
  await expect(fetchReleasePage(null,()=>{})).rejects.toThrow('不支持安全发布管理');await expect(fetchClientRelease(row.id,()=>{})).rejects.toThrow('目标不一致');expect(http.get).toHaveBeenCalledTimes(2);
});
