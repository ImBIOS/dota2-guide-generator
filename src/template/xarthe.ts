import { impact, pct } from "../config.ts";

export interface ItemRow {
  name: string;
  pick: number; // %
  win: number; // %
  timing: string;
  note?: string;
  estimated?: boolean;
}

export interface Section {
  title: string;
  gold?: string;
  items: ItemRow[];
}

export interface AbilityRow {
  name: string;
  levels: (number | null)[];
}

export interface TalentRow {
  level: 10 | 15 | 20 | 25;
  left: string;
  right: string;
  pickLeft?: number;
  pickRight?: number;
  winPick?: number;
  edge?: number; // ranked edge of recommended side
  recommended: "left" | "right";
}

export interface GuideData {
  patch: string;
  heroName: string;
  role: string;
  roleLabel: string;
  bracketLabel: string;
  updatedOn: string;
  baseline: number;
  baselineSource: string;
  methodNote: string;
  deltas: string[];
  exemplary: { id: string; duration: string; desc: string }[];
  matchup: { goodWith: string[]; goodVs: string[]; badWith: string[]; badVs: string[] };
  sections: Section[];
  abilities: AbilityRow[];
  talents: TalentRow[];
  abilityNotes: string[];
  itemNotes: string[];
}

/** Xarthe's formula: Impact = item WR − hero-average WR. */
function row(r: ItemRow, baseline: number): string {
  const imp = impact(r.win, baseline);
  const sign = imp >= 0 ? "+" : "";
  const est = r.estimated ? "est. " : "";
  const t = r.timing ? ` (${r.timing})` : "";
  return `| ${r.name}${t} | ${est}${pct(r.pick)} | ${pct(r.win)} | ${sign}${imp}% |`;
}

export function renderMarkdown(g: GuideData): string {
  const L: string[] = [];
  L.push(`# ${g.patch} (${g.roleLabel}) ${g.role} | ${g.bracketLabel} Playstyle [${g.heroName}]`);
  L.push("");
  L.push(`**By Xarthe-method reconstruction** · Role: pos 4 Soft Support · Bracket: ${g.bracketLabel}`);
  L.push(`**Patch:** ${g.patch} · **Guide last updated on:** ${g.updatedOn}`);
  L.push(`**Data sources:** ${g.baselineSource}.`);
  L.push(`**Method note:** ${g.methodNote} Baseline = **${pct(g.baseline)}**. Impact = item WR − baseline.`);
  L.push("");
  if (g.deltas.length) {
    L.push(`## ${g.patch} ${g.heroName} deltas`); L.push("");
    for (const d of g.deltas) L.push(`- ${d}`);
    L.push("");
  }
  L.push("## Recent Exemplary Matches"); L.push("");
  for (const m of g.exemplary) {
    L.push(`- ${m.id} [stratz.com] (${m.duration}) — ${m.desc}`);
  }
  L.push("");
  L.push("## Recent Quintessential Matches"); L.push("");
  L.push("| Good W/ | Good Vs | Bad W/ | Bad Vs |");
  L.push("|---|---|---|---|");
  const n = Math.max(g.matchup.goodWith.length, g.matchup.goodVs.length, g.matchup.badWith.length, g.matchup.badVs.length);
  for (let i = 0; i < n; i++) {
    L.push(`| ${g.matchup.goodWith[i] ?? ""} | ${g.matchup.goodVs[i] ?? ""} | ${g.matchup.badWith[i] ?? ""} | ${g.matchup.badVs[i] ?? ""} |`);
  }
  L.push("");
  L.push("---"); L.push("");
  L.push("## ITEM BUILD"); L.push("");
  for (const s of g.sections) {
    L.push(`### ${s.title}${s.gold ? ` [${s.gold}]` : ""}`); L.push("");
    L.push("| Item | Pick | Win | Impact |");
    L.push("|---|---|---|---|");
    for (const r of s.items) L.push(row(r, g.baseline));
    L.push("");
  }
  L.push("## ABILITY BUILD"); L.push("");
  L.push("| Ability | " + g.abilities[0].levels.map((_, i) => `L${i + 1}`).join(" | ") + " |");
  L.push("|---|" + g.abilities[0].levels.map(() => "---").join("|") + "|");
  for (const a of g.abilities) {
    L.push(`| ${a.name} | ` + a.levels.map((l) => (l === null ? "" : "X")).join(" | ") + " |");
  }
  L.push("");
  L.push("## TALENT TREE"); L.push("");
  L.push("| Lvl | Left | Right | Recommended | Edge |");
  L.push("|---|---|---|---|---|");
  for (const t of g.talents) {
    const rec = t.recommended === "left" ? t.left : t.right;
    L.push(`| ${t.level} | ${t.left} | ${t.right} | **${rec}** | ${t.edge !== undefined ? `+${t.edge}%` : "—"} |`);
  }
  L.push("");
  L.push("## AUTHOR'S ABILITY NOTES"); L.push("");
  for (const n2 of g.abilityNotes) L.push(`- ${n2}`);
  L.push("");
  L.push("## AUTHOR'S ITEM NOTES"); L.push("");
  for (const n2 of g.itemNotes) L.push(`- ${n2}`);
  L.push("");
  L.push("*Reconstruction in Xarthe's format. Live Stratz-backed refresh needs a Stratz API token; per-patch deltas are applied by hand-editing the affected rows.*");
  return L.join("\n");
}

/**
 * saveGuide-shaped JSON matching Valve's guidebuilder.js payload:
 * POST dota2.com/workshop/builds/save { post: { title, hero, filename, isScratch, skillBuild, itemBuild, itemTooltips, abilityTooltips } }
 * itemBuild keys are phase sections mapping to ["item_<key>", ...].
 */
export function renderBuildJson(g: GuideData): Record<string, unknown> {
  const slug = g.heroName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const itemBuild: Record<string, string[]> = {};
  for (const s of g.sections) {
    const key = s.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    itemBuild[key || "section"] = s.items.map((i) => `item_${i.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`);
  }
  const skillBuild: Record<string, number[]> = {};
  for (const a of g.abilities) {
    skillBuild[a.name] = a.levels
      .map((v, i) => (v === null ? -1 : i + 1))
      .filter((v) => v > 0);
  }
  return {
    title: `${g.patch} (${g.roleLabel}) ${g.role} | ${g.bracketLabel} Playstyle [${g.heroName}]`,
    hero: slug,
    filename: `guides/${slug}_${g.role}_${g.patch}.build`,
    isScratch: "0",
    skillBuild,
    itemBuild,
    itemTooltips: {},
    abilityTooltips: {},
  };
}
