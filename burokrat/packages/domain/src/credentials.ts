/** What a credential's secret is, which decides how tools take it. */
export const CREDENTIAL_TYPES = ["password", "hash", "ticket", "key", "other"] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_LABELS: Record<CredentialType, string> = {
  password: "Password",
  hash: "NT hash",
  ticket: "Ticket",
  key: "Key",
  other: "Other",
};

type Login = { username: string; domain: string; secret: string; type: CredentialType };

/** The account as Windows tools write it, `CORP\alice`, or the bare name. */
export const accountOf = ({ username, domain }: Login) =>
  domain ? `${domain}\\${username}` : username;

const quoted = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/** Arguments netexec takes for the login: `-u`, `-p` or `-H`, and `-d`. */
export function nxcArguments(login: Login) {
  const secret =
    login.type === "hash" ? ["-H", quoted(login.secret)] : ["-p", quoted(login.secret)];
  const domain = login.domain ? ["-d", quoted(login.domain)] : [];
  return ["-u", quoted(login.username), ...secret, ...domain].join(" ");
}
