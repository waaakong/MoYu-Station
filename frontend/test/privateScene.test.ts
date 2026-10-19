import {describe,it,expect,afterEach} from 'vitest';
import {parseSceneSnapshot} from '../src/scenes/privateApi';
import {clearPrivateScene,privateScene,privateSceneController} from '../src/scenes/privateSession';
const id='77777777-7777-4777-8777-777777777777';
const picture={assetId:id,fit:'contain',focalX:.5,focalY:.2,zoom:1,dim:.2};
const valid=()=>({version:1,deleted:false,config:{name:'私人窗景',defaultImage:{...picture},periods:{night:{...picture}}},media:[{assetId:id,width:960,height:1600,bytes:900,clearUrl:`/api/media/assets/${id}/clear`,displayUrl:`/api/media/assets/${id}/display`,thumbUrl:`/api/media/assets/${id}/thumb`}]});
afterEach(clearPrivateScene);
describe('private scene contract and account lifetime',()=>{
  it('retains original portrait dimensions and rejects arbitrary URLs, missing assets and unbounded preferences',()=>{
    expect(parseSceneSnapshot(valid()).media[0]!.height).toBe(1600);
    for(const mutate of [(v:any)=>v.media[0].displayUrl='https://example.invalid/private.png',(v:any)=>v.media=[],(v:any)=>v.config.defaultImage.zoom=Infinity,(v:any)=>v.config.periods.dawn=picture,(v:any)=>v.media[0].bytes=97*1024*1024]){const value=valid();mutate(value);expect(()=>parseSceneSnapshot(value)).toThrow();}
  });
  it('requires deleted tombstones to carry neither images nor a configuration',()=>{
    expect(parseSceneSnapshot({version:5,deleted:true,config:null,media:[]}).version).toBe(5);
    expect(()=>parseSceneSnapshot({...valid(),deleted:true})).toThrow();
  });
  it('clears private render selection, draft, jobs and in-flight controllers synchronously',()=>{
    privateScene.saved=parseSceneSnapshot(valid());privateScene.draft=privateScene.saved.config;privateScene.active=true;privateScene.owner='9223372036854775806';
    const {controller}=privateSceneController();clearPrivateScene();expect(controller.signal.aborted).toBe(true);expect(privateScene.saved).toBeNull();expect(privateScene.draft).toBeNull();expect(privateScene.active).toBe(false);expect(privateScene.owner).toBe('');
  });
});
