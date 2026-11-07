// TGCode Universal Theme & i18n Engine (Token & String ID Driven)
// Zero hardcoded text, zero hardcoded colors.
// ElementoVisual = F(Tokens, Strings, Payload)

window.THEME_CACHE = {};
window.LANG_CACHE = {};

window.currentTheme = localStorage.getItem('anirium_theme') || 'black';
window.currentLang = localStorage.getItem('anirium_lang') || 'pt-BR';

// 1. CARREGADOR E APLICADOR DE TEMA VIA TOKENS POR ID
window.applyTheme = async function(themeId) {
    try {
        if (!window.THEME_CACHE[themeId]) {
            const res = await fetch(`/themes/${themeId}.json?v=${Date.now()}`);
            if (!res.ok) throw new Error(`Tema ${themeId} não encontrado.`);
            window.THEME_CACHE[themeId] = await res.json();
        }
        const themeData = window.THEME_CACHE[themeId];
        window.currentTheme = themeData.theme_id || themeId;
        localStorage.setItem('anirium_theme', window.currentTheme);

        const root = document.documentElement;
        const tokens = themeData.tokens || {};

        // Injeta cada token ID como variável CSS: "color.bg.base" -> "--color-bg-base"
        for (const [tokenId, value] of Object.entries(tokens)) {
            const cssVar = '--' + tokenId.replace(/\./g, '-');
            root.style.setProperty(cssVar, value);
        }

        // Variáveis semânticas globais conectadas a tokens
        if (tokens['color.bg.base']) {
            root.style.setProperty('--bg-canvas', tokens['color.bg.base']);
            root.style.setProperty('--color-bg-base', tokens['color.bg.base']);
            document.body.style.backgroundColor = tokens['color.bg.base'];
        }
        if (tokens['color.bg.surface']) {
            root.style.setProperty('--surface-elevated', tokens['color.bg.surface']);
            root.style.setProperty('--color-bg-surface', tokens['color.bg.surface']);
        }
        if (tokens['color.bg.raised']) {
            root.style.setProperty('--color-bg-raised', tokens['color.bg.raised']);
        }
        if (tokens['color.bg.overlay']) {
            root.style.setProperty('--color-bg-overlay', tokens['color.bg.overlay']);
        }
        if (tokens['color.border.default']) {
            root.style.setProperty('--surface-border', tokens['color.border.default']);
            root.style.setProperty('--color-border-default', tokens['color.border.default']);
        }
        if (tokens['color.border.highlight']) {
            root.style.setProperty('--color-border-highlight', tokens['color.border.highlight']);
        }
        if (tokens['color.accent.primary']) {
            root.style.setProperty('--accent-primary', tokens['color.accent.primary']);
            root.style.setProperty('--color-accent-primary', tokens['color.accent.primary']);
            root.style.setProperty('--color-accent-gold', tokens['color.accent.primary']);
        }
        if (tokens['color.text.primary']) {
            root.style.setProperty('--text-primary', tokens['color.text.primary']);
            root.style.setProperty('--color-text-primary', tokens['color.text.primary']);
            document.body.style.color = tokens['color.text.primary'];
        }
        if (tokens['color.text.secondary']) {
            root.style.setProperty('--text-secondary', tokens['color.text.secondary']);
            root.style.setProperty('--color-text-secondary', tokens['color.text.secondary']);
        }
        if (tokens['color.text.muted']) {
            root.style.setProperty('--color-text-muted', tokens['color.text.muted']);
        }
        if (tokens['color.header.bg']) {
            root.style.setProperty('--color-header-bg', tokens['color.header.bg']);
        }
        if (tokens['color.card.bg']) {
            root.style.setProperty('--color-card-bg', tokens['color.card.bg']);
        }
        if (tokens['color.pill.bg']) {
            root.style.setProperty('--color-pill-bg', tokens['color.pill.bg']);
        }

        // Alterna atributo data-theme e classes de modo Light vs Dark
        root.setAttribute('data-theme', window.currentTheme);
        if (themeData.mode === 'light') {
            root.classList.remove('dark');
            root.classList.add('light');
        } else {
            root.classList.remove('light');
            root.classList.add('dark');
        }

        // Atualizar indicador visual no botão da topbar
        const indicator = document.getElementById('current-theme-indicator');
        if (indicator) {
            indicator.style.backgroundColor = themeData.color_primary || tokens['color.accent.primary'] || '#FFC766';
        }
        const themeLabel = document.getElementById('current-theme-name');
        if (themeLabel) {
            themeLabel.innerText = themeData.name || 'Tema';
        }

        // Se houver cards renderizados dinamicamente, re-renderizar para atualizar tokens
        if (typeof window.runClientSideCatalogFilter === 'function' && window.currentTab === 'explore') {
            window.runClientSideCatalogFilter();
        }

        console.log(`[ThemeEngine] Tema aplicado com sucesso: ${themeData.name} (${window.currentTheme})`);
    } catch (err) {
        console.error('[ThemeEngine] Erro ao carregar tema:', err);
    }
};

