const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.get('/last-messages/:username', chatController.getLastMessages);
router.get('/messages', chatController.getMessages);
router.get('/debug/messages', chatController.debugMessagesWithMedia);
router.post('/messages', chatController.saveMessage);
router.post('/messages/delete-for-me', chatController.deleteMessageForMe);
router.delete('/messages/:messageId', chatController.deleteMessage);

module.exports = router;
