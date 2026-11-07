import fs from 'fs';

const filePath = 'C:/Users/santo/Documents/Anirium-App/app/Http/Controllers/CatalogGraphController.php';
let content = fs.readFileSync(filePath, 'utf8');

const oldMethod = `    private function resolveUuid(string $id, string $kind = 'work'): ?string
    {
        $cleanId = preg_replace('/\\.0$/', '', trim($id));

        // 1. Tentar mapeamento por catalog_external_identities
        $ext = DB::table('catalog_external_identities')
            ->where('external_id', $cleanId)
            ->value('entity_id');
        if ($ext) return $ext;

        // 2. Se for 'work' mas o ID fornecido for de um episódio, redireciona para a obra do episódio
        if ($kind === 'work' && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $cleanId)) {
            $isWork = DB::table('catalog_works')->where('id', $cleanId)->exists();
            if (!$isWork) {
                $epWorkId = DB::table('catalog_episodes')->where('id', $cleanId)->value('work_id');
                if ($epWorkId) return $epWorkId;
                $arcWorkId = DB::table('catalog_arc_works')->where('arc_id', $cleanId)->value('work_id');
                if ($arcWorkId) return $arcWorkId;
            }
        }

        // Se já for UUID válido, retorna direto
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $cleanId)) {
            return $cleanId;
        }

        // 3. Se for 'work', tentar busca por ID numérico ou título parecido
        if ($kind === 'work') {
            $workId = DB::table('catalog_works')
                ->where('id', 'like', "%{$cleanId}%")
                ->value('id');
            if ($workId) return $workId;
        }

        return $cleanId;
    }`;

const newMethod = `    private function resolveUuid(string $id, string $kind = 'work'): ?string
    {
        $cleanId = preg_replace('/\\.0$/', '', trim($id));

        // 1. Se já for um UUID v4 legítimo e existir na tabela principal, retorna em 1ms
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $cleanId)) {
            if ($kind === 'work') {
                $isWork = DB::table('catalog_works')->where('id', $cleanId)->exists();
                if ($isWork) return $cleanId;
                
                // Se o UUID pertencer a um episódio ou arco, redireciona para a obra
                $epWorkId = DB::table('catalog_episodes')->where('id', $cleanId)->value('work_id');
                if ($epWorkId) return $epWorkId;
                $arcWorkId = DB::table('catalog_arc_works')->where('arc_id', $cleanId)->value('work_id');
                if ($arcWorkId) return $arcWorkId;
            }
            return $cleanId;
        }

        // 2. Se for external ID (ex: MyAnimeList ID, AniList ID, Shikimori ID), busca no índice
        $ext = DB::table('catalog_external_identities')
            ->where('external_id', $cleanId)
            ->value('entity_id');
        if ($ext) return $ext;

        // 3. Fallback: busca por prefixo/título se não for UUID
        if ($kind === 'work' && strlen($cleanId) >= 3) {
            $workId = DB::table('catalog_works')
                ->where('id', 'like', "{$cleanId}%")
                ->value('id');
            if ($workId) return $workId;
        }

        return $cleanId;
    }`;

if (content.includes('private function resolveUuid')) {
  // Replace using regex or direct search
  content = content.replace(/private function resolveUuid[\s\S]*?return \$cleanId;\s*\}/, newMethod.trim());
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('resolveUuid optimized successfully!');
} else {
  console.error('Could not find resolveUuid in file');
}
