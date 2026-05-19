import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// Steam throttles inventory endpoints aggressively.
// On 429, honour the Retry-After header and retry once before giving up.
async function fetchInventory(url: string): Promise<Response> {
  let response = await fetch(url);

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? 5);
    const wait = Math.min(retryAfter, 15) * 1000; // cap at 15 s
    await new Promise((resolve) => setTimeout(resolve, wait));
    response = await fetch(url);
  }

  return response;
}

// Steam inventory for a given game (appid).
// Context ID 2 covers most games (CS2=730, TF2=440, Dota2=570, etc.)
// Public inventories do not require an API key — different base URL.
router.get('/:appid', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  const { appid } = req.params;
  const contextid = req.query.contextid ?? '2';
  const count = req.query.count ?? '5000';

  const url =
    `https://steamcommunity.com/inventory/${steamid}/${appid}/${contextid}` +
    `?l=english&count=${count}`;

  try {
    const response = await fetchInventory(url);

    if (response.status === 403) {
      return res.status(403).json({ error: 'Inventory is private' });
    }
    if (response.status === 429) {
      return res.status(429).json({ error: 'Steam is throttling inventory requests. Try again later.' });
    }
    if (!response.ok) {
      return res.status(502).json({ error: `Steam returned ${response.status}` });
    }

    const data = await response.json() as {
      assets: {
        appid: number;
        contextid: string;
        assetid: string;
        classid: string;
        instanceid: string;
        amount: string;
      }[];
      descriptions: {
        appid: number;
        classid: string;
        instanceid: string;
        currency: number;
        background_color: string;
        icon_url: string;
        icon_url_large: string;
        descriptions: { type: string; value: string }[];
        tradable: number;
        actions?: { link: string; name: string }[];
        name: string;
        name_color: string;
        type: string;
        market_name: string;
        market_hash_name: string;
        marketable: number;
        commodity: number;
        market_tradable_restriction: number;
        fraudwarnings: string[];
        tags: {
          category: string;
          internal_name: string;
          localized_category_name: string;
          localized_tag_name: string;
          color?: string;
        }[];
      }[];
      total_inventory_count: number;
      success: number;
      rwgrsn: number;
    };

    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
