import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, logout } from '../api/steamApi';
import type { SteamUser } from '../types/steam';

export default function Dashboard() {
  const [user, setUser] = useState<SteamUser | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(({ authenticated, user }) => {
      if (!authenticated) {
        navigate('/');
      } else {
        setUser(user);
      }
    });
  }, [navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!user) {
    return <div style={{ textAlign: 'center', marginTop: '2rem' }}>Loading...</div>;
  }

  const visibilityLabel = user.visibility === 3 ? 'Public' : 'Private';

  return (
    <div style={{ maxWidth: '480px', margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>Dashboard</h1>
      <img src={user.avatar.large} alt="avatar" style={{ borderRadius: '50%' }} />
      <h2>{user.displayName}</h2>
      <p><strong>SteamID:</strong> {user.steamid}</p>
      <p>
        <strong>Profile:</strong>{' '}
        <a href={user.profileUrl} target="_blank" rel="noreferrer">{user.profileUrl}</a>
      </p>
      <p><strong>Visibility:</strong> {visibilityLabel}</p>
      <button onClick={handleLogout} style={{ padding: '8px 16px', cursor: 'pointer' }}>
        Sign Out
      </button>
    </div>
  );
}
