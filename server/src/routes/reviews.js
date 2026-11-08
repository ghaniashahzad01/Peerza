import { Router } from 'express';
import { Review, Meeting } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyUser } from '../notifications.js';
const routerReviews = Router();
routerReviews.get('/reviews/mine', requireAuth, async (req, res, next) => { try { res.json(await Review.find({ reviewer: req.user.id }).select('meeting')); } catch (e) { next(e); } });
routerReviews.post('/reviews', requireAuth, async (req, res, next) => {
  try {
    const { reviewedUser, rating, comment = '', meeting } = req.body;
    if (!reviewedUser || !meeting || !Number.isInteger(Number(rating)) || rating < 1 || rating > 5 || String(reviewedUser) === String(req.user.id)) return res.status(400).json({ message: 'A completed session, another learner, and a rating from 1 to 5 are required.' });
    const done = await Meeting.exists({ _id: meeting, status: 'completed', $or: [{ requester: req.user.id, recipient: reviewedUser }, { requester: reviewedUser, recipient: req.user.id }] });
    if (!done) return res.status(403).json({ message: 'Reviews are available after a completed meeting.' });
    if (await Review.exists({ reviewer: req.user.id, meeting })) return res.status(409).json({ message: 'You have already reviewed this session.' });
    const review = await Review.create({ reviewer: req.user.id, reviewedUser, rating, comment, meeting });
    const io = req.app.get('io');
    try { await notifyUser(io, { user: reviewedUser, actor: req.user.id, type: 'review', title: 'A new learner review', body: `${req.user.name} left you a ${rating}-star review${comment ? `: ${comment}` : '.'}`.slice(0, 240), link: 'discover', entityId: review._id }); }
    catch (notificationError) { console.error('Review notification could not be saved:', notificationError.message); }
    res.status(201).json(review);
  } catch (e) { next(e); }
});
routerReviews.get('/users/:id/reviews', requireAuth, async (req, res, next) => { try { res.json(await Review.find({ reviewedUser: req.params.id }).populate('reviewer', 'name avatar').sort({ createdAt: -1 })); } catch (e) { next(e); } });
export default routerReviews;
