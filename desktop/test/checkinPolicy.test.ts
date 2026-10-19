import {describe,expect,it} from 'vitest';
import {validateCloudRequest} from '../src/main/cloud/policy';

describe('daily check-in exact desktop capability',()=>{
  it.each(['FORTUNE','TAROT'])('allows the documented %s query without a body',drawType=>{
    const request={method:'POST',path:`/focus/checkin?drawType=${drawType}`} as const;
    expect(validateCloudRequest(request)).toEqual(request);
  });
  it.each([
    '/focus/checkin', '/focus/checkin?drawType=OTHER', '/focus/checkin?drawType=fortune',
    '/focus/checkin?drawType=FORTUNE&drawType=TAROT', '/focus/checkin?drawType=TAROT&userId=2',
    '/focus/checkin?drawType=%54AROT', '/focus/checkin?drawType=TAROT#ignored',
    '/focus/start?drawType=TAROT', '/auth/logout?drawType=TAROT'
  ])('rejects non-contract query %s',path=>{
    expect(()=>validateCloudRequest({method:'POST',path})).toThrow();
  });
  it.each([{json:'{}'},{json:'null'},{form:[]},{binary:{type:'image/png',bytes:new Uint8Array([1])}}])('rejects extra payload %j',payload=>{
    expect(()=>validateCloudRequest({method:'POST',path:'/focus/checkin?drawType=TAROT',...payload})).toThrow();
  });
});
