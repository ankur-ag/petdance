# Firebase Setup Guide

Follow these steps to set up Google Authentication for your PetDance app.

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or select an existing project
3. Enter your project name (e.g., "PetDance")
4. Follow the setup wizard (you can disable Google Analytics if you don't need it)

## 2. Enable Google Authentication

1. In your Firebase project, go to **"Authentication"** in the left sidebar
2. Click on the **"Sign-in method"** tab
3. Click on **"Google"** in the providers list
4. Toggle the **"Enable"** switch
5. Enter a project support email
6. Click **"Save"**

## 3. Register Your Web App

1. In your Firebase project overview, click the **Web icon** (`</>`)
2. Register your app with a nickname (e.g., "PetDance Web")
3. Check **"Also set up Firebase Hosting"** (optional)
4. Click **"Register app"**

## 4. Get Your Firebase Configuration

After registering, you'll see your Firebase configuration object. It looks like this:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456"
};
```

## 5. Update Your Configuration File

1. Open `js/firebase-config.js` in your project
2. Replace the placeholder values with your actual Firebase configuration:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "YOUR_ACTUAL_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_ACTUAL_PROJECT_ID",
    storageBucket: "YOUR_ACTUAL_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_ACTUAL_MESSAGING_SENDER_ID",
    appId: "YOUR_ACTUAL_APP_ID"
};
```

## 6. Configure Authorized Domains

1. In Firebase Console, go to **Authentication > Settings**
2. Scroll to **"Authorized domains"**
3. Add your domains:
   - `localhost` (already added by default for testing)
   - Your production domain (e.g., `petdance.com`)
   - Any other domains where you'll host the app

## 7. Test Your Authentication

1. Start a local server (see main README.md)
2. Open your app in a browser
3. Click **"Login"** or **"Create Videos"**
4. Try signing in with Google
5. You should see the Google sign-in popup

## 8. Optional: Enable Email/Password Authentication

If you want to support email/password sign-in (already implemented in the UI):

1. In Firebase Console, go to **Authentication > Sign-in method**
2. Click on **"Email/Password"**
3. Toggle **"Enable"**
4. Click **"Save"**

## Security Notes

### API Key Security
- The Firebase API key in `firebase-config.js` is **safe to expose** in client-side code
- Firebase uses domain restrictions, not API key secrecy, for security
- However, you should still set up proper security rules

### Firebase Security Rules

Set up security rules to protect your data:

1. Go to **Firestore Database > Rules** (if using Firestore)
2. Set appropriate read/write rules based on authentication

Example rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Troubleshooting

### "auth/operation-not-allowed"
- Make sure Google sign-in is enabled in Firebase Console
- Check that you've configured the provider correctly

### "auth/unauthorized-domain"
- Add your domain to authorized domains in Firebase Console
- For local testing, make sure `localhost` is authorized

### Popup Blocked
- Check if your browser is blocking popups
- Ensure you're testing on HTTPS or localhost

### "Firebase not defined"
- Make sure Firebase scripts are loaded before `firebase-config.js`
- Check the browser console for script loading errors

## Cost Information

Firebase Authentication is **free** for:
- Unlimited authentication operations
- Email/password, Google, and other providers
- Multi-factor authentication

You only pay if you use:
- SMS authentication (charged per SMS)
- Phone authentication in some regions

## Next Steps

After setting up authentication, you might want to:

1. **Set up Firestore** to store user data and video history
2. **Add Firebase Storage** to store uploaded pet photos
3. **Implement Firebase Cloud Functions** for AI model integration
4. **Add Analytics** to track user behavior
5. **Set up Firebase Hosting** for easy deployment

## Resources

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Pricing](https://firebase.google.com/pricing)
- [Security Rules Guide](https://firebase.google.com/docs/rules)
