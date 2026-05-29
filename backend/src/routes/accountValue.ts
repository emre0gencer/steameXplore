import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { withCache, peekCache, TTL } from '../services/cache';
import { steamFetch } from '../services/steamApi';
import { withHostQueue } from '../services/httpQueue';
import { fetchFullInventory } from './inventory';

const STEAM_COMMUNITY_HOST = 'steamcommunity.com';
const STEAM_COMMUNITY_MIN_GAP_MS = 1500;

const router = Router();

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Types ───────────────────────────────────────────────────────────────────────

type InvDesc = {
  classid: string; instanceid: string; name: string;
  market_hash_name: string; icon_url: string; marketable: number;
};
type InvAsset = { classid: string; instanceid: string; amount: string };
type InvResult = { assets: InvAsset[]; descriptions: InvDesc[] };

// ── SteamSpy price ──────────────────────────────────────────────────────────────

async function getSteamSpyInitialPrice(appid: number): Promise<number> {
  const data = await withCache<{ initialprice?: string }>(`steamspy:${appid}`, TTL.LONG, () =>
    fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`).then(r => r.json())
  );
  const cents = parseInt(data.initialprice ?? '0', 10);
  return isNaN(cents) ? 0 : cents;
}

// ── Skinport bulk prices (CS2) ──────────────────────────────────────────────────

interface SkinportItem { market_hash_name: string; min_price: number | null; suggested_price: number | null; }

async function getSkinportPriceMap(): Promise<Map<string, SkinportItem>> {
  return withCache('skinport:prices:730', TTL.SHORT, async () => {
    const res = await fetch('https://api.skinport.com/v1/items?app_id=730&currency=USD', { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`Skinport returned ${res.status}`);
    const items = await res.json() as SkinportItem[];
    const map = new Map<string, SkinportItem>();
    for (const item of items) map.set(item.market_hash_name, item);
    return map;
  });
}

// ── Steam Market price per item ─────────────────────────────────────────────────
// Throttling is delegated to the shared steamcommunity.com queue, so market lookups
// and inventory page fetches automatically serialize against each other.

function parseCents(priceStr: string): number {
  return Math.round(parseFloat(priceStr.replace(/[^0-9.]/g, '')) * 100);
}

async function fetchSteamMarketPrice(appid: number, market_hash_name: string): Promise<number | null> {
  return withCache<number | null>(
    `market:${appid}:${encodeURIComponent(market_hash_name)}`,
    TTL.LONG,
    async () => {
      const url =
        `https://steamcommunity.com/market/priceoverview/` +
        `?appid=${appid}&market_hash_name=${encodeURIComponent(market_hash_name)}&currency=1`;
      const doFetch = () => fetch(url, { headers: BROWSER_HEADERS });
      let res = await withHostQueue(STEAM_COMMUNITY_HOST, STEAM_COMMUNITY_MIN_GAP_MS, doFetch);
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        res = await withHostQueue(STEAM_COMMUNITY_HOST, STEAM_COMMUNITY_MIN_GAP_MS, doFetch);
      }
      if (!res.ok) return null;
      const data = await res.json() as { success: boolean; lowest_price?: string };
      if (!data.success || !data.lowest_price) return null;
      return parseCents(data.lowest_price);
    }
  );
}

// ── Sub-computation: Games ──────────────────────────────────────────────────────

async function computeGamesValue(steamid: string) {
  const data = await steamFetch<{
    response: { game_count?: number; games?: { appid: number; name: string; img_icon_url: string }[] };
  }>('/IPlayerService/GetOwnedGames/v1', {
    steamid, include_appinfo: 1, include_played_free_games: 1,
  });

  const games = data.response.games ?? [];
  const chunks: (typeof games)[] = [];
  for (let i = 0; i < games.length; i += 10) chunks.push(games.slice(i, i + 10));

  const priced: { appid: number; name: string; img_icon_url: string; initialprice_cents: number }[] = [];

  for (let i = 0; i < chunks.length; i++) {
    await Promise.all(chunks[i].map(async (g) => {
      try {
        const cents = await getSteamSpyInitialPrice(g.appid);
        if (cents > 0) priced.push({ appid: g.appid, name: g.name, img_icon_url: g.img_icon_url, initialprice_cents: cents });
      } catch { /* skip */ }
    }));
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 150));
  }

  const total_cents = priced.reduce((s, g) => s + g.initialprice_cents, 0);
  const top_games = [...priced].sort((a, b) => b.initialprice_cents - a.initialprice_cents).slice(0, 50);
  return { total_cents, game_count: games.length, priced_count: priced.length, top_games };
}

