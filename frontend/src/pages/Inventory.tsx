import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, getInventory, logout, getSteamPrice, getSkinportPrices } from '../api/steamApi';
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

export default function Inventory() {
  const [user, setUser] = useState<SteamUser | null>(null);
  const [gameInventories, setGameInventories] = useState<GameInventory[]>([]);
  const [selectedAppid, setSelectedAppid] = useState<number>(TARGET_GAMES[0].appid);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
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
    const initial: GameInventory[] = TARGET_GAMES.map((tg) => ({
      appid: tg.appid,
      name: tg.name,
      items: [],
      loading: true,
      error: null,
    }));
    setGameInventories(initial);

    await Promise.all(
      initial.map(async (game) => {
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
        <NavLink label="Search Users" onClick={() => navigate('/search')} active={false} />
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
