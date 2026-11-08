import fs from 'fs';

const filePath = 'C:/Users/santo/Documents/Anirium-App/resources/views/pages/lobby.blade.php';
let content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines[325] = "                        ['id' => 'saturdays', 'label' => 'SÁB', 'full' => 'Sábado'],";

content = lines.join('\n');
fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed SÁB by line indexing!');
