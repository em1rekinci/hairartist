/**
 * i18n.js — Hair Artist çok dil desteği
 * Desteklenen: tr, en, de, fr, ar, ru
 * Dil dosyaları: /translations/{lang}.json
 */

(function () {
  const SUPPORTED = ['tr', 'en', 'de', 'fr', 'ar', 'ru'];
  const RTL_LANGS  = ['ar'];
  const LANG_LABELS = { tr: 'TR', en: 'EN', de: 'DE', fr: 'FR', ar: 'AR', ru: 'RU' };
  const LANG_NAMES  = { tr: 'Türkçe', en: 'English', de: 'Deutsch', fr: 'Français', ar: 'العربية', ru: 'Русский' };

  let currentLang = 'tr';
  let translations = {};

  // ── Dil tespiti ──────────────────────────────────────────────────────────────
  function detectLang() {
    const stored = localStorage.getItem('ha_lang');
    if (stored && SUPPORTED.includes(stored)) return stored;
    const browser = (navigator.language || '').slice(0, 2).toLowerCase();
    return SUPPORTED.includes(browser) ? browser : 'tr';
  }

  // ── JSON yükle ───────────────────────────────────────────────────────────────
  async function loadTranslations(lang) {
    if (lang === 'tr') {
      // Türkçe inline — her zaman hazır
      return null;
    }
    try {
      const r = await fetch(`/translations/${lang}.json?v=${Date.now()}`);
      if (!r.ok) throw new Error('not found');
      return await r.json();
    } catch {
      console.warn(`[i18n] ${lang}.json yüklenemedi, Türkçeye dönülüyor.`);
      return null;
    }
  }

  // ── DOM'u güncelle ───────────────────────────────────────────────────────────
  function applyTranslations() {
    const t = translations;

    // data-i18n → textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) el.textContent = t[key];
    });

    // data-i18n-html → innerHTML (br vb. için)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (t[key] !== undefined) el.innerHTML = t[key];
    });

    // data-i18n-placeholder → placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (t[key] !== undefined) el.placeholder = t[key];
    });

    // RTL desteği
    if (RTL_LANGS.includes(currentLang)) {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', currentLang);
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
      document.documentElement.setAttribute('lang', currentLang);
    }

    // Dil seçici aktif gösterge
    document.querySelectorAll('.lang-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
  }

  // ── Dil değiştir ─────────────────────────────────────────────────────────────
  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    currentLang = lang;
    localStorage.setItem('ha_lang', lang);

    const loaded = await loadTranslations(lang);

    if (loaded) {
      translations = loaded;
    } else {
      // tr.json'dan yükle (her zaman mevcut)
      try {
        const r = await fetch('/translations/tr.json');
        translations = await r.json();
      } catch {
        translations = {};
      }
    }

    applyTranslations();
  }

  // ── Dil seçici widget'ı oluştur ───────────────────────────────────────────────
  function buildLangSwitcher() {
    const wrap = document.createElement('div');
    wrap.className = 'lang-switcher';
    wrap.setAttribute('aria-label', 'Language selector');

    const current = document.createElement('button');
    current.className = 'lang-current';
    current.setAttribute('aria-haspopup', 'listbox');
    current.setAttribute('aria-expanded', 'false');

    const globe = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
    current.innerHTML = `${globe}<span class="lang-current-label">${LANG_LABELS[currentLang]}</span>`;

    const dropdown = document.createElement('ul');
    dropdown.className = 'lang-dropdown';
    dropdown.setAttribute('role', 'listbox');

    SUPPORTED.forEach(lang => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'lang-option';
      btn.dataset.lang = lang;
      btn.setAttribute('role', 'option');
      btn.innerHTML = `<span class="lang-code">${LANG_LABELS[lang]}</span><span class="lang-name">${LANG_NAMES[lang]}</span>`;
      if (lang === currentLang) btn.classList.add('active');

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await setLang(lang);
        current.querySelector('.lang-current-label').textContent = LANG_LABELS[lang];
        dropdown.classList.remove('open');
        current.setAttribute('aria-expanded', 'false');
      });

      li.appendChild(btn);
      dropdown.appendChild(li);
    });

    current.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('open');
      current.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
      current.setAttribute('aria-expanded', 'false');
    });

    wrap.appendChild(current);
    wrap.appendChild(dropdown);
    return wrap;
  }

  // ── CSS enjekte et ────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
/* ── Lang Switcher ──────────────────────────── */
.lang-switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.lang-current {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: 1px solid rgba(247,244,239,.22);
  color: rgba(247,244,239,.75);
  padding: 5px 10px;
  border-radius: 3px;
  font-family: 'Montserrat', sans-serif;
  font-size: .6rem;
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color .2s, color .2s;
  white-space: nowrap;
}
.lang-current:hover {
  border-color: rgba(247,244,239,.5);
  color: #f7f4ef;
}
.lang-dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: #111;
  border: 1px solid #222;
  border-radius: 4px;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  min-width: 130px;
  z-index: 9999;
  box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.lang-dropdown.open { display: block; }
.lang-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: none;
  border: none;
  padding: 7px 14px;
  cursor: pointer;
  transition: background .15s;
  text-align: left;
}
.lang-option:hover { background: rgba(247,244,239,.06); }
.lang-option.active { background: rgba(247,244,239,.1); }
.lang-code {
  font-family: 'Montserrat', sans-serif;
  font-size: .6rem;
  font-weight: 700;
  letter-spacing: .1em;
  color: #f7f4ef;
  min-width: 22px;
}
.lang-name {
  font-family: 'Montserrat', sans-serif;
  font-size: .7rem;
  color: rgba(247,244,239,.55);
}
/* nav-right içinde sıralama */
.nav-right { display: flex; align-items: center; gap: 10px; }
@media (max-width: 768px) {
  .lang-switcher { margin-right: 4px; }
  .lang-dropdown { right: 0; }
}
    `;
    document.head.appendChild(style);
  }

  // ── Nav'a yerleştir ───────────────────────────────────────────────────────────
  function mountSwitcher() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    const navBook = navRight.querySelector('.nav-book');
    const switcher = buildLangSwitcher();
    // Rezervasyon Yap butonunun soluna ekle
    if (navBook) {
      navRight.insertBefore(switcher, navBook);
    } else {
      navRight.prepend(switcher);
    }
  }

  // ── Başlat ────────────────────────────────────────────────────────────────────
  async function init() {
    injectStyles();
    currentLang = detectLang();

    // Önce tr.json yükle (fallback olarak her zaman gerekli)
    try {
      const r = await fetch('/translations/tr.json');
      const trData = await r.json();
      translations = trData; // default Türkçe
    } catch { translations = {}; }

    if (currentLang !== 'tr') {
      const loaded = await loadTranslations(currentLang);
      if (loaded) translations = loaded;
    }

    applyTranslations();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountSwitcher);
    } else {
      mountSwitcher();
    }
  }

  // Public API
  window.i18n = { setLang, detectLang, t: (k) => translations[k] || k };

  init();
})();
