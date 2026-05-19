import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';
import { withCache, TTL } from '../services/cache';

const router = Router();

// Raw per-game stats (kills, wins, rounds, etc.) — fields are game-defined
router.get('/:appid', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  const { appid } = req.params;
  try {
    const data = await withCache(
      `${steamid}:stats:${appid}`,
      TTL.SHORT,
      () => steamFetch<{
        playerstats: {
          steamID: string;
          gameName: string;
          stats: { name: string; value: number }[];
          achievements: { name: string; achieved: number }[];
        };
      }>('/ISteamUserStats/GetUserStatsForGame/v2', { steamid, appid })
    );
    res.json(data.playerstats);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
