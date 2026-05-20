import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import SearchUsers from './pages/SearchUsers';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/inventory" element={<Inventory />} />
      <Route path="/search" element={<SearchUsers />} />
    </Routes>
  );
}
