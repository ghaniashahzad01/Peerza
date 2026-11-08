import 'dotenv/config';
import mongoose from 'mongoose';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { User, ProfileImage, CertificateFile, Review, Meeting, UserSkill } from './src/models.js';
import authRoutes from './src/routes/auth.js';
import profileRoutes from './src/routes/profile.js';
import userRoutes from './src/routes/users.js';
import reviewsRoutes from './src/routes/reviews.js';
import meetingsRoutes from './src/routes/meetings.js';

const MONGODB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peerza';

const TEST_PORT = 5077;

async function runFeatureCompletionTests() {
  console.log('\n--- STARTING PEERZA FEATURE COMPLETION & VERIFICATION TEST SUITE ---');

  await mongoose.connect(MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  const app = express();
  const server = http.createServer(app);
  app.use(cors());
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api', reviewsRoutes);
  app.use('/api/meetings', meetingsRoutes);

  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ message: err.message || 'Error' });
  });

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://localhost:${TEST_PORT}/api`;
  console.log(`✓ Test server listening on port ${TEST_PORT}`);

  try {
    // 1. Authenticate Maya and Jordan
    const login = async (email, password = 'PeerzaDemo2025!') => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error(`Login failed for ${email}`);
      return res.json();
    };

    const authMaya = await login('maya@peerza.demo');
    const authJordan = await login('jordan@peerza.demo');
    const tokenMaya = authMaya.token;
    const tokenJordan = authJordan.token;
    const mayaId = authMaya.user.id;
    const jordanId = authJordan.user.id;
    console.log('✓ Authenticated test users Maya Chen and Jordan Lee');

    // TEST 1: Professional Experience API
    console.log('\n--- TEST 1: Professional Experience Management ---');
    const addExpRes = await fetch(`${baseUrl}/profile/experience`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMaya}`
      },
      body: JSON.stringify({
        title: 'Lead UI/UX Designer',
        organization: 'DesignCraft Studio',
        duration: '2022 – Present',
        description: 'Led end-to-end user research and high-fidelity prototyping.'
      })
    });
    if (!addExpRes.ok) throw new Error(`Add experience failed: ${addExpRes.status}`);
    const expData = await addExpRes.json();
    if (!expData.experience?._id || expData.experience.title !== 'Lead UI/UX Designer') {
      throw new Error('Experience not saved correctly in user document');
    }
    const createdExpId = expData.experience._id;
    console.log('✓ POST /profile/experience: created experience entry successfully');

    // Verify evidenceComplete is now true
    if (expData.user.evidenceComplete !== true) {
      throw new Error('evidenceComplete should be true after adding experience');
    }
    console.log('✓ Verified evidenceComplete is true after adding experience');

    // TEST 2: Certificate Upload & BSON Storage
    console.log('\n--- TEST 2: Certificate Upload & BSON Storage in MongoDB ---');
    // Create valid minimal PDF buffer: %PDF-1.4 ... %%EOF
    const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n%%EOF');
    const formData = new FormData();
    formData.append('title', 'Advanced Interaction Design Certification');
    formData.append('issuer', 'Interaction Design Foundation');
    formData.append('skill', 'UI/UX Design');
    formData.append('certificate', new Blob([validPdfBuffer], { type: 'application/pdf' }), 'cert.pdf');

    const addCertRes = await fetch(`${baseUrl}/profile/certificates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMaya}` },
      body: formData
    });
    if (!addCertRes.ok) {
      const err = await addCertRes.json();
      throw new Error(`Add cert failed: ${err.message}`);
    }
    const certData = await addCertRes.json();
    if (!certData.certificate?.fileRef) {
      throw new Error('Certificate fileRef missing in response');
    }
    const certId = certData.certificate._id;
    const fileRef = certData.certificate.fileRef;
    console.log(`✓ POST /profile/certificates: PDF uploaded, stored with fileRef: ${fileRef}`);

    // Verify CertificateFile in MongoDB BSON collection
    const certDoc = await CertificateFile.findById(fileRef);
    if (!certDoc || !certDoc.data || certDoc.contentType !== 'application/pdf') {
      throw new Error('Certificate document not found in MongoDB CertificateFile collection');
    }
    console.log(`✓ Verified MongoDB BSON Binary storage in CertificateFile: ${certDoc.data.length} bytes`);

    // TEST 3: Certificate Document Serving
    console.log('\n--- TEST 3: Certificate Document Serving ---');
    const serveRes = await fetch(`${baseUrl}/profile/certificates/${fileRef}/file`);
    if (!serveRes.ok) throw new Error(`Serve cert failed: ${serveRes.status}`);
    const contentType = serveRes.headers.get('content-type');
    const disposition = serveRes.headers.get('content-disposition');
    if (!contentType?.includes('application/pdf')) {
      throw new Error(`Expected application/pdf, got ${contentType}`);
    }
    if (!disposition?.includes('inline')) {
      throw new Error(`Expected inline Content-Disposition, got ${disposition}`);
    }
    console.log('✓ GET /profile/certificates/:id/file: served with Content-Type: application/pdf and Content-Disposition: inline');

    // Also test lookup by certificate subdocument ID
    const serveByCertIdRes = await fetch(`${baseUrl}/profile/certificates/${certId}/file`);
    if (!serveByCertIdRes.ok) throw new Error(`Serve by cert subdocument ID failed: ${serveByCertIdRes.status}`);
    console.log('✓ Certificate serving resilient: successfully resolves by both CertificateFile ID and subdocument cert ID');

    // TEST 4: Public Profile Endpoint (/users/:id)
    console.log('\n--- TEST 4: Other Users Public Profile Retrieval ---');
    const publicProfileRes = await fetch(`${baseUrl}/users/${mayaId}`, {
      headers: { Authorization: `Bearer ${tokenJordan}` }
    });
    if (!publicProfileRes.ok) throw new Error(`Public profile retrieval failed: ${publicProfileRes.status}`);
    const publicProfile = await publicProfileRes.json();
    if (publicProfile.name !== 'Maya Chen') throw new Error('Incorrect public profile name');
    if (!Array.isArray(publicProfile.experience) || publicProfile.experience.length === 0) {
      throw new Error('Experience missing in public profile response');
    }
    if (!Array.isArray(publicProfile.certificates) || publicProfile.certificates.length === 0) {
      throw new Error('Certificates missing in public profile response');
    }
    if (publicProfile.evidenceComplete !== true) {
      throw new Error('evidenceComplete should be true in public profile');
    }
    console.log('✓ GET /api/users/:id: Jordan successfully viewed Maya\'s full profile with experience, certificates, and evidence status');

    // TEST 5: Ratings & Reviews Calculation
    console.log('\n--- TEST 5: Real Ratings & Reviews Calculation from Database ---');
    // Create completed meeting between Jordan and Maya
    const meeting = await Meeting.create({
      requester: jordanId,
      recipient: mayaId,
      proposedAt: new Date(),
      status: 'completed',
      acceptedAt: new Date(),
      completedAt: new Date()
    });

    const createReviewRes = await fetch(`${baseUrl}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenJordan}`
      },
      body: JSON.stringify({
        reviewedUser: mayaId,
        meeting: meeting._id,
        rating: 5,
        comment: 'Maya was an incredible mentor and explained design systems perfectly!'
      })
    });
    if (!createReviewRes.ok) {
      const err = await createReviewRes.json();
      throw new Error(`Review creation failed: ${err.message}`);
    }
    console.log('✓ Submitted genuine 5-star review from Jordan to Maya');

    // Check Maya's public profile again to verify updated rating & reviews
    const mayaUpdatedProfileRes = await fetch(`${baseUrl}/users/${mayaId}`, {
      headers: { Authorization: `Bearer ${tokenJordan}` }
    });
    const mayaUpdated = await mayaUpdatedProfileRes.json();
    if (typeof mayaUpdated.rating !== 'number' || mayaUpdated.rating < 1) {
      throw new Error(`Expected numeric rating, got: ${mayaUpdated.rating}`);
    }
    if (mayaUpdated.reviewCount < 1) {
      throw new Error(`Expected reviewCount >= 1, got: ${mayaUpdated.reviewCount}`);
    }
    const foundReview = mayaUpdated.reviews.find((r) => String(r.meeting) === String(meeting._id));
    if (!foundReview || foundReview.rating !== 5) {
      throw new Error('Review record not found in populated reviews list');
    }
    console.log(`✓ Real rating calculated dynamically: ${mayaUpdated.rating} stars across ${mayaUpdated.reviewCount} reviews`);

    // TEST 6: Discover Filtering & Demo Separation
    console.log('\n--- TEST 6: Discover Real Users & Demo Separation ---');
    // Discover by default (includeDemo=false)
    const discoverRealRes = await fetch(`${baseUrl}/users?exclude=${mayaId}&includeDemo=false`, {
      headers: { Authorization: `Bearer ${tokenMaya}` }
    });
    const discoverReal = await discoverRealRes.json();
    const hasDemoInDefault = discoverReal.some((u) => u.isDemo === true || (u.email && u.email.endsWith('@peerza.demo')));
    if (hasDemoInDefault) {
      throw new Error('Demo accounts found in default Discover results when includeDemo=false');
    }
    console.log(`✓ Discover (includeDemo=false): returned ${discoverReal.length} registered learners without demo accounts`);

    // Discover with demo included
    const discoverAllRes = await fetch(`${baseUrl}/users?exclude=${mayaId}&includeDemo=true`, {
      headers: { Authorization: `Bearer ${tokenMaya}` }
    });
    const discoverAll = await discoverAllRes.json();
    console.log(`✓ Discover (includeDemo=true): returned ${discoverAll.length} total users including demo accounts`);

    // TEST 7: Cleanup Test Entries
    console.log('\n--- TEST 7: Cleanup Experience & Certificate ---');
    await fetch(`${baseUrl}/profile/experience/${createdExpId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMaya}` }
    });
    console.log('✓ Deleted test experience');

    await fetch(`${baseUrl}/profile/certificates/${certId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMaya}` }
    });
    console.log('✓ Deleted test certificate and associated BSON document');

    // Clean up test meeting & review
    await Review.deleteOne({ meeting: meeting._id });
    await Meeting.deleteOne({ _id: meeting._id });
    console.log('✓ Cleaned up test meeting and review');

    console.log('\n======================================================');
    console.log('🎉 ALL FEATURE COMPLETION TESTS PASSED 100%!');
    console.log('======================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runFeatureCompletionTests().catch((err) => {
  console.error('\n❌ FEATURE COMPLETION TEST FAILED:', err);
  process.exit(1);
});
