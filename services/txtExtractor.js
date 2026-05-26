const fs = require('fs');
const path = require('path');

/**
 * Extract text from TXT file
 * @param {string} filePath - Path to TXT file
 * @returns {Promise<{text: string, pageCount: number}>}
 */
async function extractFromTxt(filePath) {
  try {
    const text = decodeTextBuffer(fs.readFileSync(filePath));
    
    return {
      text: text,
      pageCount: 1
    };
  } catch (error) {
    console.error('TXT extraction error:', error.message);
    throw new Error(`Failed to extract text from TXT: ${error.message}`);
  }
}

/**
 * Extract text from TXT buffer
 * @param {Buffer} buffer - TXT buffer
 * @returns {Promise<{text: string, pageCount: number}>}
 */
async function extractFromTxtBuffer(buffer) {
  try {
    const text = decodeTextBuffer(buffer);
    
    return {
      text: text,
      pageCount: 1
    };
  } catch (error) {
    console.error('TXT extraction error:', error.message);
    throw new Error(`Failed to extract text from TXT buffer: ${error.message}`);
  }
}

function decodeTextBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return '';

  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString('utf16le').replace(/^\uFEFF/, '');
    }

    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return swapUtf16Bytes(buffer.subarray(2)).toString('utf16le').replace(/^\uFEFF/, '');
    }
  }

  const sampleLength = Math.min(buffer.length, 200);
  let oddNulls = 0;
  let evenNulls = 0;

  for (let i = 0; i < sampleLength; i += 1) {
    if (buffer[i] === 0) {
      if (i % 2 === 0) evenNulls += 1;
      else oddNulls += 1;
    }
  }

  if (oddNulls > sampleLength * 0.2 && oddNulls > evenNulls * 2) {
    return buffer.toString('utf16le').replace(/^\uFEFF/, '');
  }

  if (evenNulls > sampleLength * 0.2 && evenNulls > oddNulls * 2) {
    return swapUtf16Bytes(buffer).toString('utf16le').replace(/^\uFEFF/, '');
  }

  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function swapUtf16Bytes(buffer) {
  const output = Buffer.from(buffer);
  for (let i = 0; i + 1 < output.length; i += 2) {
    const current = output[i];
    output[i] = output[i + 1];
    output[i + 1] = current;
  }
  return output;
}

/**
 * Count estimated pages based on character count
 * @param {string} text - Text content
 * @returns {number}
 */
function estimatePageCount(text) {
  const CHARS_PER_PAGE = 3000;
  const pages = Math.ceil(text.length / CHARS_PER_PAGE);
  return Math.max(1, pages);
}

module.exports = {
  extractFromTxt,
  extractFromTxtBuffer,
  estimatePageCount
};
