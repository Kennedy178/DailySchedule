import { supabase, signUp, signIn, signOut, getSession, resetPassword } from './auth.js';
import { showToast, renderTasks, showLoading, loadTasks, clearProfileCache, preloadProfileCache } from './app.js';
import { getAllTasks, updateTask, setSetting, getSetting, deleteTasksByUserId } from './db.js';
import { retrySyncTasks, cleanupRealtimeSubscriptions } from './sync.js';
import { initFCMManager, registerFCMToken, unregisterFCMToken, handleSettingsChange } from './fcm-manager.js';
import { initOfflineQueue, processAllQueuedOperations } from './offline-queue.js';


/* Initialize global auth variables */
let user = null;
let access_token = null;
let isSignUp = false;
let isGuest = false;
let hasSelectedMode = null;

/* Initialize auth and UI */
// Update initAuth function to include offline queue initialization
async function initAuth() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        // Restore state from storage
        user = session?.user || null;
        access_token = session?.access_token || null;
        hasSelectedMode = await getSetting('hasSelectedMode') || null;

        // Ensure authenticated mode is valid
        if (hasSelectedMode === 'authenticated' && !isAuthenticated()) {
            hasSelectedMode = null;
            await setSetting('hasSelectedMode', null);
        }

        // Restore guest flag immediately if stored
        if (hasSelectedMode === 'guest') {
            isGuest = true;
            console.log("Guest restored from hasSelectedMode");
        }

        // Initialize offline queue system early
        try {
            await initOfflineQueue();
            console.log('Offline queue initialized successfully');
        } catch (queueError) {
            console.error('Failed to initialize offline queue:', queueError);
            // Continue initialization even if offline queue fails
        }

        // Load tasks according to mode
        if (hasSelectedMode === 'guest') {
            await loadTasks('guest');
        } else if (hasSelectedMode === 'authenticated' && navigator.onLine) {
            await loadTasks('authenticated');
        } else if (hasSelectedMode === 'authenticated' && !navigator.onLine) {
            await loadTasks('authenticated'); // cached only
            console.log('Offline: Using cached tasks for authenticated user');
        }

        // Auth state change listener
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Auth event:", event);

            user = session?.user || null;
            access_token = session?.access_token || null;

            if (event === 'SIGNED_IN' && !window.location.pathname.includes('reset-password.html')) {
                // Authenticated login
                isGuest = false;
                hasSelectedMode = 'authenticated';
                await setSetting('hasSelectedMode', 'authenticated');
                await deleteTasksByUserId(null); // Delete guest tasks
                await loadTasks('authenticated');
                retrySyncTasks(); // Start retry listener

                //--- Register FCM token for authenticated user----
               
                // With:
                try {
                    const token = await registerFCMToken();
                    if (token) {
                        console.log('FCM: Successfully registered');
                    } else {
                        console.log('FCM: Registration skipped (browser limitations)');
                    }
                } catch (error) {
                    console.log('FCM: Failed gracefully, app continues normally');
                }
                try {
        await preloadProfileCache();
    } catch (error) {
        console.error('Failed to preload profile cache:', error);
    }
                //--- Process any queued operations now that we're authenticated---
                if (navigator.onLine) {
                    setTimeout(() => processAllQueuedOperations(), 2000); // Small delay for auth to settle
                }

            } else if (event === 'SIGNED_OUT') {
                //--- Unregister FCM token before logout----
                await unregisterFCMToken();
                clearProfileCache();
                
                // If mode was guest, keep guest
                if (hasSelectedMode === 'guest') {
                    isGuest = true;
                } else {
                    isGuest = false;
                    hasSelectedMode = null;
                    await setSetting('hasSelectedMode', null);
                }
            } else if (event === 'INITIAL_SESSION') {
                // Refresh handling
                if (hasSelectedMode === 'guest') {
                    isGuest = true;
                } else {
                    isGuest = false;
                }
                
                // Process queued operations if authenticated and online
                if (isAuthenticated() && navigator.onLine) {
                    setTimeout(() => processAllQueuedOperations(), 1000);
                }
            }

            updateUI();
        });

        // Initial UI render
        updateUI();
        setupEventListeners();

        // Setup online/offline event listeners for queue processing
        window.addEventListener('online', () => {
            console.log('Network online - processing queued operations');
            if (isAuthenticated()) {
                setTimeout(() => processAllQueuedOperations(), 1000);
            }
        });

        window.addEventListener('offline', () => {
            console.log('Network offline - operations will be queued');
        });

    } catch (error) {
        console.error('Init auth error:', error);
        showToast('Error initializing session', 'error');
    }
}


/* Update UI based on auth state using class toggling */
function updateUI() {
    const authSection = document.getElementById('authSection');
    const appContent = document.querySelector('.container');
    const myAccount = document.getElementById('myAccount');

    // Toggle auth/task UI
    if (hasSelectedMode === 'authenticated' || hasSelectedMode === 'guest') {
        authSection.classList.add('hidden');
        appContent.classList.remove('hidden');
    } else {
        authSection.classList.remove('hidden');
        appContent.classList.add('hidden');
    }

    // Update My Account dropdown
    updateMyAccount();
}