// ── Sub-computation: Inventory ──────────────────────────────────────────────────

type TopItem = {
  appid: number; name: string; market_hash_name: string;
  icon_url: string; price_cents: number; quantity: number;
};

async function computeInventoryValue(steamid: string) {
  const APPIDS = [730, 570, 440, 252490] as const;

  // Strategy: read from the shared inventory cache first (populated by the Inventory tab).
  // Only attempt a fresh Steam fetch for appids not already cached — with generous spacing
  // to avoid triggering Steam's burst detection that causes rwgrsn:-2 / 401 / 429.
  const invResults: (InvResult | null)[] = [];
  const needFetch: number[] = [];

  for (const appid of APPIDS) {
    const cached = peekCache<InvResult>(`inventory:${steamid}:${appid}:2`);
    if (cached) {
      invResults.push(cached);
    } else {
      invResults.push(null); // placeholder
      needFetch.push(appid);
    }
  }

  // Fetch missing appids sequentially with a 3 second gap so Steam doesn't see a burst
  for (let i = 0; i < needFetch.length; i++) {
    const appid = needFetch[i];
    const idx = APPIDS.indexOf(appid as typeof APPIDS[number]);
    try {
      const raw = await withCache<InvResult>(
        `inventory:${steamid}:${appid}:2`, TTL.MEDIUM,
        async () => {
          const full = await fetchFullInventory(steamid, String(appid), '2', '2000');
          return { assets: full.assets as InvAsset[], descriptions: full.descriptions as InvDesc[] };
        }
      );
      invResults[idx] = raw;
    } catch (err) {
      console.error(`[accountValue] inventory ${appid} failed:`, (err as Error).message);
    }
    if (i < needFetch.length - 1) await new Promise(r => setTimeout(r, 3000));
  }

  // If every appid failed (cache cold and all fetches blocked), don't cache a $0 result
  if (invResults.every(r => r === null)) {
    throw new Error('All inventory fetches failed — will retry on next request');
  }

  const [cs2Inv, dota2Inv, tf2Inv, rustInv] = invResults;

  function buildQtyMap(inv: InvResult | null): Map<string, { qty: number; desc: InvDesc }> {
    const map = new Map<string, { qty: number; desc: InvDesc }>();
    if (!inv) return map;
    const descMap = new Map<string, InvDesc>();
    for (const d of inv.descriptions) if (d.marketable === 1) descMap.set(`${d.classid}_${d.instanceid}`, d);
    for (const a of inv.assets) {
      const d = descMap.get(`${a.classid}_${a.instanceid}`);
      if (!d) continue;
      const ex = map.get(d.market_hash_name);
      if (ex) ex.qty += parseInt(a.amount, 10);
      else map.set(d.market_hash_name, { qty: parseInt(a.amount, 10), desc: d });
    }
    return map;
  }

  const top_items: TopItem[] = [];
  let cs2_cents = 0;

  // CS2: Skinport bulk pricing
  const cs2Qty = buildQtyMap(cs2Inv);
  if (cs2Qty.size > 0) {
    try {
      const priceMap = await getSkinportPriceMap();
      for (const [mhn, { qty, desc }] of cs2Qty) {
        const item = priceMap.get(mhn);
        const priceCents = item?.min_price != null ? Math.round(item.min_price * 100) : null;
        if (priceCents) {
          cs2_cents += priceCents * qty;
          top_items.push({ appid: 730, name: desc.name, market_hash_name: mhn, icon_url: desc.icon_url, price_cents: priceCents, quantity: qty });
        }
      }
    } catch { /* CS2 pricing unavailable */ }
  }

  // Dota2 / TF2 / Rust: Steam Market priceoverview (sequential, rate-limited)
  let dota2_cents = 0, tf2_cents = 0, rust_cents = 0;
  const gameEntries: [number, InvResult | null][] = [
    [570, dota2Inv], [440, tf2Inv], [252490, rustInv],
  ];

  for (const [appid, inv] of gameEntries) {
    const qtyMap = buildQtyMap(inv);
    let gameCents = 0;
    for (const [mhn, { qty, desc }] of qtyMap) {
      try {
        const priceCents = await fetchSteamMarketPrice(appid, mhn);
        if (priceCents) {
          gameCents += priceCents * qty;
          top_items.push({ appid, name: desc.name, market_hash_name: mhn, icon_url: desc.icon_url, price_cents: priceCents, quantity: qty });
        }
      } catch { /* skip item */ }
    }
    if (appid === 570) dota2_cents = gameCents;
    else if (appid === 440) tf2_cents = gameCents;
    else rust_cents = gameCents;
  }

  top_items.sort((a, b) => (b.price_cents * b.quantity) - (a.price_cents * a.quantity));
  const total_cents = cs2_cents + dota2_cents + tf2_cents + rust_cents;
  return { total_cents, cs2_cents, dota2_cents, tf2_cents, rust_cents, top_items: top_items.slice(0, 50) };
}

