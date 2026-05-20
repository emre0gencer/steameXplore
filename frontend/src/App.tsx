import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import SearchUsers from './pages/SearchUsers';
import UserProfile from './pages/UserProfile';

function PublicInventory() {
  const { steamid } = useParams<{ steamid: string }>();
  return <Inventory targetSteamId={steamid} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/inventory" element={<Inventory />} />
      <Route path="/inventory/user/:steamid" element={<PublicInventory />} />
      <Route path="/search" element={<SearchUsers />} />
      <Route path="/user/:steamid" element={<UserProfile />} />
    </Routes>
  );
}
