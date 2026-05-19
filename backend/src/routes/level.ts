import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';

const router = Router();

// Steam level and all earned badges with XP and scarcity
router.get('/', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  try {
    const [levelData, badgeData] = await Promise.all([
      steamFetch<{
        response: { player_level: number };
      }>('/IPlayerService/GetSteamLevel/v1', { steamid }),
      steamFetch<{
        response: {
          badges: {
            badgeid: number;
            level: number;
            completion_time: number;
            xp: number;
            scarcity: number;
            appid?: number;
            communityitemid?: string;
            border_color?: number;
          }[];
          player_xp: number;
          player_level: number;
          player_xp_needed_to_level_up: number;
          player_xp_needed_current_level: number;
        };
      }>('/IPlayerService/GetBadges/v1', { steamid }),
    ]);

    res.json(badgeData.response);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
