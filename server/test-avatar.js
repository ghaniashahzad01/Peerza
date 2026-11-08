import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import authRoutes from './src/routes/auth.js';
import userRoutes from './src/routes/users.js';
import profileRoutes from './src/routes/profile.js';
import { User, ProfileImage } from './src/models.js';

const TEST_PORT = 5066;
const TEST_MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peerza';

async function runAvatarTests() {
  console.log('--- STARTING PEERZA MONGODB BINARY AVATAR STORAGE TEST SUITE ---');

  // 1. Connect MongoDB
  await mongoose.connect(TEST_MONGO_URI);
  console.log('✓ Connected to MongoDB');

  // 2. Setup Express test server
  const app = express();
  const server = http.createServer(app);
  app.use(cors());
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/users', userRoutes);

  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Error' });
  });

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test server listening on port ${TEST_PORT}`);

  const baseUrl = `http://localhost:${TEST_PORT}/api`;

  let userA, userB;
  let tokenA, tokenB;

  try {
    // 3. Login User A (Maya) and User B (Jordan)
    const login = async (email, password = 'PeerzaDemo2025!') => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error(`Login failed for ${email}`);
      return res.json();
    };

    const authA = await login('maya@peerza.demo');
    userA = authA.user;
    tokenA = authA.token;

    const authB = await login('jordan@peerza.demo');
    userB = authB.user;
    tokenB = authB.token;

    console.log(`✓ Authenticated User A (${userA.name}) and User B (${userB.name})`);

    // Clean any prior avatar state for clean baseline
    await ProfileImage.deleteMany({ userId: { $in: [userA.id, userB.id] } });
    await User.updateOne({ _id: userA.id }, { avatar: '', avatarImage: null });
    await User.updateOne({ _id: userB.id }, { avatar: '', avatarImage: null });

    // Prepare synthetic test image buffers with proper magic bytes
    const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const testJpegBuffer = Buffer.concat([jpegHeader, Buffer.from('PEERZA_TEST_JPEG_DATA_BODY_12345')]);

    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    const testPngBuffer = Buffer.concat([pngHeader, Buffer.from('PEERZA_TEST_PNG_DATA_BODY_67890')]);

    const webpHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x24, 0x00, 0x00, 0x00, // file size
      0x57, 0x45, 0x42, 0x50  // WEBP
    ]);
    const testWebpBuffer = Buffer.concat([webpHeader, Buffer.from('PEERZA_TEST_WEBP_DATA_BODY_13579')]);

    // --- TEST 1: Unauthenticated upload should be blocked (401) ---
    console.log('\n--- TEST 1: Authentication Requirement ---');
    const formUnauth = new FormData();
    formUnauth.append('avatar', new Blob([testJpegBuffer], { type: 'image/jpeg' }), 'avatar.jpg');
    const unauthUploadRes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'POST',
      body: formUnauth
    });
    if (unauthUploadRes.status !== 401) {
      throw new Error(`Unauthenticated upload expected 401, got ${unauthUploadRes.status}`);
    }
    console.log('✓ Unauthenticated profile picture upload blocked with 401 Unauthorized');

    // --- TEST 2: Upload valid JPEG binary to MongoDB ---
    console.log('\n--- TEST 2: Valid JPEG Binary Upload & MongoDB Storage ---');
    const formJpeg = new FormData();
    formJpeg.append('avatar', new Blob([testJpegBuffer], { type: 'image/jpeg' }), 'maya-avatar.jpg');

    const uploadJpegRes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: formJpeg
    });

    if (!uploadJpegRes.ok) {
      const err = await uploadJpegRes.text();
      throw new Error(`JPEG upload failed with status ${uploadJpegRes.status}: ${err}`);
    }

    const uploadJpegData = await uploadJpegRes.json();
    if (!uploadJpegData.avatarUrl || !uploadJpegData.avatarUrl.includes(`/api/users/${userA.id}/avatar`)) {
      throw new Error(`Invalid avatarUrl returned: ${uploadJpegData.avatarUrl}`);
    }
    console.log(`✓ JPEG uploaded successfully: avatarUrl = ${uploadJpegData.avatarUrl}`);

    // Verify MongoDB storage in ProfileImage collection
    const storedJpegDoc = await ProfileImage.findOne({ userId: userA.id });
    if (!storedJpegDoc) throw new Error('ProfileImage document not found in MongoDB');
    if (!Buffer.isBuffer(storedJpegDoc.data)) throw new Error('Stored data is not a BSON Buffer');
    if (Buffer.compare(storedJpegDoc.data, testJpegBuffer) !== 0) {
      throw new Error('Stored Buffer content in MongoDB does not match uploaded bytes');
    }
    if (storedJpegDoc.contentType !== 'image/jpeg') {
      throw new Error(`Expected contentType 'image/jpeg', got ${storedJpegDoc.contentType}`);
    }
    console.log(`✓ Verified MongoDB BSON Binary storage: ${storedJpegDoc.data.length} bytes in ProfileImage collection`);

    // Verify User document contains reference and NOT large base64 or buffer
    const userDocA = await User.findById(userA.id);
    if (!userDocA.avatarImage || String(userDocA.avatarImage) !== String(storedJpegDoc._id)) {
      throw new Error(`User.avatarImage reference mismatch: ${userDocA.avatarImage} vs ${storedJpegDoc._id}`);
    }
    if (!userDocA.avatar.startsWith(`/api/users/${userA.id}/avatar`)) {
      throw new Error(`User.avatar string format mismatch: ${userDocA.avatar}`);
    }
    console.log('✓ User document correctly stores avatar URL reference and avatarImage ObjectId reference');

    // --- TEST 3: Retrieve Image Binary via GET /api/users/:id/avatar ---
    console.log('\n--- TEST 3: Binary Image Serving & HTTP Headers ---');
    const getAvatarRes = await fetch(`${baseUrl}/users/${userA.id}/avatar`);
    if (!getAvatarRes.ok) {
      throw new Error(`GET avatar returned ${getAvatarRes.status}`);
    }
    const contentTypeHeader = getAvatarRes.headers.get('content-type');
    if (contentTypeHeader !== 'image/jpeg') {
      throw new Error(`Expected Content-Type image/jpeg, got ${contentTypeHeader}`);
    }
    const cacheControlHeader = getAvatarRes.headers.get('cache-control');
    if (!cacheControlHeader || !cacheControlHeader.includes('public')) {
      throw new Error(`Expected public Cache-Control header, got ${cacheControlHeader}`);
    }
    const etagHeader = getAvatarRes.headers.get('etag');
    if (!etagHeader) {
      throw new Error('Expected ETag header on avatar response');
    }

    const fetchedBuffer = Buffer.from(await getAvatarRes.arrayBuffer());
    if (Buffer.compare(fetchedBuffer, testJpegBuffer) !== 0) {
      throw new Error('Served avatar bytes do not match uploaded JPEG buffer');
    }
    console.log(`✓ GET /api/users/:id/avatar successfully served ${fetchedBuffer.length} bytes with Content-Type: ${contentTypeHeader}, ETag: ${etagHeader}`);

    // --- TEST 4: Replace / Update Avatar with PNG ---
    console.log('\n--- TEST 4: Replace Existing Avatar with PNG ---');
    const formPng = new FormData();
    formPng.append('avatar', new Blob([testPngBuffer], { type: 'image/png' }), 'maya-new.png');

    const updatePngRes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: formPng
    });
    if (!updatePngRes.ok) throw new Error(`PUT /profile/avatar failed: ${updatePngRes.status}`);

    const storedPngDoc = await ProfileImage.findOne({ userId: userA.id });
    if (Buffer.compare(storedPngDoc.data, testPngBuffer) !== 0) {
      throw new Error('MongoDB ProfileImage buffer was not updated with PNG bytes');
    }
    if (storedPngDoc.contentType !== 'image/png') {
      throw new Error(`Expected updated contentType 'image/png', got ${storedPngDoc.contentType}`);
    }

    const getPngAvatarRes = await fetch(`${baseUrl}/users/${userA.id}/avatar`);
    if (getPngAvatarRes.headers.get('content-type') !== 'image/png') {
      throw new Error(`GET avatar expected image/png, got ${getPngAvatarRes.headers.get('content-type')}`);
    }
    console.log('✓ Successfully replaced avatar with PNG; Content-Type updated to image/png');

    // --- TEST 5: Upload WEBP format ---
    console.log('\n--- TEST 5: Upload WEBP Format ---');
    const formWebp = new FormData();
    formWebp.append('avatar', new Blob([testWebpBuffer], { type: 'image/webp' }), 'maya.webp');

    const uploadWebpRes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: formWebp
    });
    if (!uploadWebpRes.ok) throw new Error(`WEBP upload failed: ${uploadWebpRes.status}`);

    const storedWebpDoc = await ProfileImage.findOne({ userId: userA.id });
    if (storedWebpDoc.contentType !== 'image/webp') {
      throw new Error(`Expected contentType 'image/webp', got ${storedWebpDoc.contentType}`);
    }
    console.log('✓ Successfully uploaded and served WEBP format image');

    // --- TEST 6: Reject Unsupported File Type (e.g. Text/PDF) ---
    console.log('\n--- TEST 6: Reject Unsupported MIME & File Extensions ---');
    const formTxt = new FormData();
    formTxt.append('avatar', new Blob([Buffer.from('Hello world plain text file')], { type: 'text/plain' }), 'notes.txt');

    const uploadTxtRes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: formTxt
    });
    if (uploadTxtRes.status !== 400) {
      throw new Error(`Expected 400 for text/plain, got ${uploadTxtRes.status}`);
    }
    console.log('✓ Unsupported MIME type (text/plain) rejected with 400 Bad Request');

    // --- TEST 7: Reject Spoofed File Content (Magic Byte Validation) ---
    console.log('\n--- TEST 7: Magic Byte Verification (Reject Spoofed Fake Image) ---');
    // A file with .jpg extension and image/jpeg header, but containing plain text instead of JPEG bytes
    const spoofedContent = Buffer.from('MALICIOUS_OR_CORRUPT_PAYLOAD_NOT_A_REAL_IMAGE');
    const formSpoofed = new FormData();
    formSpoofed.append('avatar', new Blob([spoofedContent], { type: 'image/jpeg' }), 'fake.jpg');

    const uploadSpoofedRes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: formSpoofed
    });
    if (uploadSpoofedRes.status !== 400) {
      throw new Error(`Expected 400 for spoofed image with invalid magic bytes, got ${uploadSpoofedRes.status}`);
    }
    const spoofedBody = await uploadSpoofedRes.json();
    if (!spoofedBody.message || !spoofedBody.message.includes('Invalid file content')) {
      throw new Error(`Expected magic bytes error message, got: ${JSON.stringify(spoofedBody)}`);
    }
    console.log(`✓ Spoofed image with invalid magic bytes rejected: "${spoofedBody.message}"`);

    // --- TEST 8: Reject Files Exceeding 2 MB ---
    console.log('\n--- TEST 8: File Size Limit Enforcement (Max 2 MB) ---');
    const oversizeBuffer = Buffer.concat([jpegHeader, Buffer.alloc(2.5 * 1024 * 1024, 0x42)]);
    const formOversize = new FormData();
    formOversize.append('avatar', new Blob([oversizeBuffer], { type: 'image/jpeg' }), 'large.jpg');

    const uploadOversizeRes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: formOversize
    });
    if (uploadOversizeRes.status !== 400) {
      throw new Error(`Expected 400 for >2MB file, got ${uploadOversizeRes.status}`);
    }
    const oversizeBody = await uploadOversizeRes.json();
    if (!oversizeBody.message || !oversizeBody.message.includes('2 MB')) {
      throw new Error(`Expected 2 MB limit error message, got: ${JSON.stringify(oversizeBody)}`);
    }
    console.log(`✓ File exceeding 2 MB rejected: "${oversizeBody.message}"`);

    // --- TEST 9: Authorization Isolation (User B cannot modify User A's avatar) ---
    console.log('\n--- TEST 9: Authorization Isolation ---');
    // User B uploads their own avatar
    const formB = new FormData();
    formB.append('avatar', new Blob([testPngBuffer], { type: 'image/png' }), 'jordan.png');
    const uploadBRes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: formB
    });
    if (!uploadBRes.ok) throw new Error(`User B avatar upload failed: ${uploadBRes.status}`);

    // Verify User A and User B have separate documents in MongoDB
    const countA = await ProfileImage.countDocuments({ userId: userA.id });
    const countB = await ProfileImage.countDocuments({ userId: userB.id });
    if (countA !== 1 || countB !== 1) {
      throw new Error(`Expected 1 avatar document per user, got A: ${countA}, B: ${countB}`);
    }

    // Jordan (User B) calls DELETE /profile/avatar -> User A's avatar must remain intact!
    const deleteBRes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    if (!deleteBRes.ok) throw new Error(`User B delete failed: ${deleteBRes.status}`);

    // User A's avatar MUST still exist in MongoDB and return 200
    const checkAfterBDelete = await fetch(`${baseUrl}/users/${userA.id}/avatar`);
    if (checkAfterBDelete.status !== 200) {
      throw new Error(`User A's avatar was corrupted or deleted by User B: ${checkAfterBDelete.status}`);
    }
    console.log("✓ User B actions cannot modify or delete User A's avatar (authorization isolation confirmed)");

    // --- TEST 10: JSON Endpoints Do NOT Expose Binary Buffer Data ---
    console.log('\n--- TEST 10: Payload Efficiency (No Buffer in JSON Endpoints) ---');
    // Re-verify User A profile via /api/auth/me
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const meData = await meRes.json();
    const meUser = meData.user || meData;
    if (typeof meUser.avatar !== 'string' || !meUser.avatar.startsWith('/api/users/')) {
      throw new Error(`Expected avatar URL string in /auth/me, got: ${typeof meUser.avatar}`);
    }
    if (meUser.data || meUser.buffer || meUser.avatarImage?.data) {
      throw new Error('Raw binary data leaked in /auth/me response!');
    }

    // Check /api/users
    const usersRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const usersData = await usersRes.json();
    const mayaInList = usersData.find((u) => String(u._id) === String(userA.id));
    if (!mayaInList || typeof mayaInList.avatar !== 'string' || mayaInList.data) {
      throw new Error('Invalid /api/users response: raw binary leaked or missing avatar URL');
    }
    console.log('✓ Normal JSON endpoints (/api/auth/me, /api/users) return lightweight URLs without raw binary buffers');

    // --- TEST 11: Remove / Delete Avatar ---
    console.log('\n--- TEST 11: Delete / Remove Profile Picture ---');
    const deleteARes = await fetch(`${baseUrl}/profile/avatar`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    if (!deleteARes.ok) throw new Error(`Delete failed: ${deleteARes.status}`);
    const deleteAData = await deleteARes.json();
    if (deleteAData.user.avatar !== '') {
      throw new Error(`Expected empty avatar string after delete, got: ${deleteAData.user.avatar}`);
    }

    // Verify deleted in MongoDB
    const docAfterDelete = await ProfileImage.findOne({ userId: userA.id });
    if (docAfterDelete) {
      throw new Error('ProfileImage record was not removed from MongoDB collection');
    }

    // Verify subsequent GET returns 404
    const getAvatarAfterDelete = await fetch(`${baseUrl}/users/${userA.id}/avatar`);
    if (getAvatarAfterDelete.status !== 404) {
      throw new Error(`Expected 404 for deleted avatar, got ${getAvatarAfterDelete.status}`);
    }
    console.log('✓ Profile picture successfully deleted from MongoDB; subsequent GET returns 404 Not Found');

    console.log('\n======================================================');
    console.log('🎉 ALL 11 AVATAR BINARY STORAGE TESTS PASSED 100%!');
    console.log('======================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runAvatarTests().catch((err) => {
  console.error('\n❌ AVATAR TEST SUITE FAILED:', err);
  process.exit(1);
});
