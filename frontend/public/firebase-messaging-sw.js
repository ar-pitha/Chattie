// Firebase Messaging Service Worker
// This Service Worker handles background/offline push notifications from Firebase Cloud Messaging
// Note: We don't need to import Firebase SDK here - FCM handles messages natively

console.log('📲 Chat App Service Worker loaded');

// Handle background push notifications
self.addEventListener('push', function (event) {
  console.log('🔔 Push notification received:', event);

  if (!event.data) {
    console.log('No data in push event');
    return;
  }

  try {
    // Parse notification data from Firebase Cloud Messaging
    const notificationData = event.data.json();
    console.log('📨 Notification data:', notificationData);

    // Extract title and body from different possible locations
    const title = 
      notificationData.notification?.title || 
      notificationData.title || 
      'New Message';
    
    const body = 
      notificationData.notification?.body || 
      notificationData.body || 
      'You have a new message';

    const options = {
      body: body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: 'chat-notification',
      requireInteraction: false,
      data: notificationData.data || {}, // Store additional data
      actions: [
        {
          action: 'open',
          title: 'Open'
        },
        {
          action: 'close',
          title: 'Dismiss'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
        .catch(err => console.error('Failed to show notification:', err))
    );
  } catch (error) {
    console.error('Error parsing push notification:', error);
    // Fallback: show basic notification
    event.waitUntil(
      self.registration.showNotification('New Message', {
        body: 'You have received a new message',
        icon: '/icons/icon-192x192.png'
      })
    );
  }
});


// Handle notification clicks
self.addEventListener('notificationclick', function (event) {
  console.log('👆 Notification clicked:', event.action);

  // Close the notification
  event.notification.close();

  if (event.action === 'close') {
    // User clicked dismiss, just close the notification
    return;
  }

  // Open the app when notification is clicked (on any action except close)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      console.log(`Found ${clientList.length} open window(s)`);

      // Check if app window already exists
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' || client.url.includes('localhost:5173')) {
          console.log('Focus existing window');
          return client.focus();
        }
      }

      // If no window exists, open new one
      console.log('Opening new window');
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', function (event) {
  console.log('✋ Notification dismissed');
});

// Handle service worker install
self.addEventListener('install', function (event) {
  console.log('📦 Service Worker installing...');
  self.skipWaiting(); // Activate immediately
});

// Handle service worker activation
self.addEventListener('activate', function (event) {
  console.log('⚡ Service Worker activated');
  event.waitUntil(clients.claim()); // Take control of all pages
});
