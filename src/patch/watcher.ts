/** Patch watcher: detects a new live patch from dota2.com. */

export async function getLivePatch(): Promise<string | null> {
  try {
    const res = await fetch("https://www.dota2.com/patches", {
      headers: { "User-Agent": "dota2-guide-generator/0.1" },
      redirect: "follow",
    });
    const finalUrl = res.url; // e.g. https://www.dota2.com/patches/7.42
    const m = finalUrl.match(/patches\/(\d+\.\d+[a-z]?)/i);
    if (m) return m[1];
    const html = await res.text();
    const m2 = html.match(/patches\/(7\.\d+[a-z]?)/i);
    return m2 ? m2[1] : null;
  } catch {
    return null;
  }
}
