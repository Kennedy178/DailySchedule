// FCM Manager for GetItDone App
// Handles Firebase Cloud Messaging token management, permissions, and offline queue

import { messaging, getTokenWithCustomSW, vapidKey, isFCMAvailable } from './fcm-config.js';
import { isAuthenticated, user, access_token } from './authHandler.js';
import { getSetting, setSetting, storeFCMToken, getFCMToken, deleteFCMToken, storeQueuedNotification, getAllQueuedNotifications, deleteQueuedNotification } from './db.js';
import { queueTokenRegistration, queueTokenUnregistration, processAllQueuedOperations } from './offline-queue.js';

// At the top of offline-queue.js
const API_BASE_URL = window.API_BASE_URL; // Uses config.js

// FCM Manager state
let fcmToken = null;
let deviceFingerprint = null;
let isTokenRegistered = false;

/* -------------------------- Browser Detection -------------------------- */
function detectBrowser() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('brave') || (navigator.brave && navigator.brave.isBrave)) {
        return 'brave';
    } else if (userAgent.includes('edg/')) {
        return 'edge';
    } else if (userAgent.includes('chrome/') && !userAgent.includes('edg/')) {
        return 'chrome';
    } else if (userAgent.includes('firefox/')) {
        return 'firefox';
    } else if (userAgent.includes('safari/') && !userAgent.includes('chrome/')) {
        return 'safari';
    }
    return 'unknown';
}

// Track if we've already shown browser guidance this session
let hasShownBrowserGuidance = false;

function showBrowserSpecificGuidance(browser, error) {
    // CRITICAL: Only show guidance for authenticated users
    if (!isAuthenticated()) {
        console.log('FCM: Skipping browser guidance - user not authenticated');
        return;
    }
    
    // Check if user has permanently dismissed browser guidance
    if (localStorage.getItem('browserGuidanceDismissed') === 'true') {
        console.log('FCM: Browser guidance permanently dismissed by user');
        return;
    }
    
    // Skip if we've already shown guidance this session
    if (hasShownBrowserGuidance) {
        console.log('FCM: Browser guidance already shown this session, skipping');
        return;
    }
    
    let message = '';
    let duration = 25000;
    
    // Handle specific error types first
    if (typeof error === 'string') {
        switch (error) {
            case 'disabled_by_user':
                message = `✅ Task reminders are disabled in your settings. You can enable them anytime in Settings → Notifications. Your tasks work perfectly without them!`;
                break;
            case 'browser_limitation':
                // Will fall through to browser-specific messages below
                
            case 'permission_dismissed':
                message = `⏭️ Notification permission was skipped. No worries - your tasks will work perfectly without them! You can enable them later in Settings → Notifications.`;
                break;
            default:
                // Will fall through to browser-specific messages below
                break;
        }
    }
    
    // If no specific message set, use browser-specific defaults
    if (!message) {
        switch (browser) {
            case 'brave':
                message = `🦁 Brave detected! Notifications may be blocked by privacy settings. Your tasks will still work perfectly without them. Try using Chrome for full notification support.`;
                break;
                
            case 'edge':
                message = `🌐 Edge detected! If notifications don't work after closing the browser, check Privacy settings → Clear browsing data on close → disable "Cookies". Your tasks sync perfectly regardless! For best experience, try Chrome.`;
                break;
                
            case 'firefox':
                message = `🦊 Firefox detected! Notifications may be blocked by Enhanced Tracking Protection. Your tasks will sync perfectly without them! Try Chrome for full notification support.`;
                break;
                
            case 'safari':
                message = `🍎 Safari detected! Push notifications have limited support. Your tasks will work perfectly regardless! Try Chrome for full notification support.`;
                break;
                
            default:
                message = `📱 Notifications unavailable in this browser. Your tasks will sync and work perfectly without them! Try Chrome for full notification support.`;
        }
    }
    
    // Mark that we've shown guidance and show the toast
    hasShownBrowserGuidance = true;
    showBrowserToast(message, 'info', duration);
}

