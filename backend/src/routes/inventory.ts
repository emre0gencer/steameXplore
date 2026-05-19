import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

const DEFAULT_CONTEXT_ID = '2';
const DEFAULT_COUNT = '2000';
const MAX_RETRY_SECONDS = 15;
const MAX_COUNT = 5000;

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
async function fetchInventoryPage(url: string, steamid: string): Promise<Response> {
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

  let response = await fetch(url, fetchOptions);

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? 5);
    const wait = Math.min(retryAfter, MAX_RETRY_SECONDS) * 1000;
    await new Promise((resolve) => setTimeout(resolve, wait));
    response = await fetch(url, fetchOptions);
  }

  return response;
}

async function parseSteamResponse(
  response: Response
): Promise<{ data?: SteamInventoryPayload; rawBody: string }> {
  const rawBody = await response.text();

  try {
    return { data: JSON.parse(rawBody) as SteamInventoryPayload, rawBody };
  } catch {
    return { rawBody };
  }
}

function steamFailureMessage(response: Response, data?: SteamInventoryPayload): string {
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

async function fetchFullInventory(
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
  res: Response,
  steamid: string,
  appid: string
) {
  const contextid = getQueryValue(req.query.contextid, DEFAULT_CONTEXT_ID);
  const count = getCount(req.query.count);

  try {
    const data = await fetchFullInventory(steamid, appid, contextid, count);
    return res.json(data);
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes('throttling')
      ? 429
      : message.includes('denied')
        ? 403
        : message.includes('rejected')
          ? 400
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
