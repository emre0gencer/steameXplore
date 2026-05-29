import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';
import { withCache, TTL } from '../services/cache';

const router = Router();

// Steam level and all earned badges with XP and scarcity
router.get('/', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  try {
    const data = await withCache(
      `${steamid}:level`,
      TTL.MEDIUM,
      async () => {
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
        return badgeData.response;
      }
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// Resolve badge image URLs via Steam's economy classinfo API (uses communityitemid as classid).
// Returns { [communityitemid]: full_image_url }
router.get('/badge-images', requireAuth, async (req, res) => {
  const ids = ((req.query.communityitemids as string) ?? '')
    .split(',').map(s => s.trim()).filter(Boolean).slice(0, 30);
  if (ids.length === 0) return res.json({});

  const params: Record<string, string | number> = { appid: 753, class_count: ids.length };
  ids.forEach((id, i) => { params[`classid${i}`] = id; });

  try {
    const data = await withCache(
      `badge:imgs:${[...ids].sort().join(',')}`,
      TTL.LONG,
      () => steamFetch<{ result: Record<string, { icon_url?: string; name?: string } | boolean> }>(
        '/ISteamEconomy/GetAssetClassInfo/v1', params
      )
    );
    const result: Record<string, { url: string; name: string | null }> = {};
    for (const [k, v] of Object.entries(data.result)) {
      if (k === 'success' || typeof v !== 'object' || !v?.icon_url) continue;
      result[k] = {
        url: `https://community.cloudflare.steamstatic.com/economy/image/${v.icon_url}/96fx96f`,
        name: v.name ?? null,
      };
    }
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
