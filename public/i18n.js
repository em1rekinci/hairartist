/**
 * i18n.js — Hair Artist Dil Değiştirici
 * 
 * Kullanım (her HTML sayfasının <head> sonuna ekleyin):
 *   <script src="/i18n.js"></script>
 * 
 * HTML elemanlarına data-i18n="anahtar" ekleyin:
 *   <a href="#">Anasayfa</a>  →  <a href="#" data-i18n="nav_home">Anasayfa</a>
 * 
 * Placeholder için: data-i18n-placeholder="book_name"
 * Title için: data-i18n-title="nav_book"
 */

(function () {
  'use strict';

  const LANGS = {
    tr: { label: 'TR', flag: '🇹🇷', name: 'Türkçe', dir: 'ltr' },
    en: { label: 'EN', flag: '🇬🇧', name: 'English', dir: 'ltr' },
    de: { label: 'DE', flag: '🇩🇪', name: 'Deutsch', dir: 'ltr' },
    fr: { label: 'FR', flag: '🇫🇷', name: 'Français', dir: 'ltr' },
    ar: { label: 'AR', flag: '🇸🇦', name: 'العربية', dir: 'rtl' },
    ru: { label: 'RU', flag: '🇷🇺', name: 'Русский', dir: 'ltr' }
  };

  let currentLang = localStorage.getItem('ha_lang') || 'tr';
  let translations = {};

  // ── Çeviri dosyasını yükle ──────────────────────────────────────────────────
  async function loadTranslations(lang) {
    if (lang === 'tr') {
      // Türkçe varsayılan, yüklemeye gerek yok — DOM zaten Türkçe
      return {};
    }
    try {
      const res = await fetch(`/translations/${lang}.json?v=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`[i18n] ${lang}.json yüklenemedi, Türkçe kullanılıyor.`);
      return {};
    }
  }

  // ── DOM'u güncelle ──────────────────────────────────────────────────────────
  function applyTranslations(t) {
    if (!t || Object.keys(t).length === 0) return;

    // data-i18n → textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) el.textContent = t[key];
    });

    // data-i18n-html → innerHTML (bold, em gibi işaretlemeler için)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (t[key] !== undefined) el.innerHTML = t[key];
    });

    // data-i18n-placeholder → placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (t[key] !== undefined) el.placeholder = t[key];
    });

    // data-i18n-title → title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (t[key] !== undefined) el.title = t[key];
    });

    // data-i18n-aria → aria-label
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (t[key] !== undefined) el.setAttribute('aria-label', t[key]);
    });
  }

  // ── Dil değiştir ────────────────────────────────────────────────────────────
  async function setLang(lang) {
    if (!LANGS[lang]) return;

    currentLang = lang;
    localStorage.setItem('ha_lang', lang);

    // HTML dir ve lang attribute
    document.documentElement.lang = lang;
    document.documentElement.dir = LANGS[lang].dir;

    // Arapça için özel font ayarı
    if (lang === 'ar') {
      document.body.style.fontFamily = "'Noto Sans Arabic', 'Montserrat', sans-serif";
    } else {
      document.body.style.fontFamily = '';
    }

    translations = await loadTranslations(lang);
    applyTranslations(translations);
    updateDropdown();
    closeDropdown();
  }

  // ── Dil seçici widget'ı oluştur ─────────────────────────────────────────────
  function createLangSwitcher() {
    const style = document.createElement('style');
    style.textContent = `
      .ha-lang-switcher {
        position: relative;
        display: inline-flex;
        align-items: center;
        margin-left: 16px;
        z-index: 9999;
      }
      .ha-lang-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: transparent;
        border: 1px solid rgba(247,244,239,0.2);
        color: rgba(247,244,239,0.8);
        padding: 5px 10px;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.6rem;
        font-weight: 500;
        letter-spacing: 0.1em;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .ha-lang-btn:hover {
        border-color: rgba(247,244,239,0.5);
        color: #f7f4ef;
      }
      .ha-lang-btn .ha-flag { font-size: 0.85rem; line-height: 1; }
      .ha-lang-btn .ha-chevron {
        width: 8px; height: 8px;
        border-right: 1px solid currentColor;
        border-bottom: 1px solid currentColor;
        transform: rotate(45deg);
        transition: transform 0.2s;
        margin-top: -2px;
      }
      .ha-lang-switcher.open .ha-chevron { transform: rotate(-135deg); margin-top: 2px; }

      .ha-lang-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background: #111;
        border: 1px solid #2a2a2a;
        min-width: 140px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-6px);
        transition: all 0.18s ease;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      }
      .ha-lang-switcher.open .ha-lang-dropdown {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      .ha-lang-option {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.65rem;
        font-weight: 400;
        color: rgba(247,244,239,0.6);
        cursor: pointer;
        transition: all 0.15s;
        border-bottom: 1px solid #1a1a1a;
        letter-spacing: 0.05em;
      }
      .ha-lang-option:last-child { border-bottom: none; }
      .ha-lang-option:hover { background: #1a1a1a; color: #f7f4ef; }
      .ha-lang-option.active { color: #f7f4ef; }
      .ha-lang-option .ha-opt-flag { font-size: 1rem; }
      .ha-lang-option .ha-opt-label { font-weight: 600; letter-spacing: 0.12em; font-size: 0.6rem; }
      .ha-lang-option .ha-opt-name { color: rgba(247,244,239,0.35); font-size: 0.6rem; }

      /* Açık arka plan sayfalar için (fiyatlar, rezervasyon, shop) */
      .light-nav .ha-lang-btn {
        border-color: rgba(8,8,8,0.2);
        color: rgba(8,8,8,0.7);
      }
      .light-nav .ha-lang-btn:hover { border-color: rgba(8,8,8,0.5); color: #080808; }
      .light-nav .ha-lang-dropdown { background: #fff; border-color: #e8e4dc; }
      .light-nav .ha-lang-option { color: rgba(8,8,8,0.5); border-color: #f0ece4; }
      .light-nav .ha-lang-option:hover { background: #f9f6f0; color: #080808; }
      .light-nav .ha-lang-option.active { color: #080808; }
      .light-nav .ha-lang-option .ha-opt-name { color: rgba(8,8,8,0.3); }

      @media (max-width: 768px) {
        .ha-lang-switcher { margin-left: 8px; }
        .ha-lang-btn { padding: 4px 8px; font-size: 0.55rem; }
        .ha-lang-dropdown { right: 0; min-width: 130px; }
      }
    `;
    document.head.appendChild(style);

    // Widget HTML
    const switcher = document.createElement('div');
    switcher.className = 'ha-lang-switcher';
    switcher.id = 'ha-lang-switcher';

    const btn = document.createElement('button');
    btn.className = 'ha-lang-btn';
    btn.id = 'ha-lang-btn';
    btn.setAttribute('aria-label', 'Dil seçin');
    btn.innerHTML = `
      <span class="ha-flag">${LANGS[currentLang].flag}</span>
      <span class="ha-lbl">${LANGS[currentLang].label}</span>
      <span class="ha-chevron"></span>
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      switcher.classList.toggle('open');
    });

    const dropdown = document.createElement('div');
    dropdown.className = 'ha-lang-dropdown';

    Object.entries(LANGS).forEach(([code, info]) => {
      const opt = document.createElement('div');
      opt.className = `ha-lang-option${code === currentLang ? ' active' : ''}`;
      opt.dataset.lang = code;
      opt.innerHTML = `
        <span class="ha-opt-flag">${info.flag}</span>
        <span class="ha-opt-label">${info.label}</span>
        <span class="ha-opt-name">${info.name}</span>
      `;
      opt.addEventListener('click', () => setLang(code));
      dropdown.appendChild(opt);
    });

    switcher.appendChild(btn);
    switcher.appendChild(dropdown);

    // Navbar'a ekle
    const navBook = document.querySelector('.nav-book');
    const navEnd = document.querySelector('.nav-end, .nav-actions, .nav-right');

    if (navBook) {
      navBook.parentNode.insertBefore(switcher, navBook.nextSibling);
    } else if (navEnd) {
      navEnd.appendChild(switcher);
    } else {
      // Navbar bulunamazsa sağ alt köşeye sabit yerleştir
      switcher.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;';
      document.body.appendChild(switcher);
    }

    // Dışarı tıklayınca kapat
    document.addEventListener('click', closeDropdown);
  }

  function closeDropdown() {
    const sw = document.getElementById('ha-lang-switcher');
    if (sw) sw.classList.remove('open');
  }

  function updateDropdown() {
    const btn = document.getElementById('ha-lang-btn');
    if (btn) {
      btn.querySelector('.ha-flag').textContent = LANGS[currentLang].flag;
      btn.querySelector('.ha-lbl').textContent = LANGS[currentLang].label;
    }
    document.querySelectorAll('.ha-lang-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.lang === currentLang);
    });
  }

  // ── Başlat ──────────────────────────────────────────────────────────────────
  async function init() {
    // Arapça font yükle (sadece gerekirse)
    if (currentLang === 'ar') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@300;400;500;600&display=swap';
      document.head.appendChild(link);
    }

    createLangSwitcher();

    // Kaydedilen dil Türkçe değilse uygula
    if (currentLang !== 'tr') {
      await setLang(currentLang);
    }
  }

  // DOM hazır olduğunda başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Global erişim (isteğe bağlı kullanım için)
  window.i18n = { setLang, t: (key) => translations[key] || key };

})();
