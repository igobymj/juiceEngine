const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

// Persist juice-editor state to disk. index.js loads this at startup so
// configured effects survive reloads / restarts.
const JUICE_FILE = path.join(__dirname, 'public', 'scripts', 'data', 'juice.json');

app.post('/api/juice', (req, res) => {
  try {
    fs.mkdirSync(path.dirname(JUICE_FILE), { recursive: true });
    fs.writeFileSync(JUICE_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.listen(port, () => {
  console.log(`juiceEngine running at http://localhost:${port}`);
});
