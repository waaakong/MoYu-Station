// A metadata field cannot redirect users to an arbitrary download host or tag.
export function publicDownloadUrl(release: unknown): string | null {
  if (!release || typeof release !== 'object') return null;
  const item = release as Record<string, unknown>;
  if (typeof item.version !== 'string' || !/^[0-9][0-9A-Za-z.-]{0,79}$/.test(item.version)) return null;
  const filename = `MoYu-Setup-${item.version}-win-x64.exe`;
  if (item.filename !== filename) return null;
  const expected = `https://github.com/waaakong/MoYu-Station/releases/download/v${item.version}/${filename}`;
  return item.publicDownloadUrl === expected ? expected : null;
}
