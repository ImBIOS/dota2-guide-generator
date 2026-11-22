// scaffold — see publisher/README.md. Not wired to CI.
const rawP = process.argv.slice(2);
const argsP: Record<string, string> = {};
for (let i = 0; i < rawP.length; i++) {
  const m = rawP[i].match(/^--([^=]+)(?:=(.*))?$/);
  if (!m) continue;
  if (m[2] !== undefined) argsP[m[1]] = m[2];
  else if (i + 1 < rawP.length && !rawP[i + 1].startsWith("--")) argsP[m[1]] = rawP[++i];
  else argsP[m[1]] = "true";
}
const args = argsP;

if (!args.build || !args.cookies) {
  console.error("usage: bun run publisher/publish.ts --build <build.json> --cookies <cookies.json> [--visibility public|friends|private]");
  process.exit(1);
}

const build = await Bun.file(args.build).json();
const cookies: { name: string; value: string }[] = await Bun.file(args.cookies).json();
const jar = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

console.log(`loaded build: ${(build as any).title}`);
console.log(`loaded ${cookies.length} cookies (not printed)`);

const saveRes = await fetch("https://www.dota2.com/workshop/builds/save", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar },
  body: new URLSearchParams({ post: JSON.stringify(build) }),
});
console.log(`save → HTTP ${saveRes.status}`);
console.log((await saveRes.text()).slice(0, 500));
console.log("publish step: capture the logged-in 'Publish to Steam Community' request in devtools and encode it here.");
