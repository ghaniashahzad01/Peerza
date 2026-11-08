import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Review } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
const tokenFor = (user) => jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'development-only-secret', { expiresIn: '7d' });
export const safeUser = (user) => ({
  id: user.id || user._id,
  name: user.name,
  email: user.email,
  bio: user.bio,
  avatar: user.avatar,
  location: user.location,
  interests: user.interests,
  isDemo: Boolean(user.isDemo),
  experience: user.experience || [],
  certificates: user.certificates || [],
  evidenceComplete: Boolean(
    (user.experience && user.experience.length) ||
    (user.certificates && user.certificates.length)
  )
});

router.post('/register', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return res.status(400).json({ message: 'Enter a valid email, your name, and a password of at least 8 characters.' });
    const exists = await User.exists({ email });
    if (exists) return res.status(409).json({ message: 'An account with this email already exists.' });
    const user = await User.create({ name: name.trim(), email, password: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
  } catch (e) { next(e); }
});
router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Email or password is incorrect.' });
    res.json({ token: tokenFor(user), user: safeUser(user) });
  } catch (e) { next(e); }
});
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const reviews = await Review.find({ reviewedUser: req.user._id });
    const rating = reviews.length ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)) : null;
    res.json({
      user: {
        ...safeUser(req.user),
        rating,
        reviewCount: reviews.length
      }
    });
  } catch (e) { next(e); }
});
export default router;
