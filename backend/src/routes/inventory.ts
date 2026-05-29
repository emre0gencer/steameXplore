import { Router, type Request, type Response as ExpressResponse } from 'express';

type FetchResponse = globalThis.Response;
import { requireAuth } from '../middleware/requireAuth';
import { withCache, TTL, CooldownError } from '../services/cache';
import { withHostQueue, markHostThrottled } from '../services/httpQueue';

const router = Router();

const DEFAULT_CONTEXT_ID = '2';
const DEFAULT_COUNT = '2000';
const MAX_COUNT = 5000;
const STEAM_COMMUNITY_HOST = 'steamcommunity.com';
// Minimum gap between any two steamcommunity.com requests (inventory + market share this queue).
const STEAM_COMMUNITY_MIN_GAP_MS = 1500;
// On any 429 or rwgrsn:-2 from Steam, lock the whole host out for this long.
// Retrying inside a Steam burst-detect ban only extends the ban, so we fail fast
// and let the circuit breaker protect all subsequent appids.
const STEAM_THROTTLE_COOLDOWN_MS = 120_000;

type SteamInventoryPayload = {
  assets?: {
    appid: number;
    contextid: string;
    assetid: string;
    classid: string;
    instanceid: string;
    amount: string;
  }[];
  descriptions?: {
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
    fraudwarnings?: string[];
    tags?: {
      category: string;
      internal_name: string;
      localized_category_name: string;
      localized_tag_name: string;
      color?: string;
    }[];
  }[];
  total_inventory_count?: number;
  success?: number | boolean;
  more_items?: boolean;
  last_assetid?: string;
  error?: string;
  Error?: string;
  rwgrsn?: number;
};

type InventorySuccess = SteamInventoryPayload & {
  assets: NonNullable<SteamInventoryPayload['assets']>;
  descriptions: NonNullable<SteamInventoryPayload['descriptions']>;
};

function buildInventoryUrl(
  steamid: string,
  appid: string,
  contextid: string,
  count: string,
  startAssetId?: string
): string {
  const url = new URL(`https://steamcommunity.com/inventory/${steamid}/${appid}/${contextid}`);
  url.searchParams.set('l', 'english');
  url.searchParams.set('count', count);

  if (startAssetId) {
    url.searchParams.set('start_assetid', startAssetId);
  }

  return url.toString();
}

// Steam throttles inventory endpoints aggressively and sometimes returns 403/HTML to
// non-browser-looking requests even when an inventory is public in the browser.
// All fetches go through the shared steamcommunity.com queue so concurrent inventory
// requests (and market priceoverview lookups in accountValue.ts) can't burst together.
//
// IMPORTANT: we do NOT retry on 429. Steam's burst-detection ban grows every time we
// hit it while throttled — retrying makes the ban worse, not shorter. Instead, we trip
// the per-host circuit breaker so every subsequent queued fetch short-circuits with a
// CooldownError until Steam's window expires.
async function fetchInventoryPage(url: string, steamid: string): Promise<FetchResponse> {
  const fetchOptions: RequestInit = {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: `https://steamcommunity.com/profiles/${steamid}/inventory/`,
    },
  };

  const response = await withHostQueue(STEAM_COMMUNITY_HOST, STEAM_COMMUNITY_MIN_GAP_MS,
    () => fetch(url, fetchOptions));

  if (response.status === 429) {
    markHostThrottled(STEAM_COMMUNITY_HOST, STEAM_THROTTLE_COOLDOWN_MS);
  }

  return response;
}

async function parseSteamResponse(
  response: FetchResponse
): Promise<{ data?: SteamInventoryPayload; rawBody: string }> {
  const rawBody = await response.text();

  try {
    return { data: JSON.parse(rawBody) as SteamInventoryPayload, rawBody };
  } catch {
    return { rawBody };
  }
}

function steamFailureMessage(response: FetchResponse, data?: SteamInventoryPayload): string {
  const steamMessage = data?.error ?? data?.Error;

  if (response.status === 400) {
    return steamMessage
      ? `Steam rejected the inventory request: ${steamMessage}`
      : 'Steam rejected the inventory request. Check that the SteamID64, appid, contextid, and count are valid for this inventory.';
  }

  if (response.status === 403) {
    return steamMessage
      ? `Steam denied inventory access: ${steamMessage}`
      : 'Steam denied inventory access. The inventory may be private/friends-only, the app/context may be wrong, or Steam may be blocking this backend request.';
  }

  if (response.status === 429) {
    return 'Steam is throttling inventory requests. Try again later.';
  }

  return steamMessage ?? `Steam returned ${response.status} ${response.statusText}`;
}

