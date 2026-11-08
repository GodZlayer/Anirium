import fs from 'fs';

const filePath = 'c:/Users/santo/Documents/Anirium-App/resources/views/pages/lobby.blade.php';
let content = fs.readFileSync(filePath, 'utf8');

const targetOld = `        // 5. PILHA DE NAVEGAÇÃO DETERMINÃ STICA DO TGCODE (Injeção de Parciais Blade Direto do PHP)
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

const dynamicNav = `        // 5. PILHA DE NAVEGAÇÃO DETERMINÍSTICA DINÂMICA DO TGCODE (Histórico Vivo de Navegação pelas Entidades)
        window.navStack = [];

        window.pushNavigation = function(type, id, label) {
            // Se a mesma entidade já estiver no topo, não duplica
            const current = window.navStack[window.navStack.length - 1];
            if (current && current.id === id && current.type === type) return;

            // Se o usuário clicar em um item anterior de sua própria jornada, retrocede até ele
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

if (content.includes(targetOld)) {
    content = content.replace(targetOld, dynamicNav);
    console.log('Target replaced cleanly!');
} else {
    console.log('Finding target using flexible regex...');
    content = content.replace(
        /\/\/\s*5\.\s*PILHA DE NAVEGA[^\n]*\n\s*window\.navStack\s*=\s*\[\];\s*\n\s*window\.pushNavigation\s*=\s*function[\s\S]*?window\.clearNavigation\s*=\s*function\(\)\s*\{[\s\S]*?\};/,
        dynamicNav
    );
    console.log('Regex replace finished!');
}

// Ensure window.renderDynamicBreadcrumb() is called in renderCurrentState
content = content.replace(
    /window\.entityHtmlCache\.set\(cacheKey,\s*html\);\s*container\.innerHTML\s*=\s*html;\s*(window\.renderDynamicBreadcrumb\(\);\s*)?/g,
    'window.entityHtmlCache.set(cacheKey, html);\n                    container.innerHTML = html;\n                    window.renderDynamicBreadcrumb();\n'
);

content = content.replace(
    /container\.innerHTML\s*=\s*window\.entityHtmlCache\.get\(cacheKey\);\s*(window\.renderDynamicBreadcrumb\(\);\s*)?/g,
    'container.innerHTML = window.entityHtmlCache.get(cacheKey);\n                window.renderDynamicBreadcrumb();\n'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Saved lobby.blade.php with verified dynamic breadcrumb!');
