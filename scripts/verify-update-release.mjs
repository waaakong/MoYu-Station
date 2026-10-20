import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const safeName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
async function fileDigest(path, expected) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== expected.size) throw new Error('UPDATE_RELEASE_SIZE_INVALID');
  const sha512 = createHash('sha512'), sha256 = createHash('sha256');
  for await (const chunk of createReadStream(path)) { sha512.update(chunk); sha256.update(chunk); }
  if (sha512.digest('base64') !== expected.sha512) throw new Error('UPDATE_RELEASE_HASH_INVALID');
  return sha256.digest('hex');
}

export async function verifyReleaseDirectory(directory, publicKeys) {
  const root = resolve(directory);
  const raw = await readFile(resolve(root, 'release.json'));
  if (raw.length > 64 * 1024) throw new Error('UPDATE_RELEASE_MANIFEST_INVALID');
  const envelope = JSON.parse(await readFile(resolve(root, 'release.json.sig'), 'utf8'));
  const encodedKey = publicKeys[envelope.keyId];
  if (!encodedKey) throw new Error('UPDATE_RELEASE_KEY_UNKNOWN');
  const key = createPublicKey({key:Buffer.from(encodedKey, 'base64'), format:'der', type:'spki'});
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, raw, key, Buffer.from(envelope.signature, 'base64'))) throw new Error('UPDATE_RELEASE_SIGNATURE_INVALID');
  const manifest = JSON.parse(raw.toString('utf8'));
  const ids = {stable:'xyz.moyustation.studyroom',beta:'xyz.moyustation.studyroom.beta','provider-experimental':'xyz.moyustation.studyroom.provider-experimental'};
  if (![1,2].includes(manifest.schemaVersion) || !ids[manifest.channel] || manifest.appId !== ids[manifest.channel]
      || !safeName.test(manifest.version) || manifest.artifactKey !== `${manifest.channel}/${manifest.version}`
      || manifest.releaseId !== `${manifest.channel}-${manifest.version}` || manifest.platform !== 'win32' || manifest.arch !== 'x64'
      || !Array.isArray(manifest.files) || manifest.files.length < 2 || manifest.files.length > 8) throw new Error('UPDATE_RELEASE_MANIFEST_INVALID');
  if (manifest.schemaVersion === 2 && (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(manifest.github?.repository || '')
      || manifest.github.tag !== `v${manifest.version}`)) throw new Error('UPDATE_RELEASE_SOURCE_INVALID');
  const names = new Set(), checksums = [];
  for (const file of manifest.files) {
    if (!safeName.test(file.name) || names.has(file.name) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 1024**3
        || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)
        || !((file.role === 'feed' && file.name === 'latest.yml' && file.size <= 128*1024)
          || (file.role === 'installer' && file.name.endsWith('.exe')) || (file.role === 'blockmap' && file.name.endsWith('.blockmap')))) throw new Error('UPDATE_RELEASE_FILE_INVALID');
    names.add(file.name);
    checksums.push({name:file.name,sha256:await fileDigest(resolve(root,file.name),file)});
  }
  if (manifest.files.filter(f=>f.role === 'feed').length !== 1 || manifest.files.filter(f=>f.role === 'installer').length !== 1) throw new Error('UPDATE_RELEASE_FILES_INVALID');
  const installer = manifest.files.find(f=>f.role === 'installer');
  const feed = yaml.load(await readFile(resolve(root,'latest.yml'),'utf8'));
  if (!feed || feed.version !== manifest.version || feed.packages || !Array.isArray(feed.files) || feed.files.length !== 1
      || feed.files[0].url !== installer.name || feed.files[0].size !== installer.size || feed.files[0].sha512 !== installer.sha512
      || (feed.path !== undefined && feed.path !== installer.name) || (feed.sha512 !== undefined && feed.sha512 !== installer.sha512)) throw new Error('UPDATE_RELEASE_FEED_MISMATCH');
  return {manifest,checksums};
}

