import { describe, expect, it } from 'vitest';
import { publicDownloadUrl } from '../src/utils/publicDownload';

describe('pinned public installer', () => {
  const version = '0.2.0-trial.20261019.1';
  const filename = `MoYu-Setup-${version}-win-x64.exe`;
  const url = `https://github.com/waaakong/MoYu-Station/releases/download/v${version}/${filename}`;
  const release = { version, filename, publicDownloadUrl: url };
  it('accepts only a published metadata binding, not an inferred release', () => {
    expect(publicDownloadUrl(release)).toBe(url);
    expect(publicDownloadUrl({ version, filename })).toBeNull();
  });
  it.each([null, {}, { ...release, version: '../latest' }, { ...release, filename: 'other.exe' },
    ...['http:', 'https://evil.invalid/', url + '?token=private', url.replace('MoYu-Station', 'StudyRoom'), url.replace('/v0.', '/v1.')]
      .map(publicDownloadUrl => ({ ...release, publicDownloadUrl }))
  ])('rejects unpinned metadata %j', item => expect(publicDownloadUrl(item)).toBeNull());
});
