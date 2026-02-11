/**
 * PetDance Cloud Functions
 * - createJob: Create job + return presigned upload URL
 * - startJob: Trigger Replicate AI processing
 * - replicateWebhook: Handle Replicate completion
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const config = () => {
  const c = functions.config();
  return {
    replicateToken: process.env.REPLICATE_API_TOKEN || c?.replicate?.api_token,
    replicateModel: process.env.REPLICATE_MODEL || c?.replicate?.model,
    replicateWebhookSecret: process.env.REPLICATE_WEBHOOK_SECRET || c?.replicate?.webhook_secret,
    revenuecatSecret: process.env.REVENUECAT_SECRET_KEY || c?.revenuecat?.secret_key,
    revenuecatEntitlement: process.env.REVENUECAT_ENTITLEMENT_ID || c?.revenuecat?.entitlement_id || 'pro',
  };
};
const { getStorage } = require('firebase-admin/storage');
const { validateSubscription } = require('./helpers/revenuecat');
const {
  validateImage,
  createPrediction,
  verifyWebhookSignature,
  MAX_IMAGE_SIZE_BYTES,
} = require('./helpers/replicate');

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// Storage may be unavailable (e.g. bucket not created yet - billing pending)
let bucket;
try {
  const storage = getStorage();
  bucket = storage.bucket();
} catch (e) {
  console.warn('Storage not available:', e.message);
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
 * Check rate limit for free users
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
    .where('createdAt', '>=', dayAgo)
    .get();

  if (jobsSnapshot.size >= FREE_USER_DAILY_LIMIT) {
    throw new Error(`Free tier limit: ${FREE_USER_DAILY_LIMIT} videos per day. Upgrade for unlimited!`);
  }
  return true;
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
    await checkRateLimit(userId);

    const revenuecatUserId = userId;
    const subValidation = await validateSubscription(revenuecatUserId, config().revenuecatSecret);
    if (!subValidation.hasAccess && subValidation.subscriptionStatus === 'none') {
      // Allow free tier with rate limit
    }

    if (!bucket) {
      res.status(503).json({ error: STORAGE_UNAVAILABLE_MSG });
      return;
    }

    const jobRef = db.collection('jobs').doc();
    const jobId = jobRef.id;
    const inputPath = `uploads/${userId}/${jobId}/original.jpg`;

    await jobRef.set({
      userId,
      inputImagePath: inputPath,
      outputVideoPath: null,
      status: 'pending',
      danceStyle,
      replicateJobId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: null,
      errorMessage: null,
    });

    const file = bucket.file(inputPath);
    let uploadUrl;
    try {
      [uploadUrl] = await file.getSignedUrl({
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: 'image/jpeg',
      });
    } catch (storageErr) {
      console.error('Storage getSignedUrl error:', storageErr);
      res.status(503).json({ error: STORAGE_UNAVAILABLE_MSG });
      return;
    }

    res.status(200).json({
      jobId,
      uploadUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      inputPath,
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

    const { jobId } = req.body || {};
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

    if (!bucket) {
      res.status(503).json({ error: STORAGE_UNAVAILABLE_MSG });
      return;
    }

    const inputFile = bucket.file(job.inputImagePath);
    let exists;
    let imageUrl;
    try {
      [exists] = await inputFile.exists();
      if (!exists) {
        await jobRef.update({
          status: 'failed',
          errorMessage: 'Image not uploaded',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(400).json({ error: 'Image not found. Please upload first.' });
        return;
      }
      [imageUrl] = await inputFile.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });
    } catch (storageErr) {
      console.error('Storage error in startJob:', storageErr);
      res.status(503).json({ error: STORAGE_UNAVAILABLE_MSG });
      return;
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
 */
exports.replicateWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const rawBody = (typeof req.rawBody !== 'undefined' ? req.rawBody : null)
    ? (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody))
    : JSON.stringify(req.body);
  const webhookId = req.headers['webhook-id'];
  const webhookTimestamp = req.headers['webhook-timestamp'];
  const webhookSignature = req.headers['webhook-signature'];

  const secret = process.env.REPLICATE_WEBHOOK_SECRET || config().replicateWebhookSecret;
  if (secret && webhookId && webhookTimestamp && webhookSignature) {
    const isValid = verifyWebhookSignature(
      rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      secret
    );
    if (!isValid) {
      console.error('Invalid webhook signature');
      res.status(401).send('Invalid signature');
      return;
    }
  } else if (secret) {
    console.warn('Webhook verification skipped - missing headers');
  }

  let payload;
  try {
    payload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
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

    if (!bucket) {
      res.status(503).json({ error: STORAGE_UNAVAILABLE_MSG });
      return;
    }

    const file = bucket.file(job.outputVideoPath);
    let url;
    try {
      [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });
    } catch (storageErr) {
      console.error('Storage error in getDownloadUrl:', storageErr);
      res.status(503).json({ error: STORAGE_UNAVAILABLE_MSG });
      return;
    }

    res.status(200).json({ downloadUrl: url, expiresIn: 3600 });
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
      if (bucket) {
        const file = bucket.file(job.outputVideoPath);
        const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });
      data.downloadUrl = url;
      } else {
        data.errorMessage = STORAGE_UNAVAILABLE_MSG;
      }
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('getJobStatus error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
