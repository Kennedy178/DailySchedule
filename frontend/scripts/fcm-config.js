// FCM Configuration for GetItDone App
// Firebase SDK v10+ with ES6 modules

// Import Firebase SDK modules from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';

// Firebase configuration object - 
const firebaseConfig = {
    apiKey: "AIzaSyBL7ZdipX5Z5z-UPmUoAwbqpjRGrauR_9Q",
    authDomain: "getitdone-app1.firebaseapp.com",
    projectId: "getitdone-app1",
    storageBucket: "getitdone-app1.firebasestorage.app",
    messagingSenderId: "1032846385304",
    appId: "1:1032846385304:web:453509185bcae58974f0ed"
  };

// VAPID public key - 
const vapidKey = "BB3SzmzGaTIXMAQrL-de8FFixvIzyx99Hs0ItX814rdkSHErri81KYqkr1l6g4JcAEezdPo2Q-ZCYc3gga9yttM"; //VAPID public key from Firebase Console

// Initialize Firebase app
let app;
let messaging;

try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
    
    // Initialize messaging service
    messaging = getMessaging(app);
    console.log('Firebase messaging initialized successfully');
    
} catch (error) {
    console.error('Firebase initialization failed:', error);
    // Graceful fallback - app will work without FCM
    messaging = null;
}





// Add this to your fcm-config.js after messaging initialization
if (messaging) {
    // Handle foreground messages (when app is open)
    onMessage(messaging, (payload) => {
        console.log('FCM: Foreground message received:', payload);
        
        // Show notification even when app is in foreground
        if (Notification.permission === 'granted') {
            new Notification(
                payload.notification?.title || 'Task Reminder',
                {
                    body: payload.notification?.body || 'You have a task reminder',
                    icon: './icons/icon-192x192.png',
                    tag: payload.data?.tag || `fcm-fg-${Date.now()}`
                }
            );
        }
    });
}







// Custom function to get token using existing service worker
export async function getTokenWithCustomSW(vapidKey) {
    if (!messaging) {
        console.log('FCM: Messaging not available');
        return null;
    }
    
    try {
        // Get our existing service worker registration
        const registration = await navigator.serviceWorker.getRegistration();
        
        if (!registration) {
            throw new Error('No service worker registered');
        }
        
        console.log('FCM: Using existing service worker for token generation');
        
        // Get token using our existing service worker
        const token = await getToken(messaging, { 
            vapidKey,
            serviceWorkerRegistration: registration 
        });
        
        return token;
    } catch (error) {
        console.error('FCM: Token generation failed:', error);
        return null;
    }
}

// Helper function to check if FCM is available
export function isFCMAvailable() {
    return messaging !== null && 'serviceWorker' in navigator && 'Notification' in window;
}

// Helper function to get VAPID key
export function getVapidKey() {
    return vapidKey;
}

// Export configured instances
export { 
    app as firebaseApp, 
    messaging,
    firebaseConfig,
    vapidKey
};

// Export Firebase messaging functions for use in other modules
export { 
    getToken, 
    onMessage 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';