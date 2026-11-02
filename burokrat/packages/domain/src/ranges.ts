type Range = { first: number; last: number };

const OCTETS = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4(text: string) {
  const octets = OCTETS.exec(text)?.slice(1).map(Number);
  if (!octets || octets.some((octet) => octet > 255)) return undefined;
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function rangeOf(entry: string): Range | undefined {
  const [address = "", bits] = entry.split("/");
  const start = ipv4(address);
  if (start === undefined) return undefined;
  if (bits === undefined) return { first: start, last: start };
  const prefix = Number(bits);
  if (!/^\d{1,2}$/.test(bits) || prefix > 32) return undefined;
  const size = 2 ** (32 - prefix);
  const first = start - (start % size);
  return { first, last: first + size - 1 };
}

/**
 * Addresses and CIDR ranges, one or more per line, such as the excluded hosts of the rules of
 * engagement. Text after a `#` and anything that is not an address or range is ignored.
 */
export function parseRanges(text: string): Range[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/#.*/, "").split(/[\s,;]+/))
    .flatMap((entry) => rangeOf(entry) ?? []);
}

export function inRanges(ip: string, ranges: Range[]) {
  const value = ipv4(ip);
  return value !== undefined && ranges.some(({ first, last }) => value >= first && value <= last);
}
