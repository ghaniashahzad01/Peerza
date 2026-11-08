import { Router } from 'express';
import crypto from 'node:crypto';
import { Meeting, User } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyUser } from '../notifications.js';

const router = Router();

function generateRoomId(meetingId) {
  const hash = crypto.randomBytes(6).toString('hex');
  return `peerza-meet-${meetingId}-${hash}`;
}

// GET all meetings for the signed-in user
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const meetings = await Meeting.find({
      $or: [{ requester: req.user.id }, { recipient: req.user.id }]
    })
      .populate('requester recipient', 'name avatar email')
      .sort({ proposedAt: 1 });
    res.json(meetings);
  } catch (e) {
    next(e);
  }
});

// POST a new meeting request
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { recipient, proposedAt, note = '' } = req.body;
    if (!recipient || !proposedAt || new Date(proposedAt) <= new Date()) {
      return res.status(400).json({ message: 'Choose a recipient and a future date and time.' });
    }
    if (String(recipient) === String(req.user.id) || !(await User.exists({ _id: recipient }))) {
      return res.status(400).json({ message: 'Choose another Peerza member.' });
    }

    const meeting = await Meeting.create({
      requester: req.user.id,
      recipient,
      proposedAt,
      note
    });

    const io = req.app.get('io');
    try {
      await notifyUser(io, {
        user: recipient,
        actor: req.user.id,
        type: 'session',
        title: 'A new skill-swap request',
        body: `${req.user.name} invited you to a session${note ? `: ${note}` : '.'}`.slice(0, 240),
        link: 'sessions',
        entityId: meeting._id
      });
    } catch (notificationError) {
      console.error('Session notification could not be saved:', notificationError.message);
    }

    io?.to(`user:${String(recipient)}`).emit('meeting:new', meeting);
    res.status(201).json(meeting);
  } catch (e) {
    next(e);
  }
});

// PATCH update meeting status (accepted, rejected, completed)
router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid meeting status.' });
    }

    const meeting = await Meeting.findOne({
      _id: req.params.id,
      $or: [{ requester: req.user.id }, { recipient: req.user.id }]
    });

    if (!meeting) return res.status(404).json({ message: 'Meeting not found or not permitted.' });

    if (['accepted', 'rejected'].includes(status) && String(meeting.recipient) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Only the invited learner can respond to this request.' });
    }
    if (['accepted', 'rejected'].includes(status) && meeting.status !== 'pending') {
      return res.status(400).json({ message: 'This meeting request has already been answered.' });
    }
    if (status === 'completed' && meeting.status !== 'accepted') {
      return res.status(400).json({ message: 'Only an accepted session can be marked completed.' });
    }

    meeting.status = status;

    // Generate unique, unpredictable Jitsi room ID on acceptance
    if (status === 'accepted' && !meeting.roomName) {
      meeting.roomName = generateRoomId(meeting._id);
    }

    await meeting.save();
    await meeting.populate('requester recipient', 'name avatar email');

    const otherId = String(meeting.requester.id) === String(req.user.id)
      ? meeting.recipient.id
      : meeting.requester.id;

    const io = req.app.get('io');
    io?.to(`user:${String(otherId)}`).emit('meeting:update', meeting);

    try {
      await notifyUser(io, {
        user: otherId,
        actor: req.user.id,
        type: 'session_update',
        title: `Session ${status}`,
        body: `${req.user.name} ${status} your session request.`,
        link: 'sessions',
        entityId: meeting._id
      });
    } catch (notificationError) {
      console.error('Session notification could not be saved:', notificationError.message);
    }

    res.json(meeting);
  } catch (e) {
    next(e);
  }
});

// GET /api/meetings/:id/join - Authenticated verification and room authorization for Jitsi Meet
router.get('/:id/join', requireAuth, async (req, res, next) => {
  try {
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      $or: [{ requester: req.user.id }, { recipient: req.user.id }]
    }).populate('requester recipient', 'name avatar email');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found or you are not a participant.' });
    }

    if (meeting.status !== 'accepted') {
      return res.status(403).json({
        message: `Video calling is only allowed for accepted meetings. Current status: ${meeting.status}.`
      });
    }

    // Ensure room name is generated and persisted
    if (!meeting.roomName) {
      meeting.roomName = generateRoomId(meeting._id);
      await meeting.save();
    }

    const isRequester = String(meeting.requester._id) === String(req.user.id);
    const partner = isRequester ? meeting.recipient : meeting.requester;

    res.json({
      meetingId: meeting._id,
      roomName: meeting.roomName,
      status: meeting.status,
      proposedAt: meeting.proposedAt,
      note: meeting.note,
      domain: process.env.JITSI_DOMAIN || 'meet.jit.si',
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar
      },
      partner: {
        id: partner._id,
        name: partner.name,
        avatar: partner.avatar,
        email: partner.email
      }
    });
  } catch (e) {
    next(e);
  }
});

export default router;
