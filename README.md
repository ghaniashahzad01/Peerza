# Peerza — Peer Skill Exchange & Live Learning Platform

Peerza is a full-stack MERN-based peer learning and skill exchange platform that connects people who want to share their knowledge and learn new skills.

Users can discover compatible learning partners, exchange skills, communicate through real-time messaging, schedule learning sessions, and participate in one-to-one video/audio calls using Jitsi Meet.

## 1. Features Overview

### Skill Discovery & Matching
- Discover learners based on their skills, interests, and categories.
- Complementary skill matching between users.
- Browse and filter people by skill category.
- View learner profiles and their shared skills.

### Real-Time One-to-One Messaging
Built with Socket.IO and MongoDB.

- Instant bi-directional messaging.
- Persistent message storage using MongoDB.
- Multi-tab online presence tracking.
- Real-time typing indicators.
- Message delivery and read receipts:
  - Sent
  - Delivered
  - Seen
- Unread message counters.
- Conversation summaries and message history.
- Paginated message loading.
- Chronological message sorting.
- JWT-authenticated socket connections.

### One-to-One Video & Audio Calling
Integrated using the Jitsi Meet IFrame API.

- In-app video and audio calling.
- Meeting-participant authorization.
- Calls available only for accepted meetings.
- Persistent and unique meeting room identifiers.
- Microphone and camera controls.
- Fullscreen support.
- Responsive calling interface.
- Clean call-leaving functionality.

### Meeting & Session Management
- Send learning session requests.
- Accept or decline incoming requests.
- View pending and accepted sessions.
- Mark sessions as completed.
- Unlock video calling after meeting acceptance.

### Reviews & Ratings
- Submit ratings from 1 to 5 stars.
- Write reviews after completed learning sessions.
- Display ratings on learner profiles.
- Prevent unauthorized and duplicate reviews.

---

## 2. Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React 18, React Router 7, Vite |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| API Communication | Axios |
| Backend | Node.js, Express.js |
| Real-Time Communication | Socket.IO 4 |
| Database | MongoDB, Mongoose |
| Authentication | JWT, bcryptjs |
| Video Calling | Jitsi Meet IFrame API |
| Development | npm, Concurrently |

---

## 3. Project Structure

```text
Peerza/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── ...
│   ├── public/
│   ├── .env.example
│   └── package.json
│
├── server/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── sockets/
│   ├── scripts/
│   ├── tests/
│   ├── .env.example
│   └── package.json
│
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

*Note: This is a conceptual overview. Refer to the actual repository for the complete directory structure.*

---

## 4. Getting Started

### Prerequisites

Install the following before running Peerza:

- Node.js v18 or later.
- npm.
- MongoDB Community Server or a MongoDB Atlas connection.
- Git.

### Installation

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
cd Peerza
```

Install root dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
cd server
npm install
```

Install frontend dependencies:

```bash
cd ../client
npm install
```

Return to the project root:

```bash
cd ..
```

**Windows PowerShell note:** If PowerShell blocks `npm.ps1`, use `npm.cmd` instead.

---

## 5. Environment Configuration

Peerza uses environment variables to configure the backend and frontend.

### Backend Configuration

Create a `.env` file inside the `server` directory using `server/.env.example` as a reference.

```env
PORT=5000

MONGO_URI=mongodb://127.0.0.1:27017/peerza

JWT_SECRET=replace_with_a_long_random_secret

CLIENT_URL=http://localhost:5173

JITSI_DOMAIN=meet.jit.si

DEMO_PASSWORD=replace_with_a_local_demo_password
```

### Frontend Configuration

Create a `.env` file inside the `client` directory using `client/.env.example` as a reference.

```env
VITE_API_URL=http://localhost:5000/api

VITE_JITSI_DOMAIN=meet.jit.si
```

**Important security notes:**
- Never commit `.env` files to GitHub.
- Never expose your MongoDB credentials or JWT secret.
- Use strong, unique secrets.
- Keep `.env.example` files populated with placeholder values only.
- Do not use development secrets in production.

---

## 6. Seed Demo Accounts

Peerza includes a demo seeding script to populate the database with sample learner accounts and complementary skills.

Run:

```bash
cd server
npm run seed:demo
```

The demo accounts can be used to explore the platform's features.

Default local demo credentials, if configured by the seed script:

```text
Password: PeerzaDemo2025!
```

The available demo email addresses are defined in the seed script, including accounts such as:

```text
maya@peerza.demo
jordan@peerza.demo
amina@peerza.demo
```

Use demo accounts only in a local development environment. Do not use demo credentials for production accounts.

---

## 7. Running the Application

### Start Both Frontend and Backend

From the project root:

```bash
npm run dev
```

This starts the frontend and backend development servers concurrently.

### Alternatively, Start Them Separately

**Terminal 1 — Backend**

```bash
npm run server
```

Backend:

```text
http://localhost:5000
```

**Terminal 2 — Frontend**

```bash
npm run client
```

Frontend:

```text
http://localhost:5173
```

Open the frontend URL in your browser:

http://localhost:5173

---

## 8. Automated Testing

The backend includes an integration test suite for important application workflows.

Run:

```bash
cd server
npm test
```

The documented test coverage includes:

- Authentication.
- Socket.IO connections.
- Multi-tab online presence.
- Typing indicators.
- Real-time messaging.
- Message delivery and read receipts.
- Jitsi meeting room authorization.
- Regression testing.

Check the actual test output to confirm the current test results.

---

## 9. Real-Time Chat Architecture

Peerza uses Socket.IO for real-time communication and MongoDB for persistent message storage.

### Socket Authentication

- Clients authenticate during the Socket.IO handshake using a JWT.
- The server verifies the token using `JWT_SECRET`.
- Authenticated socket connections receive verified user information.
- Unauthenticated connections are rejected.
- The server does not trust user identity supplied through client event payloads.

Example client connection:

```javascript
const socket = io(SERVER_URL, {
  auth: {
    token: userToken
  }
});
```

### Socket Events Reference

| Event | Direction | Purpose |
|---|---|---|
| `join_conversation` | Client → Server | Join an authorized conversation |
| `leave_conversation` | Client → Server | Leave a conversation |
| `send_message` | Client → Server | Send and persist a message |
| `message_sent` | Server → Client | Confirm successful message submission |
| `new_message` | Server → Client | Deliver a new message |
| `message_delivered_ack` | Client → Server | Acknowledge message delivery |
| `message_delivered` | Server → Client | Notify sender of delivery |
| `mark_messages_read` | Client → Server | Mark messages as read |
| `messages_read` | Server → Client | Notify sender of read status |
| `typing_start` | Client → Server | Notify recipient that typing started |
| `typing_stop` | Client → Server | Notify recipient that typing stopped |
| `user_typing` | Server → Client | Display typing indicator |
| `user_stopped_typing` | Server → Client | Remove typing indicator |
| `user_online` | Server → Client | Notify online presence |
| `user_offline` | Server → Client | Notify offline presence |
| `presence:list` | Server → Client | Provide online user IDs |

### Message Lifecycle

```text
User sends message
       |
       v
