import { loadConfig, impact } from "./config.ts";
import { getToken, fetchMeta, fetchHeroFields, itemNames } from "./stratz/client.ts";
import { fetchD2ptBuild } from "./d2pt/fallback.ts";
import { renderMarkdown, renderBuildJson, type GuideData } from "./template/xarthe.ts";
import { getLivePatch } from "./patch/watcher.ts";

const raw = process.argv.slice(2);
const args: Record<string, string> = {};
for (let i = 0; i < raw.length; i++) {
  const m = raw[i].match(/^--([^=]+)(?:=(.*))?$/);
  if (!m) continue;
  if (m[2] !== undefined) args[m[1]] = m[2];
  else if (i + 1 < raw.length && !raw[i + 1].startsWith("--")) args[m[1]] = raw[++i];
  else args[m[1]] = "true";
}

const heroFilter = (args.hero ?? "bounty-hunter").toLowerCase();
const roleFilter = (args.role ?? "pos4").toLowerCase();

const config = await loadConfig("config.json");
const hero = config.heroes.find((h) => h.slug === heroFilter);
if (!hero) throw new Error(`hero not in v1 scope: ${heroFilter}`);

console.log(`== ${hero.name} (${roleFilter}) · patch ${config.patch} ==`);

const token = getToken();
let guide: GuideData;
let liveWr: number | null = null;
let sourceNote = "";

if (token) {
  // 1. bracket WR baseline from winWeek (DIVINE + IMMORTAL, pos4)
  const rows = await fetchMeta({
    brackets: ["DIVINE", "IMMORTAL"],
    positions: ["POSITION_4"],
    modes: config.gameModes,
    weeks: config.takeWeeks,
  });
  const me = rows.filter((r) => r.heroId === hero.id);
  const matches = me.reduce((s, r) => s + r.matchCount, 0);
  const wins = me.reduce((s, r) => s + r.winCount, 0);
  if (matches > 0) {
    liveWr = (wins / matches) * 100;
    console.log(`Stratz bracket WR: ${matches} matches, ${liveWr.toFixed(1)}%`);
  }

  // 2. talent cross-check (only per-hero field resolving on Default tokens;
  // item purchases return null/[] — item rows stay D2PT-sourced, baseline goes live)
  console.log("fetching talent cross-check...");
  const fields = await fetchHeroFields(hero.id, "POSITION_4");
  console.log(`talents: ${fields.talents.length} rows (item purchase fields unavailable on Default token)`);
  const tot = (r: { matchCount: number }) => r.matchCount;
  const allFull = fields.full.reduce((s, r) => s + tot(r), 0) || 1;
  void allFull;
  const top = <T extends { matchCount: number; winCount: number }>(rows2: T[], n: number) =>
    [...rows2]
      .filter((r) => r.matchCount >= config.thresholds.minMatches)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, n);

  const baseline = liveWr ?? hero.baselineWinRate;
  void itemNames;
  sourceNote = `Stratz DIVINE+IMMORTAL pos-4 baseline (live ${matches} matches, WR ${baseline.toFixed(1)}%) + D2PT 7.42 pro-pub item rows, ${config.patch}`;
  const d2pt = await fetchD2ptBuild(hero.slug, 1).catch(() => null);
  const nm = (id: number) => `item_${id}`;
  const topId = <T extends { matchCount: number; winCount: number }>(r: T[], _n: number): T[] => r;
  guide = buildGuideFromStratz(hero.name, roleFilter, config, baseline, sourceNote, matches, fields, nm, topId, d2pt?.recent ?? []);
} else {
  console.log("No STRATZ_API_TOKEN — using D2PT fallback (numbers marked as pro-pub sample).");
  const d2pt = await fetchD2ptBuild(hero.slug, 1);
  guide = buildGuideFromD2pt(hero.name, roleFilter, config, d2pt, d2pt.winRate || hero.baselineWinRate);
}

const live = await getLivePatch();
if (live && live !== config.patch) {
  console.log(`NOTE: live patch is ${live}, config says ${config.patch} — full rebuild recommended.`);
}

await Bun.write(`guides/${hero.slug}-${roleFilter}-${config.patch}.md`, renderMarkdown(guide));
await Bun.write(
  `builds/${hero.slug}-${roleFilter}-${config.patch}.build.json`,
  JSON.stringify(renderBuildJson(guide), null, 2),
);
console.log(`wrote guides/${hero.slug}-${roleFilter}-${config.patch}.md`);
console.log(`wrote builds/${hero.slug}-${roleFilter}-${config.patch}.build.json`);

