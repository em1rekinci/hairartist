/**
 * translate.js — Claude API ile otomatik çeviri scripti
 *
 * Kullanım:
 *   node translate.js                  → sadece JSON dosyaları
 *   node translate.js --supabase       → JSON + Supabase hizmet isimlerini çevir
 *   node translate.js --force          → mevcut dosyaları da yeniden çevir
 *   node translate.js --supabase --force
 */

const fs = require('fs');
const path = require('path');

const CLAUDE_KEY = process.env.claude || '';

const SUPA_URL = 'https://botxnihztrnwzjnrlwzv.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvdHhuaWh6dHJud3pqbnJsd3p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTg4MTAsImV4cCI6MjA5MDA5NDgxMH0.AcX4_2Aykf8J1jln9fvODh2rRffymfEJCAekzmN1ALg';

const TARGET_LANGS = {
  en: 'English',
  de: 'German',
  fr: 'French',
  ru: 'Russian'
};

const TRANSLATIONS_DIR = path.join(__dirname, 'translations');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── CLAUDE ÇEVİRİ ───────────────────────────────────────────────────────────

async function translateBatch(texts, langCode, langName) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are a professional translator for a luxury hair salon website called "Fatih Kurt Hair Artist" in Istanbul.
Translate the JSON values below from Turkish to ${langName}.

Rules:
- Keep JSON keys exactly the same, only translate the values
- Keep tone professional, elegant, luxury-salon appropriate
- For Arabic, use Modern Standard Arabic
- Preserve special characters: → ✓ ✗ ★ and emojis as-is
- Do NOT translate proper nouns: Fatih Kurt, Hair Artist, Instagram, PayTR
- Do NOT translate currency symbols or numbers
- Return ONLY valid JSON, no markdown fences, no explanation

JSON to translate:
${JSON.stringify(texts, null, 2)}`
        }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API hatası (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data.content[0].text.trim();
  const clean = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(clean);
}

async function translateLanguage(sourceTr, langCode, langName) {
  console.log(`\n🌍 ${langName} (${langCode}) çevirisi başlıyor...`);

  const keys = Object.keys(sourceTr);
  const BATCH_SIZE = 30;
  const result = {};

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batchKeys = keys.slice(i, i + BATCH_SIZE);
    const batchObj = {};
    batchKeys.forEach(k => { batchObj[k] = sourceTr[k]; });

    process.stdout.write(`  Grup ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(keys.length / BATCH_SIZE)}... `);

    try {
      const translated = await translateBatch(batchObj, langCode, langName);
      Object.assign(result, translated);
      console.log('✓');
    } catch (e) {
      console.log('✗ HATA:', e.message);
      Object.assign(result, batchObj);
    }

    if (i + BATCH_SIZE < keys.length) await sleep(500);
  }

  return result;
}

// ─── SUPABASE HİZMET İSİMLERİ ────────────────────────────────────────────────

async function supabaseGetHizmetler() {
  const res = await fetch(SUPA_URL + '/rest/v1/hizmetler?select=id,ad,ad_en,ad_de,ad_fr,ad_ru&order=sira.asc', {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY
    }
  });
  if (!res.ok) throw new Error(`Supabase okuma hatası (${res.status}): ${await res.text()}`);
  return res.json();
}

async function supabaseUpdateHizmet(id, data) {
  const res = await fetch(SUPA_URL + `/rest/v1/hizmetler?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase yazma hatası (${res.status}): ${await res.text()}`);
}

async function translateSupabase(force) {
  console.log('\n📦 Supabase hizmet isimleri çevriliyor...');

  const hizmetler = await supabaseGetHizmetler();
  console.log(`  ${hizmetler.length} hizmet bulundu.`);

  for (const h of hizmetler) {
    const eksik = Object.keys(TARGET_LANGS).filter(l => !h[`ad_${l}`]);
    if (!force && eksik.length === 0) {
      console.log(`  ⏭  "${h.ad}" zaten çevrilmiş, atlanıyor.`);
      continue;
    }

    const hedefDiller = force ? Object.entries(TARGET_LANGS) : eksik.map(l => [l, TARGET_LANGS[l]]);
    process.stdout.write(`  "${h.ad}" → `);

    const guncelleme = {};

    for (const [langCode, langName] of hedefDiller) {
      try {
        const sonuc = await translateBatch({ ad: h.ad }, langCode, langName);
        guncelleme[`ad_${langCode}`] = sonuc.ad;
        process.stdout.write(`${langCode} ✓  `);
      } catch (e) {
        process.stdout.write(`${langCode} ✗  `);
      }
      await sleep(200);
    }

    if (Object.keys(guncelleme).length > 0) {
      await supabaseUpdateHizmet(h.id, guncelleme);
    }

    console.log('');
  }

  console.log('\n✅ Supabase hizmet çevirileri tamamlandı!');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Hair Artist — Otomatik Çeviri Aracı ║');
  console.log('╚════════════════════════════════════════╝\n');

  if (!CLAUDE_KEY || !CLAUDE_KEY.startsWith('sk-ant-')) {
    console.error('❌ HATA: CLAUDE_KEY tanımlı değil veya hatalı!\n');
    console.error('Kullanım:');
    console.error('  Windows: set claude=sk-ant-... && node translate.js');
    console.error('  Mac/Linux: claude=sk-ant-... node translate.js\n');
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  const withSupabase = process.argv.includes('--supabase');

  // ── JSON dosyaları ──
  if (!fs.existsSync(TRANSLATIONS_DIR)) {
    fs.mkdirSync(TRANSLATIONS_DIR, { recursive: true });
    console.log('📁 translations/ klasörü oluşturuldu');
  }

  const trPath = path.join(TRANSLATIONS_DIR, 'tr.json');
  if (!fs.existsSync(trPath)) {
    console.error('❌ HATA: translations/tr.json bulunamadı!');
    process.exit(1);
  }

  const sourceTr = JSON.parse(fs.readFileSync(trPath, 'utf8'));
  console.log(`✓ Türkçe kaynak yüklendi (${Object.keys(sourceTr).length} anahtar)`);

  for (const [langCode, langName] of Object.entries(TARGET_LANGS)) {
    const outPath = path.join(TRANSLATIONS_DIR, `${langCode}.json`);

    if (fs.existsSync(outPath) && !force) {
      console.log(`⏭  ${langName} (${langCode}) zaten mevcut, atlanıyor. (Yenilemek için --force ekle)`);
      continue;
    }

    const translated = await translateLanguage(sourceTr, langCode, langName);
    fs.writeFileSync(outPath, JSON.stringify(translated, null, 2), 'utf8');
    console.log(`  💾 translations/${langCode}.json kaydedildi`);
  }

  // ── Supabase hizmet isimleri ──
  if (withSupabase) {
    await translateSupabase(force);
  } else {
    console.log('\n💡 Hizmet isimlerini de çevirmek için --supabase ekle:');
    console.log('   node translate.js --supabase');
  }

  console.log('\n✅ Tüm çeviriler tamamlandı!');
}

main().catch(e => {
  console.error('\n❌ Beklenmeyen hata:', e.message);
  process.exit(1);
});
