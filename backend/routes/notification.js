const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

router.post('/send', notificationController.sendNotification);
router.post('/send-by-username', notificationController.sendNotificationByUsername);

module.exports = router;
