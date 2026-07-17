const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'public', 'scripts', 'data');

// Persist any settings namespace to public/scripts/data/<name>.json. The name
// is sanitised to a safe slug so it can't escape the data directory.
function writeConfig(name, body, res) {
  const slug = String(name).replace(/[^a-z0-9_-]/gi, '');
  if (!slug) return res.status(400).json({ ok: false, error: 'bad name' });
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, slug + '.json'), JSON.stringify(body, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}

// Generic: SettingsEditor saves here.
app.post('/api/config/:name', (req, res) => writeConfig(req.params.name, req.body, res));

// Back-compat: the juice editor still posts to /api/juice.
app.post('/api/juice', (req, res) => writeConfig('juice', req.body, res));

app.listen(port, () => {
  console.log(`juiceEngine running at http://localhost:${port}`);
});
