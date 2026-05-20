export interface SteamUser {
  steamid: string;
  displayName: string;
  avatar: { small: string; medium: string; large: string };
  profileUrl: string;
  visibility: number; // 1=private, 3=public
}

export interface OwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_2weeks?: number;
  img_icon_url: string;
}

export interface OwnedGamesResponse {
  game_count: number;
  games: OwnedGame[];
}

export interface InventoryAsset {
  appid: number;
  contextid: string;
  assetid: string;
  classid: string;
  instanceid: string;
  amount: string;
}

export interface InventoryDescription {
  appid: number;
  classid: string;
  instanceid: string;
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
  descriptions?: { type: string; value: string; color?: string }[];
  actions?: { link: string; name: string }[];
  fraudwarnings?: string[];
  tags: {
    category: string;
    internal_name: string;
    localized_category_name: string;
    localized_tag_name: string;
    color?: string;
  }[];
}

export interface InventoryResponse {
  assets: InventoryAsset[];
  descriptions: InventoryDescription[];
  total_inventory_count: number;
}

export interface AccountValueGame {
  appid: number;
  name: string;
  img_icon_url: string;
  initialprice_cents: number;
}

export interface AccountValueItem {
  appid: number;
  name: string;
  market_hash_name: string;
  icon_url: string;
  price_cents: number;
  quantity: number;
}

export interface AccountValueData {
  games: {
    total_cents: number;
    game_count: number;
    priced_count: number;
    top_games: AccountValueGame[];
  };
  inventory: {
    total_cents: number;
    cs2_cents: number;
    dota2_cents: number;
    tf2_cents: number;
    rust_cents: number;
    top_items: AccountValueItem[];
  };
  badges: {
    total_cents: number;
    badge_count: number;
    priced_count: number;
  };
  grand_total_cents: number;
  cached_at: number;
}
