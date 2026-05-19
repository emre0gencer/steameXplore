import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import type { SteamUser } from '../types/steam';

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user: Express.User, done) => {
  done(null, user);
});

passport.use(
  new SteamStrategy(
    {
      returnURL: `${process.env.BACKEND_URL}/auth/steam/callback`,
      realm: process.env.BACKEND_URL!,
      apiKey: process.env.STEAM_API_KEY!,
    },
    (_identifier: string, profile: any, done: (err: unknown, user?: SteamUser) => void) => {
      const user: SteamUser = {
        steamid: profile.id,
        displayName: profile.displayName,
        avatar: {
          small: profile.photos?.[0]?.value ?? '',
          medium: profile.photos?.[1]?.value ?? '',
          large: profile.photos?.[2]?.value ?? '',
        },
        profileUrl: profile._json?.profileurl ?? '',
        visibility: profile._json?.communityvisibilitystate ?? 1,
      };
      return done(null, user);
    }
  )
);

export default passport;
