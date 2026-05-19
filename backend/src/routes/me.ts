import { Router } from 'express';
import type { SteamUser } from '../types/steam';

const router = Router();

router.get('/', (req, res) => {
  if (!req.session.user) {
    return res.json({ authenticated: false, user: null });
  }
  res.json({ authenticated: true, user: req.session.user as SteamUser });
});

export default router;
