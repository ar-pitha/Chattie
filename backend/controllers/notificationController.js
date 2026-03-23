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

    // Get receiver by username
    const receiver = await User.findOne({ username: receiverUsername });
    if (!receiver || !receiver.fcm_token) {
      return res.status(400).json({ message: 'User not found or no FCM token' });
    }

    try {
      const message = {
        notification: {
          title: `Message from ${sendersUsername}`,
          body: messageText
        },
        token: receiver.fcm_token
      };

      const response = await admin.messaging().send(message);
      console.log('Notification sent:', response);
      
      res.status(200).json({ message: 'Notification sent successfully' });
    } catch (firebaseError) {
      console.error('Firebase error:', firebaseError.message);
      // Don't fail the request if notification fails - message was still saved
      res.status(200).json({ message: 'Message saved (notification failed)', warning: firebaseError.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error sending notification', error: error.message });
  }
};
