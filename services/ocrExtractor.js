const Tesseract = require('tesseract.js');
const fs = require('fs');

/**
 * Extract text from image using OCR
 * @param {string} filePath - Path to image file
 * @returns {Promise<{text: string}>}
 */
async function extractFromImage(filePath) {
  try {
    const result = await Tesseract.recognize(filePath, 'eng', {
      logger: () => {} // Suppress logging
    });
    
    return {
      text: result.data.text
    };
  } catch (error) {
    console.error('OCR extraction error:', error.message);
    throw new Error(`Failed to extract text from image: ${error.message}`);
  }
}

/**
 * Extract text from image buffer
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<{text: string}>}
 */
async function extractFromImageBuffer(buffer) {
  try {
    const result = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {}
    });
    
    return {
      text: result.data.text
    };
  } catch (error) {
    console.error('OCR extraction error:', error.message);
    throw new Error(`Failed to extract text from image buffer: ${error.message}`);
  }
}

/**
 * Extract text from image with confidence scores
 * @param {string} filePath - Path to image file
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function extractWithConfidence(filePath) {
  try {
    const result = await Tesseract.recognize(filePath, 'eng', {
      logger: () => {}
    });
    
    return {
      text: result.data.text,
      confidence: result.data.confidence
    };
  } catch (error) {
    console.error('OCR extraction error:', error.message);
    throw new Error(`Failed to extract text from image: ${error.message}`);
  }
}

module.exports = {
  extractFromImage,
  extractFromImageBuffer,
  extractWithConfidence
};