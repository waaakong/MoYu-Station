import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createReleaseEnvelope} from './create-update-release.mjs';
import {verifyGithubDraft,verifyReleaseDirectory} from './verify-update-release.mjs';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(),'moyu-verified-release-'));
  const keys = generateKeyPairSync('ed25519'), bytes = Buffer.from('synthetic installer only');
  const keyPath = join(directory,'key.pem');
  await writeFile(keyPath,keys.privateKey.export({format:'pem',type:'pkcs8'}));
  await writeFile(join(directory,'MoYu.exe'),bytes);
  await writeFile(join(directory,'latest.yml'),JSON.stringify({version:'1.2.3',files:[{url:'MoYu.exe',size:bytes.length,sha512:createHash('sha512').update(bytes).digest('base64')}]}));
  const envelope = await createReleaseEnvelope({channel:'stable',version:'1.2.3',directory,privateKeyPath:keyPath,keyId:'fixture',githubRepository:'waaakong/StudyRoom'});
  await writeFile(join(directory,'release.json'),envelope.manifestJson);
  await writeFile(join(directory,'release.json.sig'),JSON.stringify({keyId:envelope.keyId,signature:envelope.signature}));
  const publicKeys = {fixture:keys.publicKey.export({format:'der',type:'spki'}).toString('base64')};
  return {directory,envelope,publicKeys};
}

test('verifies all local bytes and signatures, rejects tampering and unknown keys', async () => {
  const f = await fixture();
  try {
    const result = await verifyReleaseDirectory(f.directory,f.publicKeys);
    assert.equal(result.checksums.length,2);
    await assert.rejects(()=>verifyReleaseDirectory(f.directory,{}),/KEY_UNKNOWN/);
    await writeFile(join(f.directory,'MoYu.exe'),'tamper');
    await assert.rejects(()=>verifyReleaseDirectory(f.directory,f.publicKeys),/SIZE_INVALID|HASH_INVALID/);
  } finally { await rm(f.directory,{recursive:true,force:true}); }
});

test('draft verification binds all assets and strips the GitHub token on CDN redirects', async () => {
  const f = await fixture();
  try {
    const names = [...f.envelope.manifest.files.map(file=>file.name),'release.json','release.json.sig'];
    const bytes = await Promise.all(names.map(name=>readFile(join(f.directory,name))));
    const calls = [];
    const fetcher = async (url,init) => {
      calls.push({url,headers:init.headers});
      if (url.includes('/releases?')) return new Response(JSON.stringify([{draft:true,tag_name:'v1.2.3',assets:names.map((name,i)=>({name,id:i+1,size:bytes[i].length,state:'uploaded'}))}]));
      if (url.startsWith('https://api.github.com/')) return new Response(null,{status:302,headers:{location:`https://release-assets.githubusercontent.com/github-production-release-asset/123/${url.split('/').at(-1)}`}});
      return new Response(bytes[Number(url.split('/').at(-1))-1]);
    };
    await verifyGithubDraft(f.directory,f.envelope.manifest,'synthetic-ci-token',fetcher);
    assert.equal(calls.filter(c=>c.url.startsWith('https://release-assets.')).length,names.length);
    for (const call of calls.filter(c=>c.url.startsWith('https://release-assets.'))) assert.deepEqual(call.headers,{});
    assert.equal(calls.some(call => call.url.includes('/releases/tags/')), false);
    await assert.rejects(()=>verifyGithubDraft(f.directory,f.envelope.manifest,'fixture',async()=>new Response(JSON.stringify([{draft:false,tag_name:'v1.2.3',assets:[]}]))),/NOT_EXACT_DRAFT/);
    await assert.rejects(()=>verifyGithubDraft(f.directory,f.envelope.manifest,'fixture',async()=>new Response(JSON.stringify([{draft:true,tag_name:'v1.2.3',assets:[]},{draft:true,tag_name:'v1.2.3',assets:[]}]))),/NOT_EXACT_DRAFT/);
  } finally { await rm(f.directory,{recursive:true,force:true}); }
});
