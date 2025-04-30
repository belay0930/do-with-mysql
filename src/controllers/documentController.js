import asyncHandler from 'express-async-handler';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import Document from '../models/documentModel.js';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// @desc    Get all documents for the logged-in user
// @route   GET /documents
// @access  Private
const getDocuments = asyncHandler(async (req, res) => {
  const documents = await Document.find({
    $or: [
      { owner: req.session.user._id },
      { 'shared.user': req.session.user._id },
      { isPublic: true },
    ],
  }).sort({ updatedAt: -1 });

  res.render('documents/index', {
    title: 'My Documents',
    documents,
    user: req.session.user,
    documentServerUrl: process.env.DOCUMENT_SERVER_URL || 'http://localhost:8000',
  });
});

// @desc    Show form to upload a new document
// @route   GET /documents/upload
// @access  Private
const getUploadForm = asyncHandler(async (req, res) => {
  res.render('documents/upload', {
    title: 'Upload Document',
    user: req.session.user,
  });
});

// @desc    Upload a new document
// @route   POST /documents/upload
// @access  Private
const uploadDocument = asyncHandler(async (req, res) => {
  const file = req.file;
  
  if (!file) {
    res.status(400);
    throw new Error('Please upload a file');
  }

  // Extract file extension and verify it's a supported type
  const fileExt = path.extname(file.originalname).toLowerCase().slice(1);
  const supportedTypes = ['docx', 'xlsx', 'pptx', 'txt', 'pdf'];
  
  if (!supportedTypes.includes(fileExt)) {
    // Remove the file if it's not a supported type
    fs.unlinkSync(file.path);
    res.status(400);
    throw new Error('Unsupported file type. Please upload docx, xlsx, pptx, txt, or pdf files only.');
  }

  // Generate a unique key for the document
  const key = uuidv4();
  
  // Create a new document record
  const document = await Document.create({
    title: req.body.title || path.basename(file.originalname, path.extname(file.originalname)),
    filename: file.originalname,
    fileType: fileExt,
    path: file.path,
    key,
    size: file.size,
    owner: req.session.user._id,
  });

  res.redirect('/documents');
});

// @desc    View a document
// @route   GET /documents/:id
// @access  Private (with access control)
const viewDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id).populate('owner', 'name email');
  
  // Check if document exists
  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  // Check if user has access to the document
  const hasAccess = 
    document.owner._id.equals(req.session.user._id) || 
    document.isPublic || 
    document.shared.some(share => share.user.equals(req.session.user._id));

  if (!hasAccess) {
    res.status(403);
    throw new Error('You do not have permission to view this document');
  }

  // Get the user's access level (view or edit)
  let accessMode = 'view';
  if (document.owner._id.equals(req.session.user._id)) {
    accessMode = 'edit';
  } else {
    const sharedAccess = document.shared.find(share => share.user.equals(req.session.user._id));
    if (sharedAccess && sharedAccess.access === 'edit') {
      accessMode = 'edit';
    }
  }

  res.render('documents/view', {
    title: document.title,
    document,
    user: req.session.user,
    accessMode,
    documentServerUrl: process.env.DOCUMENT_SERVER_URL || 'http://localhost:8000',
    
  });
});

// @desc    Delete a document
// @route   DELETE /documents/:id
// @access  Private (owner only)
const deleteDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id);
  
  // Check if document exists
  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  // Check if user is the owner
  if (!document.owner.equals(req.session.user._id)) {
    res.status(403);
    throw new Error('You do not have permission to delete this document');
  }

  // Delete the file
  if (fs.existsSync(document.path)) {
    fs.unlinkSync(document.path);
  }

  // Delete the document from the database
  await document.remove();

  res.redirect('/documents');
});

// @desc    Create a new document
// @route   GET /documents/create/:type
// @access  Private
const createDocument = asyncHandler(async (req, res) => {
  const { type } = req.params;
  
  // Validate document type
  const validTypes = ['docx', 'xlsx', 'pptx'];
  if (!validTypes.includes(type)) {
    res.status(400);
    throw new Error('Invalid document type. Supported types are docx, xlsx, and pptx.');
  }

  // Generate a filename based on type
  const typeMap = {
    'docx': 'Document',
    'xlsx': 'Spreadsheet',
    'pptx': 'Presentation',
  };
  
  const title = `New ${typeMap[type]}`;
  const filename = `${title}.${type}`;
  
  // Create an empty template file
  const key = uuidv4();
  const filePath = path.join(UPLOAD_DIR, `${key}.${type}`);
  
  // Create an empty file of the specified type
  // This is a simplified approach. In a real implementation, you would use
  // template files or a library to create proper Office files
  fs.writeFileSync(filePath, '');

  // Create a document record
  const document = await Document.create({
    title,
    filename,
    fileType: type,
    path: filePath,
    key,
    size: 0, // Empty file
    owner: req.session.user._id,
  });

  // Redirect to the document editor
  res.redirect(`/documents/${document._id}`);
});

// @desc    Share a document with other users
// @route   POST /documents/:id/share
// @access  Private (owner only)
const shareDocument = asyncHandler(async (req, res) => {
  const { email, access } = req.body;
  const document = await Document.findById(req.params.id);
  
  // Check if document exists
  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  // Check if user is the owner
  if (!document.owner.equals(req.session.user._id)) {
    res.status(403);
    throw new Error('You do not have permission to share this document');
  }

  // Find the user to share with
  const userToShare = await User.findOne({ email });
  if (!userToShare) {
    res.status(404);
    throw new Error('User not found');
  }

  // Check if the document is already shared with this user
  const alreadyShared = document.shared.some(share => share.user.equals(userToShare._id));
  
  if (alreadyShared) {
    // Update the access level
    await Document.updateOne(
      { _id: document._id, 'shared.user': userToShare._id },
      { $set: { 'shared.$.access': access } }
    );
  } else {
    // Add the user to the shared list
    await Document.updateOne(
      { _id: document._id },
      { $push: { shared: { user: userToShare._id, access } } }
    );
  }

  res.redirect(`/documents/${document._id}`);
});

export { 
  getDocuments, 
  getUploadForm, 
  uploadDocument, 
  viewDocument, 
  deleteDocument, 
  createDocument, 
  shareDocument 
};