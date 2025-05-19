import mongoose from 'mongoose';

const documentSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    filename: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      required: true,
      enum: ['docx', 'xlsx', 'pptx', 'txt', 'pdf'],
    },
    path: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      required: true,
      unique: true,
    },
    size: {
      type: Number,
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    lastModified: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['ready', 'editing', 'saving'],
      default: 'ready'
    },
    activeUsers: [{
      type: String
    }],
    lockToken: {
      type: String,
      default: null
    },
    lockExpiresAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
  }
);

// Add index for faster lookups
documentSchema.index({ key: 1 });
documentSchema.index({ owner: 1 });

const Document = mongoose.model('Document', documentSchema);

export default Document;