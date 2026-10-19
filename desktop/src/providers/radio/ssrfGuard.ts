import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface ResolvedAddress { address: string; family: number }
export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;

function privateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a = 0, b = 0] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

function privateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  return mapped?.[1] ? privateIpv4(mapped[1]) : false;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !privateIpv4(address);
  // Only globally routable unicast; also rejects hexadecimal IPv4-mapped loopback,
  // link-local, NAT64 and multicast forms rather than trusting dotted notation alone.
  if (family === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:0?db8:/i.test(address) && !privateIpv6(address);
  return false;
}

export async function assertSafeRadioUrl(
  input: URL,
  allowedHosts: readonly string[],
  resolver: AddressResolver = async (hostname) => await lookup(hostname, { all: true })
): Promise<void> {
  if (input.protocol !== "https:" || input.username || input.password || (input.port && input.port !== "443")) {
    throw new Error("RADIO_STREAM_REJECTED");
  }
  const hostname = input.hostname.toLowerCase();
  if (!allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) throw new Error("RADIO_STREAM_REJECTED");
  const addresses = await resolver(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("RADIO_STREAM_REJECTED");
}
