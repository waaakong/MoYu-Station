import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('moyuWheel',Object.freeze({onFrame:(listener:(value:unknown)=>void)=>{const wrapped=(_event:unknown,value:unknown)=>listener(value);ipcRenderer.on('desktop-wheel:frame',wrapped);return()=>ipcRenderer.removeListener('desktop-wheel:frame',wrapped);}}));
