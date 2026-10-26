import {EventEmitter} from 'node:events';
import {describe,it,expect,vi} from 'vitest';
import {parseMetadataProcess,metadataEnvironment,type MetadataWorker} from '../src/audio/library/metadataProcess';
describe('killable metadata process',()=>{
  it('kills a hanging parser and holds its permit until physical exit',async()=>{
    const worker=new EventEmitter() as EventEmitter&MetadataWorker;worker.send=vi.fn();worker.kill=vi.fn();
    await expect(parseMetadataProcess('synthetic',{timeoutMs:10,create:()=>worker})).rejects.toThrow('METADATA_PARSE_TIMEOUT');
    expect(worker.kill).toHaveBeenCalledOnce();worker.emit('exit',1);
  });
  it('validates child output, kills the child and ignores late responses',async()=>{
    const worker=new EventEmitter() as EventEmitter&MetadataWorker;worker.send=()=>{queueMicrotask(()=>worker.emit('message',{title:'valid',lyrics:'[00:01]synthetic'}));};worker.kill=()=>{queueMicrotask(()=>worker.emit('exit',0));};
    await expect(parseMetadataProcess('synthetic',{create:()=>worker})).resolves.toMatchObject({title:'valid'});
    worker.emit('message',{title:'late'});
  });
  it('does not forward credential or Node injection environment variables',()=>{
    process.env.MOYU_TEST_SECRET='synthetic';process.env.NODE_OPTIONS='--inspect';
    try{expect(metadataEnvironment()).not.toHaveProperty('MOYU_TEST_SECRET');expect(metadataEnvironment()).not.toHaveProperty('NODE_OPTIONS');}finally{delete process.env.MOYU_TEST_SECRET;delete process.env.NODE_OPTIONS;}
  });
});
