const User = require('../models/User');
const admin = require('../config/firebase');

exports.sendNotification = async (req, res) => {
  try {
    const { receiverId, title, body } = req.body;

    if (!receiverId || !title || !body) {
      return res.status(400).json({ message: 'receiverId, title, and body required' });
    }

    // Get receiver's FCM token
    const receiver = await User.findById(receiverId);
    if (!receiver || !receiver.fcm_token) {
      return res.status(400).json({ message: 'User not found or no FCM token' });
    }

    // Send notification using Firebase Admin SDK
    try {
      const message = {
        notification: {
          title,
          body
        },
        token: receiver.fcm_token
      };

      const response = await admin.messaging().send(message);
      console.log('Notification sent:', response);
      
      res.status(200).json({ message: 'Notification sent successfully', response });
    } catch (firebaseError) {
      console.error('Firebase error:', firebaseError.message);
      res.status(400).json({ message: 'Failed to send notification', error: firebaseError.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error sending notification', error: error.message });
  }
};

exports.sendNotificationByUsername = async (req, res) => {
  try {
    const { receiverUsername, sendersUsername, messageText } = req.body;

    if (!receiverUsername || !sendersUsername || !messageText) {
      return res.status(400).json({ message: 'receiverUsername, sendersUsername, and messageText required' });
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📬 Notification Request: ${sendersUsername} → ${receiverUsername}`);
    console.log(`   Message: ${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}`);

    // Get receiver by username
    const receiver = await User.findOne({ username: receiverUsername });
    
    if (!receiver) {
      console.log(`❌ User not found: ${receiverUsername}`);
      return res.status(400).json({ message: `User ${receiverUsername} not found` });
    }

    console.log(`   Receiver found: ${receiver.username} (ID: ${receiver._id})`);

    if (!receiver.fcm_token) {
      console.log(`⚠️ No FCM token for user: ${receiverUsername}`);
      console.log(`   Possible reasons:`);
      console.log(`   - User has not granted notification permission`);
      console.log(`   - Service Worker not registered`);
      console.log(`   - FCM token request failed`);
      console.log(`${'='.repeat(70)}\n`);
      return res.status(400).json({ 
        message: `No FCM token for user ${receiverUsername}. User may not have granted notification permission.`,
        receiverUsername 
      });
    }

    console.log(`   FCM Token: ${receiver.fcm_token.substring(0, 20)}...`);

    try {
      const message = {
        notification: {
          title: 'Chattie',
          body: 'Hey! You got a new message'
        },
        token: receiver.fcm_token
      };

      console.log(`📤 Sending via Firebase Admin SDK...`);
      const response = await admin.messaging().send(message);
      
      console.log(`✅ Notification sent successfully`);
      console.log(`   Firebase Response: ${response}`);
      console.log(`${'='.repeat(70)}\n`);
      
      res.status(200).json({ 
        message: 'Notification sent successfully',
        response 
      });
    } catch (firebaseError) {
      console.error(`❌ Firebase error:`, firebaseError.message);
      console.error(`   Error Code: ${firebaseError.code}`);
      console.error(`   Details:`, firebaseError);
      console.log(`${'='.repeat(70)}\n`);
      
      // Don't fail the request if notification fails - message was still saved
      res.status(200).json({ 
        message: 'Message saved (notification failed)', 
        warning: firebaseError.message,
        firebaseError: firebaseError.code 
      });
    }
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    console.log(`${'='.repeat(70)}\n`);
    res.status(500).json({ message: 'Error sending notification', error: error.message });
  }
};
