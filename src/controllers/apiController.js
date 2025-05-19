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
    return res.status(404).json({ error: 1, message: 'Document not found' });
  }

  // Handle different status updates from the document server
  switch (status) {
    case 1: // Document being edited
      try {
        await Document.findOneAndUpdate(
          { key },
          { 
            status: 'editing',
            activeUsers: users || [],
            lastModified: new Date()
          }
        );
        console.log(`Document ${document.title} is being edited.`);
        if (users && users.length > 0) {
          console.log('Active users:', users.join(', '));
        }
      } catch (error) {
        console.error('Error updating document status:', error);
      }
      break;

    case 2: // Document saving
      if (!url) {
        return res.status(400).json({ error: 1, message: 'No URL provided for saving' });
      }

      try {
        // Update document status to saving
        await Document.findOneAndUpdate(
          { key },
          { status: 'saving' }
        );

        console.log(`Document ${document.title} is being saved.`);

        // Create temporary and backup paths
        const tempPath = `${document.path}.tmp`;
        const backupPath = `${document.path}.backup`;

        // Fetch the document from the provided URL
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.statusText}`);
        }

        // Convert response to buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Create backup of current file
        if (fs.existsSync(document.path)) {
          fs.copyFileSync(document.path, backupPath);
        }

        // Write new content to temporary file
        fs.writeFileSync(tempPath, buffer);

        // Atomic rename operation
        fs.renameSync(tempPath, document.path);

        // Update document metadata with atomic version increment
        const updatedDoc = await Document.findOneAndUpdate(
          { key },
          { 
            $inc: { version: 1 },
            status: 'ready',
            lastModified: new Date(),
            activeUsers: []
          },
          { new: true }
        );

        // Clean up backup file
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }

        console.log(`Document saved successfully. New version: ${updatedDoc.version}`);
        return res.json({ 
          error: 0,
          status: 'success',
          version: updatedDoc.version
        });

      } catch (error) {
        console.error('Error saving document:', error);

        // Restore from backup if available
        const backupPath = `${document.path}.backup`;
        if (fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, document.path);
        }

        // Clean up temporary file
        const tempPath = `${document.path}.tmp`;
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }

        // Reset document status
        await Document.findOneAndUpdate(
          { key },
          { status: 'ready' }
        );

        return res.status(500).json({ 
          error: 1,
          message: 'Failed to save document'
        });
      }

    case 3: // Document ready for saving
      console.log(`Document ${document.title} is ready for saving.`);
      break;

    case 4: // Document saving error
      console.error(`Error saving document ${document.title}.`);
      await Document.findOneAndUpdate(
        { key },
        { status: 'ready' }
      );
      break;

    case 6: // Document being edited, but user has gone away
      console.log(`Users have gone away from ${document.title}`);
      await Document.findOneAndUpdate(
        { key },
        { 
          status: 'ready',
          activeUsers: []
        }
      );
      break;

    case 7: // Document being edited, but user has expired
      console.log(`User session expired for ${document.title}`);
      await Document.findOneAndUpdate(
        { key },
        { 
          status: 'ready',
          activeUsers: []
        }
      );
      break;

    default:
      console.log(`Unknown status (${status}) for document ${document.title}.`);
  }

  return res.json({ error: 0 });
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
        key: document.key,
        version: document.version
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
        uploaded: document.createdAt,
        version: document.version,
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