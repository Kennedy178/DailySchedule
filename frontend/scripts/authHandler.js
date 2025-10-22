import { supabase, signUp, signIn, signOut, getSession, resetPassword } from './auth.js';
import { showToast, renderTasks, showLoading, loadTasks, clearProfileCache, preloadProfileCache } from './app.js';
import { getAllTasks, updateTask, setSetting, getSetting, deleteTasksByUserId } from './db.js';
import { retrySyncTasks, cleanupRealtimeSubscriptions } from './sync.js';
import { initFCMManager, registerFCMToken, unregisterFCMToken, handleSettingsChange } from './fcm-manager.js';
import { initOfflineQueue, processAllQueuedOperations, hasPendingTasks } from './offline-queue.js';
import { authStateManager } from './authStateManager.js';


// Add this function at the top
function hideAllUI() {
    const authSection = document.getElementById('authSection');
    const appContent = document.querySelector('.container');
    const loadingOverlay = document.getElementById('loadingOverlay');
    
    if (authSection) authSection.classList.add('hidden');
    if (appContent) appContent.classList.add('hidden');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
}

// Add this function too
function showInitialUI() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

/* Initialize global auth variables */
let user = null;
let access_token = null;
let isSignUp = false;
let isGuest = false;
let hasSelectedMode = null;

