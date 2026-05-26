const { GoogleGenerativeAI } = require('@google/generative-ai');
const { traceGeminiCall, traceOperation } = require('./langsmithTracing');
const { chunkText, safeJsonParse } = require('../utils/helpers');

// Initialize Gemini client
let genAI = null;
let aiDisabledReason = '';

/**
 * Initialize the Gemini AI client
 */
function initializeGemini() {
  if (aiDisabledReason) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    aiDisabledReason = 'GEMINI_API_KEY is not configured';
    console.warn(`${aiDisabledReason}. Using local fallback analysis.`);
    return null;
  }
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

/**
 * Check if AI is available
 */
function isAiAvailable() {
  if (aiDisabledReason) return false;
  return genAI !== null || initializeGemini() !== null;
}

function getAiStatus() {
  const available = isAiAvailable();
  return {
    available,
    provider: available ? 'gemini' : 'local-fallback',
    reason: available ? '' : aiDisabledReason || 'AI provider unavailable'
  };
}

/**
 * Get Gemini model
 */
function getModel() {
  if (!genAI) {
    initializeGemini();
  }
  if (!genAI) {
    throw new Error('AI not configured. Please set GEMINI_API_KEY in environment variables.');
  }
  return genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

// Base prompt template for analysis
const ANALYSIS_PROMPT = `You are a document analysis expert. Analyze the following document text and provide a comprehensive analysis in JSON format.

Return ONLY valid JSON with this exact structure:
{
  "title": "Document title or topic",
  "documentType": "invoice|resume|report|notes|research paper|legal document|assignment|form|receipt|other",
  "summary": "A brief 2-3 sentence summary",
  "detailedSummary": "A detailed paragraph explaining main points",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "importantTerms": [{"term": "term", "definition": "definition"}],
  "actionItems": ["action 1", "action 2"],
  "dates": ["any dates mentioned"],
  "people": ["names of people mentioned"],
  "amounts": ["money amounts if any"],
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "tablesDetected": [{"rows": [["cell1", "cell2"], ["cell3", "cell4"]]}],
  "studyNotes": "Generated study notes",
  "flashcards": [{"question": "Q", "answer": "A"}],
  "quizQuestions": [{"question": "Q", "options": ["A", "B", "C", "D"], "answer": "A", "explanation": "why"}],
  "possibleQuestions": ["question1", "question2"]
}

Document text:
`;

/**
 * Analyze document text using Gemini API
 * @param {string} text - Extracted document text
 * @returns {Promise<Object>}
 */
async function analyzeDocument(text) {
  return traceOperation(
    'DocuMind Analyze Document',
    'chain',
    { text },
    async ({ text: documentText }) => analyzeDocumentCore(documentText),
    {
      tags: ['analysis'],
      metadata: { operation: 'document-analysis' }
    }
  );
}

async function analyzeDocumentCore(text) {
  if (!isAiAvailable()) {
    // Return minimal analysis if AI is not available
    return getBasicAnalysis(text);
  }
  
  const model = getModel();
  
  try {
    // Chunk large texts before sending to AI
    const chunks = chunkText(text, 15000);
    
    let fullAnalysis = {};
    
    // Process chunks - for simplicity, analyze the largest chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const prompt = ANALYSIS_PROMPT + chunk;
      const response = await traceGeminiCall(
        'Gemini Analyze Chunk',
        prompt,
        async (promptText) => {
          const result = await model.generateContent(promptText);
          return result.response.text();
        },
        {
          operation: 'document-analysis',
          chunkIndex: i + 1,
          chunkCount: chunks.length,
          model: 'gemini-2.0-flash'
        }
      );
      
      // Parse JSON from response
      const parsed = parseAiResponse(response);
      
      if (i === 0) {
        fullAnalysis = parsed;
      } else {
        // Merge additional analysis
        fullAnalysis = mergeAnalyses(fullAnalysis, parsed);
      }
    }
    
    return fullAnalysis;
  } catch (error) {
    if (!markAiUnavailable(error)) {
      console.error('AI analysis error:', error.message);
    }
    // Return basic analysis on error
    return getBasicAnalysis(text);
  }
}

/**
 * Parse AI response to extract JSON
 */
function parseAiResponse(responseText) {
  // Try to find JSON in the response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return safeJsonParse(jsonMatch[0], getDefaultAnalysis());
  }
  return getDefaultAnalysis();
}

/**
 * Get default analysis structure
 */
function getDefaultAnalysis() {
  return {
    title: '',
    documentType: 'other',
    summary: '',
    detailedSummary: '',
    keyPoints: [],
    importantTerms: [],
    actionItems: [],
    dates: [],
    people: [],
    amounts: [],
    keywords: [],
    tablesDetected: [],
    studyNotes: '',
    flashcards: [],
    quizQuestions: [],
    possibleQuestions: []
  };
}

