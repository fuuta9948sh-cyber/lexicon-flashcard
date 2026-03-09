import fetch from 'node-fetch';

async function run() {
  const apiKey = process.env.GEMINI_API_KEY || "test";
  
  const payload = {
    contents: [{ parts: [{ text: "Hello" }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { greeting: { type: "STRING" } } }
    }
  };
  
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
  });
  
  const data = await res.json();
  console.log(res.status, JSON.stringify(data, null, 2));
}

run();
