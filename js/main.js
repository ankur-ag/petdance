// Main JavaScript file for PetDance
// Handles global functionality and navigation

// Smooth scroll to sections
function scrollToExamples() {
    const examplesSection = document.getElementById('examples');
    if (examplesSection) {
        examplesSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// Show subscription modal
function showSubscription() {
    const modal = document.getElementById('subscription-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// Close subscription modal
function closeSubscription() {
    const modal = document.getElementById('subscription-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Show profile modal
function showProfile() {
    const modal = document.getElementById('profile-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// Close profile modal
function closeProfile() {
    const modal = document.getElementById('profile-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Select plan (mock function)
function selectPlan(planType) {
    alert(`Plan selection: ${planType}\n\nThis would redirect to payment processing.\n(Payment integration to be implemented)`);
    closeSubscription();
}

// Logout function
async function logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    closeProfile();
    try {
        if (window.authManager) {
            await window.authManager.signOut();
        } else if (window.firebaseAuth) {
            await window.firebaseAuth.signOut();
            if (window.location.pathname.includes('app.html')) {
                window.location.href = 'index.html';
            }
        } else {
            console.warn('Auth not available');
        }
    } catch (e) {
        console.error('Logout failed:', e);
        alert('Logout failed. Please try again.');
    }
}

// Handle Google Sign In
async function handleGoogleSignIn() {
    try {
        if (window.authManager) {
            await window.authManager.signInWithGoogle();
            closeLoginModal();
            closeSignUpModal();
            
            // Redirect to app if on landing page
            if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                window.location.href = 'app.html';
            }
        }
    } catch (error) {
        console.error('Google sign-in failed:', error);
    }
}

// Handle Email Sign In
async function handleEmailSignIn(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        if (window.authManager) {
            await window.authManager.signInWithEmail(email, password);
            closeLoginModal();
            
            // Redirect to app
            window.location.href = 'app.html';
        }
    } catch (error) {
        console.error('Email sign-in failed:', error);
    }
}

// Handle Email Sign Up
async function handleEmailSignUp(event) {
    event.preventDefault();
    
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    try {
        if (window.authManager) {
            await window.authManager.createAccountWithEmail(email, password);
            closeSignUpModal();
            
            // Redirect to app
            window.location.href = 'app.html';
        }
    } catch (error) {
        console.error('Sign-up failed:', error);
    }
}

// Show/Hide Login Modal
function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Show/Hide Sign Up Modal
function showSignUpModal() {
    closeLoginModal();
    const modal = document.getElementById('signup-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeSignUpModal() {
    const modal = document.getElementById('signup-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Handle Create Videos button click
function handleCreateVideos() {
    if (window.authManager && window.authManager.isAuthenticated()) {
        window.location.href = 'app.html';
    } else {
        showLoginModal();
    }
}

// Close modals on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSubscription();
        closeProfile();
        closeLoginModal();
        closeSignUpModal();
    }
});

// Prevent body scroll when modal is open
document.addEventListener('DOMContentLoaded', () => {
    // Add touch event handling for better iOS support
    let touchStartY = 0;
    
    document.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        const modal = document.querySelector('.modal.active');
        if (modal) {
            const modalContent = modal.querySelector('.modal-content');
            const touchY = e.touches[0].clientY;
            const isScrollingUp = touchY < touchStartY;
            const isScrollingDown = touchY > touchStartY;
            
            // Prevent overscroll
            if (
                (isScrollingUp && modalContent.scrollTop === 0) ||
                (isScrollingDown && modalContent.scrollHeight - modalContent.scrollTop === modalContent.clientHeight)
            ) {
                if (e.cancelable) {
                    e.preventDefault();
                }
            }
        }
    }, { passive: false });
});

// Add viewport height fix for mobile browsers
function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', setViewportHeight);
setViewportHeight();
