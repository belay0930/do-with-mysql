import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import {
  getDocuments,
  getUploadForm,
  uploadDocument,
  viewDocument,
  deleteDocument,
  createDocument,
  shareDocument,
} from '../controllers/documentController.js';
import { protect } from '../middleware/authMiddleware.js';

// Initialize router
const router = express.Router();

// Configure multer storage
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueId = uuidv4();
    const fileExt = path.extname(file.originalname);
    cb(null, `${uniqueId}${fileExt}`);
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Apply protect middleware to all routes
router.use(protect);

// Document routes
router.get('/', getDocuments);
router.get('/upload', getUploadForm);
router.post('/upload', upload.single('document'), uploadDocument);
router.get('/create/:type', createDocument);
router.get('/:id', viewDocument);
router.delete('/:id', deleteDocument);
router.post('/:id/share', shareDocument);

export default router;