// ── Sub-computation: Badges ─────────────────────────────────────────────────────
// Valuation: $0.10 per 100 XP (0.1 cents per XP).

async function computeBadgesValue(steamid: string) {
  const data = await steamFetch<{
    response: { badges?: { xp: number }[]; player_xp?: number };
  }>('/IPlayerService/GetBadges/v1', { steamid });

  const badges = data.response.badges ?? [];
  const total_xp = data.response.player_xp ?? badges.reduce((s, b) => s + (b.xp ?? 0), 0);
  const total_cents = Math.round(total_xp * 0.1);

  return { total_cents, badge_count: badges.length, priced_count: badges.length };
}

// ── Route ───────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const querySteamId = req.query.steamid as string | undefined;
  const steamid = (querySteamId && /^\d{17}$/.test(querySteamId))
    ? querySteamId
    : req.session.user!.steamid;
  try {
    // Each component is cached independently.
    // A failed inventory does not poison games/badges and is not cached —
    // the next request will retry while reusing the already-cached games/badges.
    const [gamesResult, inventoryResult, badgesResult] = await Promise.allSettled([
      withCache(`${steamid}:games-value`, TTL.LONG, () => computeGamesValue(steamid)),
      withCache(`${steamid}:inventory-value`, TTL.MEDIUM, () => computeInventoryValue(steamid)),
      withCache(`${steamid}:badges-value`, TTL.VERY_LONG, () => computeBadgesValue(steamid)),
    ]);

    if (inventoryResult.status === 'rejected') {
      console.error('[accountValue] inventory computation failed:', (inventoryResult.reason as Error).message);
    }

    const games = gamesResult.status === 'fulfilled' ? gamesResult.value
      : { total_cents: 0, game_count: 0, priced_count: 0, top_games: [] };
    const emptyInventory = { total_cents: 0, cs2_cents: 0, dota2_cents: 0, tf2_cents: 0, rust_cents: 0, top_items: [] as TopItem[] };
    const inventory = inventoryResult.status === 'fulfilled' ? inventoryResult.value : emptyInventory;
    const badges = badgesResult.status === 'fulfilled' ? badgesResult.value
      : { total_cents: 0, badge_count: 0, priced_count: 0 };

    res.json({
      games, inventory, badges,
      grand_total_cents: games.total_cents + inventory.total_cents + badges.total_cents,
      cached_at: Date.now(),
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
