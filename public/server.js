const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const pages = ['fiyatlar', 'portfolio', 'shop', 'rezervasyon', 'admin'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, `${page}.html`));
  });
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Hair Artist sunucusu çalışıyor: http://localhost:${PORT}`);
});