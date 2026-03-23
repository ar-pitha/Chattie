const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');

router.get('/all', usersController.getAllUsers);
router.get('/:userId', usersController.getUserById);
router.put('/status', usersController.updateOnlineStatus);

module.exports = router;
