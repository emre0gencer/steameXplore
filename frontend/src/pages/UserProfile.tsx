import { useParams } from 'react-router-dom';
import Dashboard from './Dashboard';

export default function UserProfile() {
  const { steamid } = useParams<{ steamid: string }>();
  return <Dashboard targetSteamId={steamid} />;
}
