import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization', 'x-gemini-api-key'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '10mb' })); // ensure large payloads can be handled

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set in .env!");
}

app.get('/api/debug-info', (req, res) => {
  res.json({
    headers: req.headers,
    method: req.method,
    url: req.url,
    env_has_gemini_key: !!process.env.GEMINI_API_KEY,
    node_version: process.version
  });
});

const handleGeminiRequest = async (req, res) => {
  try {
    const userApiKey = req.headers['x-gemini-api-key'];
    const apiKeyToUse = userApiKey || GEMINI_API_KEY;

    if (!apiKeyToUse) {
      return res.status(401).json({ error: "API Key is required but not provided." });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyToUse}`;
    console.log(`[DEBUG] Calling Gemini API Endpoint: ${endpoint.substring(0, endpoint.indexOf('key=') + 4)}***${apiKeyToUse.slice(-4)}`);

    // Log whether it is using the user's key or the fallback server key
    console.log(`[DEBUG] Using user-provided API key: ${!!userApiKey}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    console.log(`[DEBUG] Gemini API Response Status: ${response.status} ${response.statusText}`);
    const data = await response.json();

    // Gemini API often returns 200 even with errors inside the payload (e.g. invalid auth formats), or 400 for bad keys
    if (!response.ok) {
      console.error("[DEBUG] Gemini API Error Response:", JSON.stringify(data, null, 2));
      return res.status(response.status).json({
        error: data.error?.message || "Google Gemini API returned an error.",
        details: data
      });
    }

    res.json(data);
  } catch (error) {
    console.error("Internal Server Error:", error);
    res.status(500).json({ error: "Internal server error connecting to Gemini API.", details: error.message });
  }
};

app.post('/api/generate-word', handleGeminiRequest);
app.post('/api/generate-quiz', handleGeminiRequest);
app.post('/api/generate-audio', async (req, res) => {
  try {
    const userApiKey = req.headers['x-gemini-api-key'];
    const apiKeyToUse = userApiKey || GEMINI_API_KEY;

    if (!apiKeyToUse) {
      return res.status(401).json({ error: "API Key is required but not provided." });
    }

    // Audio generation uses a different model
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKeyToUse}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini Audio API Error Response:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Google Gemini API returned an error.",
        details: data
      });
    }
    res.json(data);
  } catch (error) {
    console.error("Internal Server Error (Audio):", error);
    res.status(500).json({ error: "Internal server error connecting to Gemini Audio API.", details: error.message });
  }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
  });
}

export default app;
