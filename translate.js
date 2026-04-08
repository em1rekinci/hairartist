/**
 * translate.js — Claude API ile otomatik çeviri scripti
 * 
 * Kullanım:
 *   set CLAUDE_KEY=sk-ant-... && node translate.js
 */

const fs = require('fs');
const path = require('path');

const CLAUDE_KEY = process.env.CLAUDE_KEY || '';

const TARGET_LANGS = {
  en: 'English',
  de: 'German',
  fr: 'French',
  ar: 'Arabic',
  ru: 'Russian'
};

const TRANSLATIONS_DIR = path.join(__dirname, 'translations');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
  
  // JSON bloğunu temizle (bazen ```json ... ``` ile gelir)
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
      Object.assign(result, batchObj); // hata olursa Türkçe orijinali koy
    }

    if (i + BATCH_SIZE < keys.length) {
      await sleep(500);
    }
  }

  return result;
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Hair Artist — Otomatik Çeviri Aracı ║');
  console.log('╚════════════════════════════════════════╝\n');

  if (!CLAUDE_KEY || !CLAUDE_KEY.startsWith('sk-ant-')) {
    console.error('❌ HATA: CLAUDE_KEY tanımlı değil veya hatalı!\n');
    console.error('Kullanım:');
    console.error('  Windows: set CLAUDE_KEY=sk-ant-... && node translate.js');
    console.error('  Mac/Linux: CLAUDE_KEY=sk-ant-... node translate.js\n');
    process.exit(1);
  }

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
  console.log(`✓ Türkçe kaynak yüklendi (${Object.keys(sourceTr).length} anahtar)\n`);

  for (const [langCode, langName] of Object.entries(TARGET_LANGS)) {
    const outPath = path.join(TRANSLATIONS_DIR, `${langCode}.json`);

    if (fs.existsSync(outPath) && !process.argv.includes('--force')) {
      console.log(`⏭  ${langName} (${langCode}) zaten mevcut, atlanıyor. (Yenilemek için --force ekle)`);
      continue;
    }

    const translated = await translateLanguage(sourceTr, langCode, langName);
    fs.writeFileSync(outPath, JSON.stringify(translated, null, 2), 'utf8');
    console.log(`  💾 translations/${langCode}.json kaydedildi`);
  }

  console.log('\n✅ Tüm çeviriler tamamlandı!');
  console.log('📂 translations/ klasörünü kontrol edin.');
}

main().catch(e => {
  console.error('\n❌ Beklenmeyen hata:', e.message);
  process.exit(1);
});
