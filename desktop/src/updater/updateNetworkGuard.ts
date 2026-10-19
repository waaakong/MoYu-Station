import type { Session } from 'electron';
import type { ReleaseManifest } from './updateSecurity';
import { allowedUpdateUrl, updateHeaders } from './updateTransport';

/** Attach only to electron-updater's isolated session, never to the authenticated cloud session. */
export function installUpdateNetworkGuard(
  webRequest: Session['webRequest'], manifest: ReleaseManifest, feedUrl: string, grant: () => string
): () => void {
  webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({ cancel: !allowedUpdateUrl(details.url, manifest, feedUrl) });
  });
  webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    for (const key of Object.keys(headers)) if (/^(cookie|authorization|proxy-authorization|x-user-staging-id)$/i.test(key)) delete headers[key];
    if (allowedUpdateUrl(details.url, manifest, feedUrl)) Object.assign(headers, updateHeaders(manifest, feedUrl, grant()));
    callback({ requestHeaders: headers });
  });
  return () => {
    webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (_details, callback) => callback({ cancel: true }));
    webRequest.onBeforeSendHeaders(null);
  };
}
