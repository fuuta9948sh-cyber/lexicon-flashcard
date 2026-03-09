import fetch from 'node-fetch';

async function testGeneration() {
  const payload = {
    contents: [{ parts: [{ text: "単語: apple\n例文の指定: AIによる自動生成" }] }],
    systemInstruction: { parts: [{ text: "あなたは優秀なアシスタントです" }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          word: { type: "STRING" }
        }
      }
    }
  };

  try {
    const res = await fetch(`http://localhost:3001/api/generate-word`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gemini-api-key': 'INVALID_KEY_TEST'
      },
      body: JSON.stringify(payload)
    });

    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Fetch Error:", e);
  }
}

testGeneration();
