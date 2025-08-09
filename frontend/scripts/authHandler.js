import { supabase, signUp, signIn, signOut, getSession, resetPassword } from './auth.js';
import { 
    showToast, 
    renderTasks,
    showLoading,
    loadTasks  // Added loadTasks to imports
} from './app.js';
import { getAllTasks, updateTask } from './db.js';

/* Initialize global auth variables */
let user = null;
let access_token = null;
let isSignUp = false;
let isGuest = false; 

/* Initialize auth and UI */
async function initAuth() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        user = session?.user || null;
        access_token = session?.access_token || null;
        
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && window.location.pathname.includes('reset-password.html')) {
                console.log('Ignoring SIGNED_IN on reset-password.html'); // Debug
                return; // Prevent UI updates during reset
            }
            user = session?.user || null;
            access_token = session?.access_token || null;
            isGuest = event === 'SIGNED_OUT' && isGuest;
            updateUI();
            if (event === 'SIGNED_IN') {
                loadTasks(); // Update tasks with user_id on login
            }
        });
        
        updateUI();
        setupEventListeners();
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
    if (user || isGuest) {
        authSection.classList.add('hidden');
        appContent.classList.remove('hidden');
    } else {
        authSection.classList.remove('hidden');
        appContent.classList.add('hidden');
    }

    // Update My Account dropdown
    updateMyAccount(); // Call this here!
    renderTasks();
}

/* Update My Account dropdown */
function updateMyAccount() {
    const accountEmail = document.getElementById('accountEmail');
    const accountType = document.getElementById('accountType');
    const logoutBtn = document.getElementById('logoutBtn');

    if (user) {
        accountEmail.textContent = `Logged in as: ${user.email}`;
        accountType.textContent = 'Account Type: Registered';
        logoutBtn.style.display = 'block'; // Show logout button
    } else if (isGuest) {
        accountEmail.textContent = 'Logged in as: Guest';
        accountType.textContent = 'Account Type: Guest';
        logoutBtn.style.display = 'block'; // Allow "logout" from guest mode
    } else {
        accountEmail.textContent = 'Not logged in';
        accountType.textContent = 'Account Type: None';
        logoutBtn.style.display = 'none'; // Hide if not applicable
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
        
        // Validate email format
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
    guestBtn?.addEventListener('click', () => {
        isGuest = true;
        user = null;
        access_token = null;
        updateUI();
        showToast('Continuing as guest. Tasks saved locally.');
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

    // 7. Logout Confirmation Flow
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

    // 8. Toggle Password Visibility
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

    // New guest mode buttons
    document.getElementById('goToSignupBtn')?.addEventListener('click', () => {
        document.getElementById('logoutConfirmModal').classList.remove('active');
        document.body.style.overflow = '';
        
        isSignUp = true;
        document.getElementById('authBtn').textContent = 'Sign Up';
        document.getElementById('authToggle').innerHTML = 
            'Already have an account? <a href="#">Sign In</a>';
        
        document.getElementById('authSection').classList.remove('hidden');
        document.querySelector('.container').classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('goToLoginLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('logoutConfirmModal').classList.remove('active');
        document.body.style.overflow = '';
        
        isSignUp = false;
        document.getElementById('authBtn').textContent = 'Sign In';
        document.getElementById('authToggle').innerHTML = 
            'No account? <a href="#">Sign Up</a>';
        
        document.getElementById('authSection').classList.remove('hidden');
        document.querySelector('.container').classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Keep existing modal handlers
    confirmLogoutBtn?.addEventListener('click', async () => {
        try {
            if (user) await signOut();
            user = null;
            isGuest = false;
            access_token = null;
            updateUI();
            showToast('Signed out successfully');
        } catch (error) {
            console.error('Logout error:', error);
            showToast('Logout failed. Please try again.');
        } finally {
            document.getElementById('logoutConfirmModal').classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    cancelLogoutBtn?.addEventListener('click', () => {
        document.getElementById('logoutConfirmModal').classList.remove('active');
        document.body.style.overflow = '';
    });

    document.getElementById('logoutConfirmModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('logoutConfirmModal')) {
            document.getElementById('logoutConfirmModal').classList.remove('active');
            document.body.style.overflow = '';
        }
    });
}

/* Create inline auth error element if not present */
function createAuthError() {
    const authError = document.createElement('p');
    authError.id = 'authError';
    authError.className = 'auth-error';
    authError.style.display = 'none'; // Use CSS class for visibility
    document.querySelector('.auth-card').appendChild(authError);
    return authError;
}

/* Check if user is authenticated for backend requests */
function isAuthenticated() {
    return !!access_token;
}

/* Export functions for app.js */
export { initAuth, isAuthenticated, user, supabase, access_token};