import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { withCache, TTL } from '../services/cache';
import { steamFetch } from '../services/steamApi';

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

// ── Inventory fetch (shares cache keys with inventory.ts) ───────────────────────

async function fetchInventory(steamid: string, appid: number): Promise<InvResult> {
  const url = `https://steamcommunity.com/inventory/${steamid}/${appid}/2?l=english&count=2000`;
  const opts = {
    headers: { ...BROWSER_HEADERS, Referer: `https://steamcommunity.com/profiles/${steamid}/inventory/` },
  };
  let res = await fetch(url, opts);
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 5000));
    res = await fetch(url, opts);
  }
  if (!res.ok) throw new Error(`Inventory ${appid}: HTTP ${res.status}`);
  const data = await res.json() as { success?: number; assets?: InvAsset[]; descriptions?: InvDesc[] };
  if (!data.success) throw new Error(`Inventory ${appid}: Steam returned failure`);
  return { assets: data.assets ?? [], descriptions: data.descriptions ?? [] };
}

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

// ── Steam Market price per item (rate-limited: 1100ms between uncached fetches) ─

let lastSteamMarketFetch = 0;

function parseCents(priceStr: string): number {
  return Math.round(parseFloat(priceStr.replace(/[^0-9.]/g, '')) * 100);
}

async function fetchSteamMarketPrice(appid: number, market_hash_name: string): Promise<number | null> {
  return withCache<number | null>(
    `market:${appid}:${encodeURIComponent(market_hash_name)}`,
    TTL.LONG,
    async () => {
      const now = Date.now();
      const wait = 1100 - (now - lastSteamMarketFetch);
      if (lastSteamMarketFetch > 0 && wait > 0) await new Promise(r => setTimeout(r, wait));
      lastSteamMarketFetch = Date.now();

      const url =
        `https://steamcommunity.com/market/priceoverview/` +
        `?appid=${appid}&market_hash_name=${encodeURIComponent(market_hash_name)}&currency=1`;
      let res = await fetch(url, { headers: BROWSER_HEADERS });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        res = await fetch(url, { headers: BROWSER_HEADERS });
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
  const invResults = await Promise.all(APPIDS.map(async (appid) => {
    try {
      return await withCache<InvResult>(
        `inventory:${steamid}:${appid}:2`, TTL.SHORT,
        () => fetchInventory(steamid, appid)
      );
    } catch { return null; }
  }));

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

let lastBadgeCardFetch = 0;

async function computeBadgesValue(steamid: string) {
  const data = await steamFetch<{
    response: { badges?: { badgeid: number; appid?: number; level: number }[] };
  }>('/IPlayerService/GetBadges/v1', { steamid });

  const badges = (data.response.badges ?? []).filter(b => b.appid && b.appid > 0 && b.level > 0);
  const uniqueAppIds = [...new Set(badges.map(b => b.appid!))];

  const cardData = new Map<number, { card_count: number; median_price: number } | null>();

  for (const appid of uniqueAppIds) {
    const result = await withCache<{ card_count: number; median_price: number } | null>(
      `badge-cards:${appid}`, TTL.LONG, async () => {
        const now = Date.now();
        const wait = 500 - (now - lastBadgeCardFetch);
        if (lastBadgeCardFetch > 0 && wait > 0) await new Promise(r => setTimeout(r, wait));
        lastBadgeCardFetch = Date.now();

        try {
          const url =
            `https://steamcommunity.com/market/search/render/` +
            `?appid=753&category_753_item_class[]=tag_item_class_2` +
            `&category_753_Game[]=tag_Game_${appid}` +
            `&count=100&sort_column=price&sort_dir=asc&norender=0`;
          const res = await fetch(url, { headers: BROWSER_HEADERS });
          if (!res.ok) return null;
          const json = await res.json() as {
            success: boolean; total_count: number;
            results?: { sell_price: number }[];
          };
          if (!json.success || json.total_count === 0 || !json.results?.length) return null;
          const prices = json.results.map(r => r.sell_price).filter(p => p > 0).sort((a, b) => a - b);
          if (!prices.length) return null;
          return {
            card_count: json.results.length,
            median_price: prices[Math.floor(prices.length / 2)],
          };
        } catch { return null; }
      }
    );
    cardData.set(appid, result);
  }

  let total_cents = 0;
  let priced_count = 0;
  for (const badge of badges) {
    const cd = cardData.get(badge.appid!);
    if (cd) {
      total_cents += badge.level * cd.card_count * cd.median_price;
      priced_count++;
    }
  }

  return { total_cents, badge_count: badges.length, priced_count };
}

// ── Route ───────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const querySteamId = req.query.steamid as string | undefined;
  const steamid = (querySteamId && /^\d{17}$/.test(querySteamId))
    ? querySteamId
    : req.session.user!.steamid;
  try {
    const result = await withCache(`${steamid}:account-value`, TTL.LONG, async () => {
      const [games, inventory, badges] = await Promise.all([
        computeGamesValue(steamid),
        computeInventoryValue(steamid),
        computeBadgesValue(steamid),
      ]);
      return {
        games, inventory, badges,
        grand_total_cents: games.total_cents + inventory.total_cents + badges.total_cents,
        cached_at: Date.now(),
      };
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
