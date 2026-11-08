import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, Conversation, Message } from './models.js';
import { notifyUser } from './notifications.js';

const userRoom = (id) => `user:${id}`;
const convRoom = (id) => `conversation:${id}`;
const legacyConvRoom = (a, b) => `conversation:${[String(a), String(b)].sort().join(':')}`;

// Map of userId -> Set of active socket IDs (handles multiple tabs / devices cleanly)
const userSockets = new Map();

export function attachRealtime(server, allowedOrigins) {
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 20000,
    pingInterval: 25000
  });

  // JWT Authentication Handshake
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) return next(new Error('Authentication token required.'));

      const payload = jwt.verify(token, process.env.JWT_SECRET || 'development-only-secret');
      const user = await User.findById(payload.id).select('name email avatar');
      if (!user) return next(new Error('Account not found.'));

      socket.user = { id: String(user.id), name: user.name, email: user.email, avatar: user.avatar };
      next();
    } catch {
      next(new Error('Please sign in to connect to live updates.'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(userRoom(userId));

    // Multi-device presence management
    const existingSockets = userSockets.get(userId) || new Set();
    const wasOffline = existingSockets.size === 0;
    existingSockets.add(socket.id);
    userSockets.set(userId, existingSockets);

    // Initial list of online users
    socket.emit('presence:list', [...userSockets.keys()]);

    // Broadcast online status if first tab/device connected
    if (wasOffline) {
      io.emit('user_online', { userId });
      io.emit('presence:update', { userId, online: true });
    }

    // --- CONVERSATION ROOM MANAGEMENT ---
    // Join conversation room (verifies membership on the server)
    const handleJoinConversation = async (data = {}, acknowledge = () => {}) => {
      try {
        const { conversationId, userId: targetUserId } = data;
        let conversation = null;

        if (conversationId && mongoose.isValidObjectId(conversationId)) {
          conversation = await Conversation.findById(conversationId);
        } else if (targetUserId && mongoose.isValidObjectId(targetUserId)) {
          if (String(targetUserId) === userId || !(await User.exists({ _id: targetUserId }))) {
            socket.emit('socket_error', { message: 'Invalid conversation participant.' });
            return acknowledge({ ok: false, error: 'Invalid participant.' });
          }
          conversation = await Conversation.getOrCreateForUsers(userId, targetUserId);
        }

        if (!conversation) {
          socket.emit('socket_error', { message: 'Conversation not found.' });
          return acknowledge({ ok: false, error: 'Conversation not found.' });
        }

        const isParticipant = conversation.participants.some(p => String(p) === userId);
        if (!isParticipant) {
          socket.emit('socket_error', { message: 'Unauthorized access to conversation.' });
          return acknowledge({ ok: false, error: 'Unauthorized.' });
        }

        const room = convRoom(conversation._id);
        const legacyRoom = legacyConvRoom(conversation.participants[0], conversation.participants[1]);

        // Leave any previously joined conversation rooms
        for (const joined of socket.data.conversationRooms || []) {
          socket.leave(joined);
        }
        socket.data.conversationRooms = [room, legacyRoom];
        socket.data.activeConversationId = String(conversation._id);
        socket.join(room);
        socket.join(legacyRoom);

        // Mark incoming unread messages as read upon entering conversation
        const readResult = await Message.updateMany(
          { conversation: conversation._id, receiver: userId, status: { $ne: 'read' } },
          { $set: { status: 'read', readAt: new Date() } }
        );

        if (readResult.modifiedCount > 0) {
          const otherUserId = conversation.participants.find(p => String(p) !== userId);
          if (otherUserId) {
            io.to(userRoom(String(otherUserId))).emit('messages_read', {
              conversationId: conversation._id,
              readerId: userId,
              readAt: new Date(),
              count: readResult.modifiedCount
            });
            io.to(userRoom(String(otherUserId))).emit('message:read', {
              userId,
              count: readResult.modifiedCount
            });
          }
        }

        acknowledge({ ok: true, conversationId: conversation._id });
      } catch (err) {
        console.error('Error joining conversation:', err);
        acknowledge({ ok: false, error: err.message });
      }
    };

    socket.on('join_conversation', handleJoinConversation);
    socket.on('chat:join', handleJoinConversation); // Backwards-compatibility

    // Leave conversation room
    const handleLeaveConversation = () => {
      for (const room of socket.data.conversationRooms || []) {
        socket.leave(room);
      }
      socket.data.conversationRooms = [];
      socket.data.activeConversationId = null;
    };

    socket.on('leave_conversation', handleLeaveConversation);
    socket.on('chat:leave', handleLeaveConversation);

    // --- SEND MESSAGE VIA SOCKET.IO ---
    socket.on('send_message', async (data = {}, acknowledge = () => {}) => {
      try {
        const { receiverId, conversationId, content, text } = data;
        const messageContent = (content || text || '').trim();

        if (!messageContent) {
          socket.emit('socket_error', { message: 'Message content cannot be empty.' });
          return acknowledge({ ok: false, error: 'Message content cannot be empty.' });
        }
        if (messageContent.length > 2000) {
          socket.emit('socket_error', { message: 'Message cannot exceed 2000 characters.' });
          return acknowledge({ ok: false, error: 'Message exceeds character limit.' });
        }

        let targetId = receiverId;
        let conversation = null;

        if (conversationId && mongoose.isValidObjectId(conversationId)) {
          conversation = await Conversation.findById(conversationId);
          if (conversation) {
            targetId = conversation.participants.find(p => String(p) !== userId);
          }
        }

        if (!targetId || String(targetId) === userId || !(await User.exists({ _id: targetId }))) {
          socket.emit('socket_error', { message: 'Invalid recipient.' });
          return acknowledge({ ok: false, error: 'Invalid recipient.' });
        }

        if (!conversation) {
          conversation = await Conversation.getOrCreateForUsers(userId, targetId);
        }

        // Determine initial status based on recipient's live presence & current room
        const recipientSockets = userSockets.get(String(targetId));
        const isRecipientOnline = Boolean(recipientSockets && recipientSockets.size > 0);

        let initialStatus = 'sent';
        let deliveredAt = null;
        let readAt = null;

        if (isRecipientOnline) {
          // Check if recipient is actively inside this conversation room
          const roomSockets = await io.in(convRoom(conversation._id)).fetchSockets();
          const recipientInRoom = roomSockets.some(s => s.user?.id === String(targetId));

          if (recipientInRoom) {
            initialStatus = 'read';
            deliveredAt = new Date();
            readAt = new Date();
          } else {
            initialStatus = 'delivered';
            deliveredAt = new Date();
          }
        }

        // Persist message in MongoDB
        const message = await Message.create({
          conversation: conversation._id,
          sender: userId,
          receiver: targetId,
          content: messageContent,
          text: messageContent,
          status: initialStatus,
          deliveredAt,
          readAt
        });

        await message.populate('sender receiver', 'name avatar email');

        // Update conversation summary
        conversation.lastMessage = message._id;
        conversation.lastMessageAt = message.createdAt;
        await conversation.save();

        // Create persistent notification for offline/unfocused recipient
        if (initialStatus !== 'read') {
          try {
            await notifyUser(io, {
              user: targetId,
              actor: userId,
              type: 'message',
              title: `A note from ${socket.user.name}`,
              body: messageContent.slice(0, 120),
              link: 'messages',
              entityId: message._id
            });
          } catch (notifErr) {
            console.error('Could not save notification:', notifErr.message);
          }
        }

        // Acknowledge to sender
        acknowledge({ ok: true, message });
        socket.emit('message_sent', { message });

        // Broadcast to receiver's user room
        io.to(userRoom(String(targetId))).emit('new_message', {
          message,
          conversationId: conversation._id
        });
        io.to(userRoom(String(targetId))).emit('message:new', message);

        // If delivered or read, emit receipt events back to sender
        if (initialStatus === 'delivered') {
          io.to(userRoom(userId)).emit('message_delivered', {
            messageId: message._id,
            conversationId: conversation._id,
            deliveredAt
          });
        } else if (initialStatus === 'read') {
          io.to(userRoom(userId)).emit('messages_read', {
            conversationId: conversation._id,
            readerId: targetId,
            readAt,
            messageIds: [message._id]
          });
          io.to(userRoom(userId)).emit('message:read', { userId: targetId, count: 1 });
        }
      } catch (err) {
        console.error('Error sending message:', err);
        socket.emit('socket_error', { message: 'Failed to send message.' });
        acknowledge({ ok: false, error: err.message });
      }
    });

    // --- MESSAGE DELIVERY ACKNOWLEDGEMENT ---
    socket.on('message_delivered_ack', async ({ messageId } = {}) => {
      try {
        if (!messageId || !mongoose.isValidObjectId(messageId)) return;
        const message = await Message.findOneAndUpdate(
          { _id: messageId, receiver: userId, status: 'sent' },
          { $set: { status: 'delivered', deliveredAt: new Date() } },
          { new: true }
        );
        if (message) {
          io.to(userRoom(String(message.sender))).emit('message_delivered', {
            messageId: message._id,
            conversationId: message.conversation,
            deliveredAt: message.deliveredAt
          });
        }
      } catch (err) {
        console.error('Error in message_delivered_ack:', err);
      }
    });

    // --- MARK MESSAGES READ ---
    const handleMarkRead = async ({ conversationId, senderId } = {}, acknowledge = () => {}) => {
      try {
        let filter = { receiver: userId, status: { $ne: 'read' } };
        let otherUserId = senderId;

        if (conversationId && mongoose.isValidObjectId(conversationId)) {
          filter.conversation = conversationId;
          const conv = await Conversation.findById(conversationId);
          if (conv) otherUserId = conv.participants.find(p => String(p) !== userId);
        } else if (senderId && mongoose.isValidObjectId(senderId)) {
          filter.sender = senderId;
        }

        const now = new Date();
        const result = await Message.updateMany(filter, { $set: { status: 'read', readAt: now } });

        if (otherUserId) {
          io.to(userRoom(String(otherUserId))).emit('messages_read', {
            conversationId,
            readerId: userId,
            readAt: now,
            count: result.modifiedCount
          });
          io.to(userRoom(String(otherUserId))).emit('message:read', {
            userId,
            count: result.modifiedCount
          });
        }
        acknowledge({ ok: true, count: result.modifiedCount });
      } catch (err) {
        console.error('Error in mark_messages_read:', err);
        acknowledge({ ok: false, error: err.message });
      }
    };

    socket.on('mark_messages_read', handleMarkRead);

    // --- TYPING INDICATORS ---
    const handleTypingStart = ({ conversationId, receiverId, userId: targetUserId } = {}) => {
      const recipient = receiverId || targetUserId;
      if (!recipient) return;
      const data = {
        conversationId,
        userId,
        name: socket.user.name,
        active: true
      };
      if (conversationId) socket.to(convRoom(conversationId)).emit('user_typing', data);
      io.to(userRoom(String(recipient))).emit('user_typing', data);
      io.to(userRoom(String(recipient))).emit('chat:typing', data);
    };

    const handleTypingStop = ({ conversationId, receiverId, userId: targetUserId } = {}) => {
      const recipient = receiverId || targetUserId;
      if (!recipient) return;
      const data = {
        conversationId,
        userId,
        name: socket.user.name,
        active: false
      };
      if (conversationId) socket.to(convRoom(conversationId)).emit('user_stopped_typing', data);
      io.to(userRoom(String(recipient))).emit('user_stopped_typing', data);
      io.to(userRoom(String(recipient))).emit('chat:typing', data);
    };

    socket.on('typing_start', handleTypingStart);
    socket.on('typing_stop', handleTypingStop);
    socket.on('chat:typing', ({ userId: targetUserId, active }) => {
      if (active) handleTypingStart({ userId: targetUserId });
      else handleTypingStop({ userId: targetUserId });
    });

    // --- DISCONNECT HANDLING ---
    socket.on('disconnect', () => {
      const remainingSockets = userSockets.get(userId);
      if (remainingSockets) {
        remainingSockets.delete(socket.id);
        if (remainingSockets.size === 0) {
          userSockets.delete(userId);
          io.emit('user_offline', { userId });
          io.emit('presence:update', { userId, online: false });
        }
      }
    });
  });

  io.onlineUserIds = () => [...userSockets.keys()];
  io.userSockets = userSockets;
  io.userRoom = userRoom;
  io.convRoom = convRoom;
  return io;
}
