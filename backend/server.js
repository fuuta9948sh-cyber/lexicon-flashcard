import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Allow CORS from frontend
app.use(cors());
app.use(express.json({ limit: '10mb' })); // ensure large payloads can be handled

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set in .env!");
}

app.post('/api/generate-word', async (req, res) => {
  try {
    const userApiKey = req.headers['x-gemini-api-key'];
    const apiKeyToUse = userApiKey || GEMINI_API_KEY;

    if (!apiKeyToUse) {
      return res.status(401).json({ error: "API Key is required but not provided in headers or environment." });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyToUse}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error("Error internally:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-quiz', async (req, res) => {
  try {
    const userApiKey = req.headers['x-gemini-api-key'];
    const apiKeyToUse = userApiKey || GEMINI_API_KEY;

    if (!apiKeyToUse) {
      return res.status(401).json({ error: "API Key is required but not provided in headers or environment." });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyToUse}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error("Error internally:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-audio', async (req, res) => {
  try {
    const userApiKey = req.headers['x-gemini-api-key'];
    const apiKeyToUse = userApiKey || GEMINI_API_KEY;

    if (!apiKeyToUse) {
      return res.status(401).json({ error: "API Key is required but not provided in headers or environment." });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyToUse}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error("Error internally:", error);
    res.status(500).json({ error: error.message });
  }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
  });
}

export default app;