/**
 * Basic analysis when AI is unavailable
 */
function getBasicAnalysis(text) {
  const value = normalizeDocumentText(text);
  const words = value.split(/\s+/).filter(w => w.length > 0);
  const sentences = splitSentences(value);
  
  // Find potential dates (simple patterns)
  const datePatterns = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b|\b\w+ \d{1,2},? \d{4}\b/gi;
  const dates = (value.match(datePatterns) || []).slice(0, 10);
  
  // Find potential money amounts
  const amountPattern = /\$[\d,]+\.?\d*/gi;
  const amounts = (value.match(amountPattern) || []).slice(0, 10);
  
  const keywords = getKeywordSignals(value, 12);
  const title = inferTitle(value, keywords);
  const summary = sentences.slice(0, 3).join(' ') || value.substring(0, 300);
  const detailedSummary = sentences.slice(0, 8).join(' ') || value.substring(0, 1000);
  
  return {
    title,
    documentType: inferDocumentType(value),
    summary,
    detailedSummary,
    keyPoints: [
      `Document contains approximately ${words.length} words`,
      dates.length ? `Dates mentioned: ${dates.slice(0, 3).join(', ')}` : null,
      amounts.length ? `Amounts mentioned: ${amounts.slice(0, 3).join(', ')}` : null,
      keywords.length ? `Top keywords: ${keywords.slice(0, 5).join(', ')}` : null
    ].filter(Boolean),
    importantTerms: [],
    actionItems: [],
    dates: dates,
    people: [],
    amounts: amounts,
    keywords: keywords,
    tablesDetected: [],
    studyNotes: 'Local fallback analysis is active. Configure Gemini for deeper semantic analysis.',
    flashcards: [],
    quizQuestions: [],
    possibleQuestions: []
  };
}

/**
 * Merge analyses from multiple chunks
 */
function mergeAnalyses(a, b) {
  const merged = { ...getDefaultAnalysis(), ...a };
  
  // Combine arrays and remove duplicates
  if (b.keyPoints) {
    merged.keyPoints = [...new Set([...merged.keyPoints, ...b.keyPoints])];
  }
  if (b.keywords) {
    merged.keywords = [...new Set([...merged.keywords, ...b.keywords])];
  }
  if (b.dates) {
    merged.dates = [...new Set([...merged.dates, ...b.dates])];
  }
  if (b.amounts) {
    merged.amounts = [...new Set([...merged.amounts, ...b.amounts])];
  }
  
  return merged;
}

/**
 * Answer a question about a document
 * @param {string} text - Document text
 * @param {string} question - User's question
 * @returns {Promise<string>}
 */
async function askQuestion(text, question) {
  return traceOperation(
    'DocuMind Ask Document Question',
    'chain',
    { text, question },
    async ({ text: documentText, question: userQuestion }) => askQuestionCore(documentText, userQuestion),
    {
      tags: ['chat'],
      metadata: { operation: 'document-chat' }
    }
  );
}

async function askQuestionCore(text, question) {
  if (!isAiAvailable()) {
    return getBasicAnswer(text, question);
  }
  
  const model = getModel();
  
  const prompt = `Based on the following document, answer this question: "${question}"

Document:
${text.substring(0, 10000)}

Provide a clear, concise answer.`;
  
  try {
    return await traceGeminiCall(
      'Gemini Answer Document Question',
      prompt,
      async (promptText) => {
        const result = await model.generateContent(promptText);
        return result.response.text();
      },
      {
        operation: 'document-chat',
        model: 'gemini-2.0-flash'
      }
    );
  } catch (error) {
    if (!markAiUnavailable(error)) {
      console.error('Question answering error:', error.message);
    }
    return getBasicAnswer(text, question);
  }
}

function normalizeDocumentText(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => sentence.length > 3);
}

function inferTitle(text, keywords) {
  const firstLine = String(text || '').split(/\n/).map((line) => line.trim()).find(Boolean);
  if (firstLine && firstLine.length <= 90) return firstLine;
  if (keywords.length) return keywords.slice(0, 5).join(' ');
  return 'Untitled document';
}

function inferDocumentType(text) {
  const value = String(text || '').toLowerCase();
  if (/invoice|subtotal|total due|amount due|bill to/.test(value)) return 'invoice';
  if (/receipt|paid|transaction|payment/.test(value)) return 'receipt';
  if (/resume|curriculum vitae|experience|skills|education/.test(value)) return 'resume';
  if (/abstract|references|methodology|literature review/.test(value)) return 'research paper';
  if (/agreement|contract|whereas|party|terms and conditions/.test(value)) return 'legal document';
  if (/report|executive summary|findings|recommendations/.test(value)) return 'report';
  if (/notes|lecture|chapter|study/.test(value)) return 'notes';
  return 'other';
}

