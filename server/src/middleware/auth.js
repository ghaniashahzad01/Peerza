import jwt from 'jsonwebtoken';
import { User } from '../models.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'development-only-secret');
    req.user = await User.findById(payload.id);
    if (!req.user) return res.status(401).json({ message: 'Account not found.' });
    next();
  } catch { res.status(401).json({ message: 'Your session is invalid or has expired.' }); }
}
