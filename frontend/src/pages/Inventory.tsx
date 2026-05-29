import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, getInventory, getPublicInventory, logout, getSteamPrice, getSkinportPrices, InventoryUnavailableError } from '../api/steamApi';
import type { SkinportPriceResult, SteamPriceResult } from '../api/steamApi';
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
  appid: number;
  name: string;
  market_name: string;
  market_hash_name: string;
  icon_url: string;
  icon_url_large: string;
  name_color: string;
  background_color: string;
  type: string;
  tradable: number;
  marketable: number;
  commodity: number;
  market_tradable_restriction?: number;
  descriptions: { type: string; value: string; color?: string }[];
  actions: { link: string; name: string }[];
  fraudwarnings: string[];
  tags: { category: string; internal_name: string; localized_category_name: string; localized_tag_name: string; color?: string }[];
  quantity: number;
}

interface GameInventory {
  appid: number;
  name: string;
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  // ms timestamp at which an auto-retry should fire. null = no pending retry.
  retryAt: number | null;
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
      appid: desc.appid,
      name: desc.name,
      market_name: desc.market_name,
      market_hash_name: desc.market_hash_name ?? desc.market_name,
      icon_url: desc.icon_url,
      icon_url_large: desc.icon_url_large ?? desc.icon_url,
      name_color: desc.name_color ?? '',
      background_color: desc.background_color ?? '',
      type: desc.type ?? '',
      tradable: desc.tradable,
      marketable: desc.marketable,
      commodity: desc.commodity ?? 0,
      market_tradable_restriction: desc.market_tradable_restriction,
      descriptions: desc.descriptions ?? [],
      actions: desc.actions ?? [],
      fraudwarnings: desc.fraudwarnings ?? [],
      tags: desc.tags ?? [],
      quantity: quantityMap.get(key) ?? 1,
    });
  }
  return items;
}

function ItemSquare({ item, onClick }: { item: InventoryItem; onClick: () => void }) {
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
      onClick={onClick}
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
        }}>
          <div style={{ color: rarityColor, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {item.name}
          </div>
          {item.type && (
            <div style={{ color: C.muted, fontSize: '11px', marginTop: '4px' }}>{item.type}</div>
          )}
          <div style={{ marginTop: '4px', fontSize: '11px', color: C.muted, fontStyle: 'italic' }}>Click for details</div>
        </div>
      )}
    </div>
  );
}

function ItemModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const rarityColor = item.name_color ? `#${item.name_color}` : C.accent;
  const bgColor = item.background_color ? `#${item.background_color}` : '#1e2d3d';
  const iconUrl = `https://steamcommunity-a.akamaihd.net/economy/image/${item.icon_url_large || item.icon_url}/256fx256f`;
  const marketUrl = `https://steamcommunity.com/market/listings/${item.appid}/${encodeURIComponent(item.market_hash_name)}`;

  const [steamPrice, setSteamPrice] = useState<SteamPriceResult | null | undefined>(undefined);
  const [skinportPrice, setSkinportPrice] = useState<SkinportPriceResult | null | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (item.marketable !== 1) return;
    getSteamPrice(item.appid, item.market_hash_name)
      .then((data) => setSteamPrice(data))
      .catch(() => setSteamPrice(null));
    if (item.appid === 730) {
      getSkinportPrices([item.market_hash_name])
        .then((map) => setSkinportPrice(map[item.market_hash_name] ?? null))
        .catch(() => setSkinportPrice(null));
    }
  }, [item.appid, item.market_hash_name, item.marketable]);

  const descLines = item.descriptions.filter((d) => d.value && d.value.trim() && d.value !== ' ');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.card,
          border: `1px solid ${rarityColor}`,
          borderRadius: '6px',
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: `0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px ${rarityColor}22`,
          fontFamily: '"Motiva Sans", Arial, sans-serif',
        }}
      >
        {/* Header: image + name */}
        <div style={{
          display: 'flex', gap: '20px', alignItems: 'flex-start',
          padding: '24px 24px 20px',
          borderBottom: `1px solid ${C.border}`,
          background: bgColor !== '#1e2d3d' ? `${bgColor}22` : undefined,
        }}>
          <div style={{
            width: '128px', height: '128px', flexShrink: 0,
            background: bgColor, borderRadius: '4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${C.border}`,
          }}>
            <img src={iconUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '3px' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: rarityColor, fontSize: '18px', fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word', marginBottom: '6px' }}>
              {item.name}
            </div>
            {item.marketable === 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                <span style={{ color: '#66c0f4' }}>
                  Steam:{' '}
                  {steamPrice === undefined
                    ? <span style={{ opacity: 0.5, fontWeight: 400, fontSize: '12px' }}>loading…</span>
                    : steamPrice?.lowest_price
                      ? steamPrice.lowest_price
                      : <span style={{ opacity: 0.5, fontWeight: 400, fontSize: '12px' }}>N/A</span>
                  }
                </span>
                {item.appid === 730 && (
                  <span style={{ color: '#7ddc7d' }}>
                    Skinport:{' '}
                    {skinportPrice === undefined
                      ? <span style={{ opacity: 0.5, fontWeight: 400, fontSize: '12px' }}>loading…</span>
                      : skinportPrice?.min_price != null
                        ? `$${skinportPrice.min_price.toFixed(2)}`
                        : <span style={{ opacity: 0.5, fontWeight: 400, fontSize: '12px' }}>N/A</span>
                    }
                  </span>
                )}
              </div>
            )}
            {item.type && (
              <div style={{ color: C.muted, fontSize: '13px', marginBottom: '8px' }}>{item.type}</div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              <Badge color={item.tradable === 1 ? '#5ba32b' : '#888'} label={item.tradable === 1 ? 'Tradable' : 'Not Tradable'} />
              <Badge color={item.marketable === 1 ? '#5ba32b' : '#888'} label={item.marketable === 1 ? 'Marketable' : 'Not Marketable'} />
              {item.quantity > 1 && <Badge color={C.accent} label={`×${item.quantity} in inventory`} />}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 0 4px', flexShrink: 0, alignSelf: 'flex-start' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Fraud warnings */}
          {item.fraudwarnings.length > 0 && (
            <div style={{ background: '#4a1818', border: '1px solid #c0392b', borderRadius: '4px', padding: '10px 14px' }}>
              {item.fraudwarnings.map((w, i) => (
                <div key={i} style={{ color: '#e74c3c', fontSize: '13px' }}>{w}</div>
              ))}
            </div>
          )}

          {/* Description lines */}
          {descLines.length > 0 && (
            <div style={{ background: C.surface, borderRadius: '4px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {descLines.map((d, i) => (
                <div
                  key={i}
                  style={{ fontSize: '13px', color: d.color ? `#${d.color}` : C.text, lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: d.value.replace(/\n/g, '<br/>') }}
                />
              ))}
            </div>
          )}

          {/* Tags */}
          {item.tags.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>Properties</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {item.tags.map((tag, i) => (
                  <div key={i} style={{ background: C.surface, borderRadius: '3px', padding: '6px 10px' }}>
                    <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                      {tag.localized_category_name}
                    </div>
                    <div style={{ fontSize: '13px', color: tag.color ? `#${tag.color}` : C.text }}>
                      {tag.localized_tag_name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market trade restriction */}
          {item.market_tradable_restriction != null && item.market_tradable_restriction > 0 && (
            <div style={{ fontSize: '12px', color: C.muted }}>
              Trade hold: {item.market_tradable_restriction} day{item.market_tradable_restriction !== 1 ? 's' : ''}
            </div>
          )}

          {/* Meta info */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <MetaRow label="Market name" value={item.market_hash_name} />
            <MetaRow label="Class ID" value={item.classid} />
            <MetaRow label="Instance ID" value={item.instanceid} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {item.marketable === 1 && (
              <a
                href={marketUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: '#4c7a2e', color: '#fff', padding: '8px 16px',
                  borderRadius: '3px', fontSize: '13px', textDecoration: 'none',
                  fontWeight: 600, letterSpacing: '0.3px',
                }}
              >
                View on Steam Market
              </a>
            )}
            {item.actions.map((action, i) => {
              const link = action.link.replace('%assetid%', item.classid).replace('%owner_steamid%', '');
              return (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: C.surface, color: C.accent, padding: '8px 16px',
                    borderRadius: '3px', fontSize: '13px', textDecoration: 'none',
                    border: `1px solid ${C.border}`,
                  }}
                >
                  {action.name}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      background: `${color}22`, border: `1px solid ${color}66`,
      color, borderRadius: '3px', padding: '2px 8px', fontSize: '11px', fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
      <span style={{ color: C.muted, minWidth: '100px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.text, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

// ── Rarity sorting ─────────────────────────────────────────────────────────────

const RARITY_RANK: Record<string, number> = {
  'e4ae39': 0, // CS2 Contraband
  'eb4b4b': 1, // CS2 Covert
  'd32ce6': 2, // CS2 Classified
  '8847ff': 3, // CS2 Restricted
  '4b69ff': 4, // CS2 Mil-Spec
  '5e98d9': 5, // CS2 Industrial
  'b0c3d9': 6, // CS2 Consumer
  'ffd700': 0, // TF2 Unusual
  'aa0000': 1, // TF2 Collector's
  '8650ac': 3, // TF2 Community
  'e29b00': 1, // Dota Immortal
  'aaaa00': 2, // Dota Ancient
};

function itemRarityRank(item: InventoryItem): number {
  const rarityTag = item.tags.find(t => t.category === 'Rarity');
  const colorKey = (rarityTag?.color || item.name_color || '').toLowerCase().replace(/^#/, '');
  return RARITY_RANK[colorKey] ?? 999;
}

function sortByRarity(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => {
    const diff = itemRarityRank(a) - itemRarityRank(b);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

function getTagValue(item: InventoryItem, category: string): string {
  return item.tags.find(t => t.category === category)?.localized_tag_name ?? '';
}

// ── Inventory page ──────────────────────────────────────────────────────────────

export default function Inventory({ targetSteamId }: { targetSteamId?: string } = {}) {
  const isOwnProfile = !targetSteamId;
  const [user, setUser] = useState<SteamUser | null>(null);
  const [gameInventories, setGameInventories] = useState<GameInventory[]>([]);
  const [selectedAppid, setSelectedAppid] = useState<number>(TARGET_GAMES[0].appid);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [filterType, setFilterType] = useState('All');
  const [filterRarity, setFilterRarity] = useState('All');
  const [filterExterior, setFilterExterior] = useState('All');
  const [filterQuality, setFilterQuality] = useState('All');
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(({ authenticated, user: u }) => {
      if (isOwnProfile && !authenticated) {
        navigate('/');
        return;
      }
      if (u) setUser(u);
      loadInventories();
    });
  }, [navigate, targetSteamId]);

  // Reset CS2 filters when switching tabs
  useEffect(() => {
    setFilterType('All');
    setFilterRarity('All');
    setFilterExterior('All');
    setFilterQuality('All');
  }, [selectedAppid]);

  // Fetch one game's inventory and merge the result into state.
  // On a backend cooldown response (503 with retry_after_seconds), schedules an
  // auto-retry via retryAt so the per-second timer effect below can re-fire it.
  async function fetchOneGame(game: { appid: number; name: string }) {
    try {
      const data = isOwnProfile
        ? await getInventory(game.appid)
        : await getPublicInventory(targetSteamId!, game.appid);
      const items = buildItems(data);
      setGameInventories((prev) =>
        prev.map((g) =>
          g.appid === game.appid ? { ...g, items, loading: false, error: null, retryAt: null } : g
        )
      );
    } catch (err) {
      const msg = (err as Error).message;
      const retryAfter = err instanceof InventoryUnavailableError ? err.retryAfterSeconds : undefined;
      const friendly = msg.includes('No inventory found')
        ? 'No items — this game has no inventory for this account.'
        : msg;
      setGameInventories((prev) =>
        prev.map((g) =>
          g.appid === game.appid
            ? {
                ...g,
                loading: false,
                error: friendly,
                retryAt: retryAfter ? Date.now() + retryAfter * 1000 : null,
              }
            : g
        )
      );
    }
  }

  async function loadInventories() {
    // For the own profile, filter TARGET_GAMES to only games the user owns.
    // For public profiles the game list may be private, so try all.
    let gamesToLoad = TARGET_GAMES;
    if (isOwnProfile) {
      try {
        const owned = await getGames();
        const ownedSet = new Set(owned.games.map((g) => g.appid));
        gamesToLoad = TARGET_GAMES.filter((tg) => ownedSet.has(tg.appid));
      } catch {
        // If we can't fetch the game list, fall back to trying all
      }
    }

    const initial: GameInventory[] = TARGET_GAMES.map((tg) => ({
      appid: tg.appid,
      name: tg.name,
      items: [],
      loading: gamesToLoad.some((g) => g.appid === tg.appid),
      error: gamesToLoad.some((g) => g.appid === tg.appid) ? null : 'Not in library',
      retryAt: null,
    }));
    setGameInventories(initial);

    // Load sequentially with a small gap to avoid Steam rate-limiting parallel requests
    for (let i = 0; i < gamesToLoad.length; i++) {
      await fetchOneGame(gamesToLoad[i]);
      if (i < gamesToLoad.length - 1) await new Promise(r => setTimeout(r, 600));
    }
  }

  // 1-second tick for countdown UI + auto-retry on any game whose retryAt has elapsed.
  // Uses a ref so we don't re-create the interval on every state change.
  const giRef = useRef<GameInventory[]>([]);
  useEffect(() => { giRef.current = gameInventories; }, [gameInventories]);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      const now = Date.now();
      const due = giRef.current.filter((g) => g.retryAt !== null && g.retryAt <= now && !g.loading);
      if (due.length === 0) return;
      setGameInventories((prev) =>
        prev.map((g) =>
          due.some((d) => d.appid === g.appid)
            ? { ...g, loading: true, error: null, retryAt: null }
            : g
        )
      );
      for (const g of due) {
        fetchOneGame({ appid: g.appid, name: g.name });
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const selectedGame = gameInventories.find((g) => g.appid === selectedAppid);
  const sortedItems = selectedGame ? sortByRarity(selectedGame.items) : [];

  // CS2 filter options (dynamic from loaded items)
  const cs2Items = selectedAppid === 730 ? sortedItems : [];
  const typeOptions = ['All', ...Array.from(new Set(cs2Items.map(i => getTagValue(i, 'Type')).filter(Boolean))).sort()];
  const rarityOptions = ['All', ...Array.from(new Set(cs2Items.map(i => getTagValue(i, 'Rarity')).filter(Boolean))).sort()];
  const exteriorOptions = ['All', ...Array.from(new Set(cs2Items.map(i => getTagValue(i, 'Exterior')).filter(Boolean))).sort()];
  const qualityOptions = ['All', ...Array.from(new Set(cs2Items.map(i => getTagValue(i, 'Quality')).filter(Boolean))).sort()];

  const filteredItems = selectedAppid === 730 ? sortedItems.filter(item => {
    if (filterType !== 'All' && getTagValue(item, 'Type') !== filterType) return false;
    if (filterRarity !== 'All' && getTagValue(item, 'Rarity') !== filterRarity) return false;
    if (filterExterior !== 'All' && getTagValue(item, 'Exterior') !== filterExterior) return false;
    if (filterQuality !== 'All' && getTagValue(item, 'Quality') !== filterQuality) return false;
    return true;
  }) : sortedItems;

  if (!user && isOwnProfile) {
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
        <NavLink label="Dashboard" onClick={() => navigate('/')} active={false} />
        <NavLink label="Inventory" onClick={() => navigate('/inventory')} active={isOwnProfile} />
        <NavLink label="Search Users" onClick={() => navigate('/search')} active={false} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user ? (
            <>
              <img src={user.avatar.small} alt="" style={{ width: '28px', height: '28px', borderRadius: '3px' }} />
              <span style={{ fontSize: '13px', color: C.text }}>{user.displayName}</span>
              <button
                onClick={handleLogout}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '4px 12px', cursor: 'pointer', borderRadius: '2px', fontSize: '12px' }}
              >
                Sign Out
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/')}
              style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '4px 12px', cursor: 'pointer', borderRadius: '2px', fontSize: '12px' }}
            >
              Sign In
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '28px 24px' }}>
        {/* Back button for other profiles */}
        {!isOwnProfile && (
          <div style={{ marginBottom: '16px' }}>
            <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '5px 14px', cursor: 'pointer', borderRadius: '3px', fontSize: '12px', fontFamily: 'inherit' }}>
              ← Back
            </button>
          </div>
        )}

        <h1 style={{ fontSize: '22px', fontWeight: 300, margin: '0 0 24px 0', color: C.text, letterSpacing: '1px', textTransform: 'uppercase' }}>
          Inventory
        </h1>

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
                    <span style={{ fontWeight: isActive ? 600 : 400 }}>{game.name}</span>
                    {game.loading ? (
                      <span style={{ fontSize: '11px', color: C.muted, fontStyle: 'italic' }}>loading…</span>
                    ) : game.error ? (
                      <span style={{ fontSize: '11px', color: game.error === 'Not in library' || game.error.startsWith('No items') ? C.muted : '#e74c3c' }}>
                        {game.error === 'Not in library' ? '—' : game.error.startsWith('No items') ? '0' : '!'}
                      </span>
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

            {/* CS2 filter bar */}
            {selectedAppid === 730 && selectedGame && !selectedGame.loading && !selectedGame.error && selectedGame.items.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: 'none', padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                {[
                  { label: 'Type', value: filterType, setter: setFilterType, options: typeOptions },
                  { label: 'Rarity', value: filterRarity, setter: setFilterRarity, options: rarityOptions },
                  { label: 'Exterior', value: filterExterior, setter: setFilterExterior, options: exteriorOptions },
                  { label: 'Quality', value: filterQuality, setter: setFilterQuality, options: qualityOptions },
                ].map(({ label, value, setter, options }) => options.length > 2 && (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
                    <select
                      value={value}
                      onChange={e => setter(e.target.value)}
                      style={{
                        background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                        padding: '3px 8px', borderRadius: '3px', fontSize: '12px', cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                ))}
                {(filterType !== 'All' || filterRarity !== 'All' || filterExterior !== 'All' || filterQuality !== 'All') && (
                  <button
                    onClick={() => { setFilterType('All'); setFilterRarity('All'); setFilterExterior('All'); setFilterQuality('All'); }}
                    style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '3px 10px', cursor: 'pointer', borderRadius: '3px', fontSize: '11px', fontFamily: 'inherit' }}
                  >
                    Clear
                  </button>
                )}
                <span style={{ fontSize: '11px', color: C.muted, marginLeft: 'auto' }}>
                  {filteredItems.length} / {selectedGame.items.length} items
                </span>
              </div>
            )}

            {/* Items panel */}
            <div style={{ background: C.surface, borderRadius: '0 0 4px 4px', border: `1px solid ${C.border}`, borderTop: 'none', padding: '20px', minHeight: '200px' }}>
              {selectedGame?.loading && (
                <div style={{ color: C.muted, fontSize: '14px', padding: '16px 0' }}>Loading inventory…</div>
              )}
              {selectedGame?.error && (() => {
                const cooldownLeft = selectedGame.retryAt !== null
                  ? Math.max(0, Math.ceil((selectedGame.retryAt - Date.now()) / 1000))
                  : 0;
                const isCooldown = cooldownLeft > 0;
                const isBenign = selectedGame.error === 'Not in library' || selectedGame.error.startsWith('No items');
                return (
                  <div style={{
                    color: isCooldown ? '#f1c40f' : isBenign ? C.muted : '#e74c3c',
                    fontSize: '14px', background: C.card, padding: '12px 16px', borderRadius: '4px',
                  }}>
                    {isCooldown
                      ? `Steam is throttling inventory requests — auto-retrying in ${cooldownLeft}s…`
                      : selectedGame.error}
                  </div>
                );
              })()}
              {selectedGame && !selectedGame.loading && !selectedGame.error && filteredItems.length === 0 && (
                <div style={{ color: C.muted, fontSize: '14px', padding: '16px 0' }}>
                  {selectedGame.items.length === 0 ? 'This inventory is empty.' : 'No items match the current filters.'}
                </div>
              )}
              {selectedGame && !selectedGame.loading && !selectedGame.error && filteredItems.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {filteredItems.map((item) => (
                    <ItemSquare key={`${item.classid}_${item.instanceid}`} item={item} onClick={() => setSelectedItem(item)} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {selectedItem && <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
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
