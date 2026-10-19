import {beforeEach,expect,it,vi} from 'vitest';
import {computed} from 'vue';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),auth:{user:{id:'2104509220480131074'} as any,sessionGeneration:0,authTransition:false}}));
vi.mock('../src/services/http',()=>({http:{get:mocks.get,post:mocks.post}}));
vi.mock('../src/stores/auth',()=>({useAuthStore:()=>mocks.auth}));
import {reliableCreate,createTasks,clearReliableCreates,feedbackDraft} from '../src/services/reliableCreate';
const ok=(data:unknown)=>({data:{data}});
const options=()=>({slot:'feedback',kind:'FEEDBACK' as const,url:'/profile/feedback',payload:{title:'原稿',content:'原内容'},recover:vi.fn(async(id:any)=>({id}))});
beforeEach(()=>{clearReliableCreates();vi.resetAllMocks();mocks.auth.user={id:'2104509220480131074'};mocks.auth.sessionGeneration=0;mocks.auth.authTransition=false;mocks.get.mockResolvedValue(ok({reliableCreate:true}));});
it('does not downgrade when capability is absent',async()=>{
  mocks.get.mockResolvedValue(ok({}));await expect(reliableCreate(options())).rejects.toThrow('未开启');expect(mocks.post).not.toHaveBeenCalled();expect(createTasks.feedback).toBeUndefined();
});
it('lost response is checked on explicit retry without another POST after commit',async()=>{
  const caption=computed(()=>createTasks.feedback?.busy?'sending':createTasks.feedback?.unknown?'retry':'send');
  mocks.post.mockImplementation(async()=>{expect(caption.value).toBe('sending');throw new Error('lost');});const input=options();await expect(reliableCreate(input)).rejects.toThrow('未确认');expect(caption.value).toBe('retry');
  const id=createTasks.feedback.id;expect(createTasks.feedback.unknown).toBe(true);expect(mocks.get).toHaveBeenCalledTimes(1);
  mocks.get.mockImplementation(async(path:string)=>ok(path.endsWith('capabilities')?{reliableCreate:true}:{status:'committed',requestId:id,targetId:'2104509220480131075'}));
  expect(await reliableCreate(input)).toEqual({id:'2104509220480131075'});expect(mocks.post).toHaveBeenCalledTimes(1);expect(createTasks.feedback).toBeUndefined();
});
it('missing result retries with the same ID and exact original payload',async()=>{
  mocks.post.mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(ok({id:'9'}));const input=options();await expect(reliableCreate(input)).rejects.toThrow();
  const id=createTasks.feedback.id;mocks.get.mockImplementation(async(path:string)=>ok(path.endsWith('capabilities')?{reliableCreate:true}:{status:'missing',requestId:id}));
  await reliableCreate(input);expect(mocks.post.mock.calls[0][1]).toEqual(mocks.post.mock.calls[1][1]);
});
it('failed lookup retains task and never writes',async()=>{
  mocks.post.mockRejectedValueOnce(new Error('lost'));const input=options();await expect(reliableCreate(input)).rejects.toThrow();const id=createTasks.feedback.id;
  mocks.get.mockImplementation(async(path:string)=>{if(!path.endsWith('capabilities'))throw new Error('offline');return ok({reliableCreate:true});});
  await expect(reliableCreate(input)).rejects.toThrow('未确认');expect(createTasks.feedback.id).toBe(id);expect(mocks.post).toHaveBeenCalledTimes(1);
});
it('changed payload is rejected while original result is unknown',async()=>{
  mocks.post.mockRejectedValueOnce(new Error('lost'));await expect(reliableCreate(options())).rejects.toThrow();
  await expect(reliableCreate({...options(),payload:{title:'changed',content:'原内容'}})).rejects.toThrow('不能改换');expect(mocks.post).toHaveBeenCalledTimes(1);
});
it('clicks coalesce while pending and account change cancels before posting',async()=>{
  let done!:(value:any)=>void;mocks.get.mockReturnValue(new Promise(resolve=>{done=resolve;}));const a=reliableCreate(options()),b=reliableCreate(options());expect(a).toBe(b);
  await expect(reliableCreate({...options(),payload:{title:'changed'}})).rejects.toThrow('不能改换');
  mocks.auth.sessionGeneration++;clearReliableCreates();done(ok({reliableCreate:true}));await expect(a).rejects.toThrow('账号会话');expect(mocks.post).not.toHaveBeenCalled();
});
it('logout discards draft and late response cannot return success or restore it',async()=>{
  let done!:(value:any)=>void;mocks.post.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));feedbackDraft.title='私人内容';const result=reliableCreate(options());await vi.waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(1));
  mocks.auth.sessionGeneration++;clearReliableCreates();done(ok({id:'1'}));await expect(result).rejects.toThrow('账号会话');expect(feedbackDraft.title).toBe('');expect(createTasks.feedback).toBeUndefined();
});
it('confirmed rejection releases task without clearing draft',async()=>{
  feedbackDraft.title='保留';mocks.post.mockRejectedValue({code:'VALIDATION_ERROR',message:'invalid'});await expect(reliableCreate(options())).rejects.toEqual(expect.objectContaining({code:'VALIDATION_ERROR'}));expect(createTasks.feedback).toBeUndefined();expect(feedbackDraft.title).toBe('保留');
});
it('mismatched receipt ID never settles or retries the task',async()=>{
  mocks.post.mockRejectedValueOnce(new Error('lost'));await expect(reliableCreate(options())).rejects.toThrow();
  mocks.get.mockImplementation(async(path:string)=>ok(path.endsWith('capabilities')?{reliableCreate:true}:{status:'committed',requestId:'other',targetId:'2'}));
  await expect(reliableCreate(options())).rejects.toThrow('未确认');expect(mocks.post).toHaveBeenCalledTimes(1);
});
it('malformed success never clears the original request',async()=>{
  mocks.post.mockResolvedValue(ok({}));await expect(reliableCreate(options())).rejects.toThrow('未确认');expect(createTasks.feedback.unknown).toBe(true);
});
