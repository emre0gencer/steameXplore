import { Request, Response, NextFunction } from 'express';
import '../types/steam';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}
