// FCM Manager for GetItDone App
// Handles Firebase Cloud Messaging token management, permissions, and offline queue

import { messaging, getTokenWithCustomSW, vapidKey, isFCMAvailable } from './fcm-config.js';
import { isAuthenticated, user, access_token } from './authHandler.js';
import { getSetting, setSetting, storeFCMToken, getFCMToken, deleteFCMToken, storeQueuedNotification, getAllQueuedNotifications, deleteQueuedNotification } from './db.js';
import { queueTokenRegistration, queueTokenUnregistration, processAllQueuedOperations } from './offline-queue.js';

// At the top of offline-queue.js
const API_BASE_URL = 'http://localhost:8000';

// FCM Manager state
let fcmToken = null;
let deviceFingerprint = null;
let isTokenRegistered = false;

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
  try {
    if (!isAuthenticated()) {
      console.log('FCM: Skipped - user not authenticated');
      return false;
    }
    
    if (!isFCMAvailable()) {
      console.log('FCM: Skipped - FCM not available in browser');
      return false;
    }
    
    const enableReminders = await getSetting('enableReminders') === 'true';
    if (!enableReminders) {
      console.log('FCM: Skipped - user disabled reminders in settings');
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
      return false;
    }
    
    if (permission === 'default') {
      console.log('FCM: Requesting notification permission...');
      const newPermission = await Notification.requestPermission();
      await setSetting('notificationPermission', newPermission);
      
      if (newPermission !== 'granted') {
        console.log('FCM: Permission request denied or dismissed');
        return false;
      }
    }
    
    console.log('FCM: All conditions met - proceeding with token registration');
    return true;
  } catch (error) {
    console.error('FCM: Error checking enablement conditions:', error);
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

// Register FCM token
async function registerFCMToken() {
  try {
    if (!(await shouldEnableFCM())) {
      return null;
    }
    
    console.log('FCM: Requesting token with VAPID key...');
    const token = await getTokenWithCustomSW(vapidKey);
    
    if (!token) {
      console.log('FCM: No registration token available');
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
    console.error('FCM: Token registration failed:', error);
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
  isTokenRegistered
};