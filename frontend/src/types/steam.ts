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
  icon_url: string;
  icon_url_large: string;
  name_color: string;
  background_color: string;
  type: string;
  tradable: number;
  marketable: number;
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
