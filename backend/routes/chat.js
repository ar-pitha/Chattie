const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.get('/messages', chatController.getMessages);
router.post('/messages', chatController.saveMessage);

module.exports = router;
