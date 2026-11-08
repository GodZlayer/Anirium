import fs from 'fs';

const filePath = 'C:/Users/santo/Documents/Anirium-App/resources/views/pages/lobby.blade.php';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  '<div class="p-3 rounded-2xl bg-theme-raised border border-theme-default flex flex-col gap-1.5 transition-all">',
  '<div class="p-3 rounded-2xl bg-theme-raised border border-theme-default flex flex-col gap-1.5 transition-all" data-comment-id="${c.id}" data-user-id="${c.user_id}">'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Added data-comment-id and data-user-id to comments successfully!');