export async function fetchFullInventory(
  steamid: string,
  appid: string,
  contextid: string,
  count: string
): Promise<InventorySuccess> {
  const assets: NonNullable<SteamInventoryPayload['assets']> = [];
  const descriptions: NonNullable<SteamInventoryPayload['descriptions']> = [];
  let firstPage: SteamInventoryPayload | null = null;
  let startAssetId: string | undefined;

  do {
    const url = buildInventoryUrl(steamid, appid, contextid, count, startAssetId);
    const response = await fetchInventoryPage(url, steamid);
    const { data, rawBody } = await parseSteamResponse(response);

    // rwgrsn:-2 is ambiguous — Steam returns it both for genuinely-empty inventories AND
    // as part of its burst-throttle response. Since a false "empty" for a populated game
    // (e.g. CS2 with items) is far worse than a false "throttled" for a truly empty one,
    // we treat it as throttle and trip the circuit breaker so the other appids in flight
    // don't pile on. Real empties will hit this every retry but at least won't mask a
    // real inventory behind a 404.
    if (data?.rwgrsn === -2) {
      markHostThrottled(STEAM_COMMUNITY_HOST, STEAM_THROTTLE_COOLDOWN_MS);
      throw new Error('Steam is throttling inventory requests (rwgrsn:-2). Try again later.');
    }

    if (!response.ok || !data || data.success === false || data.success === 0) {
      const rawSnippet = rawBody.slice(0, 250);
      throw new Error(
        `${steamFailureMessage(response, data)}${rawSnippet ? ` Raw Steam response: ${rawSnippet}` : ''}`
      );
    }

    if (!firstPage) {
      firstPage = data;
    }

    assets.push(...(data.assets ?? []));
    descriptions.push(...(data.descriptions ?? []));

    startAssetId = data.more_items ? data.last_assetid : undefined;
  } while (startAssetId);

  return {
    ...(firstPage ?? {}),
    assets,
    descriptions,
    success: firstPage?.success ?? 1,
  };
}

function getQueryValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getCount(value: unknown): string {
  const rawCount = getQueryValue(value, DEFAULT_COUNT);
  const parsed = Number(rawCount);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_COUNT;
  }

  return String(Math.min(Math.floor(parsed), MAX_COUNT));
}

async function handleInventoryRequest(
  req: Request,
  res: ExpressResponse,
  steamid: string,
  appid: string
) {
  const contextid = getQueryValue(req.query.contextid, DEFAULT_CONTEXT_ID);
  const count = getCount(req.query.count);

  try {
    const data = await withCache(
      `inventory:${steamid}:${appid}:${contextid}`,
      TTL.LONG,
      () => fetchFullInventory(steamid, appid, contextid, count)
    );
    return res.json(data);
  } catch (err) {
    // Cache-layer negative-cooldown: tell the client exactly how long to wait.
    if (err instanceof CooldownError) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
      return res.status(503).json({
        error: err.message,
        retry_after_seconds: err.retryAfterSeconds,
        steamid,
        appid,
        contextid,
        count,
      });
    }

    const message = (err as Error).message;
    const status = message.includes('throttling')
      ? 429
      : message.includes('denied')
        ? 403
        : message.includes('rejected')
          ? 400
          : message.includes('No inventory found')
            ? 404
            : 502;

    return res.status(status).json({
      error: message,
      steamid,
      appid,
      contextid,
      count,
    });
  }
}

// Public inventory for any SteamID64. This route does not need Steam login; it can
// only read what Steam exposes publicly for that account/app/context.
router.get('/user/:steamid/:appid', async (req, res) => {
  const { steamid, appid } = req.params;
  return handleInventoryRequest(req, res, steamid, appid);
});

// Backward-compatible route: inventory for the currently signed-in Steam user.
router.get('/:appid', requireAuth, async (req, res) => {
  const { steamid } = req.session.user!;
  const { appid } = req.params;
  return handleInventoryRequest(req, res, steamid, appid);
});

export default router;
