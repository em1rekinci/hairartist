const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');
const crypto  = require('crypto');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── NETGSM AYARLARI (Railway Environment Variables) ─────────────────────────
const NETGSM_USERCODE  = process.env.NETGSM_USERCODE;
const NETGSM_PASSWORD  = process.env.NETGSM_PASSWORD;
const NETGSM_MSGHEADER = process.env.NETGSM_MSGHEADER;
const ALICI_TELEFON    = process.env.ALICI_TELEFON;    // Fatih Kurt
const SITE_URL         = process.env.SITE_URL;         // site adresi güncel unutma

// ─── GEÇİCİ REZERVASYON DEPOSU ───────────────────────────────────────────────
const rezervasyonlar = new Map();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── REZERVASYON AL ──────────────────────────────────────────────────────────
app.post('/rezervasyon', async (req, res) => {
  const { ad, telefon, hizmet, tarih, saat, not: musteri_notu } = req.body;

  if (!ad || !telefon || !hizmet || !tarih || !saat) {
    return res.status(400).json({ ok: false, mesaj: 'Lütfen tüm zorunlu alanları doldurun.' });
  }

  const id = crypto.randomBytes(8).toString('hex');

  rezervasyonlar.set(id, {
    id, ad, telefon, hizmet, tarih, saat,
    not: musteri_notu || '',
    durum: 'bekliyor',
    tarihOlustur: new Date().toISOString()
  });

  const onayLink = `${SITE_URL}/onay/${id}`;
  const redLink  = `${SITE_URL}/red/${id}`;

  const fatihSms =
    `YENİ REZERVASYON\n` +
    `Ad: ${ad}\n` +
    `Tel: ${telefon}\n` +
    `Hizmet: ${hizmet}\n` +
    `${tarih} - ${saat}\n` +
    (musteri_notu ? `Not: ${musteri_notu}\n` : '') +
    `\nONAY: ${onayLink}\n` +
    `RED: ${redLink}`;

  try {
    await smsSend(ALICI_TELEFON, fatihSms);
    console.log(`[${id}] Rezervasyon alındı, SMS gönderildi.`);
    return res.json({ ok: true, mesaj: "Rezervasyon talebiniz alındı! Onay SMS'i kısa sürede gelecek." });
  } catch (err) {
    console.error('SMS hatası:', err);
    return res.status(500).json({ ok: false, mesaj: 'Sistem hatası. Lütfen telefonla ulaşın: 0531 777 02 03' });
  }
});

// ─── ONAY LİNKİ ──────────────────────────────────────────────────────────────
app.get('/onay/:id', async (req, res) => {
  const rez = rezervasyonlar.get(req.params.id);

  if (!rez)
    return res.send(sayfaHTML('❌ Bulunamadı', 'Bu rezervasyon bulunamadı veya süresi doldu.', '#e74c3c'));
  if (rez.durum !== 'bekliyor')
    return res.send(sayfaHTML('⚠️ Zaten İşlendi', `Bu rezervasyon daha önce <b>${rez.durum}</b> olarak işlendi.`, '#f39c12'));

  rez.durum = 'onaylandi';

  const musteriSms =
    `Merhaba ${rez.ad}!\n` +
    `Randevunuz ONAYLANDI ✓\n` +
    `${rez.tarih} - ${rez.saat}\n` +
    `Hizmet: ${rez.hizmet}\n` +
    `Adres: Alibeyköy Cd No:5, Eyüpsultan\n` +
    `İptal: 0531 777 02 03`;

  try {
    await smsSend(telefonFormat(rez.telefon), musteriSms);
    console.log(`[${rez.id}] ONAYLANDI`);
    return res.send(sayfaHTML(
      '✅ Onaylandı',
      `<b>${rez.ad}</b> — ${rez.tarih} ${rez.saat} randevusu onaylandı.<br>Müşteriye onay SMS'i gönderildi.`,
      '#27ae60'
    ));
  } catch (err) {
    return res.send(sayfaHTML('⚠️ Hata', 'Onaylandı fakat müşteriye SMS gönderilemedi.', '#f39c12'));
  }
});

