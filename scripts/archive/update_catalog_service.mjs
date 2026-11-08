import fs from 'fs';

const filePath = 'C:/Users/santo/Documents/Anirium-App/app/Services/Cache/InMemoryCatalogService.php';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  "'total' => count($items),",
  "'total' => Cache::rememberForever('catalog:total_anime_count', function () { return DB::table('catalog_works')->where('media', 'anime')->count(); }),"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('InMemoryCatalogService updated successfully!');