/** CI only: token is used solely on api.github.com and is stripped on asset redirects. */
export async function verifyGithubDraft(directory, manifest, token, fetcher = fetch) {
  if (manifest.schemaVersion !== 2 || !token) throw new Error('UPDATE_RELEASE_GITHUB_CONFIG_REQUIRED');
  const headers = {Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  // Drafts are not reliably returned by the tag endpoint. Enumerate authenticated
  // releases and reject ambiguous tags, including any already-published release.
  const matches = [];
  for (let page = 1; ; page++) {
    if (page > 100) throw new Error('UPDATE_RELEASE_LIST_LIMIT');
    const api = `https://api.github.com/repos/${manifest.github.repository}/releases?per_page=100&page=${page}`;
    const response = await fetcher(api,{headers,redirect:'error',signal:AbortSignal.timeout(30_000)});
    if (!response.ok) throw new Error(`UPDATE_RELEASE_API_HTTP_${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length > 100) throw new Error('UPDATE_RELEASE_LIST_INVALID');
    matches.push(...rows.filter(row => row?.tag_name === manifest.github.tag));
    if (rows.length < 100) break;
  }
  if (matches.length !== 1) throw new Error('UPDATE_RELEASE_NOT_EXACT_DRAFT');
  const release = matches[0];
  if (!release.draft || release.tag_name !== manifest.github.tag || !Array.isArray(release.assets)) throw new Error('UPDATE_RELEASE_NOT_EXACT_DRAFT');
  const expected = [...manifest.files];
  for (const name of ['release.json','release.json.sig']) {
    const bytes = await readFile(resolve(directory,name));
    expected.push({name,size:bytes.length,sha512:createHash('sha512').update(bytes).digest('base64')});
  }
  if (release.assets.length !== expected.length) throw new Error('UPDATE_RELEASE_REMOTE_FILES_INVALID');
  for (const file of expected) {
    const assets = release.assets.filter(asset=>asset.name === file.name);
    if (assets.length !== 1 || assets[0].size !== file.size || assets[0].state !== 'uploaded' || !Number.isSafeInteger(assets[0].id)) throw new Error('UPDATE_RELEASE_REMOTE_FILES_INVALID');
    let url = `https://api.github.com/repos/${manifest.github.repository}/releases/assets/${assets[0].id}`;
    let assetResponse;
    for (let hop = 0; hop <= 4; hop++) {
      const parsed = new URL(url);
      const initial = hop === 0;
      if (!initial && (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hostname !== 'release-assets.githubusercontent.com'
          || !parsed.pathname.startsWith('/github-production-release-asset/'))) throw new Error('UPDATE_RELEASE_REDIRECT_BLOCKED');
      assetResponse = await fetcher(url,{headers:initial ? {...headers,Accept:'application/octet-stream'} : {},redirect:'manual',signal:AbortSignal.timeout(15*60_000)});
      if (![301,302,303,307,308].includes(assetResponse.status)) break;
      const location = assetResponse.headers.get('location'); await assetResponse.body?.cancel();
      if (!location || hop === 4) throw new Error('UPDATE_RELEASE_REDIRECT_BLOCKED');
      url = new URL(location,url).href;
    }
    if (!assetResponse?.ok || !assetResponse.body) throw new Error('UPDATE_RELEASE_ASSET_HTTP_FAILED');
    const hash = createHash('sha512'); let size = 0;
    const reader = assetResponse.body.getReader();
    try {
      for (;;) {
        const {value,done} = await reader.read(); if (done) break;
        size += value.byteLength; if (size > file.size) throw new Error('UPDATE_RELEASE_REMOTE_HASH_INVALID');
        hash.update(value);
      }
      if (size !== file.size || hash.digest('base64') !== file.sha512) throw new Error('UPDATE_RELEASE_REMOTE_HASH_INVALID');
    } finally { await reader.cancel().catch(()=>{}); }
  }
}

async function main() {
  const args = Object.fromEntries(Array.from({length:Math.floor((process.argv.length-2)/2)},(_,i)=>[process.argv[2+i*2].replace(/^--/,''),process.argv[3+i*2]]));
  if (!args.directory || !args['public-keys-json']) throw new Error('Usage: --directory --public-keys-json [--verify-github-draft true]');
  const result = await verifyReleaseDirectory(args.directory,JSON.parse(args['public-keys-json']));
  if (args['verify-github-draft'] === 'true') await verifyGithubDraft(args.directory,result.manifest,process.env.GH_TOKEN);
  process.stdout.write(JSON.stringify({releaseId:result.manifest.releaseId,githubDraftVerified:args['verify-github-draft'] === 'true',checksums:result.checksums})+'\n');
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
