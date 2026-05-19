import type { SteamUser, OwnedGamesResponse, InventoryResponse } from '../types/steam';

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

export async function getInventory(appid: number): Promise<InventoryResponse> {
  const res = await fetch(`${BASE}/api/inventory/${appid}`, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
