import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMe, logout, getGames, getRecentGames, getLevel, getBans, getFriendCount,
} from '../api/steamApi';
import type { SteamUser, OwnedGame } from '../types/steam';
import type { LevelData, BanData, RecentGame } from '../api/steamApi';

const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

const C = {
  bg: '#1b2838',
  nav: '#171a21',
  surface: '#2a475e',
  card: '#16202d',
  accent: '#66c0f4',
  green: '#5ba32b',
  red: '#c0392b',
  text: '#c6d4df',
  muted: '#8f98a0',
  border: '#3d5a6c',
  dim: '#3a3a4a',
};

function fmt(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 1000) return `${h.toLocaleString()}h`;
  return `${(h / 1000).toFixed(1)}k h`;
}

function NavLink({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 'none',
      borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
      color: active ? C.text : C.muted,
      padding: '0 12px', height: '52px', cursor: 'pointer',
      fontSize: '13px', fontFamily: 'inherit', letterSpacing: '0.3px',
      transition: 'color 0.12s', boxSizing: 'border-box',
    }}>{label}</button>
  );
}

function StatCard({ value, label, sub, ghost }: { value: string | number; label: string; sub?: string; ghost?: boolean }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: '4px',
      padding: '16px 20px', flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: '26px', fontWeight: 700, color: ghost ? C.dim : C.accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '12px', color: ghost ? C.muted : C.text, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: C.muted }}>{title}</span>
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  );
}

function GhostBar() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
      <div style={{ width: '20px', height: '20px', borderRadius: '2px', background: C.surface, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <div style={{ height: '10px', width: '45%', background: C.surface, borderRadius: '2px' }} />
          <div style={{ height: '10px', width: '12%', background: C.surface, borderRadius: '2px' }} />
        </div>
        <div style={{ height: '4px', background: C.surface, borderRadius: '2px' }} />
      </div>
    </div>
  );
}

function GhostRow() {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
      <div style={{ width: '24px', height: '24px', borderRadius: '3px', background: C.surface, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: '11px', width: '55%', background: C.surface, borderRadius: '2px', marginBottom: '5px' }} />
        <div style={{ height: '9px', width: '35%', background: C.surface, borderRadius: '2px' }} />
      </div>
    </div>
  );
}

