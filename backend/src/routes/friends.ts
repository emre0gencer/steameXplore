import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';

const router = Router();

// Full friends list with relationship type and friend_since timestamp
router.get('/', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  try {
    const data = await steamFetch<{
      friendslist: {
        friends: {
          steamid: string;
          relationship: string;
          friend_since: number;
        }[];
      };
    }>('/ISteamUser/GetFriendList/v1', { steamid, relationship: 'friend' });
    res.json(data.friendslist);
  } catch (err) {
    // Friends list returns 401 from Steam when set to private
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
