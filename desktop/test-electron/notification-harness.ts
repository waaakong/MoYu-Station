import { app, BrowserWindow, session } from 'electron';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { registerCloudBridge } from '../src/main/cloud/register';

const output = process.env.STUDYROOM_NOTIFICATION_EVIDENCE!;
app.setPath('userData', resolve(output, 'profile'));
app.setAppUserModelId('xyz.moyustation.notification-test');
void app.whenReady().then(async () => {
const window = new BrowserWindow({ width: 720, height: 460, show: false, webPreferences: {
  preload: resolve('desktop/dist/preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false
} });
const renderer = pathToFileURL(resolve('desktop/test-electron/notification-harness.html')).href;
// Real IPC/preload/CloudClient, strictly fixture HTTP. No real account or production traffic.
const fixtureSession = { fetch: async (url: string) => {
  if (new URL(url).pathname !== '/api/auth/me') throw new Error('FIXTURE_NETWORK_BLOCKED');
  return new Response(JSON.stringify({ success: true, data: { id: '2', username: 'notification-fixture', userType: 'NORMAL' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}, clearStorageData: async () => {} } as unknown as Electron.Session;
const client = registerCloudBridge(window, fixtureSession, renderer);
await window.loadURL(renderer);
const results: Record<string, unknown> = { fixture: true, realProductionAccounts: false, nativeClickManuallyVerified: false };
async function run(body: string) { return window.webContents.executeJavaScript(`(async()=>{${body}})()`); }
try {
  await run(`await window.studyRoomDesktop.cloud.request({method:'GET',path:'/auth/me'});`);
  results.ownerEstablished = client.authenticatedOwner === '2';
  await run(`window.testToken=await window.studyRoomDesktop.notifications.configure({owner:'2',scope:'1:2',suppressed:false});`);
  window.show(); window.focus();
  await new Promise(resolve => setTimeout(resolve, 100));
  results.actualWindowFocused = window.isFocused();
  results.actualWindowVisible = window.isVisible();
  results.actualWindowWasMinimized = window.isMinimized();
  results.foreground = await run(`return window.studyRoomDesktop.notifications.show({token:window.testToken,peer:'3',key:'1',summary:false});`);
  results.arbitraryUrlRejected = await run(`try{await window.studyRoomDesktop.notifications.show({token:window.testToken,peer:'3',key:'2',summary:false,url:'file:///invalid'});return false}catch{return true}`);
  window.minimize();
  await new Promise(resolve => setTimeout(resolve, 1700));
  results.actualWindowMinimized = window.isMinimized();
  results.nativeDelivery = await run(`return window.studyRoomDesktop.notifications.show({token:window.testToken,peer:'3',key:'3',summary:false});`);
  await run(`await window.studyRoomDesktop.notifications.configure({owner:'2',scope:'1:2',suppressed:true});`);
  results.suppressed = await run(`return window.studyRoomDesktop.notifications.show({token:window.testToken,peer:'3',key:'4',summary:false});`);
  client.dispose();
  results.revokedTokenRejected = await run(`try{await window.studyRoomDesktop.notifications.show({token:window.testToken,peer:'3',key:'5',summary:false});return false}catch{return true}`);
  results.passed = results.ownerEstablished && results.foreground === 'foreground' && results.arbitraryUrlRejected
    && results.nativeDelivery === 'shown' && results.suppressed === 'suppressed' && results.revokedTokenRejected;
} catch (error) { results.error = error instanceof Error ? error.message : 'HARNESS_FAILED'; }
finally {
  await writeFile(resolve(output, 'electron-results.json'), JSON.stringify(results, null, 2));
  client.dispose(); await session.defaultSession.clearStorageData(); window.destroy();
  app.exit(results.passed ? 0 : 1);
}
}).catch(async error => {
  await writeFile(resolve(output, 'electron-results.json'), JSON.stringify({ error: String(error), passed: false }));
  app.exit(1);
});