function getKeywordSignals(text, limit = 12) {
  const stopWords = new Set([
    'about', 'after', 'again', 'also', 'because', 'before', 'between', 'could', 'document',
    'from', 'have', 'into', 'more', 'other', 'should', 'than', 'that', 'their', 'there',
    'these', 'this', 'through', 'with', 'would', 'your', 'will', 'were', 'been'
  ]);

  const counts = String(text || '')
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g);

  return Object.entries((counts || []).reduce((acc, word) => {
    if (!stopWords.has(word)) acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function markAiUnavailable(error) {
  const message = error?.message || String(error || '');
  const isAvailabilityError = /429|quota|Too Many Requests|API key|API_KEY|billing|permission|unauthorized|forbidden/i.test(message);

  if (!isAvailabilityError) {
    return false;
  }

  if (!aiDisabledReason) {
    aiDisabledReason = summarizeAiError(message);
    genAI = null;
    console.warn(`Gemini unavailable (${aiDisabledReason}). Using local fallback analysis.`);
  }

  return true;
}

function summarizeAiError(message) {
  if (/429|quota|Too Many Requests/i.test(message)) return 'quota exceeded';
  if (/API key|API_KEY|unauthorized|forbidden|permission/i.test(message)) return 'invalid or unauthorized API key';
  if (/billing/i.test(message)) return 'billing issue';
  return 'provider request failed';
}

function getBasicAnswer(text, question) {
  const value = String(text || '').replace(/\uFEFF/g, '').trim();
  const prompt = String(question || '').toLowerCase();

  if (!value) {
    return 'No extracted text is available for this document.';
  }

  const amounts = value.match(/\$[\d,]+(?:\.\d{1,2})?/g) || [];
  if (/(amount|price|cost|money|total|paid|payment)/.test(prompt) && amounts.length > 0) {
    return `The document mentions ${amounts.join(', ')}.`;
  }

  const dates = value.match(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b[A-Z][a-z]+ \d{1,2},? \d{4}\b/g) || [];
  if (/(date|when|day|year)/.test(prompt) && dates.length > 0) {
    return `The document mentions ${dates.join(', ')}.`;
  }

  const sentences = value
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const keywords = prompt
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3);
  const matchingSentence = sentences.find((sentence) =>
    keywords.some((word) => sentence.toLowerCase().includes(word))
  );

  if (matchingSentence) {
    return matchingSentence;
  }

  return sentences[0] || value.slice(0, 300);
}

/**
 * Generate study plan from document
 * @param {string} text - Document text
 * @returns {Promise<string>}
 */
async function generateStudyPlan(text) {
  return traceOperation(
    'DocuMind Generate Study Plan',
    'chain',
    { text },
    async ({ text: documentText }) => generateStudyPlanCore(documentText),
    {
      tags: ['study-plan'],
      metadata: { operation: 'study-plan' }
    }
  );
}

async function generateStudyPlanCore(text) {
  if (!isAiAvailable()) {
    const analysis = getBasicAnalysis(text);
    return [
      'Local Study Plan',
      '',
      '1. Review the summary and extracted text.',
      `2. Focus on these keywords: ${analysis.keywords.slice(0, 8).join(', ') || 'No keywords detected'}.`,
      `3. Revisit these key points: ${analysis.keyPoints.join(' ')}`,
      '4. Configure Gemini for a deeper AI-generated study plan.'
    ].join('\n');
  }
  
  const model = getModel();
  
  const prompt = `Based on this document, create a study plan:

${text.substring(0, 10000)}

Create a structured study plan with:
1. Learning objectives
2. Key topics to focus on
3. Recommended study order
4. Time estimates for each section

Format as a clear, organized plan.`;
  
  try {
    return await traceGeminiCall(
      'Gemini Generate Study Plan',
      prompt,
      async (promptText) => {
        const result = await model.generateContent(promptText);
        return result.response.text();
      },
      {
        operation: 'study-plan',
        model: 'gemini-2.0-flash'
      }
    );
  } catch (error) {
    console.error('Study plan error:', error.message);
    return 'Could not generate study plan. Please try again.';
  }
}

// Initialize on module load
initializeGemini();

module.exports = {
  analyzeDocument,
  askQuestion,
  generateStudyPlan,
  isAiAvailable,
  getAiStatus,
  getModel,
  markAiUnavailable,
  getDefaultAnalysis,
  initializeGemini
};
