# Peerza — Peer Skill Exchange & Live Learning Platform

Peerza is a full-stack MERN peer learning and skill exchange platform where people connect, exchange knowledge, chat in real time with Socket.IO, schedule learning sessions, and join one-to-one video/audio calls with Jitsi Meet.

---

## 1. Features Overview

- **Skill Discovery & Complementary Matching**: Matches users whose teaching skills complement another user's learning goals.
- **Real-Time One-to-One Chat (Socket.IO & MongoDB)**:
  - Instant bi-directional messaging with MongoDB persistence.
  - Multi-tab presence tracking (`user_online`, `user_offline`, `presence:list`).
  - Typing indicators (`user_typing`, `user_stopped_typing`).
  - Delivery and read receipts (`Sent` -> `Delivered` -> `Seen`).
  - Unread message counters and conversation summaries.
  - Message history with pagination and chronological sorting.
- **One-to-One Video/Audio Calling (Jitsi Meet)**:
  - Integrated via Jitsi Meet IFrame API (`external_api.js`).
  - Server-side authorization: only participants of an **accepted** meeting can join.
  - Deterministic and persistent room identifiers (`peerza-meet-{meetingId}-{hash}`) stored in MongoDB.
  - In-app responsive calling interface with Peerza branding, microphone/camera controls, fullscreen, and clean leave handling.
- **Meeting Scheduling & Session Management**:
  - Request sessions, accept or decline incoming requests, mark completed.
  - Video calling unlocked automatically upon meeting acceptance.
- **Reviews & Ratings**:
  - Learners can leave 1–5 star ratings and written reviews after completed sessions.
  - Prevents unauthorized or duplicate reviews.

---

## 2. Technology Stack

- **Frontend**: React 18, React Router 7, Vite, Tailwind CSS, Lucide Icons, Axios, Socket.IO Client.
- **Backend**: Node.js (ES Modules), Express.js, Socket.IO 4.
- **Database**: MongoDB & Mongoose.
- **Authentication**: JSON Web Tokens (JWT), bcryptjs (salt cost 12), Protected Route Guards, Axios 401 Interceptors.
- **Video Calling**: Jitsi Meet IFrame API.

---

## 3. Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- MongoDB running locally on `mongodb://127.0.0.1:27017` or MongoDB Atlas URI

### Installation

```bash
# 1. Install root dependencies
npm install

# 2. Install backend dependencies
cd server
npm install

# 3. Install frontend dependencies
cd ../client
npm install
```

*(Note for Windows PowerShell users: If script execution policy restricts `npm.ps1`, use `npm.cmd` or `cmd /c npm ...`)*

---

## 4. Environment Variables

### Backend (`server/.env`)
Create `server/.env` based on `server/.env.example`:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/peerza
JWT_SECRET=peerza-local-7f92a1c4-secret-key
CLIENT_URL=http://localhost:5173
JITSI_DOMAIN=meet.jit.si
DEMO_PASSWORD=PeerzaDemo2025!
```

### Frontend (`client/.env`)
Create `client/.env` based on `client/.env.example`:
```env
VITE_API_URL=http://localhost:5000/api
VITE_JITSI_DOMAIN=meet.jit.si
```

---

## 5. Seed Demo Accounts

To populate the database with 6 ready-to-test learners with complementary skills:
```bash
cd server
npm run seed:demo
```
All demo accounts (`maya@peerza.demo`, `jordan@peerza.demo`, `amina@peerza.demo`, etc.) use the password:
`PeerzaDemo2025!`

---

## 6. Running the Application

### Development Mode (Both Frontend & Backend)
From the project root:
```bash
npm run dev
```
Or start them individually:
```bash
# Terminal 1 - Backend API (Port 5000)
npm run server

# Terminal 2 - Frontend Web Client (Port 5173)
npm run client
```

Open your browser at `http://localhost:5173`.

---

## 7. Automated Testing Suite

The repository includes an end-to-end integration test suite verifying authentication, multi-tab presence, typing indicators, Socket.IO messaging, receipts, Jitsi room security, and regression tests.

Run the test suite:
```bash
cd server
npm test
```

---

## 8. Real-Time Chat & Socket.IO Architecture

### Socket Handshake & Security
- The client authenticates in the Socket.IO handshake using a Bearer JWT: `{ auth: { token } }`.
- The server verifies the token against `JWT_SECRET` and attaches `socket.user = { id, name, email, avatar }`.
- Unauthenticated connections are rejected immediately (`connect_error`).
- The server never trusts a user ID passed in socket payloads; it always uses the verified `socket.user.id`.

### Socket Events Reference

