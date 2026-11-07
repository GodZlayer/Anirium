import fs from 'fs';

const files = [
  'c:/Users/santo/Documents/Anirium-App/resources/views/partials/context-card.blade.php',
  'c:/Users/santo/Documents/Anirium-App/resources/views/partials/entities/universe-view.blade.php',
  'c:/Users/santo/Documents/Anirium-App/resources/views/partials/entities/arc-view.blade.php',
  'c:/Users/santo/Documents/Anirium-App/resources/views/partials/entities/creator-view.blade.php',
  'c:/Users/santo/Documents/Anirium-App/resources/views/partials/entities/studio-view.blade.php',
  'c:/Users/santo/Documents/Anirium-App/resources/views/partials/entities/track-view.blade.php'
];

const unifiedNav = `<nav id="entity-dynamic-breadcrumb" class="flex items-center gap-2 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar">
                <button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent transition-colors shrink-0" data-i18n="nav.home">Lobby</button>
            </nav>`;

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    const updated = content.replace(/<nav[\s\S]*?<\/nav>/, unifiedNav);
    if (updated !== content) {
      fs.writeFileSync(f, updated, 'utf8');
      console.log('Replaced breadcrumb in:', f.split('/').pop());
    }
  }
});
