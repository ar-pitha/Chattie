const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.get('/last-messages/:username', chatController.getLastMessages);
router.get('/messages', chatController.getMessages);
router.get('/debug/messages', chatController.debugMessagesWithMedia);
router.post('/messages', chatController.saveMessage);
router.post('/messages/delete-for-me', chatController.deleteMessageForMe);
router.put('/messages/:messageId/edit', chatController.editMessage);
router.post('/messages/:messageId/star', chatController.toggleStar);
router.post('/messages/:messageId/pin', chatController.togglePin);
router.post('/messages/:messageId/reaction', chatController.toggleReaction);
router.get('/starred/:username', chatController.getStarredMessages);
router.get('/pinned', chatController.getPinnedMessages);
router.post('/call-event', chatController.saveCallEvent);
router.delete('/messages/:messageId', chatController.deleteMessage);

module.exports = router;
