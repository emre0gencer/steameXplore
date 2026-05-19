import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { withCache, TTL } from '../services/cache';

const router = Router();

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'br, gzip, deflate',
};

export interface SteamPriceResponse {
  success: boolean;
  lowest_price?: string;
  median_price?: string;
  volume?: string;
}

interface SkinportItem {
  market_hash_name: string;
  min_price: number | null;
  suggested_price: number | null;
  quantity: number;
}

// Skinport publishes a free, no-auth bulk price list for CS2 (app 730).
// We cache the full list and do in-memory lookups per request.
async function getSkinportPriceMap(): Promise<Map<string, SkinportItem>> {
  return withCache('skinport:prices:730', TTL.SHORT, async () => {
    const response = await fetch(
      'https://api.skinport.com/v1/items?app_id=730&currency=USD',
      { headers: BROWSER_HEADERS }
    );
    if (!response.ok) throw new Error(`Skinport returned ${response.status}`);
    const items = await response.json() as SkinportItem[];
    const map = new Map<string, SkinportItem>();
    for (const item of items) map.set(item.market_hash_name, item);
    return map;
  });
}

// Steam Market price overview — works for any game's marketable items.
// currency=1 → USD
router.get('/steam', requireAuth, async (req, res) => {
  const { appid, market_hash_name } = req.query;
  if (!appid || !market_hash_name || typeof market_hash_name !== 'string') {
    return res.status(400).json({ error: 'Missing appid or market_hash_name' });
  }

  const url =
    `https://steamcommunity.com/market/priceoverview/` +
    `?appid=${appid}&currency=1&market_hash_name=${encodeURIComponent(market_hash_name)}`;

  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Steam returned ${response.status}` });
    }
    const data = await response.json() as SteamPriceResponse;
    return res.json(data);
  } catch (err) {
    return res.status(502).json({ error: (err as Error).message });
  }
});

// Skinport batch prices — CS2 only.
// Accepts ?names=Name1,Name2,... and returns a map of { [market_hash_name]: { min_price, suggested_price, quantity } }.
router.get('/skinport', requireAuth, async (req, res) => {
  const { names } = req.query;
  if (!names || typeof names !== 'string') {
    return res.status(400).json({ error: 'Missing names query param (comma-separated market_hash_names)' });
  }

  const requested = names.split(',').map((n) => n.trim()).filter(Boolean);
  if (requested.length === 0) return res.json({});

  try {
    const priceMap = await getSkinportPriceMap();
    const result: Record<string, { min_price: number | null; suggested_price: number | null; quantity: number }> = {};
    for (const name of requested) {
      const item = priceMap.get(name);
      if (item) result[name] = { min_price: item.min_price, suggested_price: item.suggested_price, quantity: item.quantity };
    }
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
