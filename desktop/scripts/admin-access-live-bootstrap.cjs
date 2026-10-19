// Only used by the explicit isolated acceptance runner, never by an installed app.
const {app,session}=require('electron');const {join,resolve}=require('node:path');
const root=resolve(__dirname,'../..'),evidence=process.cwd();
process.env.NODE_PATH=join(root,'desktop/node_modules')+';'+join(root,'node_modules');require('node:module').Module._initPaths();
app.setAppPath(join(evidence,'desktop'));
app.commandLine.appendSwitch('no-proxy-server');app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
app.on('browser-window-created',(_event,window)=>{window.webContents.setBackgroundThrottling(false);window.show=()=>{};window.showInactive=()=>{};});
global.fetch=async()=>{throw new Error('QA_EXTERNAL_NODE_FETCH_BLOCKED');};
app.whenReady().then(()=>{for(const target of[session.defaultSession,session.fromPartition('persist:studyroom-cloud-v1')])target.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(details,callback)=>callback({cancel:new URL(details.url).origin.replace(/^wss:/,'https:')!==process.env.MEDIA_FIXTURE_ORIGIN}));});
require(join(evidence,'desktop/dist/main/index.cjs'));
