import { Router } from 'express';
import { steamFetch } from '../services/steamApi';
import { withCache, TTL } from '../services/cache';

const router = Router();

// Public profile aggregation for any steamid — no auth required, uses API key only.
router.get('/:steamid', async (req, res) => {
  const { steamid } = req.params;
  if (!/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'Invalid steamid — must be a 17-digit number' });
  }

  const [profileRes, levelRes, bansRes, gamesRes, recentRes, friendsRes] = await Promise.allSettled([
    withCache(`profile:${steamid}`, TTL.SHORT, () =>
      steamFetch<{ response: { players: unknown[] } }>(
        '/ISteamUser/GetPlayerSummaries/v2', { steamids: steamid }
      )
    ),
    withCache(`level:${steamid}`, TTL.MEDIUM, () =>
      steamFetch<{ response: unknown }>(
        '/IPlayerService/GetBadges/v1', { steamid }
      )
    ),
    withCache(`bans:${steamid}`, TTL.LONG, () =>
      steamFetch<{ players: unknown[] }>(
        '/ISteamUser/GetPlayerBans/v1', { steamids: steamid }
      )
    ),
    withCache(`games:${steamid}`, TTL.MEDIUM, () =>
      steamFetch<{ response: unknown }>(
        '/IPlayerService/GetOwnedGames/v1', {
          steamid, include_appinfo: 1, include_played_free_games: 1,
        }
      )
    ),
    withCache(`recent:${steamid}`, TTL.SHORT, () =>
      steamFetch<{ response: unknown }>(
        '/IPlayerService/GetRecentlyPlayedGames/v1', { steamid, count: 10 }
      )
    ),
    withCache(`${steamid}:friends`, TTL.MEDIUM, () =>
      steamFetch<{ friendslist: { friends: unknown[] } }>(
        '/ISteamUser/GetFriendList/v1', { steamid, relationship: 'friend' }
      )
    ),
  ]);

  res.json({
    profile: profileRes.status === 'fulfilled'
      ? (profileRes.value.response.players[0] ?? null) : null,
    level: levelRes.status === 'fulfilled'
      ? (levelRes.value.response ?? null) : null,
    bans: bansRes.status === 'fulfilled'
      ? (bansRes.value.players[0] ?? null) : null,
    games: gamesRes.status === 'fulfilled'
      ? (gamesRes.value.response ?? null) : null,
    recentGames: recentRes.status === 'fulfilled'
      ? (recentRes.value.response ?? null) : null,
    friendCount: friendsRes.status === 'fulfilled'
      ? ((friendsRes.value.friendslist?.friends?.length) ?? null) : null,
  });
});

export default router;
