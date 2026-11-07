import fs from 'fs';

const filePath = 'c:/Users/santo/Documents/Anirium-App/resources/views/pages/lobby.blade.php';
let content = fs.readFileSync(filePath, 'utf8');

const target = `        // 5. PILHA DE NAVEGAÇÃO DETERMINÍSTICA DO TGCODE (Injeção de Parciais Blade Direto do PHP)
        window.navStack = [];

        window.pushNavigation = function(type, id, label) {
            window.navStack.push({ type, id, label });
            window.renderCurrentState();
        };

        window.popNavigation = function() {
            if (window.navStack.length > 0) {
                window.navStack.pop();
                window.renderCurrentState();
            }
        };

        window.clearNavigation = function() {
            window.navStack = [];
            window.renderCurrentState();
        };`;

const replacement = `        // 5. PILHA DE NAVEGAÇÃO DETERMINÍSTICA DINÂMICA DO TGCODE (Histórico Vivo de Navegação pelas Entidades)
        window.navStack = [];

        window.pushNavigation = function(type, id, label) {
            // Evita duplicar no topo da pilha a mesma entidade se clicada repetidamente
            const current = window.navStack[window.navStack.length - 1];
            if (current && current.id === id && current.type === type) return;

            // Se o usuário clicar em um item anterior do seu próprio histórico, retrocede até ele
            const existingIndex = window.navStack.findIndex(item => item.id === id && item.type === type);
            if (existingIndex !== -1) {
                window.navStack = window.navStack.slice(0, existingIndex + 1);
            } else {
                window.navStack.push({ type, id, label: label || type });
            }
            window.renderCurrentState();
        };

        window.navigateToHistoryIndex = function(index) {
            if (index < 0) {
                window.clearNavigation();
                return;
            }
            if (index < window.navStack.length) {
                window.navStack = window.navStack.slice(0, index + 1);
                window.renderCurrentState();
            }
        };

        window.popNavigation = function() {
            if (window.navStack.length > 0) {
                window.navStack.pop();
                window.renderCurrentState();
            }
        };

        window.clearNavigation = function() {
            window.navStack = [];
            window.renderCurrentState();
        };

        window.renderDynamicBreadcrumb = function() {
            const nav = document.getElementById('entity-dynamic-breadcrumb');
            if (!nav) return;

            let html = '<button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent transition-colors shrink-0" data-i18n="nav.home">Lobby</button>';

            window.navStack.forEach((entry, idx) => {
                const isLast = (idx === window.navStack.length - 1);
                const displayLabel = entry.label || entry.type || 'Entidade';
                html += '<span class="opacity-40">❯</span>';
                if (isLast) {
                    html += \`<span class="text-theme-accent font-bold truncate max-w-xs">\${displayLabel}</span>\`;
                } else {
                    html += \`<button type="button" onclick="window.navigateToHistoryIndex(\${idx})" class="hover:text-theme-accent transition-colors truncate max-w-xs cursor-pointer">\${displayLabel}</button>\`;
                }
            });

            nav.innerHTML = html;
        };`;

if (content.includes('window.pushNavigation = function(type, id, label) {')) {
    content = content.replace(target, replacement);
    console.log('Successfully replaced navigation stack methods!');
} else {
    console.warn('Could not find target navigation block');
}

// In renderCurrentState, after updating container.innerHTML, call window.renderDynamicBreadcrumb()
const renderDomTarget = `                    window.entityHtmlCache.set(cacheKey, html);
                    container.innerHTML = html;
                    if (window.i18n) window.i18n.applyToDOM();`;

const renderDomReplacement = `                    window.entityHtmlCache.set(cacheKey, html);
                    container.innerHTML = html;
                    window.renderDynamicBreadcrumb();
                    if (window.i18n) window.i18n.applyToDOM();`;

content = content.replace(renderDomTarget, renderDomReplacement);

// Also in the cache hit branch:
const cacheHitTarget = `            if (window.entityHtmlCache.has(cacheKey)) {
                container.innerHTML = window.entityHtmlCache.get(cacheKey);
                if (window.i18n) window.i18n.applyToDOM();
                return;
            }`;

const cacheHitReplacement = `            if (window.entityHtmlCache.has(cacheKey)) {
                container.innerHTML = window.entityHtmlCache.get(cacheKey);
                window.renderDynamicBreadcrumb();
                if (window.i18n) window.i18n.applyToDOM();
                return;
            }`;

content = content.replace(cacheHitTarget, cacheHitReplacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Saved lobby.blade.php with dynamic breadcrumb!');
