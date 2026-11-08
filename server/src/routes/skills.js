import { Router } from 'express';
import { UserSkill } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
// A user's profile editor must only receive skills owned by the signed-in user.
// Returning every user's skills here made other learners' skills appear editable,
// while the update/delete routes correctly reject changes to someone else's data.
router.get('/', requireAuth, async (req, res, next) => {
  try { res.json(await UserSkill.find({ user: req.user.id }).sort({ createdAt: 1 })); }
  catch (e) { next(e); }
});
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, category = 'Other', type } = req.body;
    if (!name?.trim() || !['teach', 'learn'].includes(type)) return res.status(400).json({ message: 'A skill name and valid skill type are required.' });
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (await UserSkill.exists({ user: req.user.id, type, name: { $regex: `^${escapedName}$`, $options: 'i' } })) return res.status(409).json({ message: 'You have already added this skill in that section.' });
    const skill = await UserSkill.create({ user: req.user.id, name: name.trim(), category, type }); res.status(201).json(skill);
  } catch (e) { next(e); }
});
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { name, type, category } = req.body;
    if (!name?.trim() || !['teach', 'learn'].includes(type)) return res.status(400).json({ message: 'A skill name and valid skill type are required.' });
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (await UserSkill.exists({ _id: { $ne: req.params.id }, user: req.user.id, type, name: { $regex: `^${escapedName}$`, $options: 'i' } })) return res.status(409).json({ message: 'You have already added this skill in that section.' });
    const skill = await UserSkill.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { $set: { name: name.trim(), type, category } }, { new: true, runValidators: true });
    if (!skill) return res.status(404).json({ message: 'Skill not found.' });
    res.json(skill);
  } catch (e) { next(e); }
});
router.delete('/:id', requireAuth, async (req, res, next) => {
  try { const skill = await UserSkill.findOneAndDelete({ _id: req.params.id, user: req.user.id }); if (!skill) return res.status(404).json({ message: 'Skill not found.' }); res.status(204).end(); } catch (e) { next(e); }
});
export default router;
