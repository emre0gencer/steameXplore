import express from 'express';
import cors from 'cors';
import { sessionMiddleware } from './config/session';
import passport from './config/passport';
import authRouter from './routes/auth';
import meRouter from './routes/me';
import healthRouter from './routes/health';
import gamesRouter from './routes/games';
import friendsRouter from './routes/friends';
import bansRouter from './routes/bans';
import achievementsRouter from './routes/achievements';
import statsRouter from './routes/stats';
import groupsRouter from './routes/groups';
import levelRouter from './routes/level';
import inventoryRouter from './routes/inventory';
import schemaRouter from './routes/schema';
import priceRouter from './routes/price';
import searchRouter from './routes/search';
import userRouter from './routes/user';
import accountValueRouter from './routes/accountValue';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRouter);
app.use('/api/health', healthRouter);
app.use('/api/me', meRouter);
app.use('/api/games', gamesRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/bans', bansRouter);
app.use('/api/achievements', achievementsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/level', levelRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/schema', schemaRouter);
app.use('/api/price', priceRouter);
app.use('/api/search', searchRouter);
app.use('/api/user', userRouter);
app.use('/api/account-value', accountValueRouter);

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { markHostThrottled, isHostThrottled } = require('./services/httpQueue') as typeof import('./services/httpQueue');
  app.post('/debug/trip-breaker', (_req, res) => {
    markHostThrottled('steamcommunity.com', 60_000);
    res.json({ throttledFor: isHostThrottled('steamcommunity.com') });
  });
  app.get('/debug/breaker', (_req, res) => {
    res.json({ throttledFor: isHostThrottled('steamcommunity.com') });
  });
}

export default app;
