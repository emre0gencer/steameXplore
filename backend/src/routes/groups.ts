import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';

const router = Router();

// All Steam groups the user is a member of
router.get('/', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  try {
    const data = await steamFetch<{
      response: {
        success: boolean;
        groups: { gid: string }[];
      };
    }>('/ISteamUser/GetUserGroupList/v1', { steamid });
    res.json(data.response);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