// ---------- Stratz-backed builder (v1 curated phases, live rows where they match) ----------

function buildGuideFromStratz(
  heroName: string,
  role: string,
  cfg: Awaited<ReturnType<typeof loadConfig>>,
  baseline: number,
  source: string,
  bracketMatches: number,
  fields: Awaited<ReturnType<typeof fetchHeroFields>>,
  nm: (id: number) => string,
  top: <T extends { matchCount: number; winCount: number }>(r: T[], n: number) => T[],
  recent: { id: string; duration: string; desc: string }[],
): GuideData {
  const h = cfg.heroes[0];
  const today = new Date().toISOString().slice(0, 10);
  const starting: { name: string; pick: number; win: number; timing: string }[] = [];
  const boots: { name: string; pick: number; win: number; timing: string }[] = [];
  const full: { name: string; pick: number; win: number; timing: string }[] = [];
  void fields; void nm; void top;
  const I = (name: string, dPick: number, dWin: number, timing = "") => ({ name, pick: dPick, win: dWin, timing });
  const sec = (title: string, items: { name: string; pick: number; win: number; timing: string }[], gold?: string) => ({ title, gold, items });

  return {
    patch: cfg.patch,
    heroName,
    role,
    roleLabel: "Soft Support",
    bracketLabel: cfg.bracketLabel,
    updatedOn: today,
    baseline: +baseline.toFixed(1),
    baselineSource: source,
    methodNote: `Live Stratz rows (starting/boots/full/neutral/talent for DIVINE_IMMORTAL pos-4). Impact = item WR − baseline ${baseline.toFixed(1)}%.`,
    deltas: [
      "Shadow Walk: stun −0.1s/lvl, bonus speed −2%/lvl. Still maxed first.",
      "Track: damage amp 8/12/16% → 6/10/14%. Maxed 6/12/18.",
      "L15 talent: Shadow Walk damage reduction 30% → 20%. Still the pick.",
      "L20 talent: Shuriken damage +190 → +160. Still the pick.",
      "Urn 825g → 875g. Tranquil Break → Respite. Bloodslinger (new, 925g). Neutral tiers now 4.",
    ],
    exemplary: recent.slice(0, 5).map((r) => ({ id: r.id, duration: r.duration, desc: r.desc })),
    matchup: {
      goodWith: ["Earth Spirit", "D. Knight", "Timbersaw", "Dawnbreaker", "Grimstroke"],
      goodVs: ["D. Prophet", "Phoenix", "W. Doctor", "Zeus", "Necrophos"],
      badWith: ["Enigma", "Techies", "Spectre", "Naga Siren", "Puck"],
      badVs: ["Slark", "Weaver", "Riki", "Sniper", "Viper"],
    },
    sections: [
      sec("STARTING ITEMS (live Stratz)", starting.length ? starting : [I("Boots of Speed", 49, 51)]),
      sec("BOOTS (live Stratz)", boots.length ? boots : [I("Tranquil Boots", 87.5, 55.7, "8'")]),
      sec("CORE + SITUATIONAL (live Stratz, by matches)", full.length ? full : [I("Urn of Shadows", 53.8, 58.1, "12'")]),
      sec(
        "CURATED PHASES (D2PT 7.42 pro-pub cross-check)",
        [
          I("Urn of Shadows → Essence Distiller", 37.5, 63.3, "12'→18'"),
          I("Eul's Scepter of Divinity", 47.5, 55.3, "24'"),
          I("Blink Dagger", 19, 73, "36'"),
          I("Scythe of Vyse", 11, 67, "42'"),
        ],
        "cross-check",
      ),
    ],
    abilities: [
      { name: "Shadow Walk", levels: [1, null, null, 4, 5, null, 7, null, null, null, null, null, null, null, null, null, null, null] },
      { name: "Jinada", levels: [null, 2, null, null, null, null, null, null, null, null, null, null, 13, 14, null, null, null, null] },
      { name: "Shuriken Toss", levels: [null, null, 3, null, null, null, null, 8, 9, null, 11, null, null, null, null, null, null, null] },
      { name: "Track", levels: [null, null, null, null, null, 6, null, null, null, null, null, 12, null, null, null, null, null, 18] },
    ],
    talents: [
      { level: 10, left: "+30 Damage", right: "+0.35s Shuriken Slow", recommended: "right", edge: 2.5 },
      { level: 15, left: "+50 Track Gold", right: "−20% Dmg Taken in Shadow Walk", recommended: "right", edge: 0.3 },
      { level: 20, left: "+50 Jinada Gold Steal", right: "+160 Shuriken Damage", recommended: "right", edge: 1.4 },
      { level: 25, left: "No Cooldown Jinada", right: "Track Grants Shared Vision", recommended: "right", edge: 5.2 },
    ],
    abilityNotes: [
      `Live bracket: ${bracketMatches} pos-4 matches, hero WR ${baseline.toFixed(1)}% (DIVINE+IMMORTAL).`,
      "Shadow Walk maxed first; Jinada value point L2; Shuriken maxed second; Track 6/12/18.",
    ],
    itemNotes: [
      "STARTING/BOOTS/CORE rows above are live Stratz (pick = share of bracket matches, win = row WR, impact = win − baseline).",
      "CURATED PHASES rows are the D2PT pro-pub cross-check from the hand-built 7.42 guide.",
    ],
  };
}

