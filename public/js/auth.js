// Authentication Module
// Handles all Firebase authentication logic

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.auth = window.firebaseAuth;
        this.googleProvider = window.googleProvider;
        this.initAuthStateListener();
    }

    // Initialize authentication state listener
    initAuthStateListener() {
        this.auth.onAuthStateChanged((user) => {
            this.currentUser = user;
            this.handleAuthStateChange(user);
        });
    }

    // Handle authentication state changes
    handleAuthStateChange(user) {
        if (user) {
            // User is signed in
            console.log('User signed in:', user.displayName);
            this.onUserSignedIn(user);
        } else {
            // User is signed out
            console.log('User signed out');
            this.onUserSignedOut();
        }
    }

    // Sign in with Google
    async signInWithGoogle() {
        try {
            // Show loading state
            this.setLoadingState(true);

            const result = await this.auth.signInWithPopup(this.googleProvider);
            const user = result.user;
            
            console.log('Google sign-in successful:', user.displayName);
            
            // Track sign-in event (optional)
            this.trackEvent('google_sign_in', {
                user_id: user.uid,
                method: 'google'
            });

            return user;
        } catch (error) {
            console.error('Google sign-in error:', error);
            this.handleAuthError(error);
            throw error;
        } finally {
            this.setLoadingState(false);
        }
    }

    // Sign in with email/password
    async signInWithEmail(email, password) {
        try {
            this.setLoadingState(true);
            const result = await this.auth.signInWithEmailAndPassword(email, password);
            console.log('Email sign-in successful:', result.user.email);
            return result.user;
        } catch (error) {
            console.error('Email sign-in error:', error);
            this.handleAuthError(error);
            throw error;
        } finally {
            this.setLoadingState(false);
        }
    }

    // Create account with email/password
    async createAccountWithEmail(email, password) {
        try {
            this.setLoadingState(true);
            const result = await this.auth.createUserWithEmailAndPassword(email, password);
            console.log('Account created successfully:', result.user.email);
            return result.user;
        } catch (error) {
            console.error('Account creation error:', error);
            this.handleAuthError(error);
            throw error;
        } finally {
            this.setLoadingState(false);
        }
    }

    // Send password reset email
    async sendPasswordResetEmail(email) {
        try {
            await this.auth.sendPasswordResetEmail(email);
            this.showMessage('Password reset email sent! Check your inbox.', 'success');
        } catch (error) {
            console.error('Password reset error:', error);
            this.handleAuthError(error);
            throw error;
        }
    }

    // Sign out
    async signOut() {
        try {
            await this.auth.signOut();
            console.log('User signed out successfully');
            
            // Redirect to home page
            if (window.location.pathname.includes('app.html')) {
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Sign-out error:', error);
            this.handleAuthError(error);
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.currentUser !== null;
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Get user display name
    getUserDisplayName() {
        if (!this.currentUser) return 'Guest';
        return this.currentUser.displayName || this.currentUser.email || 'User';
    }

    // Get user email
    getUserEmail() {
        if (!this.currentUser) return '';
        return this.currentUser.email || '';
    }

    // Get user photo URL
    getUserPhotoURL() {
        if (!this.currentUser) return null;
        return this.currentUser.photoURL;
    }

    // Get user ID
    getUserId() {
        if (!this.currentUser) return null;
        return this.currentUser.uid;
    }

    // Called when user signs in
    onUserSignedIn(user) {
        // Update UI elements
        this.updateAuthUI(true, user);

        // Store user data in localStorage for offline access
        localStorage.setItem('user_email', user.email || '');
        localStorage.setItem('user_name', user.displayName || '');
        localStorage.setItem('user_photo', user.photoURL || '');
    }

    // Called when user signs out
    onUserSignedOut() {
        // Update UI elements
        this.updateAuthUI(false);

        // Clear localStorage
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_photo');
    }

    // Update UI based on authentication state
    updateAuthUI(isAuthenticated, user = null) {
        // Update profile name
        const profileNameElements = document.querySelectorAll('.profile-name');
        profileNameElements.forEach(el => {
            el.textContent = isAuthenticated ? (user.displayName || user.email) : 'Guest';
        });

        // Update profile email
        const profileEmailElements = document.querySelectorAll('.profile-email');
        profileEmailElements.forEach(el => {
            el.textContent = isAuthenticated ? (user.email || '') : '';
        });

        // Update profile avatar
        const profileAvatarElements = document.querySelectorAll('.profile-avatar');
        profileAvatarElements.forEach(el => {
            if (isAuthenticated && user.photoURL) {
                el.innerHTML = `<img src="${user.photoURL}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            } else {
                el.innerHTML = '👤';
            }
        });

        // Update nav buttons
        const loginButtons = document.querySelectorAll('.btn-login');
        const profileButtons = document.querySelectorAll('.btn-profile');
        
        loginButtons.forEach(btn => {
            btn.style.display = isAuthenticated ? 'none' : 'inline-flex';
        });
        
        profileButtons.forEach(btn => {
            btn.style.display = isAuthenticated ? 'inline-flex' : 'none';
        });
    }

    // Handle authentication errors
    handleAuthError(error) {
        let message = 'An error occurred. Please try again.';

        switch (error.code) {
            case 'auth/popup-closed-by-user':
                message = 'Sign-in cancelled. Please try again.';
                break;
            case 'auth/user-not-found':
                message = 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                message = 'Incorrect password. Please try again.';
                break;
            case 'auth/email-already-in-use':
                message = 'An account with this email already exists.';
                break;
            case 'auth/weak-password':
                message = 'Password should be at least 6 characters.';
                break;
            case 'auth/invalid-email':
                message = 'Invalid email address.';
                break;
            case 'auth/network-request-failed':
                message = 'Network error. Please check your connection.';
                break;
            case 'auth/too-many-requests':
                message = 'Too many attempts. Please try again later.';
                break;
            default:
                message = error.message || message;
        }

        this.showMessage(message, 'error');
    }

    // Show message to user
    showMessage(message, type = 'info') {
        // You can customize this to use a toast/notification library
        alert(message);
    }

    // Set loading state
    setLoadingState(isLoading) {
        const buttons = document.querySelectorAll('.btn-auth');
        buttons.forEach(btn => {
            btn.disabled = isLoading;
            if (isLoading) {
                btn.dataset.originalText = btn.textContent;
                btn.textContent = 'Loading...';
            } else if (btn.dataset.originalText) {
                btn.textContent = btn.dataset.originalText;
            }
        });
    }

    // Track analytics event (optional - implement if you use analytics)
    trackEvent(eventName, params = {}) {
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, params);
        }
        console.log('Track event:', eventName, params);
    }

    // Require authentication (redirect if not authenticated)
    requireAuth(redirectUrl = 'index.html') {
        if (!this.isAuthenticated()) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    }
}

// Initialize auth manager
let authManager;
document.addEventListener('DOMContentLoaded', () => {
    authManager = new AuthManager();
    window.authManager = authManager;
});
