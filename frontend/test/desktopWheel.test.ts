import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({
  player:{toggle:vi.fn(),next:vi.fn(),previous:vi.fn(),toggleMute:vi.fn()},
  focus:{timerState:'idle',operationPending:false,spaceAllowed:true,pause:vi.fn(),resume:vi.fn(),start:vi.fn(async()=>({clientRecordId:'synthetic'}))},
  scene:{sceneKey:'lake',timeKey:'day',beginFocusSession:vi.fn()},
  auth:{sessionGeneration:1,user:{id:'synthetic'}},shell:{toast:vi.fn()}
}));
vi.mock('../src/stores/player',()=>({usePlayerStore:()=>state.player}));
vi.mock('../src/stores/focus',()=>({useFocusStore:()=>state.focus}));
vi.mock('../src/stores/scene',()=>({useSceneStore:()=>state.scene}));
vi.mock('../src/stores/auth',()=>({useAuthStore:()=>state.auth}));
vi.mock('../src/stores/shell',()=>({useShellStore:()=>state.shell}));
import {startDesktopWheel} from '../src/audio/desktopWheel';
import type {Router} from 'vue-router';
import type {DesktopWheelCommand} from '@studyroom/contracts';
let listener:(command:DesktopWheelCommand)=>void;
let gate={active:false};
const push=vi.fn(),unsubscribe=vi.fn();
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
beforeEach(()=>{
  vi.clearAllMocks();state.focus.timerState='idle';state.auth.sessionGeneration=1;
  gate={active:false};vi.stubGlobal('window',{studyRoomDesktop:{onWheelCommand:(fn:typeof listener)=>{listener=fn;return unsubscribe;}},moyuStartupOverlay:gate});
});
afterEach(()=>vi.unstubAllGlobals());
describe('desktop wheel command delivery',()=>{
  it.each(['play-pause','next','previous','mute'] as const)('dispatches %s once to the actual player action',async command=>{
    const stop=startDesktopWheel({push} as unknown as Router);listener(command);await settle();
    expect(state.player[{'play-pause':'toggle',next:'next',previous:'previous',mute:'toggleMute'}[command] as keyof typeof state.player]).toHaveBeenCalledOnce();stop();
  });
  it.each([['sound','sound'],['space','scene']] as const)('navigates %s through the router',async(command,name)=>{
    const stop=startDesktopWheel({push} as unknown as Router);listener(command);await settle();expect(push).toHaveBeenCalledWith({name});stop();
  });
  it('starts and pauses focus, then unsubscribes without acting on late commands',async()=>{
    const stop=startDesktopWheel({push} as unknown as Router);listener('focus');await settle();
    expect(state.focus.start).toHaveBeenCalledOnce();expect(state.scene.beginFocusSession).toHaveBeenCalledWith('synthetic');
    state.focus.timerState='running';listener('focus');await settle();expect(state.focus.pause).toHaveBeenCalledOnce();
    stop();listener('next');await settle();expect(state.player.next).not.toHaveBeenCalled();expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not overlap an in-flight operation or run behind the startup gate',async()=>{
    let finish!:()=>void;state.player.toggle.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
    const stop=startDesktopWheel({push} as unknown as Router);listener('play-pause');listener('next');expect(state.player.next).not.toHaveBeenCalled();
    finish();await settle();gate.active=true;listener('next');await settle();expect(state.player.next).not.toHaveBeenCalled();stop();
  });
});
