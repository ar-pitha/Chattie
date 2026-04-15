import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Request FCM token
export const requestFCMToken = async () => {
  try {
    console.log('📱 Requesting notification permission...');
    console.log(`   Current permission status: ${Notification.permission}`);
    
    const permission = await Notification.requestPermission();
    console.log(`   Permission result: ${permission}`);
    
    if (permission === 'granted') {
      console.log('✅ Notification permission GRANTED');
      
      try {
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
        });
        
        if (token) {
          console.log('✅ FCM Token obtained successfully');
          console.log(`   Token (first 30 chars): ${token.substring(0, 30)}...`);
          return token;
        } else {
          console.error('❌ getToken() returned empty/null');
          console.error('   Possible reasons:');
          console.error('   1. VITE_FIREBASE_VAPID_KEY env variable is missing/invalid');
          console.error('   2. Service Worker not registered or not active');
          console.error('   3. Firebase configuration is invalid');
          return null;
        }
      } catch (tokenError) {
        console.error('❌ Error in getToken():', tokenError.message);
        console.error('   Error code:', tokenError.code);
        console.error('   Error details:', tokenError);
        return null;
      }
    } else if (permission === 'denied') {
      console.warn('⚠️ Notification permission DENIED by user');
      console.warn('   User clicked "Block" or previously denied permission');
      console.warn('   To fix: Browser Settings → Notifications → Allow this site');
      return null;
    } else {
      console.warn('⚠️ Notification permission status:', permission);
      return null;
    }
  } catch (error) {
    console.error('❌ Error requesting notification permission:', error);
    console.error('   Error message:', error.message);
    console.error('   Full error:', error);
    return null;
  }
};

// Handle foreground notifications
export const setupForegroundNotifications = (callback) => {
  onMessage(messaging, (payload) => {
    console.log('Message received in foreground:', payload);
    if (callback) {
      callback(payload);
    }
  });
};

// Register Service Worker
export const registerServiceWorker = async () => {
  try {
    if ('serviceWorker' in navigator) {
      console.log('🔄 Registering Service Worker...');
      console.log('   Path: /firebase-messaging-sw.js');
      console.log('   Scope: /');
      
      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { scope: '/' }
      );
      
      console.log('✅ Service Worker registration successful');
      console.log(`   Scope: ${registration.scope}`);
      console.log(`   State: ${registration.installing ? 'installing' : registration.waiting ? 'waiting' : registration.active ? 'active' : 'unknown'}`);
      
      // Wait for the Service Worker to be fully active
      if (!registration.active) {
        console.log('⏳ Waiting for Service Worker to become active...');
        await new Promise((resolve) => {
          const checkActive = () => {
            if (registration.active) {
              console.log('✅ Service Worker is now active');
              resolve();
            } else {
              registration.addEventListener('updatefound', checkActive);
            }
          };
          checkActive();
          
          // Fallback: resolve after 2 seconds even if not active
          setTimeout(() => {
            console.warn('⚠️ Service Worker activation timeout, proceeding anyway');
            resolve();
          }, 2000);
        });
      }
      
      return registration;
    } else {
      console.error('❌ Service Workers not supported in this browser');
      console.error('   This browser does not support Push Notifications');
      return null;
    }
  } catch (error) {
    console.error('❌ Service Worker registration failed:', error);
    console.error('   Error message:', error.message);
    console.error('   Possible causes:');
    console.error('   1. File not found: /firebase-messaging-sw.js does not exist');
    console.error('   2. Cross-origin: Service Worker not accessible (CORS issue)');
    console.error('   3. Browser security: Running on non-HTTPS or localhost');
    console.error('   4. Invalid scope: Check vercel.json Service-Worker-Allowed header');
    return null;
  }
};

export { messaging, app };
