import { Router } from 'express';
import mongoose from 'mongoose';
import { Message, Conversation, User } from '../models.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyUser } from '../notifications.js';

const router = Router();
const populated = (q) => q.populate('sender receiver', 'name avatar email');

// GET all conversations for the authenticated user
router.get('/conversations', requireAuth, async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const conversations = await Conversation.find({ participants: currentUserId })
      .populate('participants', 'name avatar email location')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender receiver', select: 'name avatar email' }
      })
      .sort({ lastMessageAt: -1 });

    const formatted = await Promise.all(
      conversations.map(async (conv) => {
        const other = conv.participants.find((p) => String(p._id) !== currentUserId);
        if (!other) return null;

        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          receiver: currentUserId,
          status: { $ne: 'read' }
        });

        return {
          _id: conv._id,
          conversationId: conv._id,
          user: other,
          latestMessage: conv.lastMessage || {
            text: '',
            content: '',
            createdAt: conv.lastMessageAt
          },
          unreadCount,
          lastMessageAt: conv.lastMessageAt
        };
      })
    );

    res.json(formatted.filter(Boolean));
  } catch (e) {
    next(e);
  }
});

// GET conversation messages between authenticated user and another user
router.get('/conversations/:userId', requireAuth, async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user identifier.' });
    }

    const conversation = await Conversation.getOrCreateForUsers(currentUserId, targetUserId);

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const before = req.query.before;

    const query = { conversation: conversation._id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const totalCount = await Message.countDocuments({ conversation: conversation._id });
    const skip = before ? 0 : (page - 1) * limit;

    const rawMessages = await populated(
      Message.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
    );

    // Sort chronologically for client rendering
    const messages = rawMessages.reverse();
    const hasMore = before
      ? rawMessages.length === limit
      : totalCount > skip + rawMessages.length;

    // Mark any sent messages destined for current user as delivered
    const unacknowledged = messages.filter(
      (m) => String(m.receiver?._id || m.receiver) === currentUserId && m.status === 'sent'
    );
    if (unacknowledged.length > 0) {
      const ids = unacknowledged.map((m) => m._id);
      await Message.updateMany(
        { _id: { $in: ids } },
        { $set: { status: 'delivered', deliveredAt: new Date() } }
      );
      const io = req.app.get('io');
      unacknowledged.forEach((m) => {
        io?.to(`user:${String(m.sender?._id || m.sender)}`).emit('message_delivered', {
          messageId: m._id,
          conversationId: conversation._id,
          deliveredAt: new Date()
        });
      });
    }

    // Return with pagination metadata while remaining backwards-compatible
    if (req.query.paginated === 'true') {
      return res.json({
        conversationId: conversation._id,
        messages,
        totalCount,
        hasMore,
        page
      });
    }

    res.json(messages);
  } catch (e) {
    next(e);
  }
});

// Mark all messages from a user as read
router.patch('/conversations/:userId/read', requireAuth, async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user identifier.' });
    }

    const conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, targetUserId], $size: 2 }
    });

    const filter = {
      receiver: currentUserId,
      status: { $ne: 'read' }
    };
    if (conversation) {
      filter.conversation = conversation._id;
    } else {
      filter.sender = targetUserId;
    }

    const now = new Date();
    const result = await Message.updateMany(filter, {
      $set: { status: 'read', readAt: now }
    });

    const io = req.app.get('io');
    if (result.modifiedCount > 0) {
      io?.to(`user:${targetUserId}`).emit('messages_read', {
        conversationId: conversation?._id,
        readerId: currentUserId,
        readAt: now,
        count: result.modifiedCount
      });
      io?.to(`user:${targetUserId}`).emit('message:read', {
        userId: currentUserId,
        count: result.modifiedCount
      });
    }

    res.json({ ok: true, count: result.modifiedCount });
  } catch (e) {
    next(e);
  }
});

// REST POST endpoint to send a message
router.post('/messages', requireAuth, async (req, res, next) => {
  try {
    const { receiver, text, content } = req.body;
    const messageContent = (content || text || '').trim();

    if (!receiver || !messageContent) {
      return res.status(400).json({ message: 'A recipient and message are required.' });
    }
    if (String(receiver) === String(req.user.id) || !(await User.exists({ _id: receiver }))) {
      return res.status(400).json({ message: 'Choose another Peerza member.' });
    }

    const conversation = await Conversation.getOrCreateForUsers(req.user.id, receiver);
    const io = req.app.get('io');

    const isReceiverOnline = (io?.userSockets?.get(String(receiver))?.size || 0) > 0;
    let initialStatus = 'sent';
    let deliveredAt = null;

    if (isReceiverOnline) {
      initialStatus = 'delivered';
      deliveredAt = new Date();
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user.id,
      receiver,
      content: messageContent,
      text: messageContent,
      status: initialStatus,
      deliveredAt
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;
    await conversation.save();

    const result = await populated(Message.findById(message._id));

    // Send notification
    try {
      await notifyUser(io, {
        user: receiver,
        actor: req.user.id,
        type: 'message',
        title: `A note from ${req.user.name}`,
        body: messageContent.slice(0, 120),
        link: 'messages',
        entityId: message._id
      });
    } catch (notificationError) {
      console.error('Message notification could not be saved:', notificationError.message);
    }

    // Real-time broadcasts
    io?.to(`user:${String(receiver)}`).emit('new_message', {
      message: result,
      conversationId: conversation._id
    });
    io?.to(`user:${String(receiver)}`).emit('message:new', result);

    if (initialStatus === 'delivered') {
      io?.to(`user:${String(req.user.id)}`).emit('message_delivered', {
        messageId: message._id,
        conversationId: conversation._id,
        deliveredAt
      });
    }

    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
