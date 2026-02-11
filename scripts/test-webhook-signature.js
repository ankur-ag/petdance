#!/usr/bin/env node
/**
 * Test webhook signature verification without calling Replicate.
 * Sends a properly signed fake webhook to verify the signature logic works.
 *
 * Usage:
 *   node scripts/test-webhook-signature.js [URL]
 *
 * URL defaults to local emulator. Examples:
 *   node scripts/test-webhook-signature.js
 *   node scripts/test-webhook-signature.js http://localhost:5001/petdance-da752/us-central1/replicateWebhook
 *   node scripts/test-webhook-signature.js https://us-central1-petdance-da752.cloudfunctions.net/replicateWebhook
 *
 * Requires: REPLICATE_WEBHOOK_SECRET in functions/.env
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Load .env from functions/
function loadEnv() {
  const envPath = path.join(__dirname, '../functions/.env');
  if (!fs.existsSync(envPath)) {
    console.error('Missing functions/.env - copy from .env.example and set REPLICATE_WEBHOOK_SECRET');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function signWebhook(body, webhookId, timestamp, secret) {
  const secretBase64 = secret.replace('whsec_', '');
  const secretBytes = Buffer.from(secretBase64, 'base64');
  const signedContent = `${webhookId}.${timestamp}.${body}`;
  return crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
}

async function sendWebhook(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    };
    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const env = loadEnv();
  const secret = env.REPLICATE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('REPLICATE_WEBHOOK_SECRET not set or invalid (must start with whsec_)');
    process.exit(1);
  }

  const baseUrl =
    process.argv[2] || 'http://localhost:5001/petdance-da752/us-central1/replicateWebhook';

  const webhookId = 'msg_test_' + Date.now();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = {
    id: 'test-fake-' + Date.now(),
    status: 'succeeded',
    output: 'https://replicate.delivery/fake.mp4',
  };
  const body = JSON.stringify(payload);
  const signature = signWebhook(body, webhookId, timestamp, secret);

  const headers = {
    'webhook-id': webhookId,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`,
  };

  // Self-check: verify our signature locally before sending
  const { verifyWebhookSignature } = require('../functions/helpers/replicate');
  const isValidLocal = verifyWebhookSignature(body, webhookId, timestamp, headers['webhook-signature'], secret);
  if (!isValidLocal) {
    console.error('Self-check FAILED: verifyWebhookSignature returned false with our own signature.');
    console.error('This suggests a bug in sign logic, verify logic, or secret handling.');
    process.exit(1);
  }
  console.log('Self-check OK: signature verifies locally.');

  console.log('Sending test webhook to:', baseUrl);
  console.log('Payload:', body);

  try {
    const { status, body: resBody } = await sendWebhook(baseUrl, body, headers);
    if (status === 200) {
      console.log('\n✓ Success (200). Signature verification passed.');
      console.log('  (No job found for fake id - expected, we only tested signature)');
    } else if (status === 401) {
      console.error('\n✗ 401 Invalid signature - verification failed.');
      console.error('  Response:', resBody);
      process.exit(1);
    } else {
      console.log('\nStatus:', status);
      console.log('Response:', resBody);
    }
  } catch (err) {
    console.error('Request failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('  Is the emulator running? firebase emulators:start --only functions');
    }
    process.exit(1);
  }
}

main();
