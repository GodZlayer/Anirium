const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'anirium.db'));
const rows = db.prepare('SELECT mal_id, title, streaming_links_json FROM anime_catalog WHERE title LIKE ? OR title LIKE ?').all('%Tsuihou%', '%Hell Mode%');
console.log(JSON.stringify(rows, null, 2));
