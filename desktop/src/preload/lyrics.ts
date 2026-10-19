import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('moyuLyrics',Object.freeze({
  action:(action:unknown)=>{if(action!=='close'&&action!=='lock')return Promise.reject(new Error('LYRICS_ACTION_REJECTED'));return ipcRenderer.invoke('desktop-lyrics:action',action);},
  onFrame:(listener:(value:unknown)=>void)=>{const wrapped=(_event:unknown,value:unknown)=>listener(value);ipcRenderer.on('desktop-lyrics:frame',wrapped);return ()=>ipcRenderer.removeListener('desktop-lyrics:frame',wrapped);}
}));
