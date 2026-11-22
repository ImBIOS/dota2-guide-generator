# dota2-guide-generator

Data-driven Dota 2 hero guides in Xarthe's format. Public repo, no Steam credentials.

## How it works

```
Stratz GraphQL (STRATZ_API_TOKEN) ──┐
                                    ├──► normalize ──► Xarthe template ──► guides/*.md + builds/*.json
Dota2ProTracker HTML fallback ──────┘
```

- `src/index.ts` — CLI entry. Today: Bounty Hunter pos-4 only (v1 scope).
- `src/stratz/` — GraphQL client + queries (Bearer token from `STRATZ_API_TOKEN`).
- `src/d2pt/` — no-token fallback scraper (pro builds, same source used for the BH 7.42 guide).
- `src/template/` — Xarthe renderer: Markdown guide + `saveGuide`-shaped build JSON
  (matches Valve's `POST dota2.com/workshop/builds/save` payload).
- `src/patch/` — patch watcher (`dota2.com/patches` version string).
- `publisher/` — NOT in CI. Local-only scripts that take a logged-in Steam session
  and POST save/publish. Never put Steam creds in GitHub Actions.

## Setup

```bash
bun install
export STRATZ_API_TOKEN=your-default-token   # free at https://stratz.com/api
bun run generate:bh
```

Without a token the generator uses the D2PT fallback and marks numbers as estimates.

## Daily run

`.github/workflows/daily.yml` — cron, generates guides, commits `guides/` + `builds/`
artifacts. No Steam login, no secrets except `STRATZ_API_TOKEN`.

## Config

`config.json` — heroes, roles, brackets, thresholds. v1: BH pos-4, Divine–Immortal.
