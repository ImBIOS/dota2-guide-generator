# publisher/ — LOCAL ONLY. Never run in GitHub Actions.

Takes the committed `builds/*.build.json` artifacts and POSTs them to
`https://www.dota2.com/workshop/builds/save`, then publishes to the Steam
Community — both under YOUR logged-in Steam session.

Why local: the save endpoint needs your Steam OAuth session on dota2.com and
publish needs your Community session. Cloud CI logins trigger Steam Guard,
sessions rot, and a leaked session cookie = your account.

## Flow (manual, for now)

1. Log into https://www.dota2.com/workshop/builds in your browser.
2. Export cookies for `dota2.com` + `steamcommunity.com` (devtools → Application → Cookies).
3. `bun run publisher/publish.ts --build builds/bounty-hunter-pos4-7.42.build.json --visibility public --cookies ./cookies.json`
4. Verify in the Hero Build page → "Publish to Steam Community".

## What publish.ts will do (scaffold — endpoint TBD by you)

- Read the build JSON (same shape as guidebuilder.js `saveGuide()` posts).
- POST `{ post: <build> }` to `/workshop/builds/save` with your cookies.
- Follow the same "Publish to Steam Community" request the logged-in
  editor makes (capture it once in devtools Network tab, then encode it here).
- Never print or store cookies; read from a local file ignored by git.

No code here phones home. No secrets in the repo.
