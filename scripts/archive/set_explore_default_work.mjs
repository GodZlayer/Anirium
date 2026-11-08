import fs from 'fs';

const filePath = 'C:/Users/santo/Documents/Anirium-App/resources/views/pages/lobby.blade.php';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  'class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm whitespace-nowrap" data-kind="universe"',
  'class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap" data-kind="universe"'
);

content = content.replace(
  'class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap" data-kind="work"',
  'class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm whitespace-nowrap" data-kind="work"'
);

content = content.replace("window.exploreKindFilter = 'universe';", "window.exploreKindFilter = 'work';");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Explore default set to work successfully!');
