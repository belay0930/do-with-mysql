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
    return res.status(404).json({ error: 1, message: 'Document not found' });
  }

  try {
    switch (status) {
      case 2: // Document saving
        if (!url) {
          console.error('No URL provided for saving the document.');
          return res.status(400).json({ error: 1, message: 'No URL provided for saving' });
        }

        console.log(`Saving document ${document.title} from URL: ${url}`);

        // Fetch the document from the provided URL
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.statusText}`);
        }

        // Convert response to buffer
        const buffer = await response.buffer();

        // Write new content directly to file
        fs.writeFileSync(document.path, buffer);

        console.log(`Document ${document.title} saved successfully.`);

        // Update document metadata
        await Document.findOneAndUpdate(
          { key },
          { status: 'ready', lastModified: new Date() }
        );

        break;

      case 4: // Document saving error
        console.error(`Error saving document ${document.title}.`);
        await Document.findOneAndUpdate(
          { key },
          { status: 'ready' }
        );
        break;

      default:
        console.log(`Callback received with status ${status} for document ${document.title}.`);
    }

    return res.json({ error: 0 });
  } catch (error) {
    console.error(`Error handling callback for document ${document.title}:`, error);

    // Reset document status to ready in case of any error
    await Document.findOneAndUpdate(
      { key },
      { status: 'ready' }
    );

    return res.status(500).json({ error: 1, message: 'Failed to handle callback' });
  }
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
  if (!document.owner._id.equals(req.session.user._id)) {
    return res.status(403).json({ error: 'Access denied' });
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
        key: document.key
      },
      user: {
        id: req.session.user._id.toString(),
        name: req.session.user.name,
      },
    },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '1h' }
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
        review: false,
        comment: false,
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
        forcesave: true,
        chat: false,
        comments: false,
        zoom: 100,
        showReviewChanges: false,
        trackChanges: false,
      },
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