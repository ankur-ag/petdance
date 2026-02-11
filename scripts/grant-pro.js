#!/usr/bin/env node
/**
 * One-time script to grant a user unlimited credits (pro access).
 * Usage: node scripts/grant-pro.js <userId>
 *
 * Get your userId: Firebase Console → Authentication → Users, or log it from the app.
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or run: gcloud auth application-default login
 */

const admin = require('firebase-admin');
const path = require('path');

const projectId = 'petdance-da752';
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node scripts/grant-pro.js <userId>');
  console.error('Get userId from Firebase Console → Authentication → Users');
  process.exit(1);
}

async function main() {
  if (!admin.apps.length) {
    try {
      const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
      const fs = require('fs');
      if (fs.existsSync(keyPath)) {
        const serviceAccount = require(keyPath);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      } else {
        admin.initializeApp({ projectId });
      }
    } catch (e) {
      admin.initializeApp({ projectId });
    }
  }

  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);

  const snap = await userRef.get();
  if (!snap.exists) {
    await userRef.set({
      email: '',
      subscriptionStatus: 'active',
      revenuecatUserId: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      grantedProAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('Created user', userId, 'with pro access');
  } else {
    await userRef.update({
      subscriptionStatus: 'active',
      grantedProAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('Updated user', userId, 'to pro (unlimited credits)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
