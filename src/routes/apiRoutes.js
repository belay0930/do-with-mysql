import express from 'express';
import { handleCallback, getEditorConfig } from '../controllers/apiController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Callback from OnlyOffice Document Server
router.post('/callback', handleCallback);

// Protected routes
router.get('/config/:id', protect, getEditorConfig);

export default router;