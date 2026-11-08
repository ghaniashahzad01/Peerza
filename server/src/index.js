import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import mongoose from 'mongoose';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import skillRoutes from './routes/skills.js';
import matchRoutes from './routes/matches.js';
import messageRoutes from './routes/messages.js';
import meetingRoutes from './routes/meetings.js';
import reviewRoutes from './routes/reviews.js';
import notificationRoutes from './routes/notifications.js';
import profileRoutes from './routes/profile.js';
import { attachRealtime } from './realtime.js';
import path from 'node:path';
import fs from 'node:fs';

const app = express();
const server = createServer(app);
const configuredClientOrigin = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
const allowedClientOrigins = [
  configuredClientOrigin,
  ...[5173, 5174, 5175].flatMap(port => [`http://localhost:${port}`, `http://127.0.0.1:${port}`])
];

const corsOriginChecker = (origin, callback) => {
  if (!origin) return callback(null, true);
  const cleanOrigin = origin.replace(/\/+$/, '');
  if (
    allowedClientOrigins.includes(cleanOrigin) ||
    cleanOrigin.endsWith('.vercel.app') ||
    process.env.NODE_ENV !== 'production'
  ) {
    return callback(null, true);
  }
  return callback(null, true);
};

app.use(cors({ origin: corsOriginChecker, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Peerza API' }));
app.use('/api/auth', authRoutes);
app.use('/api', reviewRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user-skills', skillRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api', messageRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500);
  const message = err.code === 11000 ? 'An account with this email already exists.' : err.message || 'Something went wrong.';
  res.status(status).json({ message });
});

const port = process.env.PORT || 5000;
const io = attachRealtime(server, corsOriginChecker);
app.set('io', io);
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peerza')
  .then(() => server.listen(port, () => console.log(`Peerza API listening on ${port} with live updates`)))
  .catch((error) => { console.error('MongoDB connection failed:', error.message); process.exit(1); });
