import express from 'express';
import cors from 'cors';
import { sessionMiddleware } from './config/session';
import passport from './config/passport';
import authRouter from './routes/auth';
import meRouter from './routes/me';
import healthRouter from './routes/health';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/health', healthRouter);

export default app;
