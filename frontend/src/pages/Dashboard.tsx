import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, logout } from '../api/steamApi';
import type { SteamUser } from '../types/steam';

const C = {
  bg: '#1b2838',
  nav: '#171a21',
  surface: '#2a475e',
  card: '#16202d',
  accent: '#66c0f4',
  text: '#c6d4df',
  muted: '#8f98a0',
  border: '#3d5a6c',
};

function NavLink({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
        color: active ? C.text : C.muted,
        padding: '0 12px',
        height: '52px',
        cursor: 'pointer',
        fontSize: '13px',
        fontFamily: 'inherit',
        letterSpacing: '0.3px',
        transition: 'color 0.12s',
        boxSizing: 'border-box',
      }}
    >
      {label}
    </button>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState<SteamUser | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(({ authenticated, user: u }) => {
      if (!authenticated) {
        navigate('/');
      } else {
        setUser(u);
      }
    });
  }, [navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!user) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        Loading...
      </div>
    );
  }

  const visibilityLabel = user.visibility === 3 ? 'Public' : 'Private';

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: '"Motiva Sans", Arial, sans-serif' }}>
      {/* Top nav */}
      <div style={{ background: C.nav, borderBottom: '1px solid #000', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '8px', height: '52px', boxSizing: 'border-box' }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: '17px', marginRight: '16px', letterSpacing: '0.5px' }}>
          steameXplore
        </span>
        <NavLink label="Dashboard" onClick={() => {}} active={true} />
        <NavLink label="Inventory" onClick={() => navigate('/inventory')} active={false} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={user.avatar.small} alt="" style={{ width: '28px', height: '28px', borderRadius: '3px' }} />
          <span style={{ fontSize: '13px', color: C.text }}>{user.displayName}</span>
          <button
            onClick={handleLogout}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '4px 12px', cursor: 'pointer', borderRadius: '2px', fontSize: '12px', fontFamily: 'inherit' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 300, margin: '0 0 28px 0', color: C.text, letterSpacing: '1px', textTransform: 'uppercase' }}>
          Dashboard
        </h1>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '24px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          <img src={user.avatar.large} alt="avatar" style={{ borderRadius: '4px', width: '80px', height: '80px', flexShrink: 0 }} />
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: C.text }}>{user.displayName}</h2>
            <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: C.muted }}>
              <strong style={{ color: C.text }}>SteamID:</strong> {user.steamid}
            </p>
            <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: C.muted }}>
              <strong style={{ color: C.text }}>Profile:</strong>{' '}
              <a href={user.profileUrl} target="_blank" rel="noreferrer" style={{ color: C.accent, textDecoration: 'none' }}>
                {user.profileUrl}
              </a>
            </p>
            <p style={{ margin: '0', fontSize: '13px', color: C.muted }}>
              <strong style={{ color: C.text }}>Visibility:</strong> {visibilityLabel}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
