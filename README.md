# Multimodal Document Analyzer Backend

Express backend for the Multimodal Document Analyzer project.

## Local Development

```bash
npm install
npm start
```

Configure environment variables from `.env.example`.

## API Base

The API is served under:

```text
/api
```

## Vercel Deployment

Set these environment variables in Vercel:

```bash
MONGODB_URI=mongodb+srv://...
GEMINI_API_KEY=...
CORS_ORIGIN=https://your-frontend-domain.vercel.app
ALLOW_LOCAL_DB_FALLBACK=false
LANGSMITH_TRACING=true
LANGSMITH_TRACING_V2=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_PROJECT=Multimodal document analyzer
LANGSMITH_API_KEY=...
```

The Vercel entrypoint is `api/index.js`.
