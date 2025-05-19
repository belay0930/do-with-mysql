import asyncHandler from 'express-async-handler';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import Document from '../models/documentModel.js';
import Docxtemplater from 'docxtemplater';
import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';

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
  const documents = await Document.find({ owner: req.session.user._id }).sort({ updatedAt: -1 });

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
// @access  Private
const viewDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id).populate('owner', 'name email');
  
  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  // Check if user owns the document
  if (!document.owner._id.equals(req.session.user._id)) {
    res.status(403);
    throw new Error('Access denied');
  }

  res.render('documents/view', {
    title: document.title,
    document,
    user: req.session.user,
    documentServerUrl: process.env.DOCUMENT_SERVER_URL || 'http://localhost:8000',
  });
});

// @desc    Delete a document
// @route   DELETE /documents/:id
// @access  Private
const deleteDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id);
  
  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  if (!document.owner.equals(req.session.user._id)) {
    res.status(403);
    throw new Error('Access denied');
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
  const { title } = req.query;
  
  if (!title) {
    res.status(400);
    throw new Error('Document title is required');
  }

  const validTypes = ['docx', 'xlsx', 'pptx'];
  
  if (!validTypes.includes(type)) {
    res.status(400);
    throw new Error('Invalid document type. Supported types are docx, xlsx, and pptx.');
  }

  const filename = `${title}.${type}`;
  const key = uuidv4();
  const filePath = path.join(UPLOAD_DIR, `${key}.${type}`);

  // Create the file based on type
  if (type === 'docx') {
    const templatePath = path.join(__dirname, '../templates/template.docx');
    const templateContent = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render({ title });
    const buffer = doc.getZip().generate({ type: 'nodebuffer' });
    fs.writeFileSync(filePath, buffer);
  } else if (type === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['Title', title]);
    await workbook.xlsx.writeFile(filePath);
  } else if (type === 'pptx') {
    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();
    slide.addText(title, { x: 1, y: 1, fontSize: 24 });
    await pptx.writeFile(filePath);
  }

  const document = await Document.create({
    title,
    filename,
    fileType: type,
    path: filePath,
    key,
    size: fs.statSync(filePath).size,
    owner: req.session.user._id,
  });

  res.redirect(`/documents/${document._id}`);
});

// @desc    Download a document
// @route   GET /documents/downloads/:id
// @access  Private
const downloadDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id);

  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  if (!document.owner.equals(req.session.user._id)) {
    res.status(403);
    throw new Error('Access denied');
  }

  const filePath = document.path;

  if (!fs.existsSync(filePath)) {
    res.status(404);
    throw new Error('File not found on server');
  }

  res.download(filePath, document.filename, (err) => {
    if (err) {
      console.error('Error during file download:', err);
      res.status(500).send('Error downloading the file');
    }
  });
});

export { 
  getDocuments, 
  getUploadForm, 
  uploadDocument, 
  viewDocument, 
  deleteDocument, 
  createDocument, 
  downloadDocument 
};