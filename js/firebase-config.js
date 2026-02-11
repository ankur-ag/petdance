// Firebase Configuration
// Replace these values with your actual Firebase project credentials
// Get them from: https://console.firebase.google.com/

const firebaseConfig = {
    apiKey: "AIzaSyBVBhQjVKDD5d-9vwFZfABmGwoXglv--Xk",
    authDomain: "petdance-da752.firebaseapp.com",
    projectId: "petdance-da752",
    storageBucket: "petdance-da752.firebasestorage.app",
    messagingSenderId: "447264049130",
    appId: "1:447264049130:web:80bfd8ff758adfa28b1493",
    measurementId: "G-98TGW3K6SB"
  };
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Cloud Functions base URL (uses same project)
const FUNCTIONS_BASE = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

// Configure Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

// RevenueCat - Web Billing Public API Key from RevenueCat dashboard (Apps → Web Billing → Public API Key)
// Leave empty to disable client-side paywall - backend still validates with REVENUECAT_SECRET_KEY
window.REVENUECAT_PUBLIC_API_KEY = 'test_hOHHLtgpRSrkvaqeiWUWnMTxPxt'; // e.g. 'pb_xxxxxxxxxxxxxxxxxxxxxxxx'

// Export for use in other files
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseStorage = storage;
window.firebaseConfig = firebaseConfig;
window.FUNCTIONS_BASE = FUNCTIONS_BASE;
window.googleProvider = googleProvider;
