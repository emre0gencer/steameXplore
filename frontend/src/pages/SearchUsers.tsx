import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, logout, searchUser } from '../api/steamApi';
import type { PlayerSearchResult } from '../api/steamApi';
import type { SteamUser } from '../types/steam';

const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

const C = {
  bg: '#1b2838',
  nav: '#171a21',
  surface: '#2a475e',
  card: '#16202d',
  accent: '#66c0f4',
  green: '#5ba32b',
  text: '#c6d4df',
  muted: '#8f98a0',
  border: '#3d5a6c',
  input: '#316282',
  inputBg: '#1b3a52',
};

const PERSONA_LABEL = ['Offline', 'Online', 'Busy', 'Away', 'Snooze', 'Looking to Trade', 'Looking to Play'];
const PERSONA_COLOR = ['#8f98a0', '#57cbde', '#c02942', '#d4af37', '#d4af37', '#57cbde', '#57cbde'];

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function matchLabel(query: string, name: string): { label: string; color: string } {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (q === n) return { label: 'Exact match', color: C.green };
  if (n.includes(q)) return { label: 'Partial match', color: C.accent };
  const dist = levenshtein(q, n);
  const pct = Math.max(0, Math.round((1 - dist / Math.max(q.length, n.length)) * 100));
  return { label: `${pct}% similar`, color: C.muted };
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

function CountryFlag({ code }: { code: string }) {
  const codePoints = [...code.toUpperCase()].map((c) => 0x1F1E6 - 65 + c.charCodeAt(0));
  return <span style={{ fontSize: '16px', lineHeight: 1 }}>{String.fromCodePoint(...codePoints)}</span>;
}

function ResultCard({ result, query }: { result: PlayerSearchResult; query: string }) {
  const [hovered, setHovered] = useState(false);
  const personaState = Math.min(result.personastate, PERSONA_LABEL.length - 1);
  const stateColor = PERSONA_COLOR[personaState];
  const stateLabel = PERSONA_LABEL[personaState];
  const isPublic = result.communityvisibilitystate === 3;
  const match = matchLabel(query, result.personaname);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '20px',
        background: hovered ? '#1e3147' : C.card,
        border: `1px solid ${hovered ? C.accent : C.border}`,
        borderRadius: '4px', padding: '16px 20px',
        marginBottom: '8px', transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <img
          src={result.avatarmedium}
          alt=""
          style={{ width: '64px', height: '64px', borderRadius: '4px', display: 'block' }}
        />
        {/* Online dot */}
        <span style={{
          position: 'absolute', bottom: '2px', right: '2px',
          width: '10px', height: '10px', borderRadius: '50%',
          background: stateColor, border: '2px solid #16202d',
          display: 'block',
        }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ fontSize: '17px', fontWeight: 700, color: C.text }}>{result.personaname}</span>
          <span style={{ fontSize: '11px', color: match.color, border: `1px solid ${match.color}44`, borderRadius: '3px', padding: '1px 7px', fontWeight: 600, flexShrink: 0 }}>
            {match.label}
          </span>
          {!isPublic && (
            <span style={{ fontSize: '11px', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '3px', padding: '1px 7px' }}>
              Private
            </span>
          )}
        </div>

        {result.realname && (
          <div style={{ fontSize: '13px', color: C.muted, marginBottom: '4px' }}>{result.realname}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: stateColor, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: stateColor, display: 'inline-block', flexShrink: 0 }} />
            {stateLabel}
          </span>

          {result.gameextrainfo && (
            <span style={{ fontSize: '12px', color: '#57cbde' }}>
              Playing: {result.gameextrainfo}
            </span>
          )}

          {result.loccountrycode && (
            <span style={{ fontSize: '12px', color: C.muted, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <CountryFlag code={result.loccountrycode} />
              {result.loccountrycode}
            </span>
          )}

          <span style={{ fontSize: '11px', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.5px' }}>
            {result.steamid}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
        <a
          href={result.profileurl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'block', textAlign: 'center',
            background: 'linear-gradient(180deg, #4c7a2e 0%, #3a5e22 100%)',
            border: '1px solid #2a4418',
            color: '#fff', padding: '7px 18px',
            borderRadius: '3px', fontSize: '13px',
            fontWeight: 600, textDecoration: 'none',
            letterSpacing: '0.3px', fontFamily: 'inherit',
          }}
        >
          View Profile
        </a>
      </div>
    </div>
  );
}

export default function SearchUsers() {
  const [authUser, setAuthUser] = useState<SteamUser | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(({ authenticated: auth, user }) => {
      setAuthenticated(auth);
      setAuthUser(user);
    });
  }, []);

  const handleInput = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchUser(q.trim());
        setResults(data);
        setSearchedQuery(q.trim());
      } catch {
        setResults([]);
        setSearchedQuery(q.trim());
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const handleLogout = async () => {
    await logout();
    setAuthenticated(false);
    setAuthUser(null);
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: '"Motiva Sans", Arial, sans-serif' }}>

      {/* Nav */}
      <div style={{ background: C.nav, borderBottom: '1px solid #000', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '8px', height: '52px', boxSizing: 'border-box' }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: '17px', marginRight: '16px', letterSpacing: '0.5px' }}>steameXplore</span>
        <NavLink label="Dashboard" onClick={() => navigate('/')} active={false} />
        <NavLink label="Inventory" onClick={() => navigate('/inventory')} active={false} />
        <NavLink label="Search Users" onClick={() => {}} active={true} />
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
          ) : authenticated === false ? (
            <button onClick={() => { window.location.href = `${BASE}/auth/steam`; }} style={{
              background: 'linear-gradient(180deg, #4c7a2e 0%, #3a5e22 100%)',
              border: '1px solid #2a4418', color: '#fff',
              padding: '6px 16px', cursor: 'pointer', borderRadius: '3px',
              fontSize: '13px', fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.3px',
            }}>
              Sign in through Steam
            </button>
          ) : null}
        </div>
      </div>

      {/* Search area */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '52px 24px 32px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '26px', fontWeight: 300, letterSpacing: '1px', color: C.text }}>
            Find Players on Steam
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>
            Search by display name, SteamID64, or profile URL (e.g. steamcommunity.com/id/username)
          </p>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: '32px' }}>
          {/* Search icon */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.muted}
            strokeWidth="2"
            style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', width: '18px', height: '18px', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="22" y2="22" />
          </svg>

          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search players..."
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box',
              background: C.inputBg,
              border: `1px solid ${query.length > 0 ? C.accent : C.input}`,
              borderRadius: '4px',
              color: C.text,
              fontSize: '15px',
              padding: '12px 44px 12px 42px',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
          />

          {/* Spinner / clear */}
          <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }}>
            {searching ? (
              <svg viewBox="0 0 24 24" width="18" height="18" style={{ animation: 'spin 0.8s linear infinite' }}>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                <circle cx="12" cy="12" r="9" fill="none" stroke={C.accent} strokeWidth="2.5" strokeDasharray="28 56" />
              </svg>
            ) : query.length > 0 ? (
              <button
                onClick={() => { setQuery(''); setResults(null); }}
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: '2px', lineHeight: 1 }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={C.muted} strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        {/* Divider */}
        {results !== null && (
          <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: '20px' }} />
        )}

        {/* Results */}
        {results !== null && !searching && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: C.muted }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={C.border} strokeWidth="1.5" style={{ width: '48px', height: '48px', marginBottom: '16px', display: 'block', margin: '0 auto 16px' }}>
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="22" y2="22" />
            </svg>
            <p style={{ margin: '0 0 6px 0', fontSize: '15px', color: C.muted }}>No players found for <strong style={{ color: C.text }}>"{searchedQuery}"</strong></p>
            <p style={{ margin: 0, fontSize: '12px', color: C.border }}>Try the exact Steam display name, a SteamID64, or a full profile URL.</p>
          </div>
        )}

        {results !== null && results.length > 0 && (
          <>
            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              {results.length} result{results.length !== 1 ? 's' : ''} for "{searchedQuery}"
            </div>
            {results.map((r) => (
              <ResultCard key={r.steamid} result={r} query={searchedQuery} />
            ))}
          </>
        )}

        {/* Empty state (no query yet) */}
        {results === null && !searching && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: C.muted }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={C.border} strokeWidth="1" style={{ width: '64px', height: '64px', display: 'block', margin: '0 auto 20px' }}>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            <p style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Search for any Steam user</p>
            <p style={{ margin: 0, fontSize: '12px', color: C.border }}>Results appear automatically as you type</p>
          </div>
        )}
      </div>
    </div>
  );
}
