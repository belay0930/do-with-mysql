import asyncHandler from 'express-async-handler';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import Document from '../models/documentModel.js';

// @desc    OnlyOffice callback handler
// @route   POST /api/callback
// @access  Public
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
          // Fetch the document from the provided URL
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch document: ${response.statusText}`);
          }

          // Convert arrayBuffer to Buffer
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Save the new version
          fs.writeFileSync(document.path, buffer);
          console.log('Document saved successfully');
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

// @desc    Generate config for OnlyOffice editor
// @route   GET /api/config/:id
// @access  Private
const getEditorConfig = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const document = await Document.findById(id).populate('owner', 'name email');
  
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
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
      info: {
        owner: document.owner.name,
        uploaded: document.createdAt
      },
      permissions: {
        edit: true,
        download: true,
        review: true,
        comment: true,
        modifyFilter: true,
        modifyContentControl: true,
        fillForms: true,
      },
    },
    documentType,
    editorConfig: {
      mode: 'edit',
      callbackUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/callback`,
      user: {
        id: req.session.user._id.toString(),
        name: req.session.user.name,
      },
      customization: {
        autosave: true,
        comments: true,
        zoom: 100,
      },
    },
    token,
  };

  res.json(config);
});

// @desc    Download document file
// @route   GET /api/documents/:key/download
// @access  Public
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