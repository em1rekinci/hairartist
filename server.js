const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');
const crypto  = require('crypto');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const SITE_URL         = process.env.SITE_URL || 'https://www.fatihkurthairartist.com';
const ADMIN_SIFRE      = process.env.ADMIN_SIFRE || 'hairartist2026';
const RESEND_API_KEY   = process.env.RESEND_API_KEY || '';

// ─── PAYTR AYARLARI ──────────────────────────────────────────────────────────
const MERCHANT_ID   = "685596";
const MERCHANT_KEY  = "aPqa74hp7yn9uXHg";
const MERCHANT_SALT = "Z7uQTT2ZTeYFxbsN";

// OK_URL ve FAIL_URL doğrudan SITE_URL'den türetiliyor — Railway'de ayrı env gerekmez
const OK_URL        = `${SITE_URL}/odeme-basarili`;
const FAIL_URL      = `${SITE_URL}/odeme-basarisiz`;
const SHOP_OK_URL   = `${SITE_URL}/odeme-basarili-shop`;
const SHOP_FAIL_URL = `${SITE_URL}/odeme-basarisiz`;

// ─── GEÇİCİ REZERVASYON DEPOSU ───────────────────────────────────────────────
const rezervasyonlar = new Map();

// ─── GEÇİCİ SHOP SİPARİŞ DEPOSU (callback gelene kadar) ─────────────────────
const bekleyenShopSiparisler = new Map();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── WWW YÖNLENDİRME (fatihkurthairartist.com → www.fatihkurthairartist.com) ─
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host && !host.startsWith('www.') && !host.startsWith('localhost')) {
    return res.redirect(301, `https://www.${host}${req.url}`);
  }
  next();
});

// ─── STATIC DOSYALAR ─────────────────────────────────────────────────────────
// (Özel route'lar static'ten ÖNCE tanımlanmalı)

// ─── SAYFA ROUTE'LARI ─────────────────────────────────────────────────────────
app.get('/shop', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

app.get('/rezervasyon', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rezervasyon.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/portfolio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portfolio.html'));
});

app.get('/fiyatlar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fiyatlar.html'));
});

app.get('/urun', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'urun.html'));
});

app.get('/sepet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sepet.html'));
});

// ─── PAYTR ÖDEME SONUÇ SAYFALARI ──────────────────────────────────────────────
app.get('/odeme-basarili', (req, res) => {
  const html = sayfaHTML(
    'Ödeme Başarılı! ✓',
    'Ödemeniz başarıyla alındı. Rezervasyon detaylarınız en kısa sürede size gönderilecek. En kısa sürede sizinle iletişime geçeceğiz.',
    '#10b981' // yeşil
  );
  res.send(html);
});

app.get('/odeme-basarili-shop', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'odeme-basarili-shop.html'));
});

app.get('/odeme-basarisiz', (req, res) => {
  const html = sayfaHTML(
    'Ödeme Başarısız',
    'Ödeme işlemi tamamlanamadı. Lütfen tekrar deneyin veya farklı bir ödeme yöntemi kullanın. Sorun devam ederse bizimle iletişime geçebilirsiniz: 0531 777 02 03',
    '#ef4444' // kırmızı
  );
  res.send(html);
});

// ─── STATIC MIDDLEWARE (sayfa route'larından sonra) ───────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════════════════════════════════════════════════
// REZERVASYON AL
// ════════════════════════════════════════════════════════════════════════════
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

  console.log(`[${id}] Rezervasyon alındı. ONAY: ${onayLink} | RED: ${redLink}`);
  return res.json({ ok: true, mesaj: 'Rezervasyon talebiniz alındı!' });
});

