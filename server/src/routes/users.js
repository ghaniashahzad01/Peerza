import { Router } from 'express';
import { User, UserSkill, Review } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
import {
  handleAvatarUpload,
  saveOrUpdateAvatar,
  deleteAvatar,
  serveAvatar
} from '../avatarUtils.js';
import { serveCertificate } from '../certificateUtils.js';

const router = Router();
const publicFields = 'name bio avatar location interests experience certificates isDemo createdAt';

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query = {};

    // Exclude specified user if requested (e.g. Discover page excludes logged-in user)
    const excludeId = req.query.exclude;
    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    // Normal Discover: display actual registered users from MongoDB (excluding demo users when requested)
    if (req.query.includeDemo === 'false' || req.query.excludeDemo === 'true') {
      query.isDemo = { $ne: true };
      query.email = { $not: /@peerza\.demo$/i };
    } else if (req.query.demoOnly === 'true') {
      query.$or = [{ isDemo: true }, { email: /@peerza\.demo$/i }];
    }

    const category = (req.query.category || '').trim();
    const skillFilter = {};
    if (category && !/^all\s*people$/i.test(category)) {
      skillFilter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
    }

    const search = String(req.query.search || req.query.skill || '').trim();
    if (search) {
      skillFilter.name = new RegExp(escapeRegex(search), 'i');
    }

    if (search) {
      const filteredSkillUsers = await UserSkill.find(skillFilter).distinct('user');
      const nameFilter = { name: new RegExp(escapeRegex(search), 'i') };
      if (skillFilter.category) {
        const catUsers = await UserSkill.find({ category: skillFilter.category }).distinct('user');
        nameFilter._id = { $in: catUsers };
      }
      const nameUsers = await User.find(nameFilter).distinct('_id');
      const matchUserIds = [...new Set([...filteredSkillUsers.map(String), ...nameUsers.map(String)])];
      query._id = query._id ? { ...query._id, $in: matchUserIds } : { $in: matchUserIds };
    } else if (skillFilter.category) {
      const catUsers = await UserSkill.find(skillFilter).distinct('user');
      query._id = query._id ? { ...query._id, $in: catUsers } : { $in: catUsers };
    }

    const users = await User.find(query).select(publicFields).limit(100);
    const allSkills = await UserSkill.find({ user: { $in: users.map((u) => u._id) } });
    const reviews = await Review.aggregate([
      { $match: { reviewedUser: { $in: users.map((u) => u._id) } } },
      { $group: { _id: '$reviewedUser', rating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }
    ]);

    const rows = users.map((user) => {
      const userSkills = allSkills.filter((s) => String(s.user) === String(user.id));
      const score = reviews.find((r) => String(r._id) === String(user.id));
      const hasExp = Boolean(user.experience && user.experience.length);
      const hasCert = Boolean(user.certificates && user.certificates.length);
      return {
        ...user.toObject(),
        skills: userSkills,
        categories: [...new Set(userSkills.map((s) => s.category))],
        rating: score?.rating ? Number(score.rating.toFixed(1)) : null,
        reviewCount: score?.reviewCount || 0,
        evidenceComplete: Boolean(hasExp || hasCert)
      };
    });

    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const fields = ['name', 'bio', 'location', 'interests'];
    for (const field of fields) {
      if (req.body[field] !== undefined) req.user[field] = req.body[field];
    }
    // If avatar was explicitly cleared
    if (req.body.avatar === '') req.user.avatar = '';
    await req.user.save();

    const hasExp = Boolean(req.user.experience && req.user.experience.length);
    const hasCert = Boolean(req.user.certificates && req.user.certificates.length);

    res.json({
      user: {
        id: req.user.id || req.user._id,
        name: req.user.name,
        email: req.user.email,
        bio: req.user.bio,
        avatar: req.user.avatar,
        location: req.user.location,
        interests: req.user.interests,
        experience: req.user.experience,
        certificates: req.user.certificates,
        evidenceComplete: Boolean(hasExp || hasCert)
      }
    });
  } catch (e) {
    next(e);
  }
});

// Authenticated current user avatar endpoints
router.post('/profile/avatar', requireAuth, handleAvatarUpload, saveOrUpdateAvatar);
router.post('/me/avatar', requireAuth, handleAvatarUpload, saveOrUpdateAvatar);
router.put('/profile/avatar', requireAuth, handleAvatarUpload, saveOrUpdateAvatar);
router.put('/me/avatar', requireAuth, handleAvatarUpload, saveOrUpdateAvatar);
router.delete('/profile/avatar', requireAuth, deleteAvatar);
router.delete('/me/avatar', requireAuth, deleteAvatar);
router.get('/profile/avatar', requireAuth, (req, res, next) => serveAvatar(req.user._id, res, next));
router.get('/me/avatar', requireAuth, (req, res, next) => serveAvatar(req.user._id, res, next));

// Binary image retrieval by user ID (public)
router.get('/:id/avatar', (req, res, next) => serveAvatar(req.params.id, res, next));

// Certificate file retrieval (public)
router.get('/certificates/:id/file', (req, res, next) => serveCertificate(req.params.id, res, next));
router.get('/:userId/certificates/:id/file', (req, res, next) => serveCertificate(req.params.id, res, next));

// Specific public profile endpoint
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(publicFields);
    if (!user) return res.status(404).json({ message: 'Profile not found.' });

    const [skills, reviews] = await Promise.all([
      UserSkill.find({ user: user.id }),
      Review.find({ reviewedUser: user.id }).populate('reviewer', 'name avatar').sort({ createdAt: -1 })
    ]);

    const rating = reviews.length
      ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
      : null;

    const hasExp = Boolean(user.experience && user.experience.length);
    const hasCert = Boolean(user.certificates && user.certificates.length);

    res.json({
      ...user.toObject(),
      skills,
      reviews,
      rating,
      reviewCount: reviews.length,
      categories: [...new Set(skills.map((s) => s.category))],
      evidenceComplete: Boolean(hasExp || hasCert)
    });
  } catch (e) {
    next(e);
  }
});

export default router;
