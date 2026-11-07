<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use App\Models\User;

class UserAddonSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::where('email', 'santoss.cog@gmail.com')->first();
        if (!$user) {
            return;
        }

        // 1. Addon Nyaa P2P Provider Server
        DB::table('user_addons')->updateOrInsert(
            ['user_id' => $user->id, 'addon_id' => 'community.nyaa.p2p'],
            [
                'name' => 'Nyaa Provider Server',
                'version' => '3.0.0',
                'type' => 'community',
                'manifest_url' => 'http://127.0.0.1:4001/manifest',
                'manifest_json' => json_encode([
                    'id' => 'community.nyaa.p2p',
                    'name' => 'Nyaa Provider Server',
                    'version' => '3.0.0',
                    'description' => 'Adaptador P2P Nyaa: busca automática de torrents e magnets com contagem de seeders e leechers.',
                    'author' => 'Anirium Open Community',
                    'capabilities' => ['magnet.search'],
                    'endpoints' => ['manifest' => '/manifest', 'search' => '/search', 'health' => '/health'],
                ]),
                'enabled' => true,
                'updated_at' => now(),
            ]
        );

        // 2. Addon Torrentio (Stremio Padrão)
        DB::table('user_addons')->updateOrInsert(
            ['user_id' => $user->id, 'addon_id' => 'community.stremio.torrentio'],
            [
                'name' => 'Torrentio (Stremio Addon)',
                'version' => '1.0.0',
                'type' => 'community',
                'manifest_url' => 'https://torrentio.strem.fun/manifest.json',
                'manifest_json' => json_encode([
                    'id' => 'community.stremio.torrentio',
                    'name' => 'Torrentio',
                    'version' => '1.0.0',
                    'description' => 'Addon Stremio para resolução descentralizada de streams e fontes de torrent.',
                    'author' => 'Stremio Community',
                    'capabilities' => ['playback.source.provide'],
                ]),
                'enabled' => true,
                'updated_at' => now(),
            ]
        );

        // 3. Addon Anime Kitsu & Streams (Stremio Padrão)
        DB::table('user_addons')->updateOrInsert(
            ['user_id' => $user->id, 'addon_id' => 'community.stremio.anime-kitsu'],
            [
                'name' => 'Anime Kitsu & Streams (Stremio)',
                'version' => '1.0.0',
                'type' => 'community',
                'manifest_url' => 'https://anime-kitsu.strem.fun/manifest.json',
                'manifest_json' => json_encode([
                    'id' => 'community.stremio.anime-kitsu',
                    'name' => 'Anime Kitsu',
                    'version' => '1.0.0',
                    'description' => 'Catálogo de animes e links de episódios compatível com formato Stremio.',
                    'author' => 'Stremio Community',
                    'capabilities' => ['playback.source.provide'],
                ]),
                'enabled' => true,
                'updated_at' => now(),
            ]
        );
    }
}
