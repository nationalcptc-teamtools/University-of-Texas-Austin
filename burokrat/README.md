# Burokrat

A collaborative editor for penetration-test findings that produces a client-ready PDF report with
Typst.

## Requirements

- Node.js 22.18+ and [Vite+](https://viteplus.dev) (`vp`). pnpm is fetched automatically.

## Install

```bash
git clone https://github.com/UT-CTF/burokrat.git
cd burokrat
vp install
cp apps/web/.env.example apps/web/.env   # then set BUROKRAT_PASSCODE and SESSION_SECRET
```

`SESSION_SECRET` must be at least 32 characters, for example `openssl rand -hex 32`.

## Run

```bash
pnpm dev
```

This starts the app on `http://localhost:3000`. Sign in with any display name and the team passcode.

Production:

```bash
pnpm build
pnpm --filter web start
```

The database and uploads live in `apps/web/data/` (or `DATA_DIR`). Back that directory up. A
single project can also be moved between servers with **Export** on its page and **Import** on the
project list; the zip holds its current content and images, without edit history.

Docker:

```bash
docker build -t burokrat .
docker run -p 3000:3000 -v burokrat-data:/data -e BUROKRAT_PASSCODE=... -e SESSION_SECRET=... burokrat
```

The image includes the report fonts and their licences (`packages/typst/fonts`).

Behind a reverse proxy, set `TRUST_PROXY` to the number of proxies in front of the app (for
example `1` for a single nginx), so failed sign-ins are limited per client rather than for everyone
at once. Leave it unset when clients connect directly: they could otherwise forge their address.

## Development

```bash
vp check                              # format, lint, type check
pnpm test                             # unit tests in every package
pnpm --filter web test:browser        # components in Chrome: linked editors, the live preview
pnpm --filter web test:e2e            # two simulated collaborators in Chrome, against a production build
pnpm --filter web db:generate         # new migration after editing apps/web/src/server/schema.ts
pnpm --filter @burokrat/domain sync-mitre  # refresh the MITRE ATT&CK techniques from mitre/cti
```

Migrations run automatically when the server starts.
