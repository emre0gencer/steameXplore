export interface SteamUser {
  steamid: string;
  displayName: string;
  avatar: { small: string; medium: string; large: string };
  profileUrl: string;
  visibility: number; // 1=private, 3=public (communityvisibilitystate)
}

declare module 'express-session' {
  interface SessionData {
    user?: SteamUser;
  }
}
