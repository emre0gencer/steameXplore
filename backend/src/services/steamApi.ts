const STEAM_API_BASE = 'https://api.steampowered.com';

export async function steamFetch<T>(
  endpoint: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const url = new URL(`${STEAM_API_BASE}${endpoint}`);
  url.searchParams.set('key', process.env.STEAM_API_KEY!);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new Error(`Steam API error: ${res.status} ${res.statusText} — ${endpoint}`);
  }

  return res.json() as Promise<T>;
}
