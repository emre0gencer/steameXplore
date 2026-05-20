import { Router } from 'express';
import { steamFetch } from '../services/steamApi';
import { withCache, TTL } from '../services/cache';

const router = Router();

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

interface PlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  personastate: number;
  communityvisibilitystate: number;
  profilestate?: number;
  lastlogoff?: number;
  realname?: string;
  gameid?: string;
  gameextrainfo?: string;
  loccountrycode?: string;
  locstatecode?: string;
}

function parseSteamId(q: string): string | null {
  const trimmed = q.trim();
  if (/^\d{17}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/\/profiles\/(\d{17})/);
  if (m) return m[1];
  return null;
}

function parseVanity(q: string): string | null {
  const m = q.trim().match(/\/id\/([^/?#\s]+)/);
  if (m) return m[1];
  return null;
}

// Fetch a Steam community sessionid without being logged in.
// Steam uses this as a CSRF token; any valid hex string works.
async function getSteamSessionId(): Promise<string> {
  try {
    const res = await fetch('https://steamcommunity.com/', { headers: BROWSER_HEADERS });
    const raw = res.headers.get('set-cookie') ?? '';
    // set-cookie can be a single string with multiple cookies separated by commas
    const match = raw.match(/sessionid=([a-f0-9]+)/i);
    if (match) return match[1];
  } catch { /* fall through */ }
  // Generate a valid-looking sessionid if fetch failed
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

// Search Steam Community by display name using the same AJAX endpoint Steam's website uses.
// Returns up to ~18 SteamID64 strings.
async function searchByDisplayName(query: string): Promise<string[]> {
  try {
    const sessionid = await getSteamSessionId();

    const body = new URLSearchParams({
      text: query,
      filter: 'users',
      sessionid,
      page: '1',
    });

    const res = await fetch('https://steamcommunity.com/search/SearchCommunityAjax', {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': `sessionid=${sessionid}`,
        'Referer': 'https://steamcommunity.com/search/users/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    });

    if (!res.ok) return [];

    const json = await res.json() as { success: number; html?: string; search_result_count?: number };
    if (json.success !== 1 || !json.html) return [];

    // Extract SteamID64s from profile links embedded in the returned HTML snippet
    const ids: string[] = [];
    const regex = /\/profiles\/(\d{17})/g;
    let m;
    while ((m = regex.exec(json.html)) !== null) {
      if (!ids.includes(m[1])) ids.push(m[1]);
    }
    return ids;
  } catch {
    return [];
  }
}

async function resolveVanity(vanity: string): Promise<string | null> {
  try {
    const data = await withCache(`vanity:${vanity}`, TTL.LONG, () =>
      steamFetch<{ response: { steamid?: string; success: number } }>(
        '/ISteamUser/ResolveVanityURL/v1',
        { vanityurl: vanity }
      )
    );
    return data.response.success === 1 ? (data.response.steamid ?? null) : null;
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
  const q = ((req.query.q as string) ?? '').trim();
  if (q.length < 2) return res.json([]);

  try {
    // 1. Always try display name search first — this is the primary path
    const displayNameIds = await searchByDisplayName(q);

    // 2. Only fall back to SteamID / URL / vanity resolution if display name search returned nothing
    const fallbackIds: string[] = [];
    if (displayNameIds.length === 0) {
      const directId = parseSteamId(q);
      if (directId) {
        fallbackIds.push(directId);
      } else {
        const vanity = parseVanity(q) ?? q;
        const resolved = await resolveVanity(vanity);
        if (resolved) fallbackIds.push(resolved);
      }
    }

    const allIds = displayNameIds.length > 0 ? displayNameIds : fallbackIds;
    if (allIds.length === 0) return res.json([]);

    // 3. Batch fetch player summaries (API supports up to 100 steamids per call)
    const steamids = allIds.slice(0, 20).join(',');
    const data = await steamFetch<{ response: { players: PlayerSummary[] } }>(
      '/ISteamUser/GetPlayerSummaries/v2',
      { steamids }
    );

    res.json(data.response.players ?? []);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