async function checkStoredAuthState() {
    try {
        const savedState = await authStateManager.getAuthState();
        console.log('Checking stored auth state:', savedState);
        
        if (savedState) {
            // Restore mode and session
            hasSelectedMode = savedState.selectedMode;
            
            if (savedState.session) {
                user = savedState.session.user;
                access_token = savedState.session.access_token;
            }

            // Load tasks before showing UI
            if (hasSelectedMode) {
                await loadTasks(hasSelectedMode);
                await updateUI(); // This will show the correct UI
                
                if (!navigator.onLine) {
                    showToast('Working offline. Changes will sync when back online.', 'info');
                }
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking stored auth state:', error);
        return false;
    }
}

/* Initialize auth and UI */
async function initAuth() {
    hideAllUI(); // Hide everything first
    
    try {
        // Check stored state first
        if (!navigator.onLine) {
            const hasStoredState = await checkStoredAuthState();
            if (hasStoredState) {
                showInitialUI();
                return; // Exit early if we restored offline state
            } else {
                showToast('You are offline. Some features may be limited.', 'warning');
            }
        }
        // 1. Check IndexedDB first for cached auth state and mode
        const savedState = await authStateManager.getAuthState();
        
        if (savedState) {
            // Restore mode from saved state
            hasSelectedMode = savedState.selectedMode || await getSetting('hasSelectedMode');
            
            if (savedState.session) {
                try {
                    await supabase.auth.setSession(savedState.session);
                    user = savedState.session.user;
                    access_token = savedState.session.access_token;
                    
                    if (!hasSelectedMode) {
                        hasSelectedMode = 'authenticated';
                        await setSetting('hasSelectedMode', 'authenticated');
                    }
                } catch (sessionError) {
                    console.warn('Failed to restore session:', sessionError);
                    // Only clear if online, keep state if offline
                    if (navigator.onLine) {
                        await authStateManager.clearAuthState();
                        hasSelectedMode = null;
                    }
                }
            }
        }

        // 2. Initialize offline queue early
        try {
            await initOfflineQueue();
            console.log('Offline queue initialized successfully');
        } catch (queueError) {
            console.error('Failed to initialize offline queue:', queueError);
        }

        // 3. If online, verify current session state
        if (navigator.onLine) {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (!error && session) {
                user = session.user;
                access_token = session.access_token;
            }
        }
        
        // 4. Handle guest mode
        if (hasSelectedMode === 'guest') {
            isGuest = true;
            await loadTasks('guest');
        }

        // 5. Handle authenticated mode
        if (hasSelectedMode === 'authenticated') {
            if (navigator.onLine) {
                await loadTasks('authenticated');
                retrySyncTasks();
            } else {
                await loadTasks('authenticated'); // Will use cached tasks
                console.log('Offline: Using cached tasks for authenticated user');
            }
        }

        // 6. Set up auth state change listener
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Auth event:", event);
            
            if (event === 'SIGNED_IN') {
                const sessionData = {
                    session: {
                        user: session.user,
                        access_token: session.access_token
                    },
                    selectedMode: 'authenticated',
                    lastUsed: Date.now()
                };
                await authStateManager.saveAuthState(sessionData);
                
                user = session.user;
                access_token = session.access_token;
                isGuest = false;
                hasSelectedMode = 'authenticated';
                
                await setSetting('hasSelectedMode', 'authenticated');
                await deleteTasksByUserId(null);
                await loadTasks('authenticated');
                
                // Handle FCM and profile cache
                try {
                    setTimeout(async () => {
                        const token = await registerFCMToken();
                        if (token) console.log('FCM: Registered after login');
                    }, 1500);
                    
                    await preloadProfileCache();
                } catch (error) {
                    console.log('Non-critical service initialization failed:', error);
                }

                if (navigator.onLine) {
                    setTimeout(() => processAllQueuedOperations(), 2000);
                }
            }
            
            if (event === 'SIGNED_OUT') {
                await authStateManager.clearAuthState();
                await unregisterFCMToken();
                clearProfileCache();
                
                if (hasSelectedMode === 'guest') {
                    isGuest = true;
                } else {
                    isGuest = false;
                    hasSelectedMode = null;
                    await setSetting('hasSelectedMode', null);
                }
            }
            updateUI();
        });

        // 7. Initial UI update and event listeners
        updateUI();
        setupEventListeners();

        // 8. Network state handlers
        // 8. Network state handlers
        window.addEventListener('online', async () => {
            // Verify session when back online
            if (hasSelectedMode === 'authenticated') {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error || !session) {
                    // Only clear if verification fails
                    await authStateManager.clearAuthState();
                    hasSelectedMode = null;
                    updateUI();
                } else {
                    // Session is valid, process queued operations
                    setTimeout(() => processAllQueuedOperations(), 1000);
                }
            }
            showToast('Back online!', 'success'); // Add this line
        });

        // Add offline handler
        window.addEventListener('offline', () => {
            showToast('You are offline. Changes will be synced when connection is restored.', 'warning');
        });

    } catch (error) {
        console.error('Init auth error:', error);
        showToast('Error initializing app', 'error');
    } finally {
        showInitialUI();
    }
}
// Keep your existing updateUI function as is
async function updateUI() {
    const authSection = document.getElementById('authSection');
    const appContent = document.querySelector('.container');

    if (!authSection || !appContent) {
        console.error('Required UI elements not found');
        return;
    }

    // First hide both
    authSection.classList.add('hidden');
    appContent.classList.add('hidden');

    if (hasSelectedMode === 'authenticated' || hasSelectedMode === 'guest') {
        // Show app content for both authenticated and guest users
        appContent.classList.remove('hidden');
        
        if (!navigator.onLine) {
            const hasTasks = await hasPendingTasks();
            if (hasTasks) {
                console.log('Offline mode: Found pending tasks');
            }
        }
    } else {
        // No mode selected, show auth form
        authSection.classList.remove('hidden');
    }

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
                redirectTo: `${window.location.origin}/reset-password.html`
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
        try {
            // Save guest state with new format
            const guestData = {
                session: null,
                selectedMode: 'guest',
                lastUsed: Date.now()
            };
            await authStateManager.saveAuthState(guestData);
            
            isGuest = true;
            user = null;
            access_token = null;
            hasSelectedMode = 'guest';
            await setSetting('hasSelectedMode', 'guest');
            await loadTasks('guest');
            updateUI();
            showToast('Continuing as guest. Tasks saved locally.');
        } catch (error) {
            console.error('Error setting guest mode:', error);
            showToast('Error setting guest mode', 'error');
        }
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
        // Close modal when clicking cancel button
    cancelLogoutBtn?.addEventListener('click', () => {
        logoutModal.classList.remove('active');
        document.body.style.overflow = '';
    });

    // Close modal when clicking outside
    logoutModal?.addEventListener('click', (e) => {
        // Check if click is outside the modal content
        if (e.target === logoutModal) {
            logoutModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Prevent clicks inside modal content from closing the modal
    document.querySelector('.logout-modal-content')?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

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

window.addEventListener('load', async () => {
    hideAllUI(); // Hide everything first
    
    try {
        // Check if page was loaded with auth state from service worker
        const authStateHeader = document.querySelector('meta[name="x-auth-state"]');
        if (authStateHeader) {
            const savedState = JSON.parse(authStateHeader.content);
            if (savedState) {
                console.log('Found auth state from service worker:', savedState);
                // Restore the state
                hasSelectedMode = savedState.selectedMode;
                if (savedState.session) {
                    user = savedState.session.user;
                    access_token = savedState.session.access_token;
                }
                
                // Load tasks and update UI
                await loadTasks(hasSelectedMode);
                await updateUI();
                
                if (!navigator.onLine) {
                    showToast('Working offline. Changes will sync when back online.', 'info');
                }
                showInitialUI();
                return;
            }
        }

        // Fallback to checking stored state
        const hasStoredState = await checkStoredAuthState();
        if (!hasStoredState) {
            if (!navigator.onLine) {
                showToast('You are offline. Some features may be limited.', 'warning');
            }
            // No stored state, show auth form
            const authSection = document.getElementById('authSection');
            if (authSection) authSection.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error in load event:', error);
        showToast('Error loading app state', 'error');
    } finally {
        showInitialUI(); // Remove loading overlay
    }
});

/* Export functions for app.js */
export { initAuth, isAuthenticated, user, supabase, access_token,isGuest };