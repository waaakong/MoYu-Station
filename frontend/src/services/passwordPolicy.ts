export function newPasswordError(value: string): string {
  const characters = Array.from(value).length;
  if (!value.trim() || characters < 8 || characters > 64 || new TextEncoder().encode(value).length > 72)
    return '密码需要为 8–64 个字符，且 UTF-8 编码不能超过 72 字节。';
  return '';
}
