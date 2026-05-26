const multer = require('multer');
const path = require('path');
const { generateUniqueFilename, validateFileType, validateFileSize, getFileExtension } = require('../utils/helpers');

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = generateUniqueFilename(file.originalname);
    cb(null, uniqueName);
  }
});

// File filter for validation
const fileFilter = (req, file, cb) => {
  const ext = getFileExtension(file.originalname);

  if (!validateFileType(file.originalname)) {
    const error = new Error(`Unsupported file type: ${ext}. Allowed types: PDF, DOCX, TXT, JPG, JPEG, PNG`);
    error.code = 'UNSUPPORTED_FILE_TYPE';
    return cb(error, false);
  }
  
  // `file.size` may be undefined at this stage; rely on multer `limits.fileSize`.
  if (typeof file.size === 'number' && !validateFileSize(file.size)) {
    const error = new Error(`File too large. Maximum size is 10MB`);
    // Use multer's limit code so error handling middleware can detect it
    error.code = 'LIMIT_FILE_SIZE';
    return cb(error, false);
  }
  
  cb(null, true);
};

// Create multer upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * Handle file upload using memory storage for processing ease
 * We'll save to disk after processing
 */
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

module.exports = { upload, uploadMemory };