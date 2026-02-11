/**
 * PetDance Cloud Functions
 * - createJob: Create job + return presigned upload URL
 * - startJob: Trigger Replicate AI processing
 * - replicateWebhook: Handle Replicate completion
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');

// Config via env vars (set in functions/.env or Firebase console)
// See functions/.env.example for required variables
const config = () => ({
  replicateToken: process.env.REPLICATE_API_TOKEN,
  replicateModel: process.env.REPLICATE_MODEL || 'minimax/hailuo-2.3-fast',
  replicateWebhookSecret: process.env.REPLICATE_WEBHOOK_SECRET,
  revenuecatSecret: process.env.REVENUECAT_SECRET_KEY,
  revenuecatEntitlement: process.env.REVENUECAT_ENTITLEMENT_ID || 'pro',
});
const { getStorage } = require('firebase-admin/storage');
const { validateSubscription } = require('./helpers/revenuecat');
const {
  validateImage,
  createPrediction,
  verifyWebhookSignature,
  MAX_IMAGE_SIZE_BYTES,
} = require('./helpers/replicate');

const BUCKET_NAME = process.env.STORAGE_BUCKET || 'petdance-da752.firebasestorage.app';

admin.initializeApp({ storageBucket: BUCKET_NAME });

const db = admin.firestore();
const auth = admin.auth();

let bucket;
try {
  bucket = getStorage().bucket(BUCKET_NAME);
  console.log('Storage bucket:', bucket.name);
} catch (e) {
  console.error('Storage init failed:', e.message, e.code);
}

const STORAGE_UNAVAILABLE_MSG = 'Video storage is being configured. Please try again later. (Storage requires billing setup)';

// Rate limit: free users (subscriptionStatus !== 'active') - 2 jobs per day
const FREE_USER_DAILY_LIMIT = 2;

/**
 * Ensure user document exists and get/create it
 */
async function getOrCreateUser(userId, email) {
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    await userRef.set({
      email: email || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      subscriptionStatus: 'none',
      revenuecatUserId: userId,
    });
  }

  return userRef;
}

/**
 * Check rate limit for free users - only counts jobs where we called Replicate
 * (processing = paying Replicate, completed = delivered video). Pending/failed don't count.
 */
async function checkRateLimit(userId) {
  const userDoc = await db.collection('users').doc(userId).get();
  const user = userDoc.data();
  
  if (user?.subscriptionStatus === 'active') {
    return true; // No limit for subscribed users
  }

  const dayAgo = new Date();
  dayAgo.setDate(dayAgo.getDate() - 1);

  const jobsSnapshot = await db.collection('jobs')
    .where('userId', '==', userId)
    .where('status', 'in', ['processing', 'completed'])
    .where('createdAt', '>=', dayAgo)
    .get();

  if (jobsSnapshot.size >= FREE_USER_DAILY_LIMIT) {
    throw new Error(`Free tier limit: ${FREE_USER_DAILY_LIMIT} videos per day. Upgrade for unlimited!`);
  }
  return true;
}

/** Verify we can write to Storage before calling expensive Replicate API */
async function verifyStorageWritable(userId, jobId) {
  if (!bucket) return false;
  if (process.env.STORAGE_SKIP_PROBE === '1') return true; // Bypass for debugging
  const outputPath = `outputs/${userId}/${jobId}/.probe`;
  try {
    const probeFile = bucket.file(outputPath);
    await probeFile.save(Buffer.from('probe'), { metadata: { contentType: 'text/plain' } });
    await probeFile.delete();
    return true;
  } catch (e) {
    console.error('Storage probe failed:', e.message, 'code:', e.code);
    return false;
  }
}

/**
 * API: Create Job
 * POST /api/create-job
 * Body: { danceStyle: string }
 * Headers: Authorization: Bearer <firebase-id-token>
 * 
 * Returns: { jobId, uploadUrl, expiresAt }
 */
exports.createJob = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const email = decodedToken.email || '';

    const { danceStyle } = req.body || {};
    if (!danceStyle || typeof danceStyle !== 'string') {
      res.status(400).json({ error: 'danceStyle is required' });
      return;
    }

    const validStyles = ['hip-hop', 'ballet', 'disco', 'breakdance', 'salsa', 'robot'];
    if (!validStyles.includes(danceStyle)) {
      res.status(400).json({ error: `Invalid danceStyle. Allowed: ${validStyles.join(', ')}` });
      return;
    }

    await getOrCreateUser(userId, email);

    const revenuecatUserId = userId;
    const subValidation = await validateSubscription(revenuecatUserId, config().revenuecatSecret);
    if (!subValidation.hasAccess && subValidation.subscriptionStatus === 'none') {
      // Allow free tier with rate limit
    }

    const jobRef = db.collection('jobs').doc();
    const jobId = jobRef.id;
    const uploadPath = `uploads/${userId}/${jobId}/original.jpg`;

    await jobRef.set({
      userId,
      inputImagePath: uploadPath,
      outputVideoPath: null,
      status: 'pending',
      danceStyle,
      replicateJobId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: null,
      errorMessage: null,
    });

    res.status(200).json({
      jobId,
      uploadPath,
    });
  } catch (error) {
    console.error('createJob error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * API: Start Job (trigger AI processing)
 * POST /api/start-job
 * Body: { jobId: string }
 * Headers: Authorization: Bearer <firebase-id-token>
 */
exports.startJob = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const { jobId, imageUrl: clientImageUrl } = req.body || {};
    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' });
      return;
    }

    const jobRef = db.collection('jobs').doc(jobId);
    const jobSnap = await jobRef.get();

    if (!jobSnap.exists) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const job = jobSnap.data();
    if (job.userId !== userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    if (job.status !== 'pending') {
      res.status(400).json({ error: `Job already ${job.status}` });
      return;
    }

    const subValidation = await validateSubscription(job.userId, config().revenuecatSecret);
    if (!subValidation.hasAccess && subValidation.subscriptionStatus === 'none') {
      // Free user - rate limit already checked at job creation
    }

    await checkRateLimit(userId);

    let imageUrl = clientImageUrl;
    if (!imageUrl || typeof imageUrl !== 'string') {
      res.status(400).json({ error: 'imageUrl is required. Upload image first, then call startJob with the download URL.' });
      return;
    }
    if (!imageUrl.startsWith('http')) {
      res.status(400).json({ error: 'imageUrl must be a valid HTTP URL' });
      return;
    }

    if (!bucket) {
      res.status(503).json({ error: STORAGE_UNAVAILABLE_MSG });
      return;
    }
    const canWrite = await verifyStorageWritable(userId, jobRef.id);
    if (!canWrite) {
      res.status(503).json({ error: STORAGE_UNAVAILABLE_MSG });
      return;
    }

    const mockMode = process.env.REPLICATE_MOCK === '1';
    const mockVideoUrl = process.env.MOCK_VIDEO_URL || 'https://download.samplelib.com/mp4/sample-5s.mp4';

    if (mockMode) {
      // Skip Replicate API - use sample video (no cost)
      const outputPath = `outputs/${userId}/${jobRef.id}/dance.mp4`;
      const outputFile = bucket.file(outputPath);
      try {
        const fetchRes = await fetch(mockVideoUrl);
        if (!fetchRes.ok) throw new Error(`Mock video fetch failed: ${fetchRes.status}`);
        const buffer = Buffer.from(await fetchRes.arrayBuffer());
        await outputFile.save(buffer, { metadata: { contentType: 'video/mp4' } });
        await jobRef.update({
          status: 'completed',
          outputVideoPath: outputPath,
          replicateJobId: 'mock-' + jobRef.id,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          errorMessage: null,
        });
        res.status(200).json({ jobId, status: 'completed', mock: true });
        return;
      } catch (mockErr) {
        console.error('Mock mode error:', mockErr);
        res.status(500).json({ error: 'Mock mode failed: ' + mockErr.message });
        return;
      }
    }

    const projectId = process.env.GCLOUD_PROJECT
      || (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).projectId : null);
    const functionsUrl = projectId
      ? `https://us-central1-${projectId}.cloudfunctions.net`
      : '';

    const webhookUrl = functionsUrl ? `${functionsUrl}/replicateWebhook` : null;

    const prediction = await createPrediction(
      imageUrl,
      job.danceStyle,
      webhookUrl || undefined,
      config().replicateToken,
      config().replicateModel
    );

    await jobRef.update({
      status: 'processing',
      replicateJobId: prediction.id,
    });

    res.status(200).json({
      jobId,
      replicateJobId: prediction.id,
      status: 'processing',
    });
  } catch (error) {
    console.error('startJob error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * Webhook: Replicate job completion
 * POST /api/replicate-webhook
 * Called by Replicate when prediction completes
 *
 * Uses express.raw() to capture exact request body for signature verification.
 * Firebase's default body parsing can alter the payload and break HMAC verification.
 */
const webhookApp = express();
webhookApp.use(express.raw({ type: 'application/json' }));
webhookApp.post('*', async (req, res) => {
  // req.body is the raw Buffer (from express.raw) - use exact bytes for signature
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  const webhookId = req.headers['webhook-id'];
  const webhookTimestamp = req.headers['webhook-timestamp'];
  const webhookSignature = req.headers['webhook-signature'];

  const secret = process.env.REPLICATE_WEBHOOK_SECRET || config().replicateWebhookSecret;
  const skipVerify = process.env.REPLICATE_SKIP_WEBHOOK_VERIFY === '1';
  if (secret && webhookId && webhookTimestamp && webhookSignature && !skipVerify) {
    const isValid = verifyWebhookSignature(
      rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      secret
    );
    if (!isValid) {
      console.error('Invalid webhook signature - check rawBody matches sent payload, or set REPLICATE_SKIP_WEBHOOK_VERIFY=1 to bypass');
      res.status(401).send('Invalid signature');
      return;
    }
  } else if (secret && skipVerify) {
    console.warn('Webhook verification SKIPPED (REPLICATE_SKIP_WEBHOOK_VERIFY=1) - re-enable for production');
  } else if (secret && (!webhookId || !webhookTimestamp || !webhookSignature)) {
    console.warn('Webhook verification skipped - missing headers');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).send('Invalid JSON');
    return;
  }

  const replicateJobId = payload.id;
  const status = payload.status;
  const output = payload.output;
  const error = payload.error;

  if (!replicateJobId) {
    res.status(400).send('Missing prediction id');
    return;
  }

  try {
    const jobsSnapshot = await db.collection('jobs')
      .where('replicateJobId', '==', replicateJobId)
      .limit(1)
      .get();

    if (jobsSnapshot.empty) {
      console.warn('No job found for replicateJobId:', replicateJobId);
      res.status(200).send('OK');
      return;
    }

    const jobRef = jobsSnapshot.docs[0].ref;
    const job = jobsSnapshot.docs[0].data();
    const { userId } = job;

    if (status === 'succeeded' && output) {
      let videoUrl = typeof output === 'string' ? output : null;
      if (!videoUrl && typeof output === 'object') {
        videoUrl = output.url || output.video || output.output || output[0];
        if (Array.isArray(videoUrl)) videoUrl = videoUrl[0];
      }
      if (!videoUrl) {
        console.error('Replicate output format:', JSON.stringify(output).slice(0, 500));
        throw new Error('No video URL in Replicate output');
      }

      if (!bucket) {
        await jobRef.update({
          status: 'failed',
          errorMessage: STORAGE_UNAVAILABLE_MSG,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(200).send('OK');
        return;
      }

      const outputPath = `outputs/${userId}/${jobRef.id}/dance.mp4`;
      const outputFile = bucket.file(outputPath);

      const fetchResponse = await fetch(videoUrl);
      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch video: ${fetchResponse.status}`);
      }

      const buffer = Buffer.from(await fetchResponse.arrayBuffer());
      try {
        await outputFile.save(buffer, {
          metadata: { contentType: 'video/mp4' },
        });
      } catch (storageErr) {
        console.error('Storage save error:', storageErr);
        await jobRef.update({
          status: 'failed',
          errorMessage: STORAGE_UNAVAILABLE_MSG,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(200).send('OK');
        return;
      }

      await jobRef.update({
        status: 'completed',
        outputVideoPath: outputPath,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: null,
      });
    } else if (status === 'failed') {
      await jobRef.update({
        status: 'failed',
        errorMessage: error || 'Replicate job failed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (status === 'canceled') {
      await jobRef.update({
        status: 'failed',
        errorMessage: 'Job was canceled',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Processing error');
    return;
  }

  res.status(200).send('OK');
});
webhookApp.all('*', (req, res) => {
  res.status(req.method === 'POST' ? 404 : 405).send(req.method === 'POST' ? 'Not found' : 'Method not allowed');
});
exports.replicateWebhook = functions.https.onRequest(webhookApp);

/**
 * API: Get signed download URL
 * POST /api/get-download-url
 * Body: { jobId: string }
 * Headers: Authorization: Bearer <firebase-id-token>
 */
exports.getDownloadUrl = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const { jobId } = req.body || {};
    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' });
      return;
    }

    const jobSnap = await db.collection('jobs').doc(jobId).get();
    if (!jobSnap.exists) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const job = jobSnap.data();
    if (job.userId !== userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    if (job.status !== 'completed' || !job.outputVideoPath) {
      res.status(400).json({ error: 'Video not ready for download' });
      return;
    }

    res.status(200).json({ outputVideoPath: job.outputVideoPath, expiresIn: 3600 });
  } catch (error) {
    console.error('getDownloadUrl error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * API: Get job status
 * GET /api/job-status?jobId=xxx
 * Headers: Authorization: Bearer <firebase-id-token>
 */
exports.getJobStatus = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const jobId = req.query.jobId;
    if (!jobId) {
      res.status(400).json({ error: 'jobId query param required' });
      return;
    }

    const jobSnap = await db.collection('jobs').doc(jobId).get();
    if (!jobSnap.exists) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const job = jobSnap.data();
    if (job.userId !== userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    const data = {
      jobId,
      status: job.status,
      danceStyle: job.danceStyle,
      createdAt: job.createdAt?.toDate?.()?.toISOString?.(),
      completedAt: job.completedAt?.toDate?.()?.toISOString?.(),
      errorMessage: job.errorMessage,
    };

    if (job.status === 'completed' && job.outputVideoPath) {
      data.outputVideoPath = job.outputVideoPath;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('getJobStatus error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
