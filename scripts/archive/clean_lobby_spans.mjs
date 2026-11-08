import fs from 'fs';

const filePath = 'C:/Users/santo/Documents/Anirium-App/resources/views/pages/lobby.blade.php';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/\r\n/g, '\n');
content = content.replace(/<span class="text-3xl">[^\n<]+<\/span>\n\s+<p class="text-sm font-mono text-theme-muted"><span data-i18n="state\.no_works_filtered">[\s\S]*?<\/p>/, '<span class="text-3xl">🔍</span>\n                        <p class="text-sm font-mono text-theme-muted"><span data-i18n="state.no_works_filtered">Nenhuma obra corresponde aos filtros ativos no navegador.</span></p>');

// Clean up any repeated span data-i18n across the file
content = content.replace(/(<span data-i18n="[^"]+">)+/g, (match, p1) => p1);
content = content.replace(/(<\/span>){4,}/g, '</span>');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Cleaned nested spans and search icon successfully!');
