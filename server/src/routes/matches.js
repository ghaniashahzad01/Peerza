import { Router } from 'express';
import { UserSkill, User } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const own = await UserSkill.find({ user: req.user.id });
    const teaches = own.filter(s => s.type === 'teach').map(s => s.name.toLowerCase());
    const learns = own.filter(s => s.type === 'learn').map(s => s.name.toLowerCase());
    if (!teaches.length || !learns.length) return res.json([]);
    const others = await UserSkill.find({ user: { $ne: req.user.id } });
    const grouped = new Map();
    for (const skill of others) {
      const row = grouped.get(String(skill.user)) || { teach: [], learn: [] };
      row[skill.type].push(skill.name); grouped.set(String(skill.user), row);
    }
    const matches = [];
    for (const [id, skills] of grouped) {
      const teachForMe = skills.teach.filter(s => learns.includes(s.toLowerCase()));
      const learnFromMe = skills.learn.filter(s => teaches.includes(s.toLowerCase()));
      if (teachForMe.length && learnFromMe.length) matches.push({ userId: id, teachForMe, learnFromMe, score: teachForMe.length + learnFromMe.length });
    }
    const users = await User.find({ _id: { $in: matches.map(m => m.userId) } }).select('name bio avatar location');
    res.json(matches.map(m => ({ ...m, user: users.find(u => String(u.id) === m.userId) })).sort((a, b) => b.score - a.score));
  } catch (e) { next(e); }
});
export default router;
