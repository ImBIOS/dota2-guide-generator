const ENDPOINT = "https://api.stratz.com/graphql";

export function getToken(): string | null {
  return process.env.STRATZ_API_TOKEN?.trim() || null;
}

export async function stratzQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("STRATZ_API_TOKEN is not set");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "STRATZ_API",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Stratz returned non-JSON: ${text.slice(0, 300)}`);
  }
  if (json.errors) {
    throw new Error(`Stratz errors: ${JSON.stringify(json.errors).slice(0, 500)}`);
  }
  if (json.message === "API rate limit exceeded") {
    throw new Error("Stratz rate limit exceeded — back off and retry");
  }
  return json.data as T;
}

/**
 * Bracket-filtered hero meta.
 * brackets: RankBracket enum — DIVINE, IMMORTAL (DIVINE_IMMORTAL does not exist here;
 * the *_BASIC enum with DIVINE_IMMORTAL is only for the stats/item/talent fields).
 * positions: MatchPlayerPositionType — POSITION_1..5.
 * modes: GameModeEnumType — ALL_PICK_RANKED.
 */
export const META_QUERY = `
  query Meta($take: Int!, $brackets: [RankBracket], $positions: [MatchPlayerPositionType], $modes: [GameModeEnumType]) {
    heroStats {
      winWeek(take: $take, bracketIds: $brackets, positionIds: $positions, gameModeIds: $modes) {
        heroId
        matchCount
        winCount
      }
    }
  }
`;

export interface WinWeekRow {
  heroId: number;
  matchCount: number;
  winCount: number;
}

export async function fetchMeta(opts: {
  brackets: string[];
  positions: string[];
  modes: string[];
  weeks: number;
}): Promise<WinWeekRow[]> {
  const data = await stratzQuery<{
    heroStats: { winWeek: WinWeekRow[] };
  }>(META_QUERY, {
    take: opts.weeks,
    brackets: opts.brackets,
    positions: opts.positions,
    modes: opts.modes,
  });
  return data.heroStats.winWeek;
}

/** Generic passthrough for ad-hoc queries. */
export async function fetchRaw<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  return stratzQuery<T>(query, variables);
}

// ---- per-hero Xarthe fields (brackets here use RankBracketBasicEnum with DIVINE_IMMORTAL) ----

export interface StartingPurchaseRow {
  itemId: number;
  matchCount: number;
  winCount: number;
}
export interface BootPurchaseRow {
  itemId: number;
  timeAverage: number;
  matchCount: number;
  winCount: number;
}
export interface FullPurchaseRow {
  itemId: number;
  time: number;
  matchCount: number;
  winCount: number;
}
export interface NeutralRow {
  itemId: number;
  matchCount: number;
  winCount: number;
  equippedMatchCount: number;
  equippedMatchWinCount: number;
}
export interface TalentRow {
  abilityId: number;
  matchCount: number;
  winCount: number;
}

const HERO_FIELDS = `
  query HeroFields($heroId: Short!, $bracket: [RankBracketBasicEnum], $position: [MatchPlayerPositionType]) {
    heroStats {
      talents: talent(heroId: $heroId, bracketBasicIds: $bracket, positionIds: $position) {
        abilityId matchCount winCount
      }
    }
  }
`;

export interface HeroFields {
  starting: StartingPurchaseRow[];
  boots: BootPurchaseRow[];
  full: FullPurchaseRow[];
  neutral: NeutralRow[];
  talents: TalentRow[];
}

export async function fetchHeroFields(heroId: number, position = "POSITION_4"): Promise<HeroFields> {
  // NOTE: itemStarting/Boot/FullPurchase + itemNeutral return null/[] on Default
  // tokens (verified Nov 2026). Only talent resolves; item rows come from D2PT.
  // Bracket/position filters also null out talent on Default tokens, so
  // request unfiltered and treat as cross-check data.
  const data = await stratzQuery<{ heroStats: { talents: TalentRow[] } }>(HERO_FIELDS, {
    heroId,
    bracket: ["DIVINE_IMMORTAL"],
    position: [position],
  });
  let talents = data.heroStats.talents ?? [];
  if (!talents.length) {
    const fallback = await stratzQuery<{ heroStats: { talents: TalentRow[] } }>(
      `query T($heroId: Short!) { heroStats { talents: talent(heroId: $heroId) { abilityId matchCount winCount } } }`,
      { heroId },
    );
    talents = fallback.heroStats.talents ?? [];
  }
  return { starting: [], boots: [], full: [], neutral: [], talents };
}

/** itemId -> displayName mapping (cached per run). */
let itemNameCache: Map<number, string> | null = null;

export async function itemNames(): Promise<Map<number, string>> {
  if (itemNameCache) return itemNameCache;
  const data = await stratzQuery<{ constants: { items: { id: number; displayName: string }[] } }>(
    `query { constants { items { id displayName } } }`,
  );
  itemNameCache = new Map(data.constants.items.map((i) => [i.id, i.displayName]));
  return itemNameCache;
}
