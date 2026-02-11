# PetDance Backend Setup Guide

This guide covers the complete backend setup: Firebase (Auth, Firestore, Storage, Cloud Functions), Replicate API, and RevenueCat.

## Architecture Overview

```
Frontend → createJob → Firestore job (pending) → Presigned upload URL
         → upload image to Storage
         → startJob → Replicate API (async)
         → Replicate webhook → replicateWebhook → Fetch video → Storage → Update job (completed)
         → Firestore listener / poll → getDownloadUrl → Signed download URL
```

## 1. Firebase Setup

### 1.1 Create Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable **Authentication** (Google, Email/Password)
4. Create **Firestore** database
5. Create **Storage** bucket (requires Blaze/billing—can be added later; app will show a friendly "Storage being configured" message until then)

### 1.2 Configure Project
Update `.firebaserc`:
```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

Update `js/firebase-config.js` with your config from Firebase Console.

### 1.3 Deploy Rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

### 1.4 Deploy Functions
```bash
cd functions
npm install
firebase deploy --only functions
```

## 2. Environment Variables (Cloud Functions)

`functions.config()` was removed in firebase-functions v7. Use a `.env` file in `functions/`:

1. Copy `functions/.env.example` to `functions/.env`
2. Fill in your values
3. Never commit `.env` (it's in .gitignore)

| Variable | Description | Required |
|----------|-------------|----------|
| `REPLICATE_API_TOKEN` | Get from [Replicate Account](https://replicate.com/account/api-tokens) | Yes |
| `REPLICATE_MODEL` | Model ID. Default: `minimax/hailuo-2.3-fast` (pet dancing) | No |
| `REPLICATE_WEBHOOK_SECRET` | From `GET https://api.replicate.com/v1/webhooks/default/secret` | For webhook verification |
| `REVENUECAT_SECRET_KEY` | From RevenueCat dashboard | For subscription validation |
| `REVENUECAT_ENTITLEMENT_ID` | Your entitlement ID (e.g. `pro`) | No (defaults to `pro`) |

**Migrating from legacy config:** If you previously used `firebase functions:config:set`:
```bash
firebase functions:config:get   # view current values
# Create functions/.env with REPLICATE_API_TOKEN=..., etc.
```

## 3. Replicate Setup

### 3.1 Get API Token
1. Sign up at [Replicate](https://replicate.com)
2. Go to Account → API Tokens
3. Create a token

### 3.2 Choose a Model
- **minimax/hailuo-2.3-fast**: Pet dancing, lower latency (default)
- **minimax/video-01**: Text + image to video
- **stability-ai/stable-video-diffusion**: Image-to-video
- Search [Replicate explore](https://replicate.com/explore) for "image to video" or "animate"

### 3.3 Configure Webhook
1. Deploy your Cloud Functions
2. Get webhook URL: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/replicateWebhook`
3. In Replicate, webhooks are per-prediction (we pass `webhook` in the API call) – no dashboard config needed
4. Optionally get signing secret: `curl -H "Authorization: Bearer YOUR_TOKEN" https://api.replicate.com/v1/webhooks/default/secret`
5. Set `REPLICATE_WEBHOOK_SECRET` in Functions config

## 4. RevenueCat Setup

### 4.1 Create Project
1. Sign up at [RevenueCat](https://www.revenuecat.com/)
2. Create a project and add your app (iOS/Android/Web)
3. Configure products and entitlements

### 4.2 Get Secret Key
1. RevenueCat Dashboard → Project Settings → API Keys
2. Copy the **Secret API key** (starts with `sk_`)
3. Set as `REVENUECAT_SECRET_KEY` in Firebase

### 4.3 User ID Mapping
We use Firebase UID as RevenueCat `app_user_id`. Ensure your client sends the same ID when identifying users in RevenueCat.

## 5. API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `createJob` | POST | Bearer token | Create job, get presigned upload URL |
| `startJob` | POST | Bearer token | Start Replicate processing |
| `getJobStatus` | GET | Bearer token | Get job status + download URL if completed |
| `getDownloadUrl` | POST | Bearer token | Get signed download URL |
| `replicateWebhook` | POST | Webhook secret | Replicate completion callback |

### Request Examples

**Create Job:**
```bash
curl -X POST https://us-central1-PROJECT.cloudfunctions.net/createJob \
  -H "Authorization: Bearer FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"danceStyle": "hip-hop"}'
# Response: { jobId, uploadUrl, expiresAt, inputPath }
```

**Upload Image** (PUT to `uploadUrl`):
```bash
curl -X PUT "SIGNED_UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @pet.jpg
```

**Start Job:**
```bash
curl -X POST https://us-central1-PROJECT.cloudfunctions.net/startJob \
  -H "Authorization: Bearer FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "JOB_ID"}'
```

## 6. Firestore Collections

### users/{userId}
```json
{
  "email": "user@example.com",
  "createdAt": "timestamp",
  "subscriptionStatus": "active|trial|none",
  "revenuecatUserId": "firebase-uid"
}
```

### jobs/{jobId}
```json
{
  "userId": "firebase-uid",
  "inputImagePath": "uploads/userId/jobId/original.jpg",
  "outputVideoPath": "outputs/userId/jobId/dance.mp4",
  "status": "pending|processing|completed|failed",
  "danceStyle": "hip-hop",
  "replicateJobId": "replicate-prediction-id",
  "createdAt": "timestamp",
  "completedAt": "timestamp",
  "errorMessage": "optional error string"
}
```

## 7. Storage Structure

```
/uploads/{userId}/{jobId}/original.jpg   # User uploads here (presigned URL)
/outputs/{userId}/{jobId}/dance.mp4      # Cloud Function writes here
```

## 8. Rate Limits

- **Free users**: 2 jobs per day
- **Subscribed users**: Unlimited
- **Image**: Max 10MB, types: JPG, PNG, WEBP

## 9. Troubleshooting

### "Image not found" after createJob
- Ensure the frontend uploads to the presigned URL **before** calling startJob
- Use PUT method with the image as body
- Content-Type should match (image/jpeg for .jpg)

### Webhook not firing
- Check Replicate dashboard for prediction status
- Verify webhook URL is correct (HTTPS)
- Cloud Functions must be deployed and publicly callable

### "No video URL in Replicate output"
- Different models have different output schemas
- Check Replicate model docs for output format
- Update `replicateWebhook` output parsing if needed

### CORS errors
- Cloud Functions have `Access-Control-Allow-Origin: *` set
- Ensure request includes `Authorization` header
- Check browser console for preflight (OPTIONS) issues

## 10. Local Emulator (Optional)

```bash
firebase emulators:start --only functions,firestore
```

Note: Replicate webhook will need a public URL (e.g. ngrok) to receive callbacks during local dev.
