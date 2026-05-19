import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, getGames, getInventory, logout } from '../api/steamApi';
import type { SteamUser, InventoryDescription } from '../types/steam';

const TARGET_GAMES = [
  { appid: 730, name: 'CS2' },
  { appid: 570, name: 'Dota 2' },
  { appid: 440, name: 'TF2' },
  { appid: 252490, name: 'Rust' },
];

interface InventoryItem {
  classid: string;
  instanceid: string;
  name: string;
  market_name: string;
  icon_url: string;
  name_color: string;
  type: string;
  tradable: number;
  marketable: number;
  quantity: number;
}

interface GameInventory {
  appid: number;
  name: string;
  img_icon_url: string;
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
}

const C = {
  bg: '#1b2838',
  nav: '#171a21',
  surface: '#2a475e',
  card: '#16202d',
  tab: '#1e3144',
  accent: '#66c0f4',
  text: '#c6d4df',
  muted: '#8f98a0',
  border: '#3d5a6c',
  itemBg: '#1e2d3d',
};

function buildItems(data: { assets: { classid: string; instanceid: string }[]; descriptions: InventoryDescription[] }): InventoryItem[] {
  if (!data?.descriptions || !data?.assets) return [];

  const descMap = new Map<string, InventoryDescription>();
  for (const desc of data.descriptions) {
    descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
  }

  const quantityMap = new Map<string, number>();
  for (const asset of data.assets) {
    const key = `${asset.classid}_${asset.instanceid}`;
    quantityMap.set(key, (quantityMap.get(key) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const items: InventoryItem[] = [];
  for (const asset of data.assets) {
    const key = `${asset.classid}_${asset.instanceid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const desc = descMap.get(key);
    if (!desc) continue;
    items.push({
      classid: asset.classid,
      instanceid: asset.instanceid,
      name: desc.name,
      market_name: desc.market_name,
      icon_url: desc.icon_url,
      name_color: desc.name_color ?? '',
      type: desc.type ?? '',
      tradable: desc.tradable,
      marketable: desc.marketable,
      quantity: quantityMap.get(key) ?? 1,
    });
  }
  return items;
}

function ItemSquare({ item }: { item: InventoryItem }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [tooltipLeft, setTooltipLeft] = useState(true);

  const rarityColor = item.name_color ? `#${item.name_color}` : C.border;
  const iconUrl = `https://steamcommunity-a.akamaihd.net/economy/image/${item.icon_url}/96fx96f`;

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setTooltipLeft(rect.left > 220);
    }
    setHovered(true);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '96px',
        height: '96px',
        background: C.itemBg,
        border: `1px solid ${hovered ? rarityColor : '#2a3f5f'}`,
        borderBottom: `3px solid ${rarityColor}`,
        borderRadius: '3px',
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'border-color 0.1s',
        boxSizing: 'border-box',
      }}
    >
      <img
        src={iconUrl}
        alt={item.name}
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: '2px', objectFit: 'contain' }}
        loading="lazy"
      />
      {item.quantity > 1 && (
        <span style={{
          position: 'absolute',
          bottom: '3px',
          right: '5px',
          fontSize: '11px',
          color: '#c6d4df',
          textShadow: '0 1px 3px #000, 0 0 6px #000',
          fontWeight: 700,
          lineHeight: 1,
        }}>
          ×{item.quantity}
        </span>
      )}
      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          ...(tooltipLeft ? { left: 0 } : { right: 0 }),
          background: '#1b2838',
          border: `1px solid ${rarityColor}`,
          borderRadius: '4px',
          padding: '8px 12px',
          zIndex: 200,
          whiteSpace: 'nowrap',
          fontSize: '13px',
          pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
          minWidth: '160px',
          maxWidth: '280px',
          whiteSpaceCollapse: 'preserve',
        }}>
          <div style={{ color: rarityColor, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {item.name}
          </div>
          {item.type && (
            <div style={{ color: C.muted, fontSize: '11px', marginTop: '4px' }}>{item.type}</div>
          )}
          <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
            {item.tradable === 1 && (
              <span style={{ color: '#5ba32b', fontSize: '11px' }}>Tradable</span>
            )}
            {item.marketable === 1 && (
              <span style={{ color: '#5ba32b', fontSize: '11px' }}>Marketable</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Inventory() {
  const [user, setUser] = useState<SteamUser | null>(null);
  const [gameInventories, setGameInventories] = useState<GameInventory[]>([]);
  const [selectedAppid, setSelectedAppid] = useState<number | null>(null);
  const [loadingGames, setLoadingGames] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(({ authenticated, user: u }) => {
      if (!authenticated) {
        navigate('/');
      } else {
        setUser(u);
        loadInventories();
      }
    });
  }, [navigate]);

  async function loadInventories() {
    setLoadingGames(true);
    setGamesError(null);
    try {
      const gamesData = await getGames();
      const ownedSet = new Set((gamesData.games ?? []).map((g) => g.appid));
      const ownedGames = (gamesData.games ?? []);

      const ownedTargets: GameInventory[] = TARGET_GAMES
        .filter((tg) => ownedSet.has(tg.appid))
        .map((tg) => {
          const owned = ownedGames.find((g) => g.appid === tg.appid);
          return {
            appid: tg.appid,
            name: tg.name,
            img_icon_url: owned?.img_icon_url ?? '',
            items: [],
            loading: true,
            error: null,
          };
        });

      setGameInventories(ownedTargets);
      if (ownedTargets.length > 0) setSelectedAppid(ownedTargets[0].appid);
      setLoadingGames(false);

      await Promise.all(
        ownedTargets.map(async (game) => {
          try {
            const data = await getInventory(game.appid);
            const items = buildItems(data);
            setGameInventories((prev) =>
              prev.map((g) => g.appid === game.appid ? { ...g, items, loading: false } : g)
            );
          } catch (err) {
            setGameInventories((prev) =>
              prev.map((g) =>
                g.appid === game.appid
                  ? { ...g, loading: false, error: (err as Error).message }
                  : g
              )
            );
          }
        })
      );
    } catch (err) {
      setLoadingGames(false);
      setGamesError((err as Error).message);
    }
  }

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const selectedGame = gameInventories.find((g) => g.appid === selectedAppid);

  if (!user) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: '"Motiva Sans", Arial, sans-serif' }}>
      {/* Top nav */}
      <div style={{ background: C.nav, borderBottom: '1px solid #000', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '8px', height: '52px', boxSizing: 'border-box' }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: '17px', marginRight: '16px', letterSpacing: '0.5px' }}>
          steameXplore
        </span>
        <NavLink label="Dashboard" onClick={() => navigate('/dashboard')} active={false} />
        <NavLink label="Inventory" onClick={() => {}} active={true} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={user.avatar.small} alt="" style={{ width: '28px', height: '28px', borderRadius: '3px' }} />
          <span style={{ fontSize: '13px', color: C.text }}>{user.displayName}</span>
          <button
            onClick={handleLogout}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '4px 12px', cursor: 'pointer', borderRadius: '2px', fontSize: '12px' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '28px 24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 300, margin: '0 0 24px 0', color: C.text, letterSpacing: '1px', textTransform: 'uppercase' }}>
          Inventory
        </h1>

        {loadingGames && (
          <div style={{ color: C.muted, fontSize: '14px' }}>Checking your library...</div>
        )}

        {gamesError && (
          <div style={{ color: '#e74c3c', background: C.card, padding: '12px 16px', borderRadius: '4px', fontSize: '14px' }}>
            Failed to load games: {gamesError}
          </div>
        )}

        {!loadingGames && !gamesError && gameInventories.length === 0 && (
          <div style={{ color: C.muted, fontSize: '14px' }}>
            None of the supported games (CS2, Dota 2, TF2, Rust) were found in your library.
          </div>
        )}

        {gameInventories.length > 0 && (
          <>
            {/* Game tabs */}
            <div style={{ display: 'flex', gap: '2px', marginBottom: '0', borderBottom: `2px solid ${C.border}` }}>
              {gameInventories.map((game) => {
                const isActive = game.appid === selectedAppid;
                return (
                  <button
                    key={game.appid}
                    onClick={() => setSelectedAppid(game.appid)}
                    style={{
                      background: isActive ? C.surface : C.card,
                      border: 'none',
                      borderTop: isActive ? `2px solid ${C.accent}` : '2px solid transparent',
                      borderLeft: `1px solid ${isActive ? C.border : 'transparent'}`,
                      borderRight: `1px solid ${isActive ? C.border : 'transparent'}`,
                      color: isActive ? C.text : C.muted,
                      padding: '10px 20px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      transition: 'background 0.12s, color 0.12s',
                      position: 'relative',
                      marginBottom: '-2px',
                    }}
                  >
                    {game.img_icon_url && (
                      <img
                        src={`https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`}
                        alt=""
                        style={{ width: '20px', height: '20px', borderRadius: '2px', flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <span style={{ fontWeight: isActive ? 600 : 400 }}>{game.name}</span>
                    {game.loading ? (
                      <span style={{ fontSize: '11px', color: C.muted, fontStyle: 'italic' }}>loading…</span>
                    ) : game.error ? (
                      <span style={{ fontSize: '11px', color: '#e74c3c' }}>!</span>
                    ) : (
                      <span style={{
                        background: isActive ? C.border : '#1e2d3d',
                        borderRadius: '10px',
                        padding: '1px 7px',
                        fontSize: '11px',
                        color: C.muted,
                        minWidth: '24px',
                        textAlign: 'center',
                      }}>
                        {game.items.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Items panel */}
            <div style={{ background: C.surface, borderRadius: '0 0 4px 4px', border: `1px solid ${C.border}`, borderTop: 'none', padding: '20px', minHeight: '200px' }}>
              {selectedGame?.loading && (
                <div style={{ color: C.muted, fontSize: '14px', padding: '16px 0' }}>Loading inventory…</div>
              )}
              {selectedGame?.error && (
                <div style={{ color: '#e74c3c', fontSize: '14px', background: C.card, padding: '12px 16px', borderRadius: '4px' }}>
                  {selectedGame.error}
                </div>
              )}
              {selectedGame && !selectedGame.loading && !selectedGame.error && selectedGame.items.length === 0 && (
                <div style={{ color: C.muted, fontSize: '14px', padding: '16px 0' }}>This inventory is empty.</div>
              )}
              {selectedGame && !selectedGame.loading && !selectedGame.error && selectedGame.items.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {selectedGame.items.map((item) => (
                    <ItemSquare key={`${item.classid}_${item.instanceid}`} item={item} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
