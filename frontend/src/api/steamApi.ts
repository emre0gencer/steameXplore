import type { SteamUser } from '../types/steam';

const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export async function getMe(): Promise<{ authenticated: boolean; user: SteamUser | null }> {
  const res = await fetch(`${BASE}/api/me`, { credentials: 'include' });
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
}