// Browser guidance toast function with both temporary and permanent dismiss options
function showBrowserToast(message, type = 'info', duration = 25000) {
    // Remove any existing browser toast
    const existingToast = document.getElementById('browser-guidance-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'browser-guidance-toast';
    toast.className = `browser-guidance-toast type-${type}`;
    
    // Type configurations
    const typeConfig = {
        info: { 
            color: '#4A90E2',           
            icon: '💡', 
            bgColor: '#0F1419',        
            borderColor: '#4A90E2'     
        },
        warning: { 
            color: '#FFA726',          
            icon: '⚠️', 
            bgColor: '#1A1410',        
            borderColor: '#FFA726'     
        },
        error: { 
            color: '#FF4757',           
            icon: '❌', 
            bgColor: '#1A0F0F',        
            borderColor: '#FF4757'     
        }
    };
    
    const config = typeConfig[type] || typeConfig.info;
    
    // Generate unique IDs for this toast instance
    const closeButtonId = `close-btn-${Date.now()}`;
    const dismissButtonId = `dismiss-btn-${Date.now()}`;
    
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-icon" style="color: ${config.color}">
                ${config.icon}
            </div>
            <div class="toast-text">
                <div class="toast-title">Browser Compatibility</div>
                <div class="toast-message">${message}</div>
                <div class="toast-actions">
                    <button class="toast-dismiss-forever" id="${dismissButtonId}">
                        Don't show again
                    </button>
                </div>
            </div>
            <button class="toast-close" id="${closeButtonId}">
                ×
            </button>
        </div>
        <div class="toast-progress" style="background: linear-gradient(90deg, ${config.color} 0%, ${config.color}80 100%);"></div>
    `;
    
    // COMPLETELY OPAQUE STYLING
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${config.bgColor};
        border: 2px solid ${config.borderColor};
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.8), 0 0 30px ${config.color}30;
        z-index: 10000;
        min-width: 320px;
        max-width: 420px;
        animation: slideInRight 0.3s ease-out;
    `;
    
    // Add enhanced styles for browser guidance toast
    if (!document.getElementById('browser-toast-styles')) {
        const styles = document.createElement('style');
        styles.id = 'browser-toast-styles';
        styles.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            
            .toast-content {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                margin-bottom: 8px;
            }
            
            .toast-icon {
                font-size: 20px;
                flex-shrink: 0;
                margin-top: 2px;
            }
            
            .toast-text {
                flex: 1;
                min-width: 0;
            }
            
            .toast-title {
                font-weight: 600;
                font-size: 14px;
                color: #FFFFFF;
                margin-bottom: 4px;
            }
            
            .toast-message {
                font-size: 13px;
                color: #E0E0E0;
                line-height: 1.4;
                word-wrap: break-word;
                margin-bottom: 8px;
            }
            
            .toast-actions {
                display: flex;
                justify-content: flex-end;
                margin-top: 8px;
            }
            
            .toast-dismiss-forever {
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                color: #E0E0E0;
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .toast-dismiss-forever:hover {
                background: rgba(255,255,255,0.2);
                color: #FFFFFF;
                border-color: rgba(255,255,255,0.3);
            }
            
            .toast-close {
                background: none;
                border: none;
                font-size: 18px;
                color: #9ca3af;
                cursor: pointer;
                padding: 0;
                margin-left: 8px;
                flex-shrink: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s;
            }
            
            .toast-close:hover {
                background: rgba(255,255,255,0.15);
                color: #FFFFFF;
            }
            
            .toast-progress {
                height: 3px;
                border-radius: 0 0 12px 12px;
                margin: 0 -16px -16px -16px;
                animation: shrinkProgress ${duration}ms linear forwards;
            }
            
            @keyframes shrinkProgress {
                from { width: 100%; }
                to { width: 0%; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    // Add to page
    document.body.appendChild(toast);
    
    // Add event listeners AFTER adding to DOM
    const closeButton = document.getElementById(closeButtonId);
    const dismissButton = document.getElementById(dismissButtonId);
    
    if (closeButton) {
        closeButton.addEventListener('click', function() {
            closeBrowserToast();
        });
    }
    
    if (dismissButton) {
        dismissButton.addEventListener('click', function() {
            dismissBrowserGuidanceForever();
        });
    }
    
    // Auto-remove after specified duration with animation
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOutRight 0.3s ease-in forwards';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }
    }, duration);
    
    // Optional: Play a subtle sound
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DrwmwhBDOR2O/CdygEMrJEAAA=');
        audio.volume = 0.1;
        audio.play().catch(() => {});
    } catch (e) {}
}

// Temporary close (X button) - just removes for this session
function closeBrowserToast() {
    const toast = document.getElementById('browser-guidance-toast');
    if (toast) {
        toast.style.animation = 'slideOutRight 0.3s ease-in forwards';
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }
}

// Permanent dismiss (Don't show again button) - saves to localStorage
function dismissBrowserGuidanceForever() {
    // Save permanent dismissal
    localStorage.setItem('browserGuidanceDismissed', 'true');
    
    // Close the toast with animation
    const toast = document.getElementById('browser-guidance-toast');
    if (toast) {
        toast.style.animation = 'slideOutRight 0.3s ease-in forwards';
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }
    
    console.log('FCM: Browser guidance permanently dismissed by user');
}

// Optional: Function to reset the permanent dismissal (for debugging/testing)
function resetBrowserGuidanceDismissal() {
    localStorage.removeItem('browserGuidanceDismissed');
    hasShownBrowserGuidance = false;
    console.log('FCM: Browser guidance dismissal reset - will show again');
}

// Make functions globally available for debugging
window.resetBrowserGuidanceDismissal = resetBrowserGuidanceDismissal;







function handleFCMError(error, browser) {
    // Log the technical error
    console.error('FCM Error Details:', error);
    
    // Show browser-specific guidance
    showBrowserSpecificGuidance(browser, error);
    
    // Continue app functionality normally
    console.log('FCM: App continues without notifications');
}

// Generate unique device fingerprint
function generateDeviceFingerprint() {
  if (deviceFingerprint) return deviceFingerprint;
  
  const components = [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    new Date().getTimezoneOffset()
  ];
  
  let hash = 0;
  const str = components.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  deviceFingerprint = 'device_' + Math.abs(hash).toString(36);
  console.log('Generated device fingerprint:', deviceFingerprint);
  return deviceFingerprint;
}

// Check if FCM should be enabled based on user settings and permissions
async function shouldEnableFCM() {
  const browser = detectBrowser();
  
  try {
    if (!isAuthenticated()) {
      console.log('FCM: Skipped - user not authenticated');
      return false;
    }
    
    if (!isFCMAvailable()) {
      console.log('FCM: Skipped - FCM not available in browser');
      // Only show guidance for authenticated users
      showBrowserSpecificGuidance(browser, 'not_available');
      return false;
    }
    
    const enableReminders = await getSetting('enableReminders') === 'true';
    if (!enableReminders) {
      console.log('FCM: Skipped - user disabled reminders in settings');
      // Show guidance when user has disabled notifications
      showBrowserSpecificGuidance(browser, 'disabled_by_user');
      return false;
    }
    
    const permission = Notification.permission;
    if (permission === 'denied') {
      console.log('FCM: Skipped - notification permission denied');
      await setSetting('notificationPermission', 'denied');
      const permissionError = document.getElementById('permissionError');
      if (permissionError) {
        permissionError.style.display = 'block';
      }
      showBrowserSpecificGuidance(browser, 'permission_denied');
      return false;
    }
    
    if (permission === 'default') {
      console.log('FCM: Requesting notification permission...');
      const newPermission = await Notification.requestPermission();
      await setSetting('notificationPermission', newPermission);
      
      if (newPermission !== 'granted') {
        console.log('FCM: Permission request denied or dismissed');
        showBrowserSpecificGuidance(browser, 'permission_dismissed');
        return false;
      }
    }
    
    console.log('FCM: All conditions met - proceeding with token registration');
    return true;
  } catch (error) {
    console.error('FCM: Error checking enablement conditions:', error);
    handleFCMError(error, browser);
    return false;
  }
}
// Store FCM token in IndexedDB
async function storeFCMTokenLocally(token) {
  try {
    const tokenData = {
      token: token,
      deviceId: generateDeviceFingerprint(),
      userId: user?.id || null,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      isActive: true
    };
    
    await storeFCMToken(tokenData);
    console.log('FCM: Token stored locally:', tokenData.deviceId);
    return tokenData;
  } catch (error) {
    console.error('FCM: Failed to store token locally:', error);
    throw error;
  }
}

// Send FCM token to backend
async function sendTokenToBackend(tokenData) {
  try {
    if (!access_token) {
      throw new Error('No access token available');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/fcm/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      },
      body: JSON.stringify({
        token: tokenData.token,
        device_id: tokenData.deviceId,
        device_name: `${navigator.platform} - ${navigator.userAgent.split(' ')[0]}`
      })
    });
    
    if (!response.ok) {
      throw new Error(`Backend registration failed: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('FCM: Token registered with backend:', result);
    return result;
  } catch (error) {
    console.error('FCM: Failed to register token with backend:', error);
    
    // Queue for retry using the new offline queue system
    await queueTokenRegistration(tokenData);
    
    throw error;
  }
}

// Send FCM token unregistration to backend
async function sendTokenUnregistrationToBackend(deviceId) {
  try {
    if (!access_token) {
      throw new Error('No access token available');
    }
    
    const response = await fetch('/api/fcm/unregister', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      },
      body: JSON.stringify({
        device_id: deviceId
      })
    });
    
    if (!response.ok) {
      throw new Error(`Backend unregistration failed: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('FCM: Token unregistered from backend:', result);
    return result;
  } catch (error) {
    console.error('FCM: Failed to unregister token from backend:', error);
    
    // Queue for retry using the new offline queue system
    await queueTokenUnregistration(deviceId);
    
    throw error;
  }
}

// Queue failed operations for retry (DEPRECATED - use offline-queue.js)
async function queueFailedOperation(operation, data) {
  try {
    const queueItem = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      operation: operation,
      data: data,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3
    };
    
    await storeQueuedNotification(queueItem);
    console.log('FCM: Queued failed operation (DEPRECATED):', operation, queueItem.id);
  } catch (error) {
    console.error('FCM: Failed to queue operation:', error);
  }
}

// Process queued operations (DEPRECATED - use offline-queue.js)
async function processQueuedOperations() {
  console.log('FCM: processQueuedOperations called (DEPRECATED - using offline-queue.js)');
  
  // Delegate to the new offline queue system
  await processAllQueuedOperations();
}

// Register FCM token with enhanced error handling
async function registerFCMToken() {
  const browser = detectBrowser();
  console.log(`FCM: Detected browser: ${browser}`);
  
  try {
    if (!(await shouldEnableFCM())) {
      console.log('FCM: Skipped - user disabled reminders in settings');
      // Show guidance when user has disabled notifications but browser could support them
      if (['chrome'].includes(browser)) {
        showBrowserSpecificGuidance(browser, 'disabled_by_user');
      } else {
        // Show browser-specific guidance for non-Chrome browsers
        showBrowserSpecificGuidance(browser, 'browser_limitation');
      }
      return null;
    }
    
    // Check if notifications are supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('FCM: Push messaging not supported');
      showBrowserSpecificGuidance(browser, 'not_supported');
      return null;
    }
    
    console.log('FCM: Requesting token with VAPID key...');
    const token = await getTokenWithCustomSW(vapidKey);
    
    if (!token) {
      console.log('FCM: No registration token available');
      showBrowserSpecificGuidance(browser, 'token_failed');
      handleFCMError(new Error('Token generation returned null'), browser);
      return null;
    }
    
    console.log('FCM: Token generated successfully');
    fcmToken = token;
    
    const tokenData = await storeFCMTokenLocally(token);
    
    try {
      await sendTokenToBackend(tokenData);
      isTokenRegistered = true;
      console.log('FCM: Token registered successfully with backend');
    } catch (error) {
      console.log('FCM: Token stored locally, queued for backend registration when online');
      // Error is already handled in sendTokenToBackend (queued for retry)
    }
    
    // Cache token in service worker for offline use
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.active) {
          registration.active.postMessage({
            type: 'CACHE_FCM_TOKEN',
            token: token
          });
        }
      } catch (swError) {
        console.error('FCM: Failed to cache token in service worker:', swError);
      }
    }
    
    return token;
  } catch (error) {
    console.error('FCM: Token registration failed:', error.message);
    
    // Handle browser-specific error messaging
    showBrowserSpecificGuidance(browser, error);
    handleFCMError(error, browser);
    
    const permissionError = document.getElementById('permissionError');
    if (permissionError) {
      permissionError.textContent = 'Push notifications setup failed. Local notifications will work.';
      permissionError.style.display = 'block';
    }
    return null;
  }
}
// Clean up FCM token
async function unregisterFCMToken() {
  try {
    if (!fcmToken || !deviceFingerprint) {
      console.log('FCM: No token to unregister');
      return;
    }
    
    // Try to unregister from backend
    try {
      await sendTokenUnregistrationToBackend(deviceFingerprint);
      console.log('FCM: Token unregistered from backend');
    } catch (error) {
      console.log('FCM: Backend unregistration failed, queued for retry');
      // Error is already handled in sendTokenUnregistrationToBackend (queued for retry)
    }
    
    // Clean up local storage
    try {
      await deleteFCMToken(deviceFingerprint);
      console.log('FCM: Token removed from local storage');
    } catch (error) {
      console.error('FCM: Failed to remove token from local storage:', error);
    }
    
    // Clear cached token in service worker
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.active) {
          registration.active.postMessage({
            type: 'CACHE_FCM_TOKEN',
            token: null
          });
        }
      } catch (swError) {
        console.error('FCM: Failed to clear cached token in service worker:', swError);
      }
    }
    
    fcmToken = null;
    isTokenRegistered = false;
    
    console.log('FCM: Token cleanup completed');
  } catch (error) {
    console.error('FCM: Token cleanup failed:', error);
  }
}

// Handle settings changes
async function handleSettingsChange() {
  const enableReminders = await getSetting('enableReminders') === 'true';
  
  if (enableReminders && isAuthenticated() && !isTokenRegistered) {
    await registerFCMToken();
  } else if (!enableReminders && isTokenRegistered) {
    await unregisterFCMToken();
  }
}

// Initialize FCM manager
async function initFCMManager() {
  try {
    console.log('FCM: Initializing FCM Manager...');
    
    // Process any queued operations if online
    if (navigator.onLine) {
      await processAllQueuedOperations();
    }
    
    // Register token if conditions are met
    await registerFCMToken();
    
    // Listen for online events to process queue
    window.addEventListener('online', () => {
      console.log('FCM: Network online, processing queued operations');
      processAllQueuedOperations();
    });
    
    console.log('FCM: Manager initialized successfully');
  } catch (error) {
    console.error('FCM: Manager initialization failed:', error);
  }
}

export {
  initFCMManager,
  registerFCMToken,
  unregisterFCMToken,
  handleSettingsChange,
  processQueuedOperations, // Keep for backward compatibility
  fcmToken,
  isTokenRegistered,
  detectBrowser,
  showBrowserSpecificGuidance
};