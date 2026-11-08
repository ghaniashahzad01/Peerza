import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { io as Client } from 'socket.io-client';
import cors from 'cors';
import authRoutes from './src/routes/auth.js';
import userRoutes from './src/routes/users.js';
import skillRoutes from './src/routes/skills.js';
import matchRoutes from './src/routes/matches.js';
import messageRoutes from './src/routes/messages.js';
import meetingRoutes from './src/routes/meetings.js';
import reviewRoutes from './src/routes/reviews.js';
import notificationRoutes from './src/routes/notifications.js';
import profileRoutes from './src/routes/profile.js';
import { attachRealtime } from './src/realtime.js';
import { User, Conversation, Message, Meeting, Review, UserSkill } from './src/models.js';

const TEST_PORT = 5055;
const TEST_MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peerza';

async function runTests() {
  console.log('--- STARTING PEERZA TEST SUITE ---');

  // 1. Connect MongoDB
  await mongoose.connect(TEST_MONGO_URI);
  console.log('✓ Connected to MongoDB');

  // 2. Set up test server
  const app = express();
  const server = http.createServer(app);
  app.use(cors());
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api', reviewRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/user-skills', skillRoutes);
  app.use('/api/matches', matchRoutes);
  app.use('/api', messageRoutes);
  app.use('/api/meetings', meetingRoutes);
  app.use('/api/notifications', notificationRoutes);

  const io = attachRealtime(server, ['*']);
  app.set('io', io);

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test HTTP & Socket.IO server listening on port ${TEST_PORT}`);

  const baseUrl = `http://localhost:${TEST_PORT}/api`;
  const socketUrl = `http://localhost:${TEST_PORT}`;

  let userA, userB, userC;
  let tokenA, tokenB, tokenC;

  try {
    // 3. Authenticate User A (Maya) and User B (Jordan) and User C (Amina)
    const login = async (email, password = 'PeerzaDemo2025!') => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Login failed for ${email}: ${data.message}`);
      return data;
    };

    const authA = await login('maya@peerza.demo');
    const authB = await login('jordan@peerza.demo');
    const authC = await login('amina@peerza.demo');

    userA = authA.user;
    tokenA = authA.token;
    userB = authB.user;
    tokenB = authB.token;
    userC = authC.user;
    tokenC = authC.token;

    console.log(`✓ Authenticated User A (${userA.name}), User B (${userB.name}), User C (${userC.name})`);

    // Helper to create authenticated Socket.IO client
    const createSocket = (token) => {
      return Client(socketUrl, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false
      });
    };

    // --- TEST 1: Socket.IO Authentication & Multi-Tab Presence ---
    console.log('\n--- TEST 1: Socket.IO Authentication & Multi-Tab Presence ---');
    const socketA1 = createSocket(tokenA);
    const socketA2 = createSocket(tokenA); // second tab for User A
    const socketB = createSocket(tokenB);

    await Promise.all([
      new Promise((res) => socketA1.on('connect', res)),
      new Promise((res) => socketA2.on('connect', res)),
      new Promise((res) => socketB.on('connect', res))
    ]);
    console.log('✓ Connected 3 sockets: User A (Tab 1), User A (Tab 2), User B');

    // Test rejection of unauthenticated socket
    const unauthSocket = Client(socketUrl, {
      auth: { token: 'invalid-token' },
      transports: ['websocket'],
      reconnection: false
    });
    const unauthRejected = await new Promise((res) => {
      unauthSocket.on('connect_error', (err) => {
        unauthSocket.disconnect();
        res(true);
      });
      unauthSocket.on('connect', () => {
        unauthSocket.disconnect();
        res(false);
      });
    });
    if (!unauthRejected) throw new Error('Unauthenticated socket should be rejected!');
    console.log('✓ Unauthenticated socket handshake rejected safely');

    // Test multi-tab disconnect: closing Tab 1 of User A should keep User A online
    let presenceEvents = [];
    socketB.on('presence:update', (data) => presenceEvents.push(data));

    socketA1.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    const stillOnline = io.onlineUserIds().includes(userA.id);
    if (!stillOnline) throw new Error('User A went offline after closing only 1 of 2 tabs!');
    console.log('✓ Multi-tab presence verified: User A remains online with second tab connected');

    // --- TEST 2: Typing Indicators ---
    console.log('\n--- TEST 2: Real-time Typing Indicators ---');
    const typingPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Typing event timed out')), 4000);
      socketB.on('user_typing', (data) => {
        if (data.userId === userA.id) {
          clearTimeout(timeout);
          resolve(data);
        }
      });
    });

    socketA2.emit('typing_start', { receiverId: userB.id });
    const typingEvent = await typingPromise;
    console.log(`✓ Typing indicator received: "${typingEvent.name}" is typing`);

    const stopTypingPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Stop typing event timed out')), 4000);
      socketB.on('user_stopped_typing', (data) => {
        if (data.userId === userA.id) {
          clearTimeout(timeout);
          resolve(data);
        }
      });
    });

    socketA2.emit('typing_stop', { receiverId: userB.id });
    await stopTypingPromise;
    console.log('✓ Stop typing indicator received');

    // --- TEST 3: Real-Time One-to-One Messaging & Delivery Receipts ---
    console.log('\n--- TEST 3: One-to-One Messaging & Status Delivery ---');
    // Join conversation rooms
    await new Promise((res) => socketA2.emit('join_conversation', { userId: userB.id }, res));
    await new Promise((res) => socketB.emit('join_conversation', { userId: userA.id }, res));
    console.log('✓ User A and User B joined conversation room');

    const messageText = `Hello Jordan! Automated test message at ${Date.now()}`;
    const receivedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('new_message timed out')), 4000);
      socketB.on('new_message', (payload) => {
        const msg = payload.message || payload;
        if (msg.content === messageText || msg.text === messageText) {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    // Send message from User A to User B
    const sendAck = await new Promise((resolve) => {
      socketA2.emit('send_message', { receiverId: userB.id, content: messageText }, resolve);
    });

    if (!sendAck.ok) throw new Error(`Send message failed: ${sendAck.error}`);
    console.log(`✓ Server acknowledged send_message, messageId: ${sendAck.message._id}`);

    const receivedMessage = await receivedPromise;
    console.log(`✓ User B received instant message: "${receivedMessage.content}"`);

    // Verify persistence in MongoDB
    const persistedMsg = await Message.findById(receivedMessage._id);
    if (!persistedMsg) throw new Error('Message not found in MongoDB!');
    if (!persistedMsg.conversation) throw new Error('Message is missing conversation reference!');
    console.log(`✓ Message persisted in MongoDB with conversation ID: ${persistedMsg.conversation}`);

    // Verify Conversation record
    const conv = await Conversation.findById(persistedMsg.conversation);
    if (!conv || String(conv.lastMessage) !== String(persistedMsg._id)) {
      throw new Error('Conversation lastMessage not updated!');
    }
    console.log('✓ Conversation record correctly updated with lastMessage and lastMessageAt');

    // --- TEST 4: Read Receipts & Delivery ACK ---
    console.log('\n--- TEST 4: Read Receipts & Delivery ACK ---');
    const readReceiptPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('messages_read timed out')), 4000);
      socketA2.on('messages_read', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    socketB.emit('mark_messages_read', { conversationId: conv._id, senderId: userA.id });
    const readReceipt = await readReceiptPromise;
    console.log(`✓ User A received read receipt: Reader ${readReceipt.readerId}`);

    // --- TEST 5: Message History Pagination & Conversation List ---
    console.log('\n--- TEST 5: Message History Pagination & Conversation List ---');
    const historyRes = await fetch(`${baseUrl}/conversations/${userB.id}?paginated=true&limit=10&page=1`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const historyData = await historyRes.json();
    if (!historyData.messages || historyData.messages.length === 0) {
      throw new Error('No messages returned in history pagination!');
    }
    console.log(`✓ Message history loaded successfully: ${historyData.messages.length} messages, total: ${historyData.totalCount}`);

    const convListRes = await fetch(`${baseUrl}/conversations`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const convList = await convListRes.json();
    const targetConv = convList.find((c) => String(c.user._id) === userB.id);
    if (!targetConv) throw new Error('Conversation not found in conversation list!');
    console.log(`✓ Conversation list verified: Found Jordan with latestMessage "${targetConv.latestMessage.content || targetConv.latestMessage.text}"`);

    // --- TEST 6: Unauthorized Conversation Access Prevention ---
    console.log('\n--- TEST 6: Unauthorized Conversation Access Prevention ---');
    const socketC = createSocket(tokenC);
    await new Promise((res) => socketC.on('connect', res));

    const unauthorizedJoin = await new Promise((resolve) => {
      socketC.emit('join_conversation', { conversationId: conv._id }, (res) => resolve(res));
    });
    if (unauthorizedJoin.ok) {
      throw new Error('User C should not be able to join User A and B conversation!');
    }
    console.log(`✓ Unauthorized conversation access blocked: ${unauthorizedJoin.error}`);

    // --- TEST 7: Jitsi Video Meeting Workflow & Authorization ---
    console.log('\n--- TEST 7: Jitsi Video Meeting Workflow & Authorization ---');
    // Step 1: User A requests meeting with User B
    const proposedTime = new Date(Date.now() + 86400000).toISOString();
    const createMeetingRes = await fetch(`${baseUrl}/meetings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        recipient: userB.id,
        proposedAt: proposedTime,
        note: 'Python & React skill swap'
      })
    });
    const meeting = await createMeetingRes.json();
    if (!createMeetingRes.ok) throw new Error(`Create meeting failed: ${meeting.message}`);
    console.log(`✓ Meeting requested by User A: status is "${meeting.status}", id: ${meeting._id}`);

    // Step 2: Attempting to join pending meeting should be rejected with 403
    const earlyJoinRes = await fetch(`${baseUrl}/meetings/${meeting._id}/join`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    if (earlyJoinRes.status !== 403) {
      throw new Error(`Joining pending meeting should return 403, got ${earlyJoinRes.status}`);
    }
    console.log('✓ Joining pending meeting correctly blocked (403 Forbidden)');

    // Step 3: User B accepts meeting
    const acceptRes = await fetch(`${baseUrl}/meetings/${meeting._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ status: 'accepted' })
    });
    const acceptedMeeting = await acceptRes.json();
    if (!acceptRes.ok) throw new Error(`Accept meeting failed: ${acceptedMeeting.message}`);
    console.log(`✓ Meeting accepted by User B: status is "${acceptedMeeting.status}"`);

    // Step 4: Both User A and User B request Jitsi join authorization
    const joinResA = await fetch(`${baseUrl}/meetings/${meeting._id}/join`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const joinDataA = await joinResA.json();
    if (!joinResA.ok) throw new Error(`User A join failed: ${joinDataA.message}`);

    const joinResB = await fetch(`${baseUrl}/meetings/${meeting._id}/join`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const joinDataB = await joinResB.json();
    if (!joinResB.ok) throw new Error(`User B join failed: ${joinDataB.message}`);

    if (joinDataA.roomName !== joinDataB.roomName) {
      throw new Error(`Room names do not match! User A: ${joinDataA.roomName}, User B: ${joinDataB.roomName}`);
    }
    console.log(`✓ Both participants authorized for the exact same Jitsi room: "${joinDataA.roomName}"`);
    console.log(`✓ Jitsi domain: ${joinDataA.domain}`);

    // Step 5: Refreshing/re-querying does NOT change room name
    const reJoinRes = await fetch(`${baseUrl}/meetings/${meeting._id}/join`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const reJoinData = await reJoinRes.json();
    if (reJoinData.roomName !== joinDataA.roomName) {
      throw new Error('Room name changed on subsequent call! Must remain deterministic and persistent.');
    }
    console.log('✓ Room identifier is persistent and deterministic across page refreshes');

    // Step 6: Unauthorized User C attempting to join meeting
    const unauthJoinRes = await fetch(`${baseUrl}/meetings/${meeting._id}/join`, {
      headers: { Authorization: `Bearer ${tokenC}` }
    });
    if (unauthJoinRes.status !== 404 && unauthJoinRes.status !== 403) {
      throw new Error(`Unauthorized user access should be rejected, got ${unauthJoinRes.status}`);
    }
    console.log('✓ Unauthorized User C blocked from joining private meeting');

    // --- TEST 8: Regression Testing (Core Modules) ---
    console.log('\n--- TEST 8: Regression Testing (Core Modules) ---');
    // Auth /me
    const meRes = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${tokenA}` } });
    const meData = await meRes.json();
    if (!meRes.ok || meData.user.email !== 'maya@peerza.demo') throw new Error('GET /api/auth/me failed');
    console.log('✓ Auth /me works');

    // User skills
    const skillsRes = await fetch(`${baseUrl}/user-skills`, { headers: { Authorization: `Bearer ${tokenA}` } });
    const skillsData = await skillsRes.json();
    if (!Array.isArray(skillsData)) throw new Error('GET /api/user-skills failed');
    console.log(`✓ User skills retrieved: ${skillsData.length} skills`);

    // Matches
    const matchesRes = await fetch(`${baseUrl}/matches`, { headers: { Authorization: `Bearer ${tokenA}` } });
    const matchesData = await matchesRes.json();
    if (!Array.isArray(matchesData)) throw new Error('GET /api/matches failed');
    console.log(`✓ Complementary matches computed: ${matchesData.length} matches`);

    // Mark completed & Review
    await fetch(`${baseUrl}/meetings/${meeting._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ status: 'completed' })
    });
    console.log('✓ Meeting marked completed');

    const reviewRes = await fetch(`${baseUrl}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        reviewedUser: userB.id,
        meeting: meeting._id,
        rating: 5,
        comment: 'Fantastic learning exchange session!'
      })
    });
    const reviewData = await reviewRes.json();
    if (!reviewRes.ok) throw new Error(`Review creation failed: ${reviewData.message}`);
    console.log(`✓ Review created successfully: ${reviewData.rating} stars`);

    // --- TEST 9: Unauthorized API Access Prevention & Protected Endpoints ---
    console.log('\n--- TEST 9: Unauthorized API Access Prevention & Protected Endpoints ---');
    // Request without token to /users should return 401
    const unauthUsersRes = await fetch(`${baseUrl}/users`);
    if (unauthUsersRes.status !== 401) {
      throw new Error(`GET /api/users without token should return 401, got ${unauthUsersRes.status}`);
    }
    console.log('✓ GET /api/users blocked without token (401 Unauthorized)');

    // Request with invalid token to /users should return 401
    const invalidTokenUsersRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: 'Bearer invalid.or.expired.jwt.token' }
    });
    if (invalidTokenUsersRes.status !== 401) {
      throw new Error(`GET /api/users with invalid token should return 401, got ${invalidTokenUsersRes.status}`);
    }
    console.log('✓ GET /api/users blocked with invalid/expired token (401 Unauthorized)');

    // Request without token to /users/:id should return 401
    const unauthUserIdRes = await fetch(`${baseUrl}/users/${userA.id}`);
    if (unauthUserIdRes.status !== 401) {
      throw new Error(`GET /api/users/:id without token should return 401, got ${unauthUserIdRes.status}`);
    }
    console.log('✓ GET /api/users/:id blocked without token (401 Unauthorized)');

    // Request without token to /matches should return 401
    const unauthMatchesRes = await fetch(`${baseUrl}/matches`);
    if (unauthMatchesRes.status !== 401) {
      throw new Error(`GET /api/matches without token should return 401, got ${unauthMatchesRes.status}`);
    }
    console.log('✓ GET /api/matches blocked without token (401 Unauthorized)');

    // Request without token to /conversations should return 401
    const unauthConvsRes = await fetch(`${baseUrl}/conversations`);
    if (unauthConvsRes.status !== 401) {
      throw new Error(`GET /api/conversations without token should return 401, got ${unauthConvsRes.status}`);
    }
    console.log('✓ GET /api/conversations blocked without token (401 Unauthorized)');

    // Request without token to /meetings should return 401
    const unauthMeetingsRes = await fetch(`${baseUrl}/meetings`);
    if (unauthMeetingsRes.status !== 401) {
      throw new Error(`GET /api/meetings without token should return 401, got ${unauthMeetingsRes.status}`);
    }
    console.log('✓ GET /api/meetings blocked without token (401 Unauthorized)');

    // Request with valid token to /users should return 200
    const authUsersRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    if (!authUsersRes.ok) {
      throw new Error(`GET /api/users with valid token should return 200, got ${authUsersRes.status}`);
    }
    const authUsersData = await authUsersRes.json();
    console.log(`✓ GET /api/users authorized with valid token: returned ${authUsersData.length} learners`);

    // Cleanup sockets
    socketA2.disconnect();
    socketB.disconnect();
    socketC.disconnect();

    console.log('\n===========================================');
    console.log('🎉 ALL AUTOMATED TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
