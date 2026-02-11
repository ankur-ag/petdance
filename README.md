# PetDance - AI Pet Dancing Video Maker

A mobile-friendly web application that transforms pet photos into fun dancing videos using AI.

## Features

- 📸 **Easy Upload**: Drag & drop or click to upload pet photos
- 💃 **Dance Styles**: Choose from 6+ trending dance styles
- ⚡ **AI Generation**: Replicate API for dancing video creation
- 📱 **Mobile-First**: Optimized for iOS/Android with webview support
- 🎨 **Themeable**: Centralized CSS variables for easy customization
- 💰 **Subscription Plans**: Free, Pro, and Premium tiers (interface only)
- 🔐 **Authentication**: Google Sign-In + Email/Password via Firebase

## Project Structure

```
petdance/
├── index.html              # Landing page
├── app.html                # Video creation interface
├── css/
│   ├── theme.css           # Centralized theme variables
│   ├── styles.css          # Landing page styles
│   └── app.css             # App-specific styles
├── functions/              # Cloud Functions (createJob, startJob, webhook, etc.)
├── js/
│   ├── firebase-config.js  # Firebase configuration
│   ├── auth.js             # Authentication logic
│   ├── api.js              # Cloud Functions API client
│   ├── main.js             # Global functionality
│   └── app.js              # App workflow logic
├── firestore.rules         # Firestore security rules
├── storage.rules           # Storage security rules
├── FIREBASE_SETUP.md       # Auth setup guide
└── BACKEND_SETUP.md        # Full backend setup guide
```

## Technology Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Authentication**: Firebase Authentication (Google OAuth + Email/Password)
- **Design**: Mobile-first, responsive design
- **iOS Support**: Optimized for webview integration
- **Theme System**: CSS custom properties (variables)

## Getting Started

### Prerequisites

1. **Firebase Account**: Create a free account at [Firebase Console](https://console.firebase.google.com/)
2. **Firebase Configuration**: Follow [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for authentication
3. **Backend**: Follow [BACKEND_SETUP.md](BACKEND_SETUP.md) for Replicate + RevenueCat + deploy

### Quick Start

1. Clone or download this repository
2. Set up Firebase (see [FIREBASE_SETUP.md](FIREBASE_SETUP.md))
3. Update `js/firebase-config.js` with your Firebase credentials
4. Open `index.html` in a web browser or start a local server
5. No build process required - pure HTML/CSS/JS

### Running a Local Server

```bash
npm install
npm run dev
```

This starts a local server and opens http://localhost:8000 in your browser. Use `npm start` to run without auto-opening.

### For iOS Webview Integration

The website is optimized for iOS webview with:
- `viewport` meta tags for proper scaling
- `apple-mobile-web-app-capable` for fullscreen mode
- Touch-friendly UI elements (44px minimum tap targets)
- Smooth scrolling and animations
- Fixed viewport height handling

## Customization

### Changing the Theme

All theme variables are centralized in `css/theme.css`. Modify these to change the entire site appearance:

```css
:root {
    /* Primary Brand Colors */
    --color-primary: #6366f1;
    --color-secondary: #ec4899;
    
    /* Typography */
    --font-size-base: 1rem;
    
    /* Spacing */
    --spacing-md: 1rem;
    
    /* ... and more */
}
```

### Key Color Variables

- `--color-primary`: Main brand color (buttons, accents)
- `--color-secondary`: Secondary brand color
- `--color-background`: Page background
- `--color-text-primary`: Main text color

### Responsive Breakpoints

- Desktop: > 768px
- Tablet: 481px - 768px
- Mobile: ≤ 480px

## Features to Implement

This is a UI/UX prototype. To make it fully functional, you'll need to add:

### Required Integrations

1. **AI Video Generation**
   - Integrate with AI model API (Hailuo, Kling, or LivePortrait)
   - Handle video processing queue
   - Store generated videos

2. **✅ Authentication** (IMPLEMENTED)
   - ✅ Google Sign-In
   - ✅ Email/Password authentication
   - ✅ Session management
   - ⏳ Additional providers (Apple, Facebook)

3. **Payment Processing**
   - Stripe or similar payment gateway
   - Subscription management
   - Usage tracking

4. **Backend API**
   - User management
   - Video storage (S3, CloudFlare, etc.)
   - Analytics

5. **Database**
   - User profiles
   - Video history
   - Subscription status

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Safari (iOS 12+)
- ✅ Firefox (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Minimal dependencies (no frameworks)
- Fast initial load
- Optimized for mobile networks
- Progressive enhancement

## Future Enhancements

- [ ] Video preview before download
- [ ] Social media direct sharing
- [ ] Custom dance upload
- [ ] Multi-pet support in one video
- [ ] Video editing features
- [ ] Background music selection
- [ ] Watermark customization
- [ ] HD/4K export options

## License

This is a prototype/template project. Customize as needed for your use case.

## Contributing

This is a template project. Feel free to fork and modify for your needs.

## Notes

- All AI generation is currently mocked with progress animations
- Payment integration shows UI only
- Actual video processing requires backend implementation
- Mobile gestures and interactions are optimized for touch devices