// ════════════════════════════════════════════════════════════════════════════
// PAYTR TOKEN AL
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/paytr-token', async (req, res) => {
  try {
    const { ad, telefon, hizmet, tarih, saat, fiyat, rezervasyon_id, merchant_oid: frontend_oid } = req.body;

    if (!ad || !telefon || !hizmet || !fiyat) {
      return res.status(400).json({ status: 'fail', reason: 'Eksik bilgi' });
    }

    const adParcalar = ad.trim().split(' ');
    const isim = adParcalar[0];
    const soyad = adParcalar.length > 1 ? adParcalar.slice(1).join(' ') : '-';

    let tel = telefon.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = tel.slice(1);
    if (!tel.startsWith('90')) tel = '90' + tel;

    // tutar_kurus tam sayı olmalı (kuruş cinsinden)
    const tutar_kurus = Math.round(Number(fiyat) * 100);
    // Frontend'den gelen merchant_oid'i kullan — Supabase'e zaten yazıldı
    const merchant_oid = frontend_oid || ('HA' + Date.now());

    // Railway'de genellikle x-forwarded-for gelir; IPv6 loopback'i engelle
    let user_ip =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '1.2.3.4';
    // PayTR localhost/loopback IP kabul etmez
    if (user_ip === '::1' || user_ip === '127.0.0.1') user_ip = '1.2.3.4';

    const sepetAdi = `${hizmet}${tarih ? ' (' + tarih + (saat ? ' ' + saat : '') + ')' : ''}`;
    const sepet = JSON.stringify([
      [sepetAdi, Number(fiyat).toFixed(2), 1],
    ]);
    const user_basket = Buffer.from(sepet).toString('base64');

    // Sabit değerler — string olarak tanımla
    const no_installment  = '0';
    const max_installment = '0';
    const currency        = 'TL';
    const test_mode       = '0';

    // ÖNEMLİ: Tüm değerler string olarak birleştirilmeli
    const hash_str =
      MERCHANT_ID +
      user_ip +
      merchant_oid +
      'info@hairartist.com.tr' +
      String(tutar_kurus) +
      user_basket +
      no_installment +
      max_installment +
      currency +
      test_mode +
      MERCHANT_SALT;

    const paytr_token = crypto
      .createHmac('sha256', MERCHANT_KEY)
      .update(hash_str)
      .digest('base64');

    console.log('[PayTR] merchant_oid:', merchant_oid);
    console.log('[PayTR] user_ip:', user_ip);
    console.log('[PayTR] tutar_kurus:', tutar_kurus);
    console.log('[PayTR] OK_URL:', OK_URL);
    console.log('[PayTR] FAIL_URL:', FAIL_URL);

    const params = new URLSearchParams({
      merchant_id:       MERCHANT_ID,
      user_ip:           user_ip,
      merchant_oid:      merchant_oid,
      email:             'info@hairartist.com.tr',
      payment_amount:    String(tutar_kurus),
      paytr_token:       paytr_token,
      user_basket:       user_basket,
      debug_on:          '1',           // hata ayıklama açık — sorun çözülünce '0' yap
      no_installment:    no_installment,
      max_installment:   max_installment,
      user_name:         `${isim} ${soyad}`,
      user_address:      'Istanbul',    // Türkçe karakter yok
      user_phone:        tel,
      merchant_ok_url:   OK_URL,
      merchant_fail_url: FAIL_URL,
      timeout_limit:     '30',
      currency:          currency,
      test_mode:         test_mode,
      lang:              'tr',
    });

    const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      body: params,
    });

    const data = await response.json();
    console.log('[PayTR] Yanıt:', JSON.stringify(data));

    if (data.status === 'success') {
      // merchant_oid'i Supabase'e kaydet — callback geldiğinde eşleştirmek için
      try {
        const SB_URL = 'https://botxnihztrnwzjnrlwzv.supabase.co';
        const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvdHhuaWh6dHJud3pqbnJsd3p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTg4MTAsImV4cCI6MjA5MDA5NDgxMH0.AcX4_2Aykf8J1jln9fvODh2rRffymfEJCAekzmN1ALg';

        // Frontend merchant_oid'i zaten Supabase'e INSERT sırasında yazdı.
        // rezervasyon_id varsa doğrulama logu yaz.
        if (frontend_oid) {
          console.log('[PayTR] merchant_oid frontend tarafından Supabase\'e yazıldı ✓', merchant_oid);
        } else {
          console.warn('[PayTR] frontend_oid gelmedi, merchant_oid Supabase\'de eksik kalabilir!');
        }
      } catch (e) {
        console.warn('[PayTR] merchant_oid Supabase\'e yazılamadı:', e.message);
      }
      return res.json({ status: 'success', token: data.token, oid: merchant_oid });
    } else {
      console.error('[PayTR] HATA reason:', data.reason);
      return res.json({ status: 'fail', reason: data.reason || 'Token alınamadı' });
    }

  } catch (err) {
    console.error('PAYTR HATA:', err);
    res.status(500).json({ status: 'fail', reason: 'Server hatası: ' + err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ONAY LİNKİ
// ════════════════════════════════════════════════════════════════════════════
app.get('/onay/:id', async (req, res) => {
  const rez = rezervasyonlar.get(req.params.id);

  if (!rez)
    return res.send(sayfaHTML('❌ Bulunamadı', 'Bu rezervasyon bulunamadı veya süresi doldu.', '#e74c3c'));
  if (rez.durum !== 'bekliyor')
    return res.send(sayfaHTML('⚠️ Zaten İşlendi', `Bu rezervasyon daha önce <b>${rez.durum}</b> olarak işlendi.`, '#f39c12'));

  rez.durum = 'onaylandi';
  console.log(`[${rez.id}] ONAYLANDI`);
  return res.send(sayfaHTML(
    '✅ Onaylandı',
    `<b>${rez.ad}</b> — ${rez.tarih} ${rez.saat} randevusu onaylandı.`,
    '#27ae60'
  ));
});

// ════════════════════════════════════════════════════════════════════════════
// RED LİNKİ
// ════════════════════════════════════════════════════════════════════════════
app.get('/red/:id', async (req, res) => {
  const rez = rezervasyonlar.get(req.params.id);

  if (!rez)
    return res.send(sayfaHTML('❌ Bulunamadı', 'Bu rezervasyon bulunamadı veya süresi doldu.', '#e74c3c'));
  if (rez.durum !== 'bekliyor')
    return res.send(sayfaHTML('⚠️ Zaten İşlendi', `Bu rezervasyon daha önce <b>${rez.durum}</b> olarak işlendi.`, '#f39c12'));

  rez.durum = 'reddedildi';
  console.log(`[${rez.id}] REDDEDİLDİ`);
  return res.send(sayfaHTML(
    '❌ Reddedildi',
    `<b>${rez.ad}</b> — ${rez.tarih} ${rez.saat} randevusu reddedildi.`,
    '#e74c3c'
  ));
});

// ════════════════════════════════════════════════════════════════════════════
// ADMİN PANELİ
// ════════════════════════════════════════════════════════════════════════════
app.post('/admin/giris', (req, res) => {
  const { sifre } = req.body;
  if (sifre === ADMIN_SIFRE) return res.json({ ok: true });
  return res.status(401).json({ ok: false, mesaj: 'Şifre hatalı.' });
});

app.get('/admin/rezervasyonlar', (req, res) => {
  const { sifre } = req.query;
  if (sifre !== ADMIN_SIFRE) return res.status(401).json({ ok: false });

  const liste = Array.from(rezervasyonlar.values())
    .sort((a, b) => new Date(b.tarihOlustur) - new Date(a.tarihOlustur));

  return res.json({ ok: true, rezervasyonlar: liste });
});

app.post('/admin/onay/:id', async (req, res) => {
  const { sifre } = req.body;
  if (sifre !== ADMIN_SIFRE) return res.status(401).json({ ok: false });

  const rez = rezervasyonlar.get(req.params.id);
  if (!rez) return res.status(404).json({ ok: false, mesaj: 'Bulunamadı.' });
  if (rez.durum !== 'bekliyor') return res.status(400).json({ ok: false, mesaj: 'Zaten işlendi.' });

  rez.durum = 'onaylandi';
  console.log(`[admin] ${rez.id} ONAYLANDI`);
  return res.json({ ok: true, mesaj: 'Onaylandı.' });
});

app.post('/admin/red/:id', async (req, res) => {
  const { sifre } = req.body;
  if (sifre !== ADMIN_SIFRE) return res.status(401).json({ ok: false });

  const rez = rezervasyonlar.get(req.params.id);
  if (!rez) return res.status(404).json({ ok: false, mesaj: 'Bulunamadı.' });
  if (rez.durum !== 'bekliyor') return res.status(400).json({ ok: false, mesaj: 'Zaten işlendi.' });

  rez.durum = 'reddedildi';
  console.log(`[admin] ${rez.id} REDDEDİLDİ`);
  return res.json({ ok: true, mesaj: 'Reddedildi.' });
});

app.delete('/admin/sil/:id', (req, res) => {
  const { sifre } = req.body;
  if (sifre !== ADMIN_SIFRE) return res.status(401).json({ ok: false });
  rezervasyonlar.delete(req.params.id);
  return res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// PORTFOLYo FOTOĞRAF API
// ════════════════════════════════════════════════════════════════════════════
const PORTFOLIO_DIR = path.join(__dirname, 'public', 'images', 'portfolio');
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

const KATEGORİ_MAP = {
  kesim:  'Saç Kesimi',
  boya:   'Saç Boyama',
  balyaj: 'Balyaj',
  bakim:  'Bakım & Şekil',
  gelin:  'Gelin Saçı',
  sekil:  'Şekillendirme',
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
      const base   = path.basename(f, path.extname(f));
      const parts  = base.split('-');
      const catKey = parts[0].toLowerCase();
      const cat    = KATEGORİ_MAP[catKey] || catKey;
      return {
        src:      `/images/portfolio/${f}`,
        cat:      catKey,
        catLabel: cat,
        name:     cat,
        file:     f
      };
    });

    res.json({ photos });
  } catch (e) {
    console.error('Portfolyo hatası:', e);
    res.status(500).json({ photos: [] });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PAYTR TOKEN AL — SHOP (Sepet ödemesi için)
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/paytr-token-shop', async (req, res) => {
  try {
    const { ad, telefon, email, adres, fiyat, sepetItems } = req.body;

    if (!ad || !telefon || !fiyat || !sepetItems?.length) {
      return res.status(400).json({ status: 'fail', reason: 'Eksik bilgi' });
    }

    const adParcalar = ad.trim().split(' ');
    const isim = adParcalar[0];
    const soyad = adParcalar.length > 1 ? adParcalar.slice(1).join(' ') : '-';

    let tel = telefon.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = tel.slice(1);
    if (!tel.startsWith('90')) tel = '90' + tel;

    const tutar_kurus = Math.round(Number(fiyat) * 100);
    const merchant_oid = 'HS' + Date.now(); // HS = Hair Shop

    const urunAdi = sepetItems.length === 1
      ? sepetItems[0][0]
      : sepetItems.length + ' ürün';

    // Supabase'e bekleyen olarak yaz — callback gelince onaylandi'ya güncellenir
    const SB_URL = 'https://botxnihztrnwzjnrlwzv.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvdHhuaWh6dHJud3pqbnJsd3p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTg4MTAsImV4cCI6MjA5MDA5NDgxMH0.AcX4_2Aykf8J1jln9fvODh2rRffymfEJCAekzmN1ALg';
    try {
      await fetch(`${SB_URL}/rest/v1/siparisler`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          musteri_adi:   ad,
          telefon:       telefon,
          urun_adi:      urunAdi,
          toplam:        Number(fiyat),
          odeme_yontemi: 'kart',
          durum:         'bekleyen',
          tarih:         new Date().toISOString().substring(0, 10),
          created_at:    new Date().toISOString(),
          merchant_oid:  merchant_oid,
          adres:         adres || '',
          email:         email || '',
          sepet_detay:   JSON.stringify(sepetItems)
        })
      });
      console.log('[PayTR Shop] Supabase bekleyen kayıt oluşturuldu:', merchant_oid);
    } catch(e) {
      console.warn('[PayTR Shop] Supabase ön kayıt hatası:', e.message);
    }

    let user_ip =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '1.2.3.4';
    if (user_ip === '::1' || user_ip === '127.0.0.1') user_ip = '1.2.3.4';

    // Sepet items: [[ad, fiyat, adet], ...]
    const user_basket = Buffer.from(JSON.stringify(sepetItems)).toString('base64');

    const no_installment  = '0';
    const max_installment = '0';
    const currency        = 'TL';
    const test_mode       = '0';
    const userEmail       = email || 'info@hairartist.com.tr';

    const hash_str =
      MERCHANT_ID +
      user_ip +
      merchant_oid +
      userEmail +
      String(tutar_kurus) +
      user_basket +
      no_installment +
      max_installment +
      currency +
      test_mode +
      MERCHANT_SALT;

    const paytr_token = crypto
      .createHmac('sha256', MERCHANT_KEY)
      .update(hash_str)
      .digest('base64');

    console.log('[PayTR Shop] merchant_oid:', merchant_oid, 'tutar:', tutar_kurus);

    const params = new URLSearchParams({
      merchant_id:       MERCHANT_ID,
      user_ip:           user_ip,
      merchant_oid:      merchant_oid,
      email:             userEmail,
      payment_amount:    String(tutar_kurus),
      paytr_token:       paytr_token,
      user_basket:       user_basket,
      debug_on:          '1',
      no_installment:    no_installment,
      max_installment:   max_installment,
      user_name:         `${isim} ${soyad}`,
      user_address:      adres ? adres.replace(/[^a-zA-Z0-9\s\.,\/\-]/g, ' ').substring(0, 100) : 'Istanbul',
      user_phone:        tel,
      merchant_ok_url:   SHOP_OK_URL,
      merchant_fail_url: SHOP_FAIL_URL,
      timeout_limit:     '30',
      currency:          currency,
      test_mode:         test_mode,
      lang:              'tr',
    });

    const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      body: params,
    });

    const data = await response.json();
    console.log('[PayTR Shop] Yanıt:', JSON.stringify(data));

    return res.json(data);

  } catch (err) {
    console.error('[PayTR Shop] Hata:', err);
    return res.status(500).json({ status: 'fail', reason: 'Sunucu hatası' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PAYTR CALLBACK — PayTR ödeme sonucunu buraya bildirir
// PayTR Paneli > Ayarlar > Bildirim Adresi: https://www.fatihkurthairartist.com/api/paytr-callback
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/paytr-callback', async (req, res) => {
  try {
    const {
      merchant_oid,
      status,
      total_amount,
      hash,
      failed_reason_code,
      failed_reason_msg,
      test_mode,
      payment_type,
      currency,
      payment_amount,
    } = req.body;

    // ── Hash doğrulama (güvenlik)
    const hash_str   = merchant_oid + MERCHANT_SALT + status + total_amount;
    const beklenen   = crypto.createHmac('sha256', MERCHANT_KEY).update(hash_str).digest('base64');

    if (beklenen !== hash) {
      console.error('[PayTR Callback] Hash uyuşmadı! Sahte istek olabilir.');
      return res.send('PAYTR_HASH_ERROR');
    }

    console.log(`[PayTR Callback] merchant_oid=${merchant_oid} status=${status} tutar=${total_amount}`);

    if (status === 'success') {
      // Shop siparişi mi? (HS prefix)
      if (merchant_oid.startsWith('HS')) {
        const SB_URL = 'https://botxnihztrnwzjnrlwzv.supabase.co';
        const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvdHhuaWh6dHJud3pqbnJsd3p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTg4MTAsImV4cCI6MjA5MDA5NDgxMH0.AcX4_2Aykf8J1jln9fvODh2rRffymfEJCAekzmN1ALg';
        const r = await fetch(
          `${SB_URL}/rest/v1/siparisler?merchant_oid=eq.${encodeURIComponent(merchant_oid)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SB_KEY,
              'Authorization': 'Bearer ' + SB_KEY,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({ durum: 'onaylandi' })
          }
        );
        if (r.ok) {
          console.log(`[PayTR Callback] ✓ Shop siparişi onaylandi: ${merchant_oid}`);
          // Mail gönder
          try {
            const rows = await r.json();
            const s = Array.isArray(rows) ? rows[0] : rows;
            if (s) await shopSiparisMail(s);
          } catch(e) {
            console.warn('[Mail] Gönderim hatası:', e.message);
          }
        } else {
          const t = await r.text();
          console.error(`[PayTR Callback] Supabase güncelleme hatası: ${t}`);
        }
      } else {
        // Rezervasyon ödemesi
        await supabaseGuncelle(merchant_oid, {
          durum: 'onaylandi',
          odeme_alindi: true,
          tip: 'online',
          odeme_yontemi: 'kart',
          odeme_tarihi: new Date().toISOString(),
          odeme_turu: payment_type || '',
        });
      }
      console.log(`[PayTR Callback] ✓ Ödeme başarılı: ${merchant_oid}`);
    } else {
      // Ödeme başarısız — odeme_basarisiz olarak işaretle (odeme_bekleniyor değil!)
      // Müşteri yeni ödeme yaparsa frontend yeni kayıt oluşturur
      await supabaseGuncelle(merchant_oid, {
        durum: 'odeme_basarisiz',
        odeme_alindi: false,
        odeme_hata_kodu: failed_reason_code || '',
        odeme_hata_mesaj: failed_reason_msg || '',
      });
      console.log(`[PayTR Callback] ✗ Ödeme başarısız: ${merchant_oid} — ${failed_reason_msg}`);
    }

    // PayTR'a mutlaka "OK" dönmemiz gerekiyor, aksi hâlde tekrar tekrar bildirim gönderir
    return res.send('OK');

  } catch (err) {
    console.error('[PayTR Callback] Hata:', err);
    return res.send('OK'); // yine de OK dön, PayTR'ın döngüye girmesini önle
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SHOP SİPARİŞ MAİLİ — Resend ile info@hairartist.com.tr'ye gönderilir
// ════════════════════════════════════════════════════════════════════════════
async function shopSiparisMail(siparis) {
  if (!RESEND_API_KEY) {
    console.warn('[Mail] RESEND_API_KEY tanımlı değil, mail atlanıyor.');
    return;
  }

  // Sepet detaylarını parse et
  let sepetSatirlar = '';
  try {
    const items = JSON.parse(siparis.sepet_detay || '[]');
    sepetSatirlar = items.map(item => {
      const [ad, fiyat, adet] = item;
      const toplam = (parseFloat(fiyat) * parseInt(adet)).toLocaleString('tr-TR');
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e8e4dc;font-size:14px;color:#1a1a1a">${ad}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e8e4dc;font-size:14px;color:#1a1a1a;text-align:center">${adet}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e8e4dc;font-size:14px;color:#1a1a1a;text-align:right;font-weight:600">${parseFloat(fiyat).toLocaleString('tr-TR')}₺</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e8e4dc;font-size:14px;color:#4a7a00;text-align:right;font-weight:700">${toplam}₺</td>
        </tr>`;
    }).join('');
  } catch(e) {
    sepetSatirlar = `<tr><td colspan="4" style="padding:10px 14px;color:#888">${siparis.urun_adi || '—'}</td></tr>`;
  }

  const tarih = new Date().toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

        <!-- HEADER -->
        <tr><td style="background:#080808;padding:28px 32px;text-align:center">
          <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#f7f4ef;letter-spacing:.02em">Fatih Kurt Hair Artist</div>
          <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(247,244,239,.35);margin-top:4px">Shop</div>
        </td></tr>

        <!-- BANNER -->
        <tr><td style="background:#c8ff00;padding:14px 32px;text-align:center">
          <div style="font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#080808">🛍 Yeni Sipariş Alındı</div>
        </td></tr>

        <!-- BODY -->
        <tr><td style="background:#ffffff;padding:32px">

          <p style="margin:0 0 24px;font-size:13px;color:#6a6560;line-height:1.7">
            <strong style="color:#080808">${tarih}</strong> tarihinde yeni bir shop siparişi alındı.
          </p>

          <!-- MÜŞTERİ BİLGİLERİ -->
          <div style="background:#f4f1ec;border:1px solid #e8e4dc;padding:18px 20px;margin-bottom:24px">
            <div style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#9a9490;margin-bottom:12px;font-weight:600">Müşteri Bilgileri</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#9a9490;padding:4px 0;width:100px">Ad Soyad</td>
                <td style="font-size:13px;color:#080808;font-weight:600;padding:4px 0">${siparis.musteri_adi || '—'}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#9a9490;padding:4px 0">Telefon</td>
                <td style="font-size:13px;color:#080808;padding:4px 0">${siparis.telefon || '—'}</td>
              </tr>
              ${siparis.email ? `<tr>
                <td style="font-size:12px;color:#9a9490;padding:4px 0">E-posta</td>
                <td style="font-size:13px;color:#080808;padding:4px 0">${siparis.email}</td>
              </tr>` : ''}
              ${siparis.adres ? `<tr>
                <td style="font-size:12px;color:#9a9490;padding:4px 0;vertical-align:top">Adres</td>
                <td style="font-size:13px;color:#080808;padding:4px 0;line-height:1.6">${siparis.adres}</td>
              </tr>` : ''}
            </table>
          </div>

          <!-- SEPET -->
          <div style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#9a9490;margin-bottom:10px;font-weight:600">Sipariş İçeriği</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e4dc;margin-bottom:16px">
            <thead>
              <tr style="background:#f4f1ec">
                <th style="padding:9px 14px;text-align:left;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#9a9490;font-weight:600">Ürün</th>
                <th style="padding:9px 14px;text-align:center;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#9a9490;font-weight:600">Adet</th>
                <th style="padding:9px 14px;text-align:right;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#9a9490;font-weight:600">Birim</th>
                <th style="padding:9px 14px;text-align:right;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#9a9490;font-weight:600">Toplam</th>
              </tr>
            </thead>
            <tbody>${sepetSatirlar}</tbody>
          </table>

          <!-- TOPLAM -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr>
              <td style="font-size:13px;color:#6a6560;padding:6px 0">Ara Toplam</td>
              <td style="font-size:13px;color:#080808;text-align:right;padding:6px 0">${siparis.toplam ? siparis.toplam.toLocaleString('tr-TR') : '—'}₺</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6a6560;padding:6px 0">Ödeme Yöntemi</td>
              <td style="font-size:13px;color:#080808;text-align:right;padding:6px 0">💳 Kart</td>
            </tr>
            <tr style="border-top:2px solid #080808">
              <td style="font-size:15px;font-weight:700;color:#080808;padding:10px 0 0">Genel Toplam</td>
              <td style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#080808;text-align:right;padding:10px 0 0;font-style:italic">${siparis.toplam ? siparis.toplam.toLocaleString('tr-TR') : '—'}₺</td>
            </tr>
          </table>

          <!-- SİPARİŞ NO -->
          <div style="background:#f4f1ec;border:1px solid #e8e4dc;padding:10px 16px;text-align:center;font-size:11px;color:#9a9490;letter-spacing:.12em;text-transform:uppercase">
            Sipariş No: <strong style="color:#080808">${siparis.merchant_oid || '—'}</strong>
          </div>

        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#080808;padding:20px 32px;text-align:center">
          <div style="font-size:11px;color:rgba(247,244,239,.3);line-height:1.8">
            Hair Artist — fatihkurthairartist.com<br>
            Bu mail otomatik olarak gönderilmiştir.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const mailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from:    'Fatih Kurt Hair Artist Shop <siparis@fatihkurthairartist.com>',
      to:      ['info@hairartist.com.tr'],
      subject: `🛍 Yeni Sipariş — ${siparis.musteri_adi || 'Müşteri'} | ${siparis.toplam ? siparis.toplam.toLocaleString('tr-TR') + '₺' : ''}`,
      html:    html
    })
  });

  if (mailRes.ok) {
    console.log('[Mail] ✓ Sipariş maili gönderildi:', siparis.merchant_oid);
  } else {
    const t = await mailRes.text();
    console.error('[Mail] Resend hatası:', t);
  }
}

