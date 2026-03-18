// Core i18n Utility
class I18nManager {
    constructor() {
        this.currentLang = localStorage.getItem('language') || 'en';
        this.locales = {};
        this.initialized = false;
        
        // Expose translate globally for easy use in HTML/JS
        window.t = this.translate.bind(this);
    }

    async init() {
        try {
            // Determine default language from browser if not set manually
            if (!localStorage.getItem('language')) {
                const sysLang = navigator.language || navigator.userLanguage;
                // Simple matching: if it starts with 'zh', default to zh-CN, else en 
                this.currentLang = sysLang.startsWith('zh') ? 'zh-CN' : 'en';
                localStorage.setItem('language', this.currentLang);
            }
            await this.loadLocale(this.currentLang);
            // Fallback to en if the current lang fails to provide a missing key
            if (this.currentLang !== 'en') {
                await this.loadLocale('en'); 
            }
            this.initialized = true;
            this.applyTranslations();
        } catch (error) {
            console.error('i18n init error:', error);
        }
    }

    async loadLocale(lang) {
        if (this.locales[lang]) return;
        try {
            const response = await fetch(`js/locales/${lang}.json`);
            if (response.ok) {
                this.locales[lang] = await response.json();
            } else {
                console.warn(`Failed to load locale: ${lang}`);
            }
        } catch (error) {
            console.error(`Error loading locale ${lang}:`, error);
        }
    }

    translate(key, params = {}) {
        if (!this.initialized) return key;

        const keys = key.split('.');
        let translation = this.getValue(keys, this.locales[this.currentLang]);

        // Fallback to English if not found
        if (translation === undefined && this.currentLang !== 'en') {
            translation = this.getValue(keys, this.locales['en']);
        }

        if (translation === undefined) {
            console.warn(`Translation missing for key: ${key}`);
            return key;
        }

        // Replace parameters (e.g., {{name}} or {name})
        return translation.replace(/\{\{\s*(\w+)\s*\}\}|\{\s*(\w+)\s*\}/g, (match, p1, p2) => {
            const paramKey = p1 || p2;
            return params[paramKey] !== undefined ? params[paramKey] : match;
        });
    }

    getValue(keys, localeObj) {
        if (!localeObj) return undefined;
        let obj = localeObj;
        for (const k of keys) {
            if (obj && obj[k] !== undefined) {
                obj = obj[k];
            } else {
                return undefined;
            }
        }
        return obj;
    }

    applyTranslations(rootElement = document) {
        if (!this.initialized) return;
        const elements = rootElement.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                el.innerText = this.translate(key);
            }
        });
        
        // Also handle placeholders if needed
        const inputs = rootElement.querySelectorAll('[data-i18n-placeholder]');
        inputs.forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) {
                el.placeholder = this.translate(key);
            }
        });

        // Also handle titles (tooltips)
        const titledEls = rootElement.querySelectorAll('[data-i18n-title]');
        titledEls.forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (key) {
                el.title = this.translate(key);
            }
        });

        // Handle document title
        const titleEl = rootElement.querySelector('title[data-i18n]');
        if (titleEl) {
            document.title = this.translate(titleEl.getAttribute('data-i18n'));
        }
    }

    async setLanguage(lang) {
        if (this.currentLang === lang) return;
        this.currentLang = lang;
        localStorage.setItem('language', lang);
        await this.init(); 
    }
}

// Instantiate globally
window.i18n = new I18nManager();

// Automatically init based on dom load
document.addEventListener('DOMContentLoaded', () => {
    window.i18n.init();
});
