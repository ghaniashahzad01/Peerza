import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  handleAvatarUpload,
  saveOrUpdateAvatar,
  deleteAvatar,
  serveAvatar
} from '../avatarUtils.js';
import {
  handleCertificateUpload,
  addCertificate,
  deleteCertificate,
  serveCertificate
} from '../certificateUtils.js';

const router = Router();

// --- AVATAR ROUTES ---
router.post('/avatar', requireAuth, handleAvatarUpload, saveOrUpdateAvatar);
router.put('/avatar', requireAuth, handleAvatarUpload, saveOrUpdateAvatar);
router.delete('/avatar', requireAuth, deleteAvatar);
router.get('/avatar', requireAuth, (req, res, next) => serveAvatar(req.user._id, res, next));

// --- CERTIFICATE ROUTES ---
router.post('/certificates', requireAuth, handleCertificateUpload, addCertificate);
router.delete('/certificates/:id', requireAuth, deleteCertificate);
router.get('/certificates/:id/file', (req, res, next) => serveCertificate(req.params.id, res, next));

// --- PROFESSIONAL EXPERIENCE ROUTES ---
router.post('/experience', requireAuth, async (req, res, next) => {
  try {
    const title = (req.body.title || '').trim();
    const organization = (req.body.organization || '').trim();
    const duration = (req.body.duration || '').trim();
    const description = (req.body.description || '').trim();

    if (!title || !organization || !duration) {
      return res.status(400).json({
        message: 'Job title, organization name, and duration are required.'
      });
    }

    req.user.experience.push({ title, organization, duration, description });
    await req.user.save();

    const createdExp = req.user.experience[req.user.experience.length - 1];

    return res.status(201).json({
      message: 'Experience added successfully.',
      experience: createdExp,
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
        evidenceComplete: Boolean(
          (req.user.experience && req.user.experience.length) ||
          (req.user.certificates && req.user.certificates.length)
        )
      }
    });
  } catch (err) {
    next(err);
  }
});

router.put('/experience/:id', requireAuth, async (req, res, next) => {
  try {
    const exp = req.user.experience.id(req.params.id);
    if (!exp) {
      return res.status(404).json({ message: 'Experience entry not found.' });
    }

    if (req.body.title !== undefined) exp.title = req.body.title.trim();
    if (req.body.organization !== undefined) exp.organization = req.body.organization.trim();
    if (req.body.duration !== undefined) exp.duration = req.body.duration.trim();
    if (req.body.description !== undefined) exp.description = req.body.description.trim();

    await req.user.save();

    return res.status(200).json({
      message: 'Experience updated successfully.',
      experience: exp,
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
        evidenceComplete: Boolean(
          (req.user.experience && req.user.experience.length) ||
          (req.user.certificates && req.user.certificates.length)
        )
      }
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/experience/:id', requireAuth, async (req, res, next) => {
  try {
    const expIndex = req.user.experience.findIndex((e) => String(e._id) === String(req.params.id));
    if (expIndex === -1) {
      return res.status(404).json({ message: 'Experience entry not found.' });
    }

    req.user.experience.splice(expIndex, 1);
    await req.user.save();

    return res.status(200).json({
      message: 'Experience entry removed.',
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
        evidenceComplete: Boolean(
          (req.user.experience && req.user.experience.length) ||
          (req.user.certificates && req.user.certificates.length)
        )
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
