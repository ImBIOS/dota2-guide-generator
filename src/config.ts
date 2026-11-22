export interface HeroConfig {
  id: number;
  slug: string;
  name: string;
  roles: string[];
  baselineWinRateSource: string;
  baselineWinRate: number;
}

export interface GeneratorConfig {
  patch: string;
  bracket: string;
  bracketLabel: string;
  takeWeeks: number;
  gameModes: string[];
  heroes: HeroConfig[];
  thresholds: { minPickRate: number; minMatches: number };
}

export async function loadConfig(path = "config.json"): Promise<GeneratorConfig> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`config not found: ${path}`);
  return (await file.json()) as GeneratorConfig;
}

export function impact(itemWinRate: number, baseline: number): number {
  return +(itemWinRate - baseline).toFixed(1);
}

export function pct(n: number): string {
  return `${(+n.toFixed(1))}%`;
}
