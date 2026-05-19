import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';

const router = Router();

// VAC bans, game bans, community ban, economy ban status
router.get('/', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  try {
    const data = await steamFetch<{
      players: {
        SteamId: string;
        CommunityBanned: boolean;
        VACBanned: boolean;
        NumberOfVACBans: number;
        DaysSinceLastBan: number;
        NumberOfGameBans: number;
        EconomyBan: string; // 'none' | 'probation' | 'banned'
      }[];
    }>('/ISteamUser/GetPlayerBans/v1', { steamids: steamid });
    res.json(data.players[0] ?? null);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
