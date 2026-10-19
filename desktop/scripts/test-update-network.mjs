// Loopback-only transport acceptance. Never launches an installer or changes OS trust.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const workspace = resolve(import.meta.dirname, '../..');
const root = await mkdtemp(join(tmpdir(), 'moyu-update-network-'));
const openssl = process.env.STUDYROOM_TEST_OPENSSL || 'C:/Program Files/Git/usr/bin/openssl.exe';
execFileSync(openssl, ['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
  '-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1',
  '-keyout',join(root,'loopback.key'),'-out',join(root,'loopback.crt')], {stdio:'ignore',windowsHide:true});
await writeFile(join(root,'README.txt'), 'Isolated update network acceptance. Synthetic account and release only. Private loopback TLS key is test-only. No installer, OS trust changes, or production access.\n');
await build({entryPoints:[join(workspace,'desktop/test-electron/updateNetworkHarness.ts')],outfile:join(root,'harness.cjs'),
  bundle:true,platform:'node',target:'node24',format:'cjs',external:['electron','node:*'],logLevel:'silent'});
const env={...process.env,STUDYROOM_UPDATE_LAB_ROOT:root};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(join(workspace,'node_modules/electron/dist/electron.exe'),[join(root,'harness.cjs'),`--user-data-dir=${join(root,'user-data')}`],
  {cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='',errors='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{errors+=b;});
const timer=setTimeout(()=>child.kill(),60000);
const code=await new Promise((done,reject)=>{child.once('exit',done);child.once('error',reject);});clearTimeout(timer);
await writeFile(join(root,'process.log'),output+'\n'+errors);
console.log(JSON.stringify({evidence:root,exitCode:code}));
console.log(output.trim());if(code!==0)process.exitCode=1;