/* Update My Account dropdown */
function updateMyAccount() {
    const accountEmail = document.getElementById('accountEmail');
    const accountType = document.getElementById('accountType');
    const logoutBtn = document.getElementById('logoutBtn');

    if (hasSelectedMode === 'authenticated' && user) {
        accountEmail.textContent = `Logged in as: ${user.email}`;
        accountType.textContent = 'Account Type: Registered';
        logoutBtn.style.display = 'block';
    } 
    else if (hasSelectedMode === 'guest') {
        accountEmail.textContent = 'Logged in as: Guest';
        accountType.textContent = 'Account Type: Guest';
        logoutBtn.style.display = 'block';
    } 
    else {
        accountEmail.textContent = 'Not logged in';
        accountType.textContent = 'Account Type: None';
        logoutBtn.style.display = 'none';
    }
}


function setupEventListeners() {
    // Get all DOM elements
    const authForm = document.getElementById('authForm');
    const authToggle = document.getElementById('authToggle');
    const forgotPassword = document.getElementById('forgotPassword');
    const guestBtn = document.getElementById('guestBtn');
    const myAccountBtn = document.getElementById('myAccountBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const myAccount = document.getElementById('myAccount');
    const logoutModal = document.getElementById('logoutConfirmModal');
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');
    const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');

    // 1. Auth Form Submission
    authForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const authError = document.getElementById('authError');

        authError.textContent = '';
        authError.classList.remove('visible');

        try {
            showLoading(true);

            const { data, error } = isSignUp 
                ? await signUp(email, password)
                : await signIn(email, password);

            if (error) throw error;

            if (isSignUp) {
                showToast('Account created! Please verify your email.');
            } else if (data?.user) {
                user = data.user;
                access_token = data.session?.access_token;
                showToast('Welcome back! Redirecting...');
                hasSelectedMode = 'authenticated';
                await setSetting('hasSelectedMode', 'authenticated');
                await loadTasks('authenticated');
                updateUI();
            }
        } catch (error) {
            let message = error.message || 'Authentication failed';

            if (message.includes('Invalid')) {
                message = 'Incorrect email or password';
            } else if (message.includes('confirmed')) {
                message = 'Please verify your email first';
            }

            authError.textContent = message;
            authError.classList.add('visible');
            showToast(message, 'error');
        } finally {
            showLoading(false);
        }
    });

    // 2. Toggle Sign-Up/Sign-In
    authToggle?.addEventListener('click', (e) => {
        e.preventDefault();
        isSignUp = !isSignUp;
        const authBtn = document.getElementById('authBtn');
        authBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
        authToggle.innerHTML = isSignUp 
            ? 'Already have an account? <a href="#">Sign In</a>' 
            : 'No account? <a href="#">Sign Up</a>';
    });

    // 3. Forgot Password
    forgotPassword?.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!email) {
            showToast('Please enter your email address', 'error');
            return;
        }
        
        if (!emailRegex.test(email)) {
            showToast('Please enter a valid email address', 'error');
            return;
        }

        try {
            showLoading(true);
            
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'http://localhost:5500/reset-password.html'
            });
            
            if (error) throw error;
            
            showToast(
                'If an account exists with this email, you will receive a password reset link shortly. ' +
                'Please check your inbox and spam folder.', 
                'success'
            );
            
            document.getElementById('email').value = '';
            
        } catch (error) {
            console.error('Password reset error:', error);
            
            let errorMessage = 'Failed to send reset email. Please try again.';
            if (error.message.includes('rate limit')) {
                errorMessage = 'Too many requests. Please wait before trying again.';
            } else if (error.message.includes('disabled')) {
                errorMessage = 'Password reset is temporarily unavailable.';
            }
            
            showToast(errorMessage, 'error');
        } finally {
            showLoading(false);
        }
    });

    // 4. Guest Mode
    guestBtn?.addEventListener('click', async () => {
        isGuest = true;
        user = null;
        access_token = null;
        hasSelectedMode = 'guest';
        await setSetting('hasSelectedMode', 'guest');
        await loadTasks('guest');
        updateUI();
        showToast('Continuing as guest. Tasks saved locally.');
        // Note: No FCM registration for guests - they use local notifications
    });

    // 5. My Account Dropdown
    myAccountBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        myAccount.classList.toggle('hidden');
        myAccount.style.display = myAccount.classList.contains('hidden') ? 'none' : 'block';
    });

    // 6. Close Dropdown When Clicking Outside
    document.addEventListener('click', () => {
        if (!myAccount.classList.contains('hidden')) {
            myAccount.classList.add('hidden');
            myAccount.style.display = 'none';
        }
    });

        // 7. Toggle Password Visibility
    window.togglePasswordVisibility = function() {
        const passwordInput = document.getElementById('password');
        const toggleButton = document.getElementById('togglePassword');
        const icon = toggleButton?.querySelector('.material-icons');
        
        if (passwordInput && icon) {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            icon.textContent = isPassword ? 'visibility_off' : 'visibility';
            passwordInput.focus();
        }
    }

    // 8. Logout Confirmation Flow
    logoutBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const logoutModal = document.getElementById('logoutConfirmModal');
        const authUserContent = document.getElementById('authUserLogout');
        const guestContent = document.getElementById('guestLogoutPrompt');

        if (isGuest) {
            authUserContent.classList.add('hidden');
            guestContent.classList.remove('hidden');
        } else {
            authUserContent.classList.remove('hidden');
            guestContent.classList.add('hidden');
        }
        
        logoutModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });


    // New guest mode buttons
    document.getElementById('goToSignupBtn')?.addEventListener('click', async () => {
        document.getElementById('logoutConfirmModal').classList.remove('active');
        document.body.style.overflow = '';
        
        isSignUp = true;
        document.getElementById('authBtn').textContent = 'Sign Up';
        document.getElementById('authToggle').innerHTML = 
            'Already have an account? <a href="#">Sign In</a>';
        
        document.getElementById('authSection').classList.remove('hidden');
        document.querySelector('.container').classList.add('hidden');
        hasSelectedMode = null;
        await setSetting('hasSelectedMode', null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('goToLoginLink')?.addEventListener('click', async (e) => {
        e.preventDefault();
        document.getElementById('logoutConfirmModal').classList.remove('active');
        document.body.style.overflow = '';
        
        isSignUp = false;
        document.getElementById('authBtn').textContent = 'Sign In';
        document.getElementById('authToggle').innerHTML = 
            'No account? <a href="#">Sign Up</a>';
        
        document.getElementById('authSection').classList.remove('hidden');
        document.querySelector('.container').classList.add('hidden');
        hasSelectedMode = null;
        await setSetting('hasSelectedMode', null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

// Keep existing modal handlers
confirmLogoutBtn?.addEventListener('click', async () => {
    console.log('🔄 Logout button clicked - starting logout process');
    
    // 1. CLOSE MODAL IMMEDIATELY - Give instant feedback
    document.getElementById('logoutConfirmModal').classList.remove('active');
    document.body.style.overflow = '';
    showToast('Signing out...', 'info');
    
    try {
        console.log('🔄 Step 1: Starting signOut process');
        
        // 2. FAST LOCAL CLEANUP (await these - should be quick)
        console.log('🔄 Step 2: Cleaning up local data');
        user = null;
        isGuest = false;
        access_token = null;
        hasSelectedMode = null;
        
        // Local storage cleanup
        await setSetting('hasSelectedMode', null);
        await setSetting('hasMigratedTasks', null);
        
        // Clear cache immediately
        clearProfileCache();
        console.log('✅ Local cleanup completed');
        
        // 3. UPDATE UI IMMEDIATELY
        console.log('🔄 Step 3: Updating UI');
        updateUI();
        showToast('Signed out successfully!', 'success');
        console.log('✅ UI updated, user should see signed out state');
        
        // 4. BACKGROUND OPERATIONS (don't await - let them run async)
        console.log('🔄 Step 4: Starting background cleanup');
        
        // Background: Supabase signout
        if (user) {
            signOut().then(() => {
                console.log('✅ Supabase signOut completed');
            }).catch(error => {
                console.error('❌ Supabase signOut failed (non-critical):', error);
                // Don't show error to user since they're already logged out locally
            });
        } else {
            console.log('ℹ️ No user to sign out from Supabase');
        }
        
        // Background: Cleanup subscriptions
        Promise.resolve().then(() => {
            try {
                cleanupRealtimeSubscriptions();
                console.log('✅ Realtime subscriptions cleaned up');
            } catch (error) {
                console.error('❌ Subscription cleanup failed (non-critical):', error);
            }
        });
        
        console.log('🎉 Logout process completed successfully');
        
    } catch (error) {
        console.error('❌ Critical logout error:', error);
        showToast('Logout completed with some errors', 'warning');
        
        // Even if there's an error, ensure user appears logged out
        user = null;
        isGuest = false;
        access_token = null;
        hasSelectedMode = null;
        updateUI();
    }
});
}

/* Create inline auth error element */
function createAuthError() {
    const authError = document.createElement('p');
    authError.id = 'authError';
    authError.className = 'auth-error';
    authError.style.display = 'none';
    document.querySelector('.auth-card').appendChild(authError);
    return authError;
}

/* Check if user is authenticated for backend requests */
function isAuthenticated() {
    return !!access_token;
}

/* Export functions for app.js */
export { initAuth, isAuthenticated, user, supabase, access_token };