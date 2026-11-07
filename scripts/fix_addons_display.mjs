import fs from 'fs';

const filePath = 'c:/Users/santo/Documents/Anirium-App/resources/views/pages/lobby.blade.php';
let content = fs.readFileSync(filePath, 'utf8');

// Helper formatting function to give clean names to addons
const helperLogic = `        function formatAddonDisplayName(a) {
            if (a.name && !a.name.startsWith('remote-')) return a.name;
            const url = (a.manifest_url || '').toLowerCase();
            if (url.includes('torrentio')) return 'Torrentio (P2P Streams)';
            if (url.includes('netflix')) return 'Netflix Catalog Stream';
            if (url.includes('thepiratebay')) return 'ThePirateBay+ (Torrents)';
            if (url.includes('brazuca')) return 'Brazuca Torrents (Dub/Sub)';
            if (url.includes('animesub')) return 'AnimeSub (Legendas PT-BR)';
            if (url.includes('opensubtitles')) return 'OpenSubtitles v3 Pro';
            if (url.includes('subdl')) return 'SubDL (Subtitle Engine)';
            if (url.includes('subsource')) return 'SubSource (Subtitles)';
            if (url.includes('stremio-br-anime')) return 'Stremio BR Anime';
            if (url.includes('aniscraper') || url.includes('nyaa')) return 'AniScraper (Nyaa P2P)';
            if (a.name) return a.name.replace(/^remote-([a-f0-9]{8})[a-f0-9]+$/, 'Addon Comunitário #$1');
            return 'Addon Comunitário #' + (a.id || '').substring(0, 8);
        }

        window.renderAddonsList = function() {`;

content = content.replace('window.renderAddonsList = function() {', helperLogic);

const oldItem = `<h5 class="text-xs font-bold text-theme-primary truncate">\${a.name || a.id}</h5>
                            <p class="text-[10px] font-mono text-theme-muted truncate">\${a.description || a.version || 'Stremio Community Addon'}</p>`;

const newItem = `<h5 class="text-xs font-bold text-theme-primary truncate">\${formatAddonDisplayName(a)}</h5>
                            <p class="text-[10px] font-mono text-theme-muted truncate">\${a.manifest_url ? (a.manifest_url.replace(/https?:\\/\\//, '').split('/')[0]) : (a.description || 'Stremio Community Addon')}</p>`;

if (content.includes(oldItem)) {
    content = content.replace(oldItem, newItem);
    console.log('Successfully updated addon card rendering!');
} else {
    console.warn('Could not find oldItem snippet in lobby.blade.php');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('lobby.blade.php saved!');