| Event Name | Direction | Payload | Description |
|---|---|---|---|
| `join_conversation` | Client → Server | `{ conversationId, userId }` | Authorizes membership and joins room |
| `leave_conversation` | Client → Server | `{}` | Leaves current conversation room |
| `send_message` | Client → Server | `{ receiverId, content }`, callback | Saves to MongoDB and broadcasts |
| `message_sent` | Server → Client | `{ message }` | Acknowledges message sent to sender |
| `new_message` | Server → Client | `{ message, conversationId }` | Emitted to receiver's user room |
| `message_delivered_ack` | Client → Server | `{ messageId }` | Recipient client acknowledges receipt |
| `message_delivered` | Server → Client | `{ messageId, deliveredAt }` | Notifies sender of message delivery |
| `mark_messages_read` | Client → Server | `{ conversationId, senderId }` | Marks messages read in database |
| `messages_read` | Server → Client | `{ conversationId, readerId, readAt }` | Notifies sender that messages were seen |
| `typing_start` | Client → Server | `{ receiverId, conversationId }` | Emits typing state |
| `typing_stop` | Client → Server | `{ receiverId, conversationId }` | Emits stopped typing state |
| `user_typing` | Server → Client | `{ userId, name, active: true }` | Displays "User is typing..." in chat |
| `user_stopped_typing` | Server → Client | `{ userId, name, active: false }` | Removes typing indicator |
| `user_online` / `user_offline` | Server → Client | `{ userId }` | Broadcasts presence changes |
| `presence:list` | Server → Client | `[userId, ...]` | List of currently online user IDs |

---

## 9. Jitsi Meet Video Calling Integration

### Meeting Workflow
1. **Request**: User A selects a partner and proposes a meeting date/time (`POST /api/meetings`).
2. **Accept**: User B accepts the meeting request (`PATCH /api/meetings/:id/status`). Upon acceptance, a unique and unpredictable room identifier is generated and saved to the meeting record in MongoDB (`roomName`).
3. **Authorization**: Both participants can view the **"Join Video Call"** button. Clicking the button calls `GET /api/meetings/:id/join`, where the backend validates that the requesting user is either the requester or recipient and that status is `accepted`.
4. **Conference**: Jitsi Meet IFrame API (`external_api.js`) loads seamlessly inside Peerza with camera, microphone, and fullscreen controls.
5. **Persistence**: Refreshing the page does NOT generate a new room. Both participants are always routed to the same persistent room.
6. **Access Control**: Users who are not participants, or attempts to join pending/rejected/completed meetings, receive `403 Forbidden` / `404 Not Found`.

---

## 10. Manual Testing Instructions

### Testing Real-Time Chat (Two Accounts)
1. Open Browser Window 1 (e.g. Chrome normal window):
   - Sign in as `maya@peerza.demo` (`PeerzaDemo2025!`).
2. Open Browser Window 2 (e.g. Chrome Incognito / Firefox):
   - Sign in as `jordan@peerza.demo` (`PeerzaDemo2025!`).
3. In Window 1, navigate to **Messages** and select Jordan Lee. Notice Jordan's green "Online now" badge.
4. Type in the input field in Window 1. Notice Window 2 immediately displays `"Maya is typing…"`.
5. Send a message:
   - Window 2 immediately displays the new bubble with zero page reload.
   - Window 1 shows the message status badge (`Sent` -> `Delivered` -> `Seen`).
6. Refresh either window; the message history persists and loads from MongoDB with pagination.

### Testing Jitsi Video Calling
1. In Window 1 (Maya), go to **Discover** or **My matches** and click **"Request a session"** with Jordan.
2. In Window 2 (Jordan), navigate to **Sessions**. The session appears under pending requests.
3. Click **"Accept"**.
4. Both Window 1 and Window 2 will now show the **"Join Video Call"** button.
5. Click **"Join Video Call"** in both windows:
   - Both users enter the exact same Jitsi conference room.
   - Allow camera and microphone permissions when prompted by your browser.
   - Both participants can see and hear each other live.
6. Click **"Leave Call"** to gracefully exit the video room and return to Peerza.

---

## 11. Architecture & Security Considerations

- **Private Conference Rooms vs Public Jitsi Instance**:
  By default, `JITSI_DOMAIN` is configured to `meet.jit.si`. The room identifier generated by Peerza (`peerza-meet-{id}-{randomHex}`) is cryptographically unpredictable to avoid collisions. For enterprise private deployments, you can point `JITSI_DOMAIN` / `VITE_JITSI_DOMAIN` to a self-hosted Jitsi instance or 8x8 JaaS with JWT token generation without altering any application code.
- **Socket Security**:
  All socket actions (`send_message`, `join_conversation`, `mark_messages_read`) verify room membership and user identity on the server side using the JWT session.
