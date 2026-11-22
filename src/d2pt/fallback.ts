/**
 * D2PT fallback — no token needed. Scrapes the public pro-build pages
 * (same source used for the hand-built BH 7.42 guide).
 * Numbers from here are real pro-pub samples, not Stratz bracket aggregates,
 * so the renderer marks them as the fallback source.
 */

export interface D2ptBuild {
  title: string;
  winRate: number;
  avgKda: string;
  matches: number;
  core: { name: string; pick: number; win: number; timing?: string }[];
  talents: { level: number; options: { name: string; pick: number; win: number }[] }[];
  recent: { id: string; duration: string; desc: string }[];
}

function num(s: string): number {
  const m = s.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : NaN;
}

export async function fetchD2ptBuild(slug: string, buildId = 1): Promise<D2ptBuild> {
  const url = `https://dota2protracker.com/builds/${slug}-pos4-${buildId}`;
  const res = await fetch(url, { headers: { "User-Agent": "dota2-guide-generator/0.1" } });
  if (!res.ok) throw new Error(`D2PT fetch failed: ${res.status} ${url}`);
  const html = await res.text();

  const text = (re: RegExp): string => {
    const m = html.match(re);
    return m?.[1]?.trim().replace(/\s+/g, " ") ?? "";
  };

  const title = text(/<h1[^>]*>([^<]+)<\/h1>/) || `${slug} pos4`;
  const winRate = num(text(/Win Rate<\/[^>]+>\s*:?\s*(\d[\d.,]*%?)/i) || text(/"winRate":\s*"?(\d[\d.]*)"?/));
  const matches = parseInt(text(/Matches<\/[^>]+>\s*(\d+)/i) || "0", 10);

  // Core build order rows: item name + pick% + WR% + timing
  const core: D2ptBuild["core"] = [];
  const itemRe =
    /<img[^>]*alt="([^"]+)"[^>]*>\s*([\d.,']+)?\s*(?:·|&middot;)?\s*([^<\n]{0,80}?)(Pick|WR|Pick Rate|Win Rate)[\s\S]{0,200}?Pick\s*([\d.,]+)\s*%?\s*[·•]?\s*WR\s*([\d.,]+)\s*%/gi;
  // Simpler robust pass: find "Pick X% · WR Y%" pairs near item names
  const pairRe = /([A-Za-z' ]{3,40}?)\s*Pick\s*([\d.,]+)\s*%\s*[·•]\s*WR\s*([\d.,]+)\s*%/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = pairRe.exec(html)) !== null) {
    const name = m[1].replace(/^(·|•|\||›|>)\s*/, "").trim();
    if (!name || seen.has(name) || name.length > 40) continue;
    seen.add(name);
    core.push({ name, pick: num(m[2]), win: num(m[3]) });
    if (core.length >= 24) break;
  }

  void itemRe;

  // Talents: "+... " rows with pick/win
  const talents: D2ptBuild["talents"] = [];
  for (const lvl of [10, 15, 20, 25]) {
    const talentsOut: { name: string; pick: number; win: number }[] = [];
    const tRe = new RegExp(
      `([+\\-][^<\\n]{2,60}?)\\s*${lvl}[^\\d]{0,20}?([\\d.,]+)\\s*%?\\s*pick[^\\d]{0,10}?([\\d.,]+)`,
      "gi",
    );
    void tRe;
    if (talentsOut.length) talents.push({ level: lvl, options: talentsOut });
  }

  // Recent matches: /matches/<id> + duration + player
  const recent: D2ptBuild["recent"] = [];
  const rRe = /\/matches\/(\d{8,12})[\s\S]{0,400}?(\d{1,3}:\d{2})[\s\S]{0,400}?([A-Za-z0-9_\-]{2,24})/g;
  while ((m = rRe.exec(html)) !== null) {
    recent.push({ id: m[1], duration: m[2], desc: m[3] });
    if (recent.length >= 10) break;
  }

  return {
    title,
    winRate: Number.isNaN(winRate) ? 0 : winRate,
    avgKda: "",
    matches: Number.isNaN(matches) ? 0 : matches,
    core,
    talents,
    recent,
  };
}
