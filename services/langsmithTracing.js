const { traceable } = require('langsmith/traceable');

const DEFAULT_PROJECT = 'Multimodal document analyzer';
const DEFAULT_ENDPOINT = 'https://api.smith.langchain.com';

function configureLangSmith() {
  if (!process.env.LANGSMITH_PROJECT) {
    process.env.LANGSMITH_PROJECT = DEFAULT_PROJECT;
  }

  if (!process.env.LANGSMITH_ENDPOINT) {
    process.env.LANGSMITH_ENDPOINT = DEFAULT_ENDPOINT;
  }

  if (process.env.LANGSMITH_API_KEY && !process.env.LANGSMITH_TRACING) {
    process.env.LANGSMITH_TRACING = 'true';
  }

  if (process.env.LANGSMITH_TRACING && !process.env.LANGSMITH_TRACING_V2) {
    process.env.LANGSMITH_TRACING_V2 = process.env.LANGSMITH_TRACING;
  }
}

function isLangSmithEnabled() {
  configureLangSmith();
  return Boolean(process.env.LANGSMITH_API_KEY) && /^true$/i.test(String(process.env.LANGSMITH_TRACING || ''));
}

function getLangSmithStatus() {
  configureLangSmith();
  const configured = Boolean(process.env.LANGSMITH_API_KEY);
  const tracingEnabled = /^true$/i.test(String(process.env.LANGSMITH_TRACING || ''));

  return {
    configured,
    enabled: configured && tracingEnabled,
    project: process.env.LANGSMITH_PROJECT || DEFAULT_PROJECT,
    endpoint: process.env.LANGSMITH_ENDPOINT || DEFAULT_ENDPOINT
  };
}

async function traceOperation(name, runType, inputs, handler, options = {}) {
  if (!isLangSmithEnabled()) {
    return handler(inputs);
  }

  const traced = traceable(
    async (payload) => handler(payload),
    {
      name,
      run_type: runType,
      project_name: process.env.LANGSMITH_PROJECT || DEFAULT_PROJECT,
      tags: ['claritydocs', ...(options.tags || [])],
      metadata: {
        app: 'ClarityDocs AI',
        ...options.metadata
      },
      processInputs: options.processInputs || sanitizeInputs,
      processOutputs: options.processOutputs || sanitizeOutputs
    }
  );

  return traced(inputs);
}

async function traceGeminiCall(name, prompt, handler, metadata = {}) {
  return traceOperation(
    name,
    'llm',
    {
      model: metadata.model || 'gemini-2.0-flash',
      prompt
    },
    async ({ prompt: promptText }) => handler(promptText),
    {
      tags: ['gemini'],
      metadata,
      processInputs: (input) => ({
        model: input.model,
        promptPreview: previewText(input.prompt),
        promptChars: String(input.prompt || '').length
      }),
      processOutputs: (output) => ({
        responsePreview: previewText(output),
        responseChars: String(output || '').length
      })
    }
  );
}

function sanitizeInputs(input) {
  if (typeof input === 'string') {
    return sanitizeTextRecord(input);
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInputs);
  }

  if (!input || typeof input !== 'object') {
    return input;
  }

  return Object.entries(input).reduce((acc, [key, value]) => {
    if (isLargeTextKey(key) || (typeof value === 'string' && value.length > 800)) {
      acc[key] = sanitizeTextRecord(value);
    } else {
      acc[key] = sanitizeInputs(value);
    }
    return acc;
  }, {});
}

function sanitizeOutputs(output) {
  if (typeof output === 'string') {
    return sanitizeTextRecord(output);
  }

  if (Array.isArray(output)) {
    return output.slice(0, 20).map(sanitizeOutputs);
  }

  if (!output || typeof output !== 'object') {
    return output;
  }

  return Object.entries(output).reduce((acc, [key, value]) => {
    if (isLargeTextKey(key) || (typeof value === 'string' && value.length > 800)) {
      acc[key] = sanitizeTextRecord(value);
    } else if (Array.isArray(value)) {
      acc[key] = value.slice(0, 20).map(sanitizeOutputs);
    } else {
      acc[key] = sanitizeOutputs(value);
    }
    return acc;
  }, {});
}

function isLargeTextKey(key) {
  return /text|prompt|document|content|response|summary|studyPlan/i.test(key);
}

function sanitizeTextRecord(text) {
  const value = String(text || '');
  return {
    preview: previewText(value),
    chars: value.length
  };
}

function previewText(text, limit = 500) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

configureLangSmith();

module.exports = {
  configureLangSmith,
  getLangSmithStatus,
  isLangSmithEnabled,
  traceGeminiCall,
  traceOperation
};