// 2. CARREGADOR E APLICADOR DE IDIOMA VIA STRING IDs
window.applyLanguage = async function(langCode) {
    try {
        if (!window.LANG_CACHE[langCode]) {
            const res = await fetch(`/i18n/${langCode}.json?v=${Date.now()}`);
            if (!res.ok) throw new Error(`Idioma ${langCode} não encontrado.`);
            window.LANG_CACHE[langCode] = await res.json();
        }
        const langData = window.LANG_CACHE[langCode];
        window.currentLang = langData.locale || langCode;
        localStorage.setItem('anirium_lang', window.currentLang);

        // Atualiza indicadores de idioma no botão da topbar (Exibe a Bandeira Visual SVG)
        const flagEl = document.getElementById('current-lang-flag');
        if (flagEl) {
            if (flagEl.tagName.toLowerCase() === 'img') {
                flagEl.src = `/assets/flags/${langCode}.svg`;
                flagEl.alt = langData.name || langCode;
            } else {
                flagEl.innerText = langData.flag || '🌐';
            }
        }
        const codeEl = document.getElementById('current-lang-code');
        if (codeEl) codeEl.innerText = '';

        // Traduz todo o DOM guiado por IDs
        window.translateDOM();

        // Re-executa renderers dinâmicos que contêm strings internas
        if (typeof window.runClientSideCatalogFilter === 'function' && window.currentTab === 'explore') {
            window.runClientSideCatalogFilter();
        }
        if (typeof window.renderCalendarPage === 'function' && window.currentTab === 'calendar') {
            window.renderCalendarPage();
        }

        console.log(`[i18nEngine] Idioma aplicado: ${langData.name} (${window.currentLang})`);
    } catch (err) {
        console.error('[i18nEngine] Erro ao carregar idioma:', err);
    }
};

// 3. FUNÇÃO AUXILIAR DE TRADUÇÃO VIA ID: window.t('nav.home')
window.t = function(key, fallback = '') {
    const langData = window.LANG_CACHE[window.currentLang];
    if (!langData || !langData.strings) return fallback || key;
    return langData.strings[key] !== undefined ? langData.strings[key] : (fallback || key);
};

// 4. TRADUZIR ELEMENTOS DO DOM MARCADOS COM data-i18n OU data-i18n-placeholder
window.translateDOM = function(rootEl = document) {
    const langData = window.LANG_CACHE[window.currentLang];
    if (!langData || !langData.strings) return;
    const strings = langData.strings;

    // Texto interno
    rootEl.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (strings[key] !== undefined) {
            el.innerText = strings[key];
        }
    });

    // Placeholders de inputs
    rootEl.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (strings[key] !== undefined) {
            el.setAttribute('placeholder', strings[key]);
        }
    });

    // Títulos / Tooltips
    rootEl.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (strings[key] !== undefined) {
            el.setAttribute('title', strings[key]);
        }
    });
};

// 5. DROPDOWNS INDEPENDENTES (UM PARA TEMA, OUTRO PARA IDIOMA)
window.toggleThemeMenu = function(e) {
    if (e) e.stopPropagation();
    const langDrop = document.getElementById('lang-dropdown');
    if (langDrop) langDrop.classList.add('hidden');

    const themeDrop = document.getElementById('theme-dropdown');
    if (themeDrop) themeDrop.classList.toggle('hidden');
};

window.closeThemeMenu = function() {
    const themeDrop = document.getElementById('theme-dropdown');
    if (themeDrop) themeDrop.classList.add('hidden');
};

window.toggleLangMenu = function(e) {
    if (e) e.stopPropagation();
    const themeDrop = document.getElementById('theme-dropdown');
    if (themeDrop) themeDrop.classList.add('hidden');

    const langDrop = document.getElementById('lang-dropdown');
    if (langDrop) langDrop.classList.toggle('hidden');
};

window.closeLangMenu = function() {
    const langDrop = document.getElementById('lang-dropdown');
    if (langDrop) langDrop.classList.add('hidden');
};

// Fechar ao clicar fora
document.addEventListener('click', function(e) {
    const themeDrop = document.getElementById('theme-dropdown');
    if (themeDrop && !themeDrop.contains(e.target) && !e.target.closest('#btn-theme-trigger')) {
        themeDrop.classList.add('hidden');
    }

    const langDrop = document.getElementById('lang-dropdown');
    if (langDrop && !langDrop.contains(e.target) && !e.target.closest('#btn-lang-trigger')) {
        langDrop.classList.add('hidden');
    }
});

// Observador para traduzir conteúdo inserido dinamicamente (modais, cards, parciais)
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // ELEMENT_NODE
                    window.translateDOM(node);
                }
            });
        }
    }
});
observer.observe(document.body, { childList: true, subtree: true });

// Inicialização automática ao carregar
document.addEventListener('DOMContentLoaded', function() {
    window.applyTheme(window.currentTheme);
    window.applyLanguage(window.currentLang);
});