// ─── RED LİNKİ ───────────────────────────────────────────────────────────────
app.get('/red/:id', async (req, res) => {
  const rez = rezervasyonlar.get(req.params.id);

  if (!rez)
    return res.send(sayfaHTML('❌ Bulunamadı', 'Bu rezervasyon bulunamadı veya süresi doldu.', '#e74c3c'));
  if (rez.durum !== 'bekliyor')
    return res.send(sayfaHTML('⚠️ Zaten İşlendi', `Bu rezervasyon daha önce <b>${rez.durum}</b> olarak işlendi.`, '#f39c12'));

  rez.durum = 'reddedildi';

  const musteriSms =
    `Merhaba ${rez.ad},\n` +
    `${rez.tarih} ${rez.saat} randevusu uygun değil.\n` +
    `Yeni tarih için: 0531 777 02 03\n` +
    `Hair Artist`;

  try {
    await smsSend(telefonFormat(rez.telefon), musteriSms);
    console.log(`[${rez.id}] REDDEDİLDİ`);
    return res.send(sayfaHTML(
      '❌ Reddedildi',
      `<b>${rez.ad}</b> — ${rez.tarih} ${rez.saat} randevusu reddedildi.<br>Müşteriye bilgi SMS'i gönderildi.`,
      '#e74c3c'
    ));
  } catch (err) {
    return res.send(sayfaHTML('⚠️ Hata', 'Reddedildi fakat müşteriye SMS gönderilemedi.', '#f39c12'));
  }
});

// ─── YARDIMCI: SMS GÖNDER ────────────────────────────────────────────────────
async function smsSend(numara, mesaj) {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<mainbody><header>` +
      `<usercode>${NETGSM_USERCODE}</usercode>` +
      `<password>${NETGSM_PASSWORD}</password>` +
      `<msgheader>${NETGSM_MSGHEADER}</msgheader>` +
    `</header><body>` +
      `<msg><![CDATA[${mesaj}]]></msg>` +
      `<no>${numara}</no>` +
    `</body></mainbody>`;

  const res  = await fetch('https://api.netgsm.com.tr/sms/send/xml', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
    body: xml
  });
  const text = await res.text();
  console.log('Netgsm:', text.trim());
  if (!['00','01','02'].some(k => text.trim().startsWith(k)))
    throw new Error('Netgsm hata: ' + text.trim());
}

// ─── YARDIMCI: TELEFON FORMAT ────────────────────────────────────────────────
function telefonFormat(tel) {
  let t = tel.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');
  if (t.startsWith('0')) t = '9' + t;
  return t;
}

// ─── YARDIMCI: HTML SAYFA ────────────────────────────────────────────────────
function sayfaHTML(baslik, icerik, renk) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${baslik} — Hair Artist</title>
  <style>
    body{margin:0;font-family:sans-serif;background:#0a0a0a;color:#f5f0e8;
         display:flex;align-items:center;justify-content:center;min-height:100vh}
    .box{background:#161616;border:1px solid #2a2a2a;padding:48px 40px;
         border-radius:8px;max-width:480px;text-align:center}
    h1{font-size:1.6rem;margin-bottom:16px;color:${renk}}
    p{font-size:.95rem;line-height:1.7;color:rgba(245,240,232,.6)}
    a{display:inline-block;margin-top:24px;color:${renk};font-size:.85rem;
      text-decoration:none;border-bottom:1px solid ${renk};padding-bottom:2px}
  </style></head><body>
  <div class="box"><h1>${baslik}</h1><p>${icerik}</p>
  <a href="/">← Anasayfaya Dön</a></div>
  </body></html>`;
}

// ─── PORTFOLYO SAYFA YÖNLENDİRME
app.get('/portfolio', (req, res) => {
  res.redirect('/portfolio.html');
});

// ─── PORTFOLYo FOTOĞRAF LİSTESİ ─────────────────────────────────────────────
const PORTFOLIO_DIR = path.join(__dirname, 'public', 'images', 'portfolio');
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

// Dosya adından kategori ve başlık çıkar
// Format: kategori-sayi.jpg → ör: kesim-01.jpg, balayaj-03.webp
const KATEGORİ_MAP = {
  kesim:    'Saç Kesimi',
  boya:     'Saç Boyama',
  balyaj:   'Balyaj',
  bakim:    'Bakım & Şekil',
  gelin:    'Gelin Saçı',
  sekil:    'Şekillendirme',
};

app.get('/api/portfolio', (req, res) => {
  try {
    if (!fs.existsSync(PORTFOLIO_DIR)) {
      return res.json({ photos: [] });
    }
    const files = fs.readdirSync(PORTFOLIO_DIR)
      .filter(f => IMG_EXTS.includes(path.extname(f).toLowerCase()))
      .sort();

    const photos = files.map(f => {
      const base = path.basename(f, path.extname(f)); // ör: kesim-01
      const parts = base.split('-');
      const catKey = parts[0].toLowerCase();
      const cat = KATEGORİ_MAP[catKey] || catKey;
      return {
        src: `/images/portfolio/${f}`,
        cat: catKey,
        catLabel: cat,
        name: cat,
        file: f
      };
    });

    res.json({ photos });
  } catch (e) {
    console.error('Portfolyo hatası:', e);
    res.status(500).json({ photos: [] });
  }
});

// ─── SUNUCU BAŞLAT ────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`✓ Sunucu: http://localhost:${PORT}`));
