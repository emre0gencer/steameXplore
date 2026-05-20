import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';
import { withCache, TTL } from '../services/cache';

const router = Router();

interface FriendEntry { steamid: string; relationship: string; friend_since: number; }
interface PlayerSummary {
  steamid: string; personaname: string; profileurl: string;
  avatar: string; avatarmedium: string; avatarfull: string;
  personastate: number; communityvisibilitystate: number;
  realname?: string; gameid?: string; gameextrainfo?: string;
  loccountrycode?: string; lastlogoff?: number;
}

async function getFriendIds(steamid: string): Promise<FriendEntry[]> {
  const data = await withCache(
    `${steamid}:friends`,
    TTL.MEDIUM,
    () => steamFetch<{ friendslist: { friends: FriendEntry[] } }>(
      '/ISteamUser/GetFriendList/v1', { steamid, relationship: 'friend' }
    )
  );
  return data.friendslist?.friends ?? [];
}

// Full friends list with relationship type and friend_since timestamp
router.get('/', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  try {
    const friends = await getFriendIds(steamid);
    res.json({ friends });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// Friends list enriched with player summaries (avatars, names, online status)
router.get('/with-summaries', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  try {
    const friends = await getFriendIds(steamid);
    const ids = friends.map(f => f.steamid);
    if (ids.length === 0) return res.json([]);

    // GetPlayerSummaries accepts up to 100 steamids per call
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));

    const summaries = await withCache(
      `${steamid}:friends:summaries`,
      TTL.SHORT,
      () => Promise.all(
        chunks.map(chunk =>
          steamFetch<{ response: { players: PlayerSummary[] } }>(
            '/ISteamUser/GetPlayerSummaries/v2', { steamids: chunk.join(',') }
          )
        )
      )
    );

    res.json(summaries.flatMap(s => s.response.players));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// Public friends-with-summaries for any steamid — no session required.
router.get('/for/:steamid', async (req, res) => {
  const { steamid } = req.params;
  if (!/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'Invalid steamid' });
  }
  try {
    const friends = await getFriendIds(steamid);
    const ids = friends.map(f => f.steamid);
    if (ids.length === 0) return res.json([]);

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));

    const summaries = await withCache(
      `${steamid}:friends:summaries`,
      TTL.SHORT,
      () => Promise.all(
        chunks.map(chunk =>
          steamFetch<{ response: { players: PlayerSummary[] } }>(
            '/ISteamUser/GetPlayerSummaries/v2', { steamids: chunk.join(',') }
          )
        )
      )
    );
    res.json(summaries.flatMap(s => s.response.players));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
