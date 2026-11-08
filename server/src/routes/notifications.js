import { Router } from 'express';
import { Notification } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [items, unreadCount] = await Promise.all([
      Notification.find({ user: req.user.id }).populate('actor', 'name avatar').sort({ createdAt: -1 }).limit(30),
      Notification.countDocuments({ user: req.user.id, readAt: null })
    ]);
    res.json({ items, unreadCount });
  } catch (e) { next(e); }
});
router.patch('/read-all', requireAuth, async (req, res, next) => {
  try { await Notification.updateMany({ user: req.user.id, readAt: null }, { $set: { readAt: new Date() } }); res.json({ ok: true }); }
  catch (e) { next(e); }
});
router.patch('/messages/:actorId/read', requireAuth, async (req, res, next) => {
  try {
    const result = await Notification.updateMany({ user: req.user.id, actor: req.params.actorId, type: 'message', readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true, count: result.modifiedCount });
  } catch (e) { next(e); }
});
router.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { $set: { readAt: new Date() } }, { new: true });
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json(notification);
  } catch (e) { next(e); }
});
export default router;
