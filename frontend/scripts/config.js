
// Disable console logs in production
if (location.hostname !== "localhost") {
    console.log = function () {};
    console.debug = function () {};
    console.info = function () {};
    console.warn = function () {};
    //Only console.error for actual error reporting
}
// frontend/scripts/config.js
// Auto-detect environment and set API base URL
const API_CONFIG = {
    development: 'http://localhost:8000',
    production: 'https://getitdone-api.onrender.com'  // actual backend URL
};

// Detect environment
const isDevelopment = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.includes('localhost');

const API_BASE_URL = isDevelopment ? API_CONFIG.development : API_CONFIG.production;

// Make it globally available
window.API_BASE_URL = API_BASE_URL;

console.log(`🌐 Environment: ${isDevelopment ? 'development' : 'production'}`);
console.log(`🔗 API Base URL: ${API_BASE_URL}`);

// Helper function for making API calls
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    // Merge options
    const mergedOptions = { ...defaultOptions, ...options };
    
    // Add auth header if token exists
    const token = localStorage.getItem('authToken');
    if (token) {
        mergedOptions.headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        console.log(`📡 API Call: ${options.method || 'GET'} ${url}`);
        const response = await fetch(url, mergedOptions);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API call failed (${response.status}): ${errorText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('❌ API call error:', error);
        throw error;
    }
}

// Export for use in other scripts
window.apiCall = apiCall;