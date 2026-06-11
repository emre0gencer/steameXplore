import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMe, logout, getGames, getRecentGames, getLevel, getBans, getFriendCount,
  getFriends, getGameMeta, getBadgeImages, getAccountValue, getSkinportPrices,
  getPublicFriends, getUserProfile,
} from '../api/steamApi';
import type { FriendSummary, GameMeta, Badge, SkinportPriceResult } from '../api/steamApi';
import type { SteamUser, OwnedGame, AccountValueData } from '../types/steam';
import type { LevelData, BanData, RecentGame } from '../api/steamApi';

const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

const C = {
  bg: '#1b2838', nav: '#171a21', surface: '#2a475e', card: '#16202d',
  accent: '#66c0f4', green: '#5ba32b', red: '#c0392b', gold: '#c6b74e',
  text: '#c6d4df', muted: '#8f98a0', border: '#3d5a6c', dim: '#3a3a4a',
};

const PIE_COLORS = [
  '#66c0f4','#5ba32b','#c6b74e','#e74c3c','#9b59b6',
  '#e67e22','#1abc9c','#e91e63','#3498db','#f39c12',
  '#00bcd4','#8bc34a','#ff5722','#607d8b','#795548',
];

const PERSONA_LABEL = ['Offline','Online','Busy','Away','Snooze','Looking to Trade','Looking to Play'];
const PERSONA_COLOR = ['#8f98a0','#57cbde','#c02942','#c6b74e','#c6b74e','#57cbde','#57cbde'];

function fmt(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 1000) return `${h.toLocaleString()}h`;
  return `${(h / 1000).toFixed(1)}k h`;
}

function fmtDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

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

function StatCard({ value, label, sub, ghost, onClick }: {
  value: string | number; label: string; sub?: string; ghost?: boolean; onClick?: () => void;
}) {
  const [hov, setHov] = useState(false);
  const clickable = !!onClick && !ghost;
  return (
    <div
      onClick={clickable ? onClick : undefined}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: C.card, border: `1px solid ${clickable && hov ? C.accent : C.border}`,
        borderRadius: '4px', padding: '16px 20px', flex: 1, minWidth: 0,
        cursor: clickable ? 'pointer' : 'default', transition: 'border-color 0.12s',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: '26px', fontWeight: 700, color: ghost ? C.dim : C.accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '12px', color: ghost ? C.muted : C.text, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        {label}
        {clickable && <span style={{ color: C.muted, fontSize: '11px', marginLeft: '5px' }}>↗</span>}
      </div>
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

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: ok ? C.green : C.red, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ── Overlay shell — FIXED height so panels never shift ─────────────────────────

function Overlay({ title, subtitle, onClose, children, width = 860 }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px',
          width: '100%', maxWidth: `${width}px`,
          height: '84vh',           // fixed — never shrinks/grows with content
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Fixed header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', background: C.surface,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</span>
            {subtitle && <div style={{ fontSize: '12px', color: C.muted, marginTop: '3px' }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px 6px', fontFamily: 'inherit' }}>✕</button>
        </div>
        {/* Child panels manage their own controls + scroll area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Friends Panel ─────────────────────────────────────────────────────────────

function FriendsPanel({ onClose, steamid }: { onClose: () => void; steamid?: string }) {
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (steamid ? getPublicFriends(steamid) : getFriends())
      .then(setFriends).catch(() => setFriends([]));
  }, [steamid]);

  const filtered = (friends ?? [])
    .filter(f => f.personaname.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aOn = a.personastate > 0 ? 1 : 0, bOn = b.personastate > 0 ? 1 : 0;
      return bOn - aOn || a.personaname.localeCompare(b.personaname);
    });

  const online = filtered.filter(f => f.personastate > 0);
  const offline = filtered.filter(f => f.personastate === 0);

  const handleFriendClick = (f: FriendSummary) => {
    onClose();
    navigate(`/user/${f.steamid}`);
  };

  return (
    <>
      {/* Fixed search bar */}
      <div style={{ flexShrink: 0, padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by display name..."
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#1b3a52', border: `1px solid ${C.border}`, borderRadius: '3px',
            color: C.text, fontSize: '13px', padding: '8px 12px',
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        {friends !== null && (
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '6px' }}>
            {online.length} online · {offline.length} offline
          </div>
        )}
      </div>

      {/* Scrollable friend list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', minHeight: 0 }}>
        {friends === null && (
          <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', paddingTop: '24px' }}>Loading friends…</div>
        )}
        {friends !== null && filtered.length === 0 && (
          <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', paddingTop: '24px' }}>
            {search ? `No friends matching "${search}"` : 'No friends found — list may be private.'}
          </div>
        )}

        {[{ label: `Online (${online.length})`, list: online }, { label: `Offline (${offline.length})`, list: offline }].map(group =>
          group.list.length === 0 ? null : (
            <div key={group.label} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, marginBottom: '6px', fontWeight: 700 }}>
                {group.label}
              </div>
              {group.list.map(f => {
                const state = Math.min(f.personastate, PERSONA_LABEL.length - 1);
                return (
                  <div
                    key={f.steamid}
                    onClick={() => handleFriendClick(f)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '7px 10px', borderRadius: '3px', marginBottom: '2px',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1e3147')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={f.avatar} alt="" style={{ width: '36px', height: '36px', borderRadius: '3px', display: 'block' }} />
                      <span style={{
                        position: 'absolute', bottom: '1px', right: '1px',
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: PERSONA_COLOR[state], border: '1.5px solid #16202d', display: 'block',
                      }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.personaname}</div>
                      <div style={{ fontSize: '11px', color: f.gameextrainfo ? C.accent : PERSONA_COLOR[state] }}>
                        {f.gameextrainfo ? `Playing ${f.gameextrainfo}` : PERSONA_LABEL[state]}
                      </div>
                    </div>
                    {f.loccountrycode && (
                      <span style={{ fontSize: '13px', flexShrink: 0 }}>
                        {String.fromCodePoint(...[...f.loccountrycode.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)))}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: C.muted, flexShrink: 0 }}>View →</span>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </>
  );
}

// ── Badges Panel ──────────────────────────────────────────────────────────────

function BadgeRow({ b, src, name }: { b: Badge; src: string | null; name: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!src && !imgFailed;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
      {showImg && (
        <img
          src={src!} alt=""
          style={{ width: '72px', height: '72px', objectFit: 'contain', flexShrink: 0 }}
          onError={() => setImgFailed(true)}
        />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{name}</div>
        <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>Level {b.level} · {b.xp.toLocaleString()} XP</div>
        <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>Unlocked {fmtDate(b.completion_time)}</div>
        {b.scarcity != null && (
          <div style={{ fontSize: '11px', color: C.border, marginTop: '2px' }}>{b.scarcity.toLocaleString()} owners</div>
        )}
      </div>
    </div>
  );
}

function BadgesPanel({ badges, onClose, gameNames }: { badges: Badge[]; onClose: () => void; gameNames: Record<number, string> }) {
  const [imgMap, setImgMap] = useState<Record<string, { url: string; name: string | null }>>({});

  useEffect(() => {
    const ids = badges.map(b => b.communityitemid).filter(Boolean) as string[];
    if (ids.length === 0) return;
    getBadgeImages(ids).then(setImgMap).catch(() => {});
  }, [badges]);

  const sorted = [...badges].sort((a, b) => b.completion_time - a.completion_time);

  // Group badges by game (appid) or 0 for community badges, preserving newest-first order within each group
  const groups = new Map<number, { label: string; badges: Badge[] }>();
  for (const b of sorted) {
    const key = b.appid ?? 0;
    if (!groups.has(key)) {
      groups.set(key, {
        label: b.appid ? (gameNames[b.appid] ?? 'Steam Game') : 'Steam Community',
        badges: [],
      });
    }
    groups.get(key)!.badges.push(b);
  }

  function badgeImg(b: Badge): string | null {
    if (b.communityitemid && imgMap[b.communityitemid]?.url) return imgMap[b.communityitemid].url;
    if (b.appid) return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${b.appid}/badge_${b.level}.png`;
    return `https://community.cloudflare.steamstatic.com/public/images/badges/${b.badgeid}/${b.level}_80px.png`;
  }

  function badgeName(b: Badge): string {
    if (b.communityitemid && imgMap[b.communityitemid]?.name) return imgMap[b.communityitemid].name!;
    if (b.appid) return `${gameNames[b.appid] ?? 'Badge'} — Level ${b.level}`;
    return 'Community Badge';
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {[...groups.entries()].map(([key, group]) => (
        <div key={key}>
          <div style={{
            padding: '10px 20px',
            background: C.nav,
            borderBottom: `1px solid ${C.border}`,
            borderTop: `1px solid ${C.border}`,
            fontSize: '15px',
            fontWeight: 700,
            color: C.text,
          }}>
            {group.label}
          </div>
          {group.badges.map((b, i) => (
            <BadgeRow
              key={`${b.badgeid}_${b.appid ?? 'c'}_${i}`}
              b={b}
              src={badgeImg(b)}
              name={badgeName(b)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Playtime Charts ───────────────────────────────────────────────────────────

type ChartView = 'bar' | 'pie' | 'treemap' | 'list';

function PieChart({ data, total }: { data: OwnedGame[]; total: number }) {
  const cx = 140, cy = 140, r = 120;
  let angle = -90;
  const slices = data.map((g, i) => {
    const pct = g.playtime_forever / total;
    const sweep = pct * 360;
    const start = angle;
    angle += sweep;
    return { g, pct, sweep, start, color: PIE_COLORS[i % PIE_COLORS.length] };
  });
  function arc(startDeg: number, sweepDeg: number, radius: number) {
    const rad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(rad(startDeg));
    const y1 = cy + radius * Math.sin(rad(startDeg));
    const x2 = cx + radius * Math.cos(rad(startDeg + sweepDeg));
    const y2 = cy + radius * Math.sin(rad(startDeg + sweepDeg));
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
  }
  return (
    <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <svg width={280} height={280} viewBox="0 0 280 280" style={{ flexShrink: 0 }}>
        {slices.map(s => <path key={s.g.appid} d={arc(s.start, s.sweep, r)} fill={s.color} stroke={C.bg} strokeWidth={1.5} />)}
        <circle cx={cx} cy={cy} r={50} fill={C.bg} />
        <text x={cx} y={cy - 6} textAnchor="middle" fill={C.text} fontSize={13} fontWeight={700}>{data.length}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill={C.muted} fontSize={10}>games</text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {slices.map(s => (
          <div key={s.g.appid} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.g.name}</span>
            <span style={{ fontSize: '12px', color: C.muted, flexShrink: 0 }}>{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data, max }: { data: OwnedGame[]; max: number }) {
  return (
    <div>
      {data.map(g => {
        const pct = max > 0 ? (g.playtime_forever / max) * 100 : 0;
        const icon = g.img_icon_url
          ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
          : null;
        return (
          <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '9px' }}>
            {icon
              ? <img src={icon} alt="" style={{ width: '20px', height: '20px', borderRadius: '2px', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <div style={{ width: '20px', height: '20px', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '12px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '74%' }}>{g.name}</span>
                <span style={{ fontSize: '12px', color: C.muted, flexShrink: 0 }}>{fmt(g.playtime_forever)}</span>
              </div>
              <div style={{ height: '4px', background: '#0e1923', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: C.accent, borderRadius: '2px', transition: 'width 0.5s ease' }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Treemap({ data, total }: { data: OwnedGame[]; total: number }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
      {data.map((g, i) => {
        const pct = total > 0 ? (g.playtime_forever / total) * 100 : 0;
        return (
          <div key={g.appid} title={`${g.name} — ${fmt(g.playtime_forever)} (${pct.toFixed(1)}%)`} style={{
            flexGrow: Math.max(3, pct), flexShrink: 0, flexBasis: `${Math.max(3, pct)}%`,
            minWidth: '52px', height: '72px',
            background: PIE_COLORS[i % PIE_COLORS.length] + '2a',
            border: `1px solid ${PIE_COLORS[i % PIE_COLORS.length]}66`,
            borderRadius: '3px', padding: '6px', boxSizing: 'border-box',
            overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: '11px', color: C.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
            <div style={{ fontSize: '10px', color: PIE_COLORS[i % PIE_COLORS.length] }}>{fmt(g.playtime_forever)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ data, total }: { data: OwnedGame[]; total: number }) {
  return (
    <div>
      {data.map((g, i) => {
        const pct = total > 0 ? (g.playtime_forever / total) * 100 : 0;
        return (
          <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 10px', borderRadius: '3px', marginBottom: '2px' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1e3147')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ width: '26px', textAlign: 'right', fontSize: '12px', color: C.muted, flexShrink: 0 }}>#{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: '13px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
            <div style={{ fontSize: '12px', color: C.muted, flexShrink: 0 }}>{pct.toFixed(1)}%</div>
            <div style={{ fontSize: '12px', color: C.accent, fontWeight: 600, flexShrink: 0, minWidth: '52px', textAlign: 'right' }}>{fmt(g.playtime_forever)}</div>
          </div>
        );
      })}
    </div>
  );
}

function PlaytimePanel({ games, onClose }: { games: OwnedGame[]; onClose: () => void }) {
  const [view, setView] = useState<ChartView>('bar');
  const played = [...games].filter(g => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever);
  const total = played.reduce((s, g) => s + g.playtime_forever, 0);
  const top = played.slice(0, 15);
  const othersTime = played.slice(15).reduce((s, g) => s + g.playtime_forever, 0);
  const pieData = othersTime > 0
    ? [...top, { appid: -1, name: 'Others', playtime_forever: othersTime, img_icon_url: '' }]
    : top;

  const VIEWS: { key: ChartView; label: string }[] = [
    { key: 'bar', label: 'Bar Graph' }, { key: 'pie', label: 'Pie Chart' },
    { key: 'treemap', label: 'Treemap' }, { key: 'list', label: 'Ranked List' },
  ];

  return (
    <>
      {/* Fixed view switcher */}
      <div style={{ flexShrink: 0, padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg, display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        {VIEWS.map(v => (
          <button key={v.key} onClick={() => setView(v.key)} style={{
            background: view === v.key ? C.surface : 'transparent',
            border: `1px solid ${view === v.key ? C.accent : C.border}`,
            color: view === v.key ? C.text : C.muted,
            padding: '5px 14px', borderRadius: '3px', cursor: 'pointer',
            fontSize: '12px', fontFamily: 'inherit',
          }}>{v.label}</button>
        ))}
        <span style={{ fontSize: '12px', color: C.muted, marginLeft: '4px' }}>{played.length} games · {fmt(total)} total</span>
      </div>
      {/* Scrollable chart */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', minHeight: 0 }}>
        {view === 'bar' && <BarChart data={played} max={played[0]?.playtime_forever ?? 1} />}
        {view === 'pie' && <PieChart data={pieData} total={total} />}
        {view === 'treemap' && <Treemap data={played.slice(0, 40)} total={total} />}
        {view === 'list' && <ListView data={played} total={total} />}
      </div>
    </>
  );
}

// ── Games Panel ───────────────────────────────────────────────────────────────

type SortKey = 'playtime_desc' | 'playtime_asc' | 'name_asc' | 'name_desc' | 'recent' | 'ccu_desc' | 'ccu_asc';
type PlayedFilter = 'all' | 'played' | 'never';
type PriceFilter = 'all' | 'free' | '0-5' | '5-15' | '15-25' | '25+';

function priceMatch(meta: GameMeta | undefined, f: PriceFilter): boolean {
  if (f === 'all') return true;
  if (!meta) return true;
  const p = meta.price;
  if (f === 'free') return meta.is_free || p === 0;
  if (f === '0-5') return p > 0 && p <= 500;
  if (f === '5-15') return p > 500 && p <= 1500;
  if (f === '15-25') return p > 1500 && p <= 2500;
  if (f === '25+') return p > 2500;
  return true;
}

function GamesPanel({ games, onClose }: { games: OwnedGame[]; onClose: () => void }) {
  const [meta, setMeta] = useState<Record<number, GameMeta>>({});
  const [metaLoading, setMetaLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('playtime_desc');
  const [played, setPlayed] = useState<PlayedFilter>('all');
  const [genre, setGenre] = useState('all');
  const [price, setPrice] = useState<PriceFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const topIds = [...games].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 40).map(g => g.appid);
    getGameMeta(topIds).then(d => setMeta(d)).catch(() => {}).finally(() => setMetaLoading(false));
  }, [games]);

  const allGenres = [...new Set(Object.values(meta).flatMap(m => m.genres))].sort();

  let list = games;
  if (search) list = list.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
  if (played === 'played') list = list.filter(g => g.playtime_forever > 0);
  if (played === 'never') list = list.filter(g => g.playtime_forever === 0);
  if (genre !== 'all') list = list.filter(g => meta[g.appid]?.genres.includes(genre));
  if (price !== 'all') list = list.filter(g => priceMatch(meta[g.appid], price));

  const sorted = [...list].sort((a, b) => {
    if (sort === 'playtime_desc') return b.playtime_forever - a.playtime_forever;
    if (sort === 'playtime_asc') return a.playtime_forever - b.playtime_forever;
    if (sort === 'name_asc') return a.name.localeCompare(b.name);
    if (sort === 'name_desc') return b.name.localeCompare(a.name);
    if (sort === 'recent') return (b.playtime_2weeks ?? 0) - (a.playtime_2weeks ?? 0);
    if (sort === 'ccu_desc') return (meta[b.appid]?.ccu ?? 0) - (meta[a.appid]?.ccu ?? 0);
    if (sort === 'ccu_asc') return (meta[a.appid]?.ccu ?? 0) - (meta[b.appid]?.ccu ?? 0);
    return 0;
  });

  const selBtn = (active: boolean): React.CSSProperties => ({
    background: active ? C.surface : 'transparent',
    border: `1px solid ${active ? C.accent : C.border}`,
    color: active ? C.text : C.muted,
    padding: '4px 10px', borderRadius: '3px', cursor: 'pointer',
    fontSize: '12px', fontFamily: 'inherit',
  });

  const selStyle: React.CSSProperties = {
    background: C.card, border: `1px solid ${C.border}`, color: C.text,
    fontSize: '12px', padding: '5px 8px', borderRadius: '3px',
    fontFamily: 'inherit', outline: 'none',
  };

  return (
    <>
      {/* Fixed controls */}
      <div style={{ flexShrink: 0, padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search games..."
            style={{ background: '#1b3a52', border: `1px solid ${C.border}`, borderRadius: '3px', color: C.text, fontSize: '12px', padding: '5px 10px', fontFamily: 'inherit', outline: 'none', width: '150px' }}
          />
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['all', 'played', 'never'] as PlayedFilter[]).map(v => (
              <button key={v} onClick={() => setPlayed(v)} style={selBtn(played === v)}>
                {v === 'all' ? 'All' : v === 'played' ? 'Played' : 'Never played'}
              </button>
            ))}
          </div>
          <select value={genre} onChange={e => setGenre(e.target.value)} style={selStyle}>
            <option value="all">All Genres</option>
            {allGenres.map(g => <option key={g} value={g}>{g}</option>)}
            {metaLoading && <option disabled>Loading…</option>}
          </select>
          <select value={price} onChange={e => setPrice(e.target.value as PriceFilter)} style={selStyle}>
            {(['all','free','0-5','5-15','15-25','25+'] as PriceFilter[]).map(v => (
              <option key={v} value={v}>{{ all:'All Prices', free:'Free', '0-5':'$0–5', '5-15':'$5–15', '15-25':'$15–25', '25+':'$25+' }[v]}</option>
            ))}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={selStyle}>
            <option value="playtime_desc">Playtime ↓</option>
            <option value="playtime_asc">Playtime ↑</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="recent">Recently Played</option>
            <option value="ccu_desc">Active Players ↓</option>
            <option value="ccu_asc">Active Players ↑</option>
          </select>
          <span style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>{sorted.length} results</span>
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* Column header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 20px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.nav, zIndex: 1 }}>
          <div style={{ width: '22px' }} />
          <div style={{ width: '24px' }} />
          <div style={{ flex: 1, fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Game</div>
          <div style={{ fontSize: '10px', color: C.muted, minWidth: '60px', textAlign: 'right' }}>Players</div>
          <div style={{ fontSize: '10px', color: C.muted, minWidth: '36px', textAlign: 'right' }}>Score</div>
          <div style={{ fontSize: '10px', color: C.muted, minWidth: '48px', textAlign: 'right' }}>Price</div>
          <div style={{ fontSize: '10px', color: C.muted, minWidth: '52px', textAlign: 'right' }}>Playtime</div>
        </div>

        <div style={{ padding: '4px 10px' }}>
          {sorted.map((g, i) => {
            const m = meta[g.appid];
            const icon = g.img_icon_url
              ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
              : null;
            const reviewPct = m && (m.positive + m.negative) > 0
              ? Math.round((m.positive / (m.positive + m.negative)) * 100) : null;
            const reviewColor = reviewPct == null ? C.muted : reviewPct >= 70 ? C.green : reviewPct >= 40 ? C.gold : C.red;
            return (
              <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '7px 10px', borderRadius: '3px', marginBottom: '1px' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1e3147')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: '22px', textAlign: 'right', fontSize: '11px', color: C.border, flexShrink: 0 }}>#{i + 1}</div>
                {icon
                  ? <img src={icon} alt="" style={{ width: '24px', height: '24px', borderRadius: '2px', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <div style={{ width: '24px', height: '24px', background: C.surface, borderRadius: '2px', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                  {m?.genres.length ? <div style={{ fontSize: '10px', color: C.muted }}>{m.genres.slice(0, 3).join(', ')}</div> : null}
                </div>
                <div style={{ fontSize: '11px', minWidth: '60px', textAlign: 'right', flexShrink: 0 }}>
                  {m?.ccu ? <span style={{ color: C.green }}>{m.ccu.toLocaleString()}</span> : <span style={{ color: C.border }}>—</span>}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, flexShrink: 0, minWidth: '36px', textAlign: 'right', color: reviewColor }}>
                  {reviewPct != null ? `${reviewPct}%` : <span style={{ color: C.border }}>—</span>}
                </div>
                <div style={{ fontSize: '11px', flexShrink: 0, minWidth: '48px', textAlign: 'right', color: C.muted }}>
                  {m != null ? (m.is_free ? <span style={{ color: C.green }}>Free</span> : m.price > 0 ? `$${(m.price / 100).toFixed(2)}` : '—') : '—'}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, flexShrink: 0, minWidth: '52px', textAlign: 'right', color: g.playtime_forever > 0 ? C.accent : C.border }}>
                  {g.playtime_forever > 0 ? fmt(g.playtime_forever) : 'Unplayed'}
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: C.muted, fontSize: '13px' }}>No games match the current filters.</div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Account Value Panel ────────────────────────────────────────────────────────

function AccountValuePanel({ data, onRecalculate }: { data: AccountValueData; onRecalculate: () => void }) {
  const [tab, setTab] = useState<'games' | 'inventory' | 'badges'>('games');
  // Skinport batch prices for CS2 items (fetched once when Inventory tab opens)
  const [skinportPrices, setSkinportPrices] = useState<Record<string, SkinportPriceResult>>({});
  const [skinportLoaded, setSkinportLoaded] = useState(false);
  const APP_LABEL: Record<number, string> = { 730: 'CS2', 570: 'Dota 2', 440: 'TF2', 252490: 'Rust' };

  useEffect(() => {
    if (tab !== 'inventory' || skinportLoaded) return;
    setSkinportLoaded(true);
    const cs2Names = data.inventory.top_items
      .filter(i => i.appid === 730)
      .map(i => i.market_hash_name);
    if (cs2Names.length === 0) return;
    // Single batch request — no per-item Steam Market calls
    getSkinportPrices(cs2Names).then(setSkinportPrices).catch(() => {});
  }, [tab, skinportLoaded, data.inventory.top_items]);

  return (
    <>
      {/* Sub-totals + tab switcher */}
      <div style={{ flexShrink: 0, padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {([
            { label: 'Game Library', value: data.games.total_cents, sub: `${data.games.priced_count}/${data.games.game_count} priced` },
            { label: 'Inventory', value: data.inventory.total_cents, sub: 'CS2 · Dota 2 · TF2 · Rust' },
            { label: 'Badges', value: data.badges.total_cents, sub: `${data.badges.badge_count} badges · $0.10/100 XP` },
          ] as const).map(({ label, value, sub }) => (
            <div key={label}>
              <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: C.gold }}>{fmtCents(value)}</div>
              <div style={{ fontSize: '10px', color: C.muted }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['games', 'inventory', 'badges'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? C.surface : 'transparent',
              border: `1px solid ${tab === t ? C.gold : C.border}`,
              color: tab === t ? C.text : C.muted,
              padding: '4px 12px', borderRadius: '3px', cursor: 'pointer',
              fontSize: '12px', fontFamily: 'inherit',
            }}>
              {t === 'games' ? 'Game Library' : t === 'inventory' ? 'Inventory' : 'Badges'}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', minHeight: 0 }}>
        {tab === 'games' && (
          <div>
            {data.games.top_games.map((g, i) => {
              const icon = g.img_icon_url
                ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
                : null;
              return (
                <div key={g.appid} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 8px', borderRadius: '3px' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1e3147')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: '28px', textAlign: 'right', fontSize: '11px', color: C.muted, flexShrink: 0 }}>#{i + 1}</div>
                  {icon
                    ? <img src={icon} alt="" style={{ width: '24px', height: '24px', borderRadius: '2px', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    : <div style={{ width: '24px', height: '24px', background: C.surface, borderRadius: '2px', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0, fontSize: '13px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                  <div style={{ fontSize: '12px', color: C.gold, fontWeight: 600, flexShrink: 0 }}>{fmtCents(g.initialprice_cents)}</div>
                </div>
              );
            })}
            {data.games.top_games.length === 0 && (
              <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '24px' }}>No game price data available.</div>
            )}
          </div>
        )}

        {tab === 'inventory' && (
          <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {([
                { label: 'CS2', cents: data.inventory.cs2_cents, tag: 'Skinport' },
                { label: 'Dota 2', cents: data.inventory.dota2_cents, tag: 'Steam Market' },
                { label: 'TF2', cents: data.inventory.tf2_cents, tag: 'Steam Market' },
                { label: 'Rust', cents: data.inventory.rust_cents, tag: 'Steam Market' },
              ] as const).map(({ label, cents, tag }) => (
                <div key={label} style={{ background: C.surface, borderRadius: '3px', padding: '8px 12px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: '10px', color: C.muted }}>{label} · {tag}</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: C.gold }}>{fmtCents(cents)}</div>
                </div>
              ))}
            </div>
            {data.inventory.top_items.map((item, i) => (
              <div key={`${item.appid}_${item.market_hash_name}_${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 8px', borderRadius: '3px' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1e3147')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <img
                  src={`https://community.cloudflare.steamstatic.com/economy/image/${item.icon_url}/64x64`}
                  alt="" style={{ width: '32px', height: '32px', borderRadius: '2px', flexShrink: 0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: '10px', color: C.muted }}>
                    {APP_LABEL[item.appid] ?? item.appid}
                    {item.quantity > 1 && ` · quantity: ${item.quantity}`}
                  </div>
                  {item.appid === 730 && skinportPrices[item.market_hash_name]?.min_price != null && (
                    <div style={{ fontSize: '10px', color: C.accent, marginTop: '1px' }}>
                      Skinport: {fmtCents(Math.round((skinportPrices[item.market_hash_name].min_price ?? 0) * 100))}
                      {item.quantity > 1 && ` × ${item.quantity}`}
                    </div>
                  )}
                  {item.appid !== 730 && (
                    <div style={{ fontSize: '10px', color: C.muted, marginTop: '1px', fontStyle: 'italic' }}>Steam Market</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '12px', color: C.gold, fontWeight: 600 }}>{fmtCents(item.price_cents * item.quantity)}</div>
                  {item.quantity > 1 && <div style={{ fontSize: '10px', color: C.muted }}>{fmtCents(item.price_cents)} ea</div>}
                </div>
              </div>
            ))}
            {data.inventory.top_items.length === 0 && (
              <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '24px', lineHeight: 1.8 }}>
                No inventory data loaded yet.<br />
                <span style={{ fontSize: '12px' }}>
                  Visit the <strong style={{ color: C.text }}>Inventory</strong> tab first to cache your items, then recalculate.
                </span><br />
                <button onClick={onRecalculate} style={{
                  marginTop: '8px', background: C.surface, border: `1px solid ${C.border}`,
                  color: C.text, padding: '5px 16px', borderRadius: '3px', cursor: 'pointer',
                  fontSize: '12px', fontFamily: 'inherit',
                }}>Recalculate</button>
              </div>
            )}
          </div>
        )}

        {tab === 'badges' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div style={{ background: C.surface, borderRadius: '3px', padding: '12px 16px', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Est. Badge Value</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: C.gold, marginTop: '4px' }}>{fmtCents(data.badges.total_cents)}</div>
              </div>
              <div style={{ background: C.surface, borderRadius: '3px', padding: '12px 16px', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Game Badges</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: C.accent, marginTop: '4px' }}>{data.badges.badge_count}</div>
                <div style={{ fontSize: '11px', color: C.muted }}>at $0.10 / 100 XP</div>
              </div>
            </div>
            <div style={{ color: C.muted, fontSize: '12px', lineHeight: 1.6 }}>
              Est. badge value = <span style={{ color: C.text }}>total badge XP × $0.10 / 100 XP</span>.
            </div>
          </div>
        )}

        <div style={{ marginTop: '20px', padding: '10px 14px', background: '#0e1923', borderRadius: '3px', fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>
          * Estimated values. Game prices from SteamSpy (initial list price, not sale price). Inventory from Steam Market / Skinport. Badge value = total XP × $0.10 / 100 XP.
        </div>
      </div>
    </>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

type OpenPanel = 'friends' | 'badges' | 'playtime' | 'games' | 'account-value' | null;

export default function Dashboard({ targetSteamId }: { targetSteamId?: string } = {}) {
  const isOwnProfile = !targetSteamId;
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<SteamUser | null>(null); // logged-in user for nav
  const [user, setUser] = useState<SteamUser | null>(null);         // profile being viewed
  const [games, setGames] = useState<{ game_count: number; games: OwnedGame[] } | null>(null);
  const [recent, setRecent] = useState<RecentGame[] | null>(null);
  const [level, setLevel] = useState<LevelData | null>(null);
  const [bans, setBans] = useState<BanData | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [panel, setPanel] = useState<OpenPanel>(null);
  const [accountValue, setAccountValue] = useState<AccountValueData | null>(null);
  const [accountValueLoading, setAccountValueLoading] = useState(false);
  const [accountValueError, setAccountValueError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Reset profile-specific state when navigating between profiles
    setUser(null); setGames(null); setRecent(null); setLevel(null);
    setBans(null); setFriendCount(null); setPanel(null);
    setAccountValue(null); setAccountValueLoading(false); setAccountValueError(null);

    if (!targetSteamId) {
      // Own profile — session-based loading
      getMe().then(({ authenticated: auth, user: u }) => {
        setAuthenticated(auth);
        setAuthUser(u);
        setUser(u);
        if (!auth) return;
        getGames().then(setGames).catch(() => {});
        getRecentGames().then(d => setRecent(d.games ?? [])).catch(() => setRecent([]));
        getLevel().then(setLevel).catch(() => {});
        getBans().then(setBans).catch(() => {});
        getFriendCount().then(setFriendCount).catch(() => {});
      });
    } else {
      // Another user's profile — public API loading
      getMe().then(({ authenticated: auth, user: u }) => {
        setAuthenticated(auth);
        setAuthUser(u);
      });
      getUserProfile(targetSteamId).then(data => {
        if (data.profile) {
          setUser({
            steamid: targetSteamId,
            displayName: data.profile.personaname,
            avatar: { small: data.profile.avatar, medium: data.profile.avatarmedium, large: data.profile.avatarfull },
            profileUrl: data.profile.profileurl,
            visibility: data.profile.communityvisibilitystate,
          });
        }
        if (data.games) setGames(data.games as { game_count: number; games: OwnedGame[] });
        if (data.recentGames) setRecent((data.recentGames.games ?? []) as RecentGame[]);
        if (data.level) setLevel(data.level as LevelData);
        if (data.bans) setBans(data.bans as BanData);
        if (data.friendCount != null) setFriendCount(data.friendCount);
      }).catch(() => {});
    }
  }, [targetSteamId]);

  const handleLogout = async () => {
    await logout();
    setAuthenticated(false);
    setAuthUser(null);
    setPanel(null);
    setAccountValue(null); setAccountValueLoading(false); setAccountValueError(null);
    if (isOwnProfile) {
      setUser(null); setGames(null); setRecent(null);
      setLevel(null); setBans(null); setFriendCount(null);
    }
  };

  const totalMins = games?.games?.reduce((s, g) => s + g.playtime_forever, 0) ?? 0;
  const playedGames = games?.games?.filter(g => g.playtime_forever > 0) ?? [];
  const badgeCount = level?.badges.length ?? 0;
  const xpCurrent = level ? level.player_xp - level.player_xp_needed_current_level : 0;
  const xpNeeded = level ? level.player_xp_needed_to_level_up : 0;
  const xpPct = xpNeeded > 0 ? Math.min((xpCurrent / xpNeeded) * 100, 100) : 0;
  const vacStatus = bans ? (bans.VACBanned || bans.NumberOfGameBans > 0 || bans.CommunityBanned ? 'flagged' : 'clean') : null;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: '"Motiva Sans", Arial, sans-serif' }}>

      {/* Nav */}
      <div style={{ background: C.nav, borderBottom: '1px solid #000', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '8px', height: '52px', boxSizing: 'border-box' }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: '17px', marginRight: '16px', letterSpacing: '0.5px' }}>steameXplore</span>
        <NavLink label="Dashboard" onClick={() => navigate('/')} active={isOwnProfile} />
        <NavLink label="Inventory" onClick={() => navigate('/inventory')} active={false} />
        <NavLink label="Search Users" onClick={() => navigate('/search')} active={false} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {authenticated && authUser ? (
            <>
              <img src={authUser.avatar.small} alt="" style={{ width: '28px', height: '28px', borderRadius: '3px' }} />
              <span style={{ fontSize: '13px', color: C.text }}>{authUser.displayName}</span>
              <button onClick={handleLogout} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '4px 12px', cursor: 'pointer', borderRadius: '2px', fontSize: '12px', fontFamily: 'inherit' }}>
                Sign Out
              </button>
            </>
          ) : (
            <button onClick={() => { window.location.href = `${BASE}/auth/steam`; }} style={{
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

        {/* Back button for other profiles */}
        {!isOwnProfile && (
          <div>
            <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '5px 14px', cursor: 'pointer', borderRadius: '3px', fontSize: '12px', fontFamily: 'inherit' }}>
              ← Back
            </button>
          </div>
        )}

        {/* Profile hero */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '24px', display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {user
              ? <img src={user.avatar.large} alt="avatar" style={{ borderRadius: '4px', width: '100px', height: '100px', display: 'block' }} />
              : <div style={{ width: '100px', height: '100px', borderRadius: '4px', background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                </div>}
            {level
              ? <div style={{ position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)', background: C.surface, border: `2px solid ${C.accent}`, borderRadius: '12px', padding: '1px 10px', fontSize: '12px', fontWeight: 700, color: C.accent, whiteSpace: 'nowrap' }}>
                  Lvl {level.player_level}
                </div>
              : isOwnProfile && !authenticated
                ? <div style={{ position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)', background: C.surface, border: `2px solid ${C.dim}`, borderRadius: '12px', padding: '1px 10px', fontSize: '12px', fontWeight: 700, color: C.muted, whiteSpace: 'nowrap' }}>
                    Lvl —
                  </div>
                : null}
          </div>

          <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
            {/* Name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: user ? C.text : C.muted }}>
                {user ? user.displayName : 'Your Steam Profile'}
              </h1>
              {vacStatus === 'clean' && <span style={{ fontSize: '11px', color: C.green, border: `1px solid ${C.green}55`, borderRadius: '3px', padding: '1px 7px', fontWeight: 600 }}>VAC Clean</span>}
              {vacStatus === 'flagged' && <span style={{ fontSize: '11px', color: C.red, border: `1px solid ${C.red}55`, borderRadius: '3px', padding: '1px 7px', fontWeight: 600 }}>⚠ Banned</span>}
              {user && (
                <a
                  href={user.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: '11px', color: C.accent, border: `1px solid ${C.accent}44`,
                    borderRadius: '3px', padding: '2px 8px', textDecoration: 'none',
                    fontWeight: 600, letterSpacing: '0.2px',
                  }}
                >
                  View on Steam ↗
                </a>
              )}
              {!isOwnProfile && user && (
                <button
                  onClick={() => navigate(`/inventory/user/${targetSteamId}`)}
                  style={{
                    fontSize: '11px', color: C.text, background: C.surface,
                    border: `1px solid ${C.border}`, borderRadius: '3px', padding: '2px 8px',
                    cursor: 'pointer', fontWeight: 600, letterSpacing: '0.2px', fontFamily: 'inherit',
                  }}
                >
                  Inventory
                </button>
              )}
            </div>

            {/* SteamID / profile info */}
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {user ? (
                <>
                  <span style={{ fontSize: '12px', color: C.muted }}><span style={{ color: C.text }}>SteamID</span>&nbsp;{user.steamid}</span>
                  <span style={{ fontSize: '12px', color: user.visibility === 3 ? C.green : C.muted }}>{user.visibility === 3 ? 'Public profile' : 'Private profile'}</span>
                </>
              ) : isOwnProfile ? (
                <span style={{ fontSize: '13px', color: C.muted }}>Sign in to load your Steam profile and stats.</span>
              ) : null}
            </div>

            {/* XP bar */}
            {level ? (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.muted, marginBottom: '4px' }}>
                  <span>{level.player_xp.toLocaleString()} XP total</span>
                  <span>{xpCurrent.toLocaleString()} / {xpNeeded.toLocaleString()} XP to level {level.player_level + 1}</span>
                </div>
                <div style={{ height: '6px', background: '#0e1923', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${xpPct}%`, background: `linear-gradient(90deg, ${C.accent}, #4fa3d4)`, borderRadius: '3px', transition: 'width 0.8s ease' }} />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ height: '11px', width: '40%', background: C.surface, borderRadius: '2px', marginBottom: '6px' }} />
                <div style={{ height: '6px', background: C.surface, borderRadius: '3px' }} />
              </div>
            )}

            {/* Total Account Value — hero stat card */}
            {(() => {
              const isLoaded = !!accountValue;
              const isClickable = !accountValueLoading;
              const handleClick = () => {
                if (accountValueLoading) return;
                if (isLoaded) { setPanel('account-value'); return; }
                // First click: trigger calculation
                setAccountValueError(null);
                setAccountValueLoading(true);
                getAccountValue(targetSteamId)
                  .then(setAccountValue)
                  .catch(err => setAccountValueError((err as Error).message))
                  .finally(() => setAccountValueLoading(false));
              };
              const valueLabel = accountValueError ? 'Error' : isLoaded ? fmtCents(accountValue!.grand_total_cents) : '—';
              const subLabel = accountValueError
                ? accountValueError.slice(0, 60)
                : isLoaded
                  ? `Games ${fmtCents(accountValue!.games.total_cents)} · Inv ${fmtCents(accountValue!.inventory.total_cents)} · Badges ${fmtCents(accountValue!.badges.total_cents)}`
                  : 'Click to calculate';
              return (
                <div
                  onClick={isClickable ? handleClick : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '10px',
                    background: '#1a1a0e',
                    borderTop: `1px solid ${C.gold}${isLoaded ? 'cc' : '66'}`,
                    borderRight: `1px solid ${C.gold}${isLoaded ? 'cc' : '66'}`,
                    borderBottom: `1px solid ${C.gold}${isLoaded ? 'cc' : '66'}`,
                    borderLeft: `3px solid ${C.gold}`,
                    borderRadius: '4px',
                    padding: '8px 14px',
                    cursor: isClickable ? 'pointer' : 'default',
                    transition: 'border-color 0.12s',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: '11px', color: C.gold, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700 }}>
                    Total Account Value
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: accountValueError ? C.red : C.gold }}>
                    {valueLabel}
                  </span>
                  <span style={{ fontSize: '10px', color: C.muted, maxWidth: '260px' }}>
                    {accountValueLoading
                      ? <span style={{ fontSize: '9px', color: C.muted, fontStyle: 'italic' }}>Loading…</span>
                      : subLabel}
                    {isLoaded && <span style={{ color: C.muted, fontSize: '10px', marginLeft: '4px' }}>↗</span>}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Stat row */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <StatCard
            value={games ? (games.game_count ?? games.games?.length ?? 0).toLocaleString() : '—'} label="Games Owned"
            sub={games ? `${playedGames.length.toLocaleString()} played` : undefined}
            ghost={!games}
            onClick={games ? () => setPanel('games') : undefined}
          />
          <StatCard
            value={games ? fmt(totalMins) : '—'} label="Total Playtime"
            sub={games ? `${Math.round(totalMins / 60 / 24).toLocaleString()} days` : undefined}
            ghost={!games}
            onClick={games ? () => setPanel('playtime') : undefined}
          />
          <StatCard
            value={friendCount != null ? friendCount.toLocaleString() : '—'} label="Friends"
            ghost={friendCount === null}
            onClick={friendCount != null ? () => setPanel('friends') : undefined}
          />
          <StatCard
            value={level ? badgeCount.toLocaleString() : '—'} label="Badges"
            sub={level ? `Level ${level.player_level}` : undefined}
            ghost={!level}
            onClick={level ? () => setPanel('badges') : undefined}
          />
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Section title="Recent Activity (Last 2 Weeks)">
            {recent === null
              ? [0,1,2,3].map(i => <GhostRow key={i} />)
              : recent.length === 0
                ? <span style={{ color: C.muted, fontSize: '13px' }}>No games played in the last 2 weeks.</span>
                : recent.map(g => {
                      const icon = g.img_icon_url ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg` : null;
                      return (
                        <div key={g.appid} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                          {icon && <img src={icon} alt="" style={{ width: '24px', height: '24px', borderRadius: '3px', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                            <div style={{ fontSize: '11px', color: C.muted }}>{fmt(g.playtime_2weeks)} this period · {fmt(g.playtime_forever)} total</div>
                          </div>
                        </div>
                      );
                    })}
          </Section>

          <Section title="Account Status">
            {bans
              ? <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <StatusRow label="VAC Bans" value={bans.VACBanned ? `${bans.NumberOfVACBans} ban(s)` : 'None'} ok={!bans.VACBanned} />
                  <StatusRow label="Game Bans" value={bans.NumberOfGameBans > 0 ? `${bans.NumberOfGameBans} ban(s)` : 'None'} ok={bans.NumberOfGameBans === 0} />
                  <StatusRow label="Economy Ban" value={bans.EconomyBan === 'none' ? 'None' : bans.EconomyBan} ok={bans.EconomyBan === 'none'} />
                  <StatusRow label="Community Ban" value={bans.CommunityBanned ? 'Yes' : 'No'} ok={!bans.CommunityBanned} />
                  {bans.VACBanned && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>Last ban: {bans.DaysSinceLastBan} days ago</div>}
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{[0,1,2,3].map(i => <GhostRow key={i} />)}</div>}
          </Section>
        </div>
      </div>

      {/* Overlay panels */}
      {panel === 'friends' && <Overlay title="Friends" onClose={() => setPanel(null)}><FriendsPanel onClose={() => setPanel(null)} steamid={targetSteamId} /></Overlay>}
      {panel === 'badges' && level && (() => {
  const totalXP = level.badges.reduce((s, b) => s + b.xp, 0);
  const estValue = fmtCents(Math.round(totalXP * 0.1));
  return (
    <Overlay
      title={`Badges — ${level.badges.length} · ${totalXP.toLocaleString()} XP total · Value ${estValue}*`}
      subtitle={'*Badge valuation is estimated at $0.10 / 100 XP.'}
      onClose={() => setPanel(null)}
      width={920}
    >
      <BadgesPanel badges={level.badges} onClose={() => setPanel(null)} gameNames={Object.fromEntries((games?.games ?? []).map(g => [g.appid, g.name]))} />
    </Overlay>
  );
})()}
      {panel === 'playtime' && games && <Overlay title={`Playtime — ${fmt(totalMins)} total`} onClose={() => setPanel(null)}><PlaytimePanel games={games.games} onClose={() => setPanel(null)} /></Overlay>}
      {panel === 'games' && games && <Overlay title={`Games Library — ${games.game_count}`} onClose={() => setPanel(null)} width={960}><GamesPanel games={games.games} onClose={() => setPanel(null)} /></Overlay>}
      {panel === 'account-value' && accountValue && (
        <Overlay title={`Total Account Value — ${fmtCents(accountValue.grand_total_cents)}`} onClose={() => setPanel(null)} width={800}>
          <AccountValuePanel data={accountValue} onRecalculate={() => {
            setAccountValue(null);
            setPanel(null);
            setAccountValueLoading(true);
            getAccountValue(targetSteamId)
              .then(setAccountValue)
              .catch(err => setAccountValueError((err as Error).message))
              .finally(() => setAccountValueLoading(false));
          }} />
        </Overlay>
      )}
    </div>
  );
}
