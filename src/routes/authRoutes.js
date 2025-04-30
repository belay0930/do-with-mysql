import express from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getLoginPage,
  getRegisterPage,
} from '../controllers/authController.js';

const router = express.Router();

// Public routes
router.get('/', getLoginPage);
router.get('/login', getLoginPage);
router.get('/register', getRegisterPage);
router.post('/login', loginUser);
router.post('/register', registerUser);
router.get('/logout', logoutUser);

export default router;