/*!
 * NetEase web protocol reference: NeteaseCloudMusicApi 4.32.0 util/crypto.js.
 * Adapted to Node crypto for StudyRoom; no dependency on the reference HTTP server.
 * The MIT License (MIT)
 * Copyright (c) 2013-2022 Binaryify
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import { constants, createCipheriv, createHash, publicEncrypt, randomInt } from "node:crypto";

const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;
const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/** API envelope encoding, not media decryption. Reference: MIT util/crypto.js eapi. */
export function encodeEapi(path: string, data: Record<string, unknown>): URLSearchParams {
  const text = JSON.stringify(data);
  const digest = createHash('md5').update(`nobody${path}use${text}md5forencrypt`).digest('hex');
  const cipher = createCipheriv('aes-128-ecb', Buffer.from('e82ckenh8dichen8'), null);
  return new URLSearchParams({ params: Buffer.concat([
    cipher.update(`${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`, 'utf8'), cipher.final()
  ]).toString('hex').toUpperCase() });
}
function encrypt(text: string, key: string): string {
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(key), Buffer.from("0102030405060708"));
  return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString("base64");
}
export function encodeWeapi(data: Record<string, unknown>, secret = Array.from({length:16},()=>alphabet[randomInt(alphabet.length)]).join("")): URLSearchParams {
  if (!/^[a-zA-Z0-9]{16}$/.test(secret)) throw new Error("INVALID_PROTOCOL_KEY");
  const padded = Buffer.alloc(128);
  Buffer.from([...secret].reverse().join("")).copy(padded,112);
  return new URLSearchParams({
    params: encrypt(encrypt(JSON.stringify(data), "0CoJUm6Qyw8W8jud"), secret),
    encSecKey: publicEncrypt({key:publicKey,padding:constants.RSA_NO_PADDING},padded).toString("hex")
  });
}
