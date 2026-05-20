import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';
import { withCache, TTL } from '../services/cache';

const router = Router();

// All owned games with playtime broken down by platform
router.get('/', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  try {
    const data = await withCache(
      `${steamid}:games`,
      TTL.MEDIUM,
      () => steamFetch<{
        response: {
          game_count: number;
          games: {
            appid: number;
            name: string;
            playtime_forever: number;
            playtime_2weeks?: number;
            playtime_windows_forever: number;
            playtime_mac_forever: number;
            playtime_linux_forever: number;
            playtime_deck_forever: number;
            rtime_last_played: number;
            img_icon_url: string;
            has_community_visible_stats: boolean;
          }[];
        };
      }>('/IPlayerService/GetOwnedGames/v1', {
        steamid,
        include_appinfo: 1,
        include_played_free_games: 1,
        include_free_sub: 1,
      })
    );
    res.json(data.response);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// Recently played games (last 2 weeks, up to 20)
router.get('/recent', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  try {
    const data = await withCache(
      `${steamid}:games:recent`,
      TTL.SHORT,
      () => steamFetch<{
        response: {
          total_count: number;
          games: {
            appid: number;
            name: string;
            playtime_2weeks: number;
            playtime_forever: number;
            img_icon_url: string;
            playtime_windows_forever: number;
            playtime_mac_forever: number;
            playtime_linux_forever: number;
            playtime_deck_forever: number;
          }[];
        };
      }>('/IPlayerService/GetRecentlyPlayedGames/v1', { steamid, count: 20 })
    );
    res.json(data.response);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

interface SteamSpyApp {
  appid: number; name: string; genre: string; price: string;
  initialprice: string; discount: string; ccu: number;
  positive: number; negative: number; owners: string;
}

// Per-game metadata from SteamSpy: genres, price, CCU, reviews
router.get('/meta', requireAuth, async (req, res) => {
  const raw = ((req.query.appids as string) ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const appids = [...new Set(raw)].slice(0, 40);
  if (appids.length === 0) return res.json({});

  const result: Record<string, { genres: string[]; price: number; is_free: boolean; ccu: number; positive: number; negative: number; owners: string }> = {};

  await Promise.all(appids.map(async (id) => {
    try {
      const data = await withCache(`steamspy:${id}`, TTL.LONG, () =>
        fetch(`https://steamspy.com/api.php?request=appdetails&appid=${id}`)
          .then(r => r.json()) as Promise<SteamSpyApp>
      );
      const price = parseInt(data.price ?? '0', 10);
      result[id] = {
        genres: data.genre ? data.genre.split(',').map(g => g.trim()).filter(Boolean) : [],
        price,
        is_free: price === 0,
        ccu: data.ccu ?? 0,
        positive: data.positive ?? 0,
        negative: data.negative ?? 0,
        owners: data.owners ?? '',
      };
    } catch { /* skip failed lookups */ }
  }));

  res.json(result);
});

export default router;
