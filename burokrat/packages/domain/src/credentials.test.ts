import { expect, it } from "vite-plus/test";
import { accountOf, nxcArguments } from "./credentials.ts";
import { inRanges, parseRanges } from "./ranges.ts";

it("writes a login as netexec takes it, quoting what the shell would read", () => {
  const login = {
    username: "svc_sql",
    domain: "CORP",
    secret: "Pa$$'w0rd",
    type: "password" as const,
  };
  expect(accountOf(login)).toBe("CORP\\svc_sql");
  expect(nxcArguments(login)).toBe(`-u 'svc_sql' -p 'Pa$$'\\''w0rd' -d 'CORP'`);
  expect(nxcArguments({ ...login, domain: "", type: "hash", secret: "aad3b435" })).toBe(
    "-u 'svc_sql' -H 'aad3b435'",
  );
});

it("reads excluded addresses and ranges, ignoring comments and anything else", () => {
  const ranges = parseRanges("10.0.0.5  # the PLC\n10.0.1.0/24, 10.0.2.7/33\nprinter.corp");
  expect(["10.0.0.5", "10.0.1.0", "10.0.1.255"].every((ip) => inRanges(ip, ranges))).toBe(true);
  expect(["10.0.0.6", "10.0.2.7", "10.0.2.0", "web"].some((ip) => inRanges(ip, ranges))).toBe(
    false,
  );
});
