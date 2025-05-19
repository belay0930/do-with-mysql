import asyncHandler from 'express-async-handler';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';
import Document from '../models/documentModel.js';

// @desc    OnlyOffice callback handler
// @route   POST /api/callback
// @access  Public (with JWT verification)
const handleCallback = asyncHandler(async (req, res) => {
  const { body } = req;
  const { key, status, url, users, actions } = body;

  console.log('Received callback from OnlyOffice Document Server:', body);

  // Find the document by key
  const document = await Document.findOne({ key });

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Handle different status updates from the document server
  switch (status) {
    case 1: // Document being edited
      console.log(`Document ${document.title} is being edited.`);
      // Track active users
      if (users && users.length > 0) {
        console.log(`Active users: ${users.map(u => u.name).join(', ')}`);
      }
      break;

    case 2: // Document saving
      console.log(`Document ${document.title} is being saved.`);
      if (url) {
        try {
          // Create a temporary file path for the new version
          const tempPath = `${document.path}.temp`;
          
          // Fetch and save the new version to temporary file
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch document: ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          fs.writeFileSync(tempPath, buffer);

          // Create a backup of the current version
          const backupPath = `${document.path}.${document.version}`;
          if (fs.existsSync(document.path)) {
            fs.copyFileSync(document.path, backupPath);
          }

          // Replace the current file with the new version
          fs.renameSync(tempPath, document.path);

          // Update document metadata
          const newVersion = document.version + 1;
          await Document.findByIdAndUpdate(document._id, {
            version: newVersion,
            lastModified: new Date(),
          });

          console.log(`Document saved successfully. New version: ${newVersion}`);
          
          // Return forced save result
          return res.json({
            error: 0,
            status: 'success',
            version: newVersion,
          });
        } catch (error) {
          console.error('Error saving document:', error);

          // Restore from backup if save failed
          const backupPath = `${document.path}.${document.version}`;
          if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, document.path);
          }

          return res.status(500).json({
            error: 1,
            message: 'Failed to save document',
          });
        }
      }
      break;

    case 3: // Document ready for saving
      console.log(`Document ${document.title} is ready for saving.`);
      break;

    case 4: // Document saving error
      console.error(`Error saving document ${document.title}.`);
      break;

    case 6: // Document being edited, but user has gone away
      console.log(`Users have gone away from ${document.title}`);
      break;

    case 7: // Document being edited, but user has expired
      console.log(`User session expired for ${document.title}`);
      break;

    default:
      console.log(`Unknown status (${status}) for document ${document.title}.`);
  }

  // Return success to OnlyOffice Document Server
  res.json({ error: 0 });
});

// @desc    Generate JWT for OnlyOffice integration
// @route   GET /api/config/:id
// @access  Private
const getEditorConfig = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const document = await Document.findById(id).populate('owner', 'name email');
  
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Check if user has access to the document
  const hasAccess = 
    document.owner._id.equals(req.session.user._id) || 
    document.isPublic || 
    document.shared.some(share => share.user.equals(req.session.user._id));

  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Determine if user has edit rights
  let mode = 'view';
  if (document.owner._id.equals(req.session.user._id)) {
    mode = 'edit';
  } else {
    const sharedAccess = document.shared.find(share => share.user.equals(req.session.user._id));
    if (sharedAccess && sharedAccess.access === 'edit') {
      mode = 'edit';
    }
  }

  // Get file extension without the leading dot
  const fileExt = document.fileType;

  // Determine the document type based on extension
  let documentType;
  switch (fileExt) {
    case 'docx':
    case 'doc':
    case 'txt':
      documentType = 'word';
      break;
    case 'xlsx':
    case 'xls':
    case 'csv':
      documentType = 'cell';
      break;
    case 'pptx':
    case 'ppt':
      documentType = 'slide';
      break;
    default:
      documentType = 'word';
  }

  // Generate a token for document server security
  const token = jwt.sign(
    {
      document: {
        key: document.key,
      },
      permissions: {
        edit: mode === 'edit',
      },
      user: {
        id: req.session.user._id.toString(),
        name: req.session.user.name,
      },
    },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '1d' }
  );

  // Build the configuration for OnlyOffice Document Server
  const config = {
    document: {
      fileType: fileExt,
      key: document.key,
      title: document.title,
      url: `${process.env.APP_URL || 'http://localhost:3000'}/api/documents/${document.key}/download`,
      permissions: {
        edit: mode === 'edit',
        download: true,
        review: true,
        comment: true,
        modifyFilter: true,
        modifyContentControl: true,
        fillForms: true,
      },
      info: {
        owner: document.owner.name,
        uploaded: document.createdAt,
      },
    },
    documentType,
    editorConfig: {
      mode,
      callbackUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/callback`,
      user: {
        id: req.session.user._id.toString(),
        name: req.session.user.name,
      },
      customization: {
        autosave: true,
        forcesave: true,
        chat: false,
        comments: false,
        zoom: 100,
        showReviewChanges: false,
        trackChanges: false,
      }
    },
    token,
  };

  res.json(config);
});

// @desc    Download document file
// @route   GET /api/documents/:key/download
// @access  Public (with token)
const downloadDocument = asyncHandler(async (req, res) => {
  const { key } = req.params;
  
  const document = await Document.findOne({ key });
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Check if file exists
  if (!fs.existsSync(document.path)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Set appropriate headers
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);

  // Stream the file
  const fileStream = fs.createReadStream(document.path);
  fileStream.pipe(res);
});

export { handleCallback, getEditorConfig, downloadDocument };