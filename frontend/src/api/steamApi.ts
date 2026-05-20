import type { SteamUser, OwnedGamesResponse, InventoryResponse, AccountValueData } from '../types/steam';

const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export async function getMe(): Promise<{ authenticated: boolean; user: SteamUser | null }> {
  const res = await fetch(`${BASE}/api/me`, { credentials: 'include' });
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
}

export async function getGames(): Promise<OwnedGamesResponse> {
  const res = await fetch(`${BASE}/api/games`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface RecentGame {
  appid: number;
  name: string;
  playtime_2weeks: number;
  playtime_forever: number;
  img_icon_url: string;
}

export async function getRecentGames(): Promise<{ total_count: number; games: RecentGame[] }> {
  const res = await fetch(`${BASE}/api/games/recent`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface Badge {
  badgeid: number;
  level: number;
  completion_time: number;
  xp: number;
  scarcity: number;
  appid?: number;
  communityitemid?: string;
  border_color?: number;
}

export interface LevelData {
  player_level: number;
  player_xp: number;
  player_xp_needed_to_level_up: number;
  player_xp_needed_current_level: number;
  badges: Badge[];
}

export async function getLevel(): Promise<LevelData> {
  const res = await fetch(`${BASE}/api/level`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface BanData {
  VACBanned: boolean;
  NumberOfVACBans: number;
  DaysSinceLastBan: number;
  NumberOfGameBans: number;
  EconomyBan: string;
  CommunityBanned: boolean;
}

export async function getBans(): Promise<BanData> {
  const res = await fetch(`${BASE}/api/bans`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getFriendCount(): Promise<number> {
  const res = await fetch(`${BASE}/api/friends`, { credentials: 'include' });
  if (!res.ok) return 0;
  const data = await res.json() as { friends?: unknown[] };
  return data.friends?.length ?? 0;
}

export interface FriendSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  personastate: number;
  communityvisibilitystate: number;
  realname?: string;
  gameextrainfo?: string;
  loccountrycode?: string;
  lastlogoff?: number;
}

export async function getFriends(): Promise<FriendSummary[]> {
  const res = await fetch(`${BASE}/api/friends/with-summaries`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

export interface GameMeta {
  genres: string[];
  price: number;
  is_free: boolean;
  ccu: number;
  positive: number;
  negative: number;
  owners: string;
}

// Resolves badge image URLs via GetAssetClassInfo. Pass communityitemids from badge data.
// Returns { [communityitemid]: full_image_url }
export async function getBadgeImages(communityitemids: string[]): Promise<Record<string, string>> {
  if (communityitemids.length === 0) return {};
  const qs = new URLSearchParams({ communityitemids: communityitemids.join(',') });
  const res = await fetch(`${BASE}/api/level/badge-images?${qs}`, { credentials: 'include' });
  if (!res.ok) return {};
  return res.json();
}

export interface UserProfileData {
  profile: {
    steamid: string; personaname: string; profileurl: string;
    avatar: string; avatarmedium: string; avatarfull: string;
    personastate: number; communityvisibilitystate: number;
    realname?: string; gameid?: string; gameextrainfo?: string;
    loccountrycode?: string; lastlogoff?: number;
  } | null;
  level: {
    player_level: number; player_xp: number;
    player_xp_needed_to_level_up: number; player_xp_needed_current_level: number;
    badges: Badge[];
  } | null;
  bans: {
    VACBanned: boolean; NumberOfVACBans: number; DaysSinceLastBan: number;
    NumberOfGameBans: number; EconomyBan: string; CommunityBanned: boolean;
  } | null;
  games: { game_count: number; games: { appid: number; name: string; playtime_forever: number; playtime_2weeks?: number; img_icon_url: string }[] } | null;
  recentGames: { total_count: number; games: { appid: number; name: string; playtime_2weeks: number; playtime_forever: number; img_icon_url: string }[] } | null;
  friendCount: number | null;
}

export async function getUserProfile(steamid: string): Promise<UserProfileData> {
  const res = await fetch(`${BASE}/api/user/${steamid}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getGameMeta(appids: number[]): Promise<Record<number, GameMeta>> {
  if (appids.length === 0) return {};
  const qs = new URLSearchParams({ appids: appids.join(',') });
  const res = await fetch(`${BASE}/api/games/meta?${qs}`, { credentials: 'include' });
  if (!res.ok) return {};
  // Backend returns string keys; coerce to number-indexed for convenience
  const raw = await res.json() as Record<string, GameMeta>;
  const out: Record<number, GameMeta> = {};
  for (const [k, v] of Object.entries(raw)) out[Number(k)] = v;
  return out;
}

export async function getInventory(appid: number): Promise<InventoryResponse> {
  const res = await fetch(`${BASE}/api/inventory/${appid}`, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getPublicInventory(steamid: string, appid: number): Promise<InventoryResponse> {
  const res = await fetch(`${BASE}/api/inventory/user/${steamid}/${appid}`, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface SteamPriceResult {
  lowest_price?: string;
  median_price?: string;
  volume?: string;
}

export async function getSteamPrice(appid: number, market_hash_name: string): Promise<SteamPriceResult> {
  const qs = new URLSearchParams({ appid: String(appid), market_hash_name });
  const res = await fetch(`${BASE}/api/price/steam?${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface SkinportPriceResult {
  min_price: number | null;
  suggested_price: number | null;
  quantity: number;
}

export interface PlayerSearchResult {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  personastate: number;
  communityvisibilitystate: number;
  realname?: string;
  gameid?: string;
  gameextrainfo?: string;
  loccountrycode?: string;
}

export async function searchUser(q: string): Promise<PlayerSearchResult[]> {
  const qs = new URLSearchParams({ q });
  const res = await fetch(`${BASE}/api/search?${qs}`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

// Fetches Skinport prices for a batch of CS2 items in a single request.
// Returns a map of market_hash_name → price data.
export async function getSkinportPrices(
  market_hash_names: string[]
): Promise<Record<string, SkinportPriceResult>> {
  if (market_hash_names.length === 0) return {};
  const qs = new URLSearchParams({ names: market_hash_names.join(',') });
  const res = await fetch(`${BASE}/api/price/skinport?${qs}`, { credentials: 'include' });
  if (!res.ok) return {};
  return res.json();
}

export async function getAccountValue(steamid?: string): Promise<AccountValueData> {
  const qs = steamid ? `?steamid=${encodeURIComponent(steamid)}` : '';
  const res = await fetch(`${BASE}/api/account-value${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getPublicFriends(steamid: string): Promise<FriendSummary[]> {
  const res = await fetch(`${BASE}/api/friends/for/${steamid}`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}
