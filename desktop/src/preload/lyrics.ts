import {contextBridge,ipcRenderer} from 'electron';
import {LYRICS_ACTIONS} from '../main/music/lyricsProtocol';
contextBridge.exposeInMainWorld('moyuLyrics',Object.freeze({
  action:(action:unknown)=>{if(typeof action!=='string'||!LYRICS_ACTIONS.includes(action as typeof LYRICS_ACTIONS[number]))return Promise.reject(new Error('LYRICS_ACTION_REJECTED'));return ipcRenderer.invoke('desktop-lyrics:action',action);},
  onFrame:(listener:(value:unknown)=>void)=>{const wrapped=(_event:unknown,value:unknown)=>listener(value);ipcRenderer.on('desktop-lyrics:frame',wrapped);return ()=>ipcRenderer.removeListener('desktop-lyrics:frame',wrapped);}
}));
