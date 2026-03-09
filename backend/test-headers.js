import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ allowedHeaders: ['Content-Type', 'Authorization', 'x-gemini-api-key'] }));

app.post('/api/test', (req, res) => {
  console.log('Received headers:', req.headers);
  res.json({ headers: req.headers });
});

app.listen(3002, () => console.log('Test server on 3002'));
