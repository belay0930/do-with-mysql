import express from 'express';
import { handleCallback, getEditorConfig, downloadDocument } from '../controllers/apiController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Callback from OnlyOffice Document Server
router.post('/callback', handleCallback);

// Protected routes
router.get('/config/:id', protect, getEditorConfig);

// Document download route
router.get('/documents/:key/download', downloadDocument);

export default router;