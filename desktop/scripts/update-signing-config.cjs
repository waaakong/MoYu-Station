const { createPublicKey } = require('node:crypto');
const enabled = value => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

function httpsUrl(value, code) {
  let url;
  try { url = new URL(value); } catch { throw new Error(code); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(code);
  return url;
}

function updateSigningConfig(env = process.env) {
  if (enabled(env.STUDYROOM_UPDATE_TEST_SIGNED)) throw new Error('UPDATE_LEGACY_TEST_SIGNED_FLAG_REJECTED');
  const controlEnabled = enabled(env.STUDYROOM_UPDATE_CONTROL_ENABLED);
  const mode = env.STUDYROOM_SIGNING_MODE || 'disabled';
  if (!['disabled', 'trusted', 'manifest-signed'].includes(mode)) throw new Error('UPDATE_SIGNING_MODE_INVALID');
  if (mode === 'manifest-signed' && !controlEnabled) throw new Error('UPDATE_MANIFEST_MODE_REQUIRES_CONTROL');
  if (mode === 'manifest-signed' && (env.CSC_LINK || env.WIN_CSC_LINK)) throw new Error('UPDATE_MANIFEST_MODE_SIGNER_CONFLICT');
  let apiBaseUrl = env.STUDYROOM_UPDATE_API_BASE_URL || 'https://moyustation.xyz/api';
  let updateOrigin = env.STUDYROOM_UPDATE_ORIGIN || 'https://moyustation.xyz';
  const publicKeysJson = env.STUDYROOM_UPDATE_PUBLIC_KEYS_JSON || '';
  if (controlEnabled) {
    const origin = httpsUrl(updateOrigin, 'UPDATE_ORIGIN_INVALID');
    const api = httpsUrl(apiBaseUrl, 'UPDATE_API_ORIGIN_INVALID');
    const cloud = httpsUrl(env.STUDYROOM_CLOUD_ORIGIN || 'https://moyustation.xyz', 'UPDATE_CLOUD_ORIGIN_INVALID');
    if (origin.pathname !== '/' || api.origin !== origin.origin || cloud.origin !== origin.origin || !/^\/api\/?$/.test(api.pathname)) throw new Error('UPDATE_ORIGIN_MISMATCH');
    updateOrigin = origin.origin;
    apiBaseUrl = api.origin + '/api';
    let keys;
    try {
      keys = JSON.parse(publicKeysJson);
      if (!keys || Array.isArray(keys) || typeof keys !== 'object' || Object.keys(keys).length < 1 || Object.keys(keys).length > 4) throw new Error();
      for (const [id, encoded] of Object.entries(keys)) {
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(id) || typeof encoded !== 'string') throw new Error();
        const key = createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' });
        if (key.asymmetricKeyType !== 'ed25519') throw new Error();
      }
    } catch { throw new Error('UPDATE_PUBLIC_KEYS_INVALID'); }
  }
  let signing;
  if (mode === 'trusted') {
    const publisher = String(env.STUDYROOM_SIGNING_PUBLISHER || '').trim();
    const thumbprint = String(env.STUDYROOM_SIGNING_CERT_SHA1 || '').toUpperCase();
    if (!publisher || publisher.length > 200 || /[\r\n\0]/.test(publisher)) throw new Error('UPDATE_SIGNING_PUBLISHER_REQUIRED');
    if (!/^[A-F0-9]{40}$/.test(thumbprint)) throw new Error('UPDATE_SIGNING_CERT_SHA1_REQUIRED');
    const timestamp = httpsUrl(env.STUDYROOM_SIGNING_TIMESTAMP_URL, 'UPDATE_SIGNING_TIMESTAMP_REQUIRED');
    signing = { publisher, thumbprint, timestampUrl: timestamp.href, certificateStore: !(env.CSC_LINK || env.WIN_CSC_LINK) };
  }
  return { mode, controlEnabled, installEnabled: controlEnabled && (!!signing || mode === 'manifest-signed'), apiBaseUrl, updateOrigin, publicKeysJson, signing };
}
module.exports = { updateSigningConfig };