function GameBar({ game, max }: { game: OwnedGame; max: number }) {
  const pct = max > 0 ? (game.playtime_forever / max) * 100 : 0;
  const iconUrl = game.img_icon_url
    ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
    : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
      {iconUrl
        ? <img src={iconUrl} alt="" style={{ width: '20px', height: '20px', borderRadius: '2px', flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : <div style={{ width: '20px', height: '20px', flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span style={{ fontSize: '12px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{game.name}</span>
          <span style={{ fontSize: '12px', color: C.muted, flexShrink: 0 }}>{fmt(game.playtime_forever)}</span>
        </div>
        <div style={{ height: '4px', background: '#0e1923', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: C.accent, borderRadius: '2px', transition: 'width 0.6s ease' }} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<SteamUser | null>(null);
  const [games, setGames] = useState<{ game_count: number; games: OwnedGame[] } | null>(null);
  const [recent, setRecent] = useState<RecentGame[] | null>(null);
  const [level, setLevel] = useState<LevelData | null>(null);
  const [bans, setBans] = useState<BanData | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(({ authenticated: auth, user: u }) => {
      setAuthenticated(auth);
      if (!auth) return;
      setUser(u);
      getGames().then(setGames).catch(() => {});
      getRecentGames().then((d) => setRecent(d.games ?? [])).catch(() => setRecent([]));
      getLevel().then(setLevel).catch(() => {});
      getBans().then(setBans).catch(() => {});
      getFriendCount().then(setFriendCount).catch(() => {});
    });
  }, []);

  const handleLogout = async () => { await logout(); setAuthenticated(false); setUser(null); setGames(null); setRecent(null); setLevel(null); setBans(null); setFriendCount(null); };
  const handleLogin = () => { window.location.href = `${BASE}/auth/steam`; };

  // Derived stats (authenticated)
  const totalMins = games?.games.reduce((s, g) => s + g.playtime_forever, 0) ?? 0;
  const playedGames = games?.games.filter((g) => g.playtime_forever > 0) ?? [];
  const topGames = [...playedGames].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 8);
  const maxPlaytime = topGames[0]?.playtime_forever ?? 1;
  const badgeCount = level?.badges.length ?? 0;
  const xpCurrent = level ? (level.player_xp - level.player_xp_needed_current_level) : 0;
  const xpNeeded = level ? level.player_xp_needed_to_level_up : 0;
  const xpPct = xpNeeded > 0 ? Math.min((xpCurrent / xpNeeded) * 100, 100) : 0;
  const vacStatus = bans ? (bans.VACBanned || bans.NumberOfGameBans > 0 || bans.CommunityBanned ? 'flagged' : 'clean') : null;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: '"Motiva Sans", Arial, sans-serif' }}>

      {/* Nav */}
      <div style={{ background: C.nav, borderBottom: '1px solid #000', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '8px', height: '52px', boxSizing: 'border-box' }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: '17px', marginRight: '16px', letterSpacing: '0.5px' }}>steameXplore</span>
        <NavLink label="Dashboard" onClick={() => {}} active={true} />
        <NavLink label="Inventory" onClick={() => navigate('/inventory')} active={false} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {authenticated && user ? (
            <>
              <img src={user.avatar.small} alt="" style={{ width: '28px', height: '28px', borderRadius: '3px' }} />
              <span style={{ fontSize: '13px', color: C.text }}>{user.displayName}</span>
              <button onClick={handleLogout} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '4px 12px', cursor: 'pointer', borderRadius: '2px', fontSize: '12px', fontFamily: 'inherit' }}>
                Sign Out
              </button>
            </>
          ) : (
            <button onClick={handleLogin} style={{
              background: 'linear-gradient(180deg, #4c7a2e 0%, #3a5e22 100%)',
              border: '1px solid #2a4418', color: '#fff',
              padding: '6px 16px', cursor: 'pointer', borderRadius: '3px',
              fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.3px',
            }}>
              Sign in through Steam
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Profile hero */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '24px', display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {authenticated && user
              ? <img src={user.avatar.large} alt="avatar" style={{ borderRadius: '4px', width: '100px', height: '100px', display: 'block' }} />
              : <div style={{ width: '100px', height: '100px', borderRadius: '4px', background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                </div>
            }
            {level && (
              <div style={{ position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)', background: C.surface, border: `2px solid ${C.accent}`, borderRadius: '12px', padding: '1px 10px', fontSize: '12px', fontWeight: 700, color: C.accent, whiteSpace: 'nowrap' }}>
                Lvl {level.player_level}
              </div>
            )}
            {!authenticated && (
              <div style={{ position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)', background: C.surface, border: `2px solid ${C.dim}`, borderRadius: '12px', padding: '1px 10px', fontSize: '12px', fontWeight: 700, color: C.muted, whiteSpace: 'nowrap' }}>
                Lvl —
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: authenticated && user ? C.text : C.muted }}>
                {authenticated && user ? user.displayName : 'Your Steam Profile'}
              </h1>
              {vacStatus === 'clean' && <span style={{ fontSize: '11px', color: C.green, border: `1px solid ${C.green}55`, borderRadius: '3px', padding: '1px 7px', fontWeight: 600 }}>VAC Clean</span>}
              {vacStatus === 'flagged' && <span style={{ fontSize: '11px', color: C.red, border: `1px solid ${C.red}55`, borderRadius: '3px', padding: '1px 7px', fontWeight: 600 }}>⚠ Banned</span>}
            </div>
            <div style={{ marginTop: '8px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {authenticated && user ? (
                <>
                  <span style={{ fontSize: '12px', color: C.muted }}><span style={{ color: C.text }}>SteamID</span>&nbsp; {user.steamid}</span>
                  <span style={{ fontSize: '12px', color: C.muted }}><span style={{ color: C.text }}>Profile</span>&nbsp; <a href={user.profileUrl} target="_blank" rel="noreferrer" style={{ color: C.accent, textDecoration: 'none' }}>{user.profileUrl}</a></span>
                  <span style={{ fontSize: '12px', color: user.visibility === 3 ? C.green : C.muted }}>{user.visibility === 3 ? 'Public' : 'Private'}</span>
                </>
              ) : (
                <span style={{ fontSize: '13px', color: C.muted }}>Sign in to load your Steam profile and stats.</span>
              )}
            </div>

            {/* XP bar */}
            <div style={{ marginTop: '14px' }}>
              {authenticated && level ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.muted, marginBottom: '4px' }}>
                    <span>{level.player_xp.toLocaleString()} XP total</span>
                    <span>{xpCurrent.toLocaleString()} / {xpNeeded.toLocaleString()} XP to level {level.player_level + 1}</span>
                  </div>
                  <div style={{ height: '6px', background: '#0e1923', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${xpPct}%`, background: `linear-gradient(90deg, ${C.accent}, #4fa3d4)`, borderRadius: '3px', transition: 'width 0.8s ease' }} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ height: '11px', width: '40%', background: C.surface, borderRadius: '2px', marginBottom: '6px' }} />
                  <div style={{ height: '6px', background: C.surface, borderRadius: '3px' }} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stat row */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <StatCard value={games ? games.game_count.toLocaleString() : '—'} label="Games owned" sub={games ? `${playedGames.length.toLocaleString()} played` : undefined} ghost={!authenticated} />
          <StatCard value={games ? fmt(totalMins) : '—'} label="Total playtime" sub={games ? `${Math.round(totalMins / 60 / 24).toLocaleString()} days` : undefined} ghost={!authenticated} />
          <StatCard value={friendCount != null ? friendCount.toLocaleString() : '—'} label="Friends" ghost={!authenticated} />
          <StatCard value={level ? badgeCount.toLocaleString() : '—'} label="Badges" sub={level ? `Level ${level.player_level}` : undefined} ghost={!authenticated} />
        </div>

        {/* Main two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          <Section title="Most Played">
            {!authenticated
              ? [0,1,2,3,4,5,6,7].map((i) => <GhostBar key={i} />)
              : topGames.length === 0
                ? <span style={{ color: C.muted, fontSize: '13px' }}>No playtime data available.</span>
                : topGames.map((g) => <GameBar key={g.appid} game={g} max={maxPlaytime} />)
            }
          </Section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            <Section title="Recent Activity (Last 2 Weeks)">
              {!authenticated
                ? [0,1,2,3].map((i) => <GhostRow key={i} />)
                : recent === null
                  ? <span style={{ color: C.muted, fontSize: '13px' }}>Loading…</span>
                  : recent.length === 0
                    ? <span style={{ color: C.muted, fontSize: '13px' }}>No games played in the last 2 weeks.</span>
                    : recent.map((g) => {
                        const iconUrl = g.img_icon_url ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg` : null;
                        return (
                          <div key={g.appid} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                            {iconUrl && <img src={iconUrl} alt="" style={{ width: '24px', height: '24px', borderRadius: '3px', flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                              <div style={{ fontSize: '11px', color: C.muted }}>{fmt(g.playtime_2weeks)} this period · {fmt(g.playtime_forever)} total</div>
                            </div>
                          </div>
                        );
                      })
              }
            </Section>

            <Section title="Account Status">
              {!authenticated
                ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {['VAC Bans', 'Game Bans', 'Economy Ban', 'Community Ban'].map((label) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: C.muted }}>{label}</span>
                        <span style={{ color: C.dim, fontWeight: 600 }}>—</span>
                      </div>
                    ))}
                  </div>
                )
                : bans ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <StatusRow label="VAC Bans" value={bans.VACBanned ? `${bans.NumberOfVACBans} ban(s)` : 'None'} ok={!bans.VACBanned} />
                    <StatusRow label="Game Bans" value={bans.NumberOfGameBans > 0 ? `${bans.NumberOfGameBans} ban(s)` : 'None'} ok={bans.NumberOfGameBans === 0} />
                    <StatusRow label="Economy Ban" value={bans.EconomyBan === 'none' ? 'None' : bans.EconomyBan} ok={bans.EconomyBan === 'none'} />
                    <StatusRow label="Community Ban" value={bans.CommunityBanned ? 'Yes' : 'No'} ok={!bans.CommunityBanned} />
                    {bans.VACBanned && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>Last ban: {bans.DaysSinceLastBan} days ago</div>}
                  </div>
                ) : (
                  <span style={{ color: C.muted, fontSize: '13px' }}>Loading…</span>
                )
              }
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: ok ? C.green : C.red, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