// ── Supabase: merchant_oid'e göre rezervasyonu güncelle
async function supabaseGuncelle(merchant_oid, guncelleme) {
  const SUPABASE_URL = 'https://botxnihztrnwzjnrlwzv.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvdHhuaWh6dHJud3pqbnJsd3p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTg4MTAsImV4cCI6MjA5MDA5NDgxMH0.AcX4_2Aykf8J1jln9fvODh2rRffymfEJCAekzmN1ALg';

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rezervasyonlar?merchant_oid=eq.${encodeURIComponent(merchant_oid)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(guncelleme),
    }
  );

  const txt = await res.text();
  if (!res.ok) {
    console.error('[Supabase Güncelle] Hata:', txt);
    return;
  }

  const rows = txt ? JSON.parse(txt) : [];
  if (!rows.length) {
    console.warn(`[Supabase Güncelle] merchant_oid ile kayıt bulunamadı: ${merchant_oid}`);
  } else {
    console.log(`[Supabase Güncelle] ✓ ${rows.length} kayıt güncellendi`);
  }
}


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

// ─── SUNUCU BAŞLAT ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Sunucu: http://localhost:${PORT}`);
  console.log(`✓ SITE_URL: ${SITE_URL}`);
  console.log(`✓ OK_URL: ${OK_URL}`);
  console.log(`✓ FAIL_URL: ${FAIL_URL}`);
});