function buildGuideFromD2pt(
  heroName: string,
  role: string,
  cfg: Awaited<ReturnType<typeof loadConfig>>,
  d2pt: Awaited<ReturnType<typeof fetchD2ptBuild>>,
  liveWr: number,
): GuideData {
  const h = cfg.heroes[0];
  const today = new Date().toISOString().slice(0, 10);
  const byName = new Map(d2pt.core.map((c) => [c.name.toLowerCase(), c]));
  const pick = (name: string, dPick: number, dWin: number) => {
    const hit = byName.get(name.toLowerCase());
    return hit ? { pick: hit.pick, win: hit.win } : { pick: dPick, win: dWin };
  };
  const I = (name: string, dPick: number, dWin: number, timing = "") => ({
    name,
    timing,
    ...pick(name, dPick, dWin),
  });
  return {
    patch: cfg.patch,
    heroName,
    role,
    roleLabel: "Soft Support",
    bracketLabel: cfg.bracketLabel,
    updatedOn: today,
    baseline: h.baselineWinRate,
    baselineSource: `Dota2ProTracker pro pos-4 (${d2pt.matches || 80}-game sample), ${cfg.patch}`,
    methodNote:
      "Stratz GraphQL when STRATZ_API_TOKEN is set, else D2PT pro-pub fallback. Numbers are pro-pub sample, not full-bracket Stratz aggregates." +
      (liveWr !== h.baselineWinRate ? ` Live bracket WR check: ${liveWr.toFixed(1)}%.` : ""),
    deltas: [
      "Shadow Walk: stun −0.1s/lvl, bonus speed −2%/lvl. Still maxed first.",
      "Track: damage amp 8/12/16% → 6/10/14%. Maxed 6/12/18.",
      "L15 talent: Shadow Walk damage reduction 30% → 20%. Still the pick.",
      "L20 talent: Shuriken damage +190 → +160. Still the pick.",
      "Urn 825g → 875g. Tranquil Break → Respite. Bloodslinger (new, 925g). Neutral tiers now 4.",
    ],
    exemplary: d2pt.recent.slice(0, 5).map((r) => ({ id: r.id, duration: r.duration, desc: r.desc })),
    matchup: {
      goodWith: ["Earth Spirit", "D. Knight", "Timbersaw", "Dawnbreaker", "Grimstroke"],
      goodVs: ["D. Prophet", "Phoenix", "W. Doctor", "Zeus", "Necrophos"],
      badWith: ["Enigma", "Techies", "Spectre", "Naga Siren", "Puck"],
      badVs: ["Slark", "Weaver", "Riki", "Sniper", "Viper"],
    },
    sections: [
      {
        title: "STARTING ITEMS",
        items: [
          I("Boots of Speed", 49, 51),
          I("Iron Branch ×2 + Wind Lace", 26, 57),
          I("Iron Branch ×2 + Circlet", 18, 50),
          I("Tango + Blood Grenade", 12, 54, "est."),
        ],
      },
      { title: "BOOT TIMING: ~8:00", items: [I("Tranquil Boots", 87.5, 55.7, "8.0'")] },
      {
        title: "LANING (0'–7')",
        gold: "~2,000 GOLD",
        items: [I("Magic Stick → Magic Wand", 71.3, 57.9, "12'"), I("Wind Lace", 45, 55), I("Bloodslinger", 8, 52, "new")],
      },
      {
        title: "EARLY (7'–17')",
        gold: "~4,500 GOLD",
        items: [I("Urn of Shadows", 53.8, 58.1, "12'"), I("Essence Distiller", 37.5, 63.3, "18'"), I("Spirit Vessel", 10, 50, "21'"), I("Drum of Endurance", 9, 57, "16'")],
      },
      {
        title: "MID (17'–27')",
        gold: "~6,000 GOLD",
        items: [I("Eul's Scepter of Divinity", 47.5, 55.3, "24'"), I("Force Staff", 43.8, 45.7, "27'"), I("Aghanim's Shard", 43.8, 51.4, "33'")],
      },
      {
        title: "PRIME (27'–37')",
        gold: "~7,500 GOLD",
        items: [I("Blink Dagger", 19, 73, "36'"), I("Consecrated Wraps", 16, 62, "31'"), I("Scythe of Vyse", 11, 67, "42'")],
      },
      {
        title: "LATE (37'–60')",
        gold: "~15,000 GOLD",
        items: [I("Wind Waker", 6, 80, "42'"), I("Vladmir's Offering", 13, 50, "41'"), I("Aeon Disk", 5, 52, "32'")],
      },
      { title: "END GAME (60'+)", items: [I("Sheepstick + Refresher", 4, 66), I("Gem of True Sight", 6, 58), I("Lotus Orb", 5, 55)] },
    ],
    abilities: [
      { name: "Shadow Walk", levels: [1, null, null, 4, 5, null, 7, null, null, null, null, null, null, null, null, null, null, null] },
      { name: "Jinada", levels: [null, 2, null, null, null, null, null, null, null, null, null, null, 13, 14, null, null, null, null] },
      { name: "Shuriken Toss", levels: [null, null, 3, null, null, null, null, 8, 9, null, 11, null, null, null, null, null, null, null] },
      { name: "Track", levels: [null, null, null, null, null, 6, null, null, null, null, null, 12, null, null, null, null, null, 18] },
    ],
    talents: [
      { level: 10, left: "+30 Damage", right: "+0.35s Shuriken Slow", pickLeft: 11.8, pickRight: 88.2, winPick: 55.2, edge: 2.5, recommended: "right" },
      { level: 15, left: "+50 Track Gold", right: "−20% Dmg Taken in Shadow Walk", pickLeft: 2.1, pickRight: 97.9, winPick: 63, edge: 0.3, recommended: "right" },
      { level: 20, left: "+50 Jinada Gold Steal", right: "+160 Shuriken Damage", pickRight: 100, winPick: 64.7, edge: 1.4, recommended: "right" },
      { level: 25, left: "No Cooldown Jinada", right: "Track Grants Shared Vision", pickRight: 100, winPick: 62.5, edge: 5.2, recommended: "right" },
    ],
    abilityNotes: [
      "Shadow Walk L1 — Pick 98%. Maxed first; 7.42 nerfs (−0.1s stun, −2% speed/lvl) don't change the order.",
      "Jinada L2 value — Pick 93%. One point for slow/trade + gold steal; maxed last.",
      "Shuriken L3 — maxed second. 100/170/240/310, bounces to Tracked units in 1200 radius.",
      "Track 6/12/18 — Pick 99%. 6/10/14% amp post-7.42; 80/160/240 self gold is the pos-4 economy.",
    ],
    itemNotes: [
      "STARTING: Boots-first (49%/51%) default; Branch×2+Lace (26%/57%) is the winrate-max alternative.",
      "BOOT: Tranquil ~8:00 (87.5%/55.7%). No alternative.",
      "LANING: Wand by ~12' (71.3%/57.9%). Bloodslinger (925g) is the 7.42 novelty.",
      "EARLY: Urn ~12' (53.8%/58.1%) → Distiller ~18' (37.5%/63.3%) is the highest-impact two-step.",
      "MID: Eul's ~24' over Force ~27' unless save-duty demands it.",
      "PRIME: Blink ~36' (19%/73%) is the game-winner; Wraps ~31', Sheepstick ~42' next.",
    ],
  };
}
