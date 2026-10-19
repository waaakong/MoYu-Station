// Included only by prepare-sandbox-update.mjs, never the production build.
import { app, session } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CloudClient } from '../src/main/cloud/client';
import { newPuzzle, new2048, newMines, newSpider } from '@studyroom/contracts';

export function attach(getState: () => any) {
  if (process.env.USERNAME !== 'WDAGUtilityAccount' || !existsSync('C:/MoYuLab/guest-only.json')) throw Error('SANDBOX_ONLY');
  const out=process.env.MOYU_SANDBOX_EVIDENCE || 'C:/MoYuEvidence', origin='https://localhost:18443';
  let busy=false, last='', ready=false;
  const data=(db:any)=>({setting:db.getSetting('sandbox-preservation'),tracks:db.listTracks(),queue:db.readQueue(),focus:db.listFocusRecords(),
    games:['puzzle','game2048','minesweeper','spider'].map(id=>db.readEntertainmentState(id))});
  const timer=setInterval(async()=>{
    if(busy)return;
    const {updateManager:m,databaseStore:db,windowManager:wm}=getState();
    if(!m||!db||!wm||wm.window.webContents.isLoading())return;
    busy=true;
    try {
      if(!ready){
        const content=await wm.window.webContents.executeJavaScript("({nodes:document.getElementById('app')?.children.length||0,runtimeBound:!!window.moyuStartupOverlay?.runtimeBound})");
        if(!content.nodes)return;
        writeFileSync(join(out,`boot-${app.getVersion()}.json`),JSON.stringify({version:app.getVersion(),exe:app.getPath('exe'),userData:app.getPath('userData'),content,data:data(db)},null,2));
        ready=true;
      }
      if(!existsSync(join(out,'command.json')))return;
      let cmd:any;try{cmd=JSON.parse(readFileSync(join(out,'command.json'),'utf8'));}catch{return;}
      if(!cmd.id||cmd.id===last||cmd.version!==app.getVersion())return;
      last=cmd.id;
      let result:any;
      if(cmd.action==='seed'){
        db.setSetting('sandbox-preservation',{volume:.37,scene:'mountain',label:'synthetic fixture'});
        const audio='C:/MoYuLab/fixture.wav';writeFileSync(audio,Buffer.alloc(44));
        db.importLocalFiles([{path:audio,title:'Sandbox fixture',artist:'Synthetic',quickSignature:'sandbox-fixture',size:44,modifiedAt:100}]);
        db.replaceQueue([{id:'sandbox-queue',queuedAt:100,track:db.listTracks()[0]}]);
        db.saveFocusRecord({clientRecordId:'sandbox-focus',startedAt:100,finishedAt:200,plannedMinutes:25,completedMinutes:25,completedSeconds:1500,status:'completed',syncStatus:'local',syncPolicy:'manual-only'});
        const gen='11111111-1111-4111-8111-111111111111';
        for(const g of [newPuzzle(4,gen,()=>.4),new2048(gen,()=>.4),newMines(2,gen),newSpider(4,gen,()=>.4)])db.saveEntertainmentState(g.toolId,g,null);
        result=data(db);
      }else if(cmd.action==='auth'){
        const s=session.fromPartition('persist:sandbox-update-fixture');
        await s.cookies.set({url:origin,name:'STUDYROOM_SESSION',value:'synthetic-guest-session',secure:true,httpOnly:true,sameSite:'strict'});
        const cloud=new CloudClient(origin,(url,init)=>s.fetch(url,init),async()=>{},()=>{});
        // Authentication is synthetic; the application updater and CloudClient are real.
        m.cloud={session:s,fetcher:(url:string,init:any)=>cloud.updateCheck(url,init)};
        result=await m.setAuthState({authenticated:true});
      }else if(cmd.action==='check')result=await m.check(true);
      else if(cmd.action==='download')result=await m.download();
      else if(cmd.action==='busy-install'){m.setActivityState({focusActive:true,audioActive:true});await m.install();result=m.snapshot();}
      else if(cmd.action==='idle'){result=m.setActivityState({focusActive:false,audioActive:false});}
      else if(cmd.action==='logout')result=await m.setAuthState({authenticated:false});
      else if(cmd.action==='snapshot')result={status:m.snapshot(),data:data(db)};
      else if(cmd.action==='quit'||cmd.action==='install'){
        // This proves only the request/before-state. The new process's boot evidence proves installation.
        writeFileSync(join(out,`${cmd.id}.json`),JSON.stringify({requested:true,action:cmd.action,status:m.snapshot(),data:data(db)}));
        if(cmd.action==='install')await m.install();else app.quit();return;
      }else throw Error('UNKNOWN_LAB_ACTION');
      writeFileSync(join(out,`${cmd.id}.json`),JSON.stringify({ok:true,result},null,2));
    }catch(error){writeFileSync(join(out,`${last||'startup-error'}.json`),JSON.stringify({ok:false,error:String(error)}));}
    finally{busy=false;}
  },400);
  app.once('will-quit',()=>clearInterval(timer));
}