Socket.IO receives event
       |
       v
Server validates sender and recipient
       |
       v
Message saved in MongoDB
       |
       v
Message delivered to recipient
       |
       v
Recipient acknowledges delivery
       |
       v
Sender receives delivery status
       |
       v
Recipient reads message
       |
       v
Sender receives read receipt
```

Message persistence ensures that conversation history remains available after page refreshes or server restarts.

---

## 10. Jitsi Meet Integration

Peerza integrates Jitsi Meet through its IFrame API.

### Meeting Workflow

1. **Request:** A learner sends a session request to another learner.
2. **Acceptance:** The recipient accepts the meeting.
3. **Room Creation:** The backend generates a unique room identifier and stores it in MongoDB.
4. **Authorization:** The backend verifies that the requesting user is a participant of the accepted meeting.
5. **Joining:** Authorized participants can access the same Jitsi conference room.
6. **Persistence:** The room identifier remains associated with the meeting, including after page refreshes.
7. **Leaving:** Participants can leave the call using the in-app controls.

### Access Control

The backend validates:

- Meeting existence.
- Authenticated user identity.
- Meeting participant membership.
- Accepted meeting status.

Unauthorized users cannot join another user's meeting through the application's protected meeting endpoint.

### Jitsi Configuration

The default development configuration uses:

```env
JITSI_DOMAIN=meet.jit.si
```

For a private deployment, a compatible Jitsi instance can be configured through the environment variables, subject to the deployment's authentication and infrastructure requirements.

---

## 11. Manual Testing Guide

### Testing Real-Time Chat

Use two separate browser sessions.

**Browser Window 1:**

```text
Email: maya@peerza.demo
Password: PeerzaDemo2025!
```

**Browser Window 2:**

```text
Email: jordan@peerza.demo
Password: PeerzaDemo2025!
```

Testing steps:

1. Sign in using the two different accounts.
2. Open Messages in both browser windows.
3. Select the relevant conversation.
4. Type a message in Window 1.
5. Verify that Window 2 displays the typing indicator.
6. Send the message.
7. Verify that the message appears in Window 2 without refreshing.
8. Check the Sent, Delivered, and Seen indicators.
9. Refresh either browser window.
10. Verify that the previous messages are still available.

### Testing Video Calling

1. Sign in as Maya in Browser Window 1.
2. Sign in as Jordan in Browser Window 2.
3. Open Discover or My Matches.
4. Request a learning session.
5. Accept the request from the recipient account.
6. Verify that the Join Video Call option becomes available.
7. Join the call from both accounts.
8. Allow browser camera and microphone permissions.
9. Verify that both participants can communicate.
10. Leave the call and verify that the application returns to its normal interface.

---

## 12. Security Considerations

Peerza applies security measures across authentication, messaging, and meeting management.

- Password hashing using bcryptjs.
- JWT-based authentication.
- Protected backend routes.
- Server-side authorization checks.
- Socket.IO handshake authentication.
- Conversation membership validation.
- Meeting participant validation.
- Accepted-status validation before joining calls.
- Environment-based secret management.
- MongoDB-backed message persistence.

Client-side restrictions are not considered sufficient authorization. Sensitive operations must be validated by the backend.

---

## 13. Future Improvements

Potential improvements for future versions include:

- Enhanced profile verification.
- Improved certificate and professional experience management.
- Additional profile discovery filters.
- Better notification experiences.
- Expanded accessibility and responsive design.
- Production deployment and monitoring.

These are potential improvements and should not be interpreted as already implemented functionality.

---

## 14. Project Goal

Peerza aims to make learning collaborative by connecting people who can teach what others want to learn.

Its central workflow is:

**Discover → Match → Connect → Chat → Learn → Review**

The platform brings skill discovery, real-time communication, session management, and video calling together in one learning community.

---

*Peerza — Learn together, grow together.*
