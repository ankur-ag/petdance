/**
 * Replicate API helper for AI video generation
 * Docs: https://replicate.com/docs/reference/http
 */

const REPLICATE_API_BASE = 'https://api.replicate.com/v1';

// Valid image MIME types
const VALID_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Validate image before processing
 */
function validateImage(imageUrl, contentType, contentLength) {
  if (!VALID_IMAGE_TYPES.includes(contentType?.toLowerCase()) &&
      !imageUrl?.match(/\.(jpg|jpeg|png|webp)$/i)) {
    throw new Error(`Invalid image type. Allowed: ${VALID_IMAGE_TYPES.join(', ')}`);
  }
  if (contentLength && contentLength > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image too large. Maximum size: ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`);
  }
}

/**
 * Create a Replicate prediction for pet dancing video
 * Uses configurable model via REPLICATE_MODEL env var
 * 
 * Recommended models for image-to-video animation:
 * - minimax/video-01 (general video gen, uses prompt + image)
 * - stability-ai/stable-video-diffusion (image to video)
 * - Custom model with image input
 */
async function createPrediction(imageUrl, danceStyle, webhookUrl, apiToken, modelConfig) {
  apiToken = apiToken || process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is not configured');
  }

  modelConfig = modelConfig || process.env.REPLICATE_MODEL || 'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438';

  let version = modelConfig;
  if (!modelConfig.includes(':')) {
    version = await getModelVersion(modelConfig);
  }

  // Stable Video Diffusion uses image input; minimax/video-01 uses prompt + image
  const input = modelConfig.startsWith('minimax/')
    ? {
        prompt: `A cute pet dancing in ${danceStyle} style, smooth motion, professional quality`,
        image: imageUrl,
      }
    : {
        image: imageUrl,
        motion_bucket_id: 127,
        fps: 6,
      };

  const payload = {
    version,
    input,
    ...(webhookUrl && { webhook: webhookUrl, webhook_events_filter: ['completed'] }),
  };

  const response = await fetch(`${REPLICATE_API_BASE}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Replicate API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Get latest model version if not specified
 */
async function getModelVersion(modelId) {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const [owner, name] = modelId.split('/');
  
  const response = await fetch(
    `https://api.replicate.com/v1/models/${owner}/${name}/versions`,
    {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    }
  );

  if (!response.ok) {
    return modelId; // Fallback to using as version
  }

  const data = await response.json();
  const latest = data.results?.[0];
  return latest ? `${modelId}:${latest.id}` : modelId;
}

/**
 * Verify Replicate webhook signature
 */
function verifyWebhookSignature(body, webhookId, timestamp, signature, secret) {
  const crypto = require('crypto');
  const signedContent = `${webhookId}.${timestamp}.${body}`;
  const secretKey = secret.replace('whsec_', '');
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(signedContent)
    .digest('base64');

  const signatures = signature.split(' ').map(s => {
    const parts = s.split(',');
    return parts[parts.length - 1]; // Get signature without version prefix
  });

  const isValid = signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig, 'base64'),
        Buffer.from(expectedSignature, 'base64')
      );
    } catch {
      return false;
    }
  });

  // Verify timestamp to prevent replay attacks (5 min tolerance)
  const timestampAge = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  const isRecent = timestampAge < 300;

  return isValid && isRecent;
}

module.exports = {
  validateImage,
  createPrediction,
  verifyWebhookSignature,
  VALID_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
};
