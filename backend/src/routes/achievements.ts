import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';

const router = Router();

// Per-game achievements for the logged-in user with unlock timestamps
router.get('/:appid', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  const { appid } = req.params;
  try {
    const [playerData, globalData] = await Promise.all([
      steamFetch<{
        playerstats: {
          steamID: string;
          gameName: string;
          achievements: {
            apiname: string;
            achieved: number; // 0 or 1
            unlocktime: number; // Unix timestamp, 0 if not achieved
          }[];
          success: boolean;
          error?: string;
        };
      }>('/ISteamUserStats/GetPlayerAchievements/v1', {
        steamid,
        appid,
        l: 'english',
      }),
      steamFetch<{
        achievementpercentages: {
          achievements: {
            name: string;
            percent: number;
          }[];
        };
      }>('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2', { gameid: appid }),
    ]);

    // Merge global unlock rate into player achievements
    const globalMap = new Map(
      globalData.achievementpercentages.achievements.map((a) => [a.name, a.percent])
    );
    const merged = playerData.playerstats.achievements?.map((a) => ({
      ...a,
      global_percent: globalMap.get(a.apiname) ?? null,
    }));

    res.json({ ...playerData.playerstats, achievements: merged });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
