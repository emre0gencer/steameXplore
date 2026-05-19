import { Router } from 'express';
import passport from '../config/passport';
import type { SteamUser } from '../types/steam';

const router = Router();

router.get('/steam', passport.authenticate('steam'));

router.get(
  '/steam/callback',
  passport.authenticate('steam', { failureRedirect: '/' }),
  (req, res) => {
    req.session.user = req.user as SteamUser;
    req.session.save(() => {
      res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    });
  }
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

export default router;
