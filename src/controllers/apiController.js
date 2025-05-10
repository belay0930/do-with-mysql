import asyncHandler from 'express-async-handler';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import Document from '../models/documentModel.js';

// @desc    OnlyOffice callback handler
// @route   POST /api/callback
// @access  Public (with JWT verification)
const handleCallback = asyncHandler(async (req, res) => {
  const { body } = req;
  const { key, status, url } = body;

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
      break;
      
    case 2: // Document saving
      console.log(`Document ${document.title} is being saved.`);
      if (url) {
        try {
          // Save the document from the provided URL
          // This would typically involve downloading the file and saving it
          console.log(`Document should be saved from: ${url}`);
          
          // Increment version number
          await Document.findByIdAndUpdate(document._id, {
            version: document.version + 1,
            lastModified: new Date(),
          });
        } catch (error) {
          console.error('Error saving document:', error);
          return res.status(500).json({ error: 'Failed to save document' });
        }
      }
      break;
      
    case 3: // Document ready for saving
      console.log(`Document ${document.title} is ready for saving.`);
      break;
    case 4: // Document saving error
      console.error(`Error saving document ${document.title}.`);
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
  const document = await Document.findById(id);
  
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Check if user has access to the document
  const hasAccess = 
    document.owner.equals(req.session.user._id) || 
    document.isPublic || 
    document.shared.some(share => share.user.equals(req.session.user._id));

  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Determine if user has edit rights
  let mode = 'view';
  if (document.owner.equals(req.session.user._id)) {
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
    },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '1d' }
  );
  const callbackUrl = `${process.env.APP_URL}/api/callback`;

  // Build the configuration for OnlyOffice Document Server
  const config = {
    document: {
      fileType: fileExt,
      key: document.key,
      title: document.title,
      url: `${process.env.APP_URL}/uploads/${document.key}.${fileExt}`, // Use APP_URL
    },
    documentType,
    editorConfig: {
      mode,
      callbackUrl: callbackUrl,
      user: {
        id: req.session.user._id.toString(),
        name: req.session.user.name,
      },
      customization: {
        chat: true,
        comments: true,
        compactHeader: false,
        compactToolbar: false,
        forceSave: true,
        submitForm: false,
      },
    },
    token,
  };

  res.json(config);
});

export { handleCallback, getEditorConfig };