import session from 'express-session';

// WARNING: MemoryStore is NOT production-ready.
// It leaks memory and does not persist across restarts.
// Replace with connect-redis + RedisStore before deploying.
export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});
