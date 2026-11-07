<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class FixBladeTokensAndI18nCommand extends Command
{
    protected $signature = 'fix:blade-tokens';
    protected $description = 'Substitui todas as cores Tailwind fixas por classes de tokens semânticos e adiciona chaves i18n';

    public function handle(): int
    {
        $this->info("1. Atualizando dicionários i18n com as chaves faltantes...");
        $this->updateI18nDictionaries();

        $this->info("2. Tokenizando views Blade...");
        $this->fixViews();

        return 0;
    }

    private function updateI18nDictionaries(): void
    {
        $locales = ['pt-BR', 'en-US', 'es-ES', 'ja-JP', 'zh-CN', 'ru-RU', 'it-IT', 'fr-FR', 'de-DE', 'hi-IN'];
        $newStrings = [
            'pt-BR' => [
                'state.loading_context' => 'Carregando contexto compilado no servidor PHP...',
                'state.no_works_filtered' => 'Nenhuma obra corresponde aos filtros ativos no navegador.',
                'state.no_anime_day' => 'Nenhum anime neste dia da semana.',
                'state.on_air' => 'No Ar',
                'state.watched' => 'Assistido',
                'state.error_partial' => 'Erro ao compilar parcial Blade para esta obra.',
                'state.error_connection' => 'Falha de conexão com o backend PHP.',
                'state.no_title' => 'Entidade Sem Título',
                'state.canon' => 'Cânon',
                'state.filler' => 'Filler',
                'state.mixed' => 'Misto',
                'profile.tab_overview' => 'Visão Geral',
                'profile.tab_library' => 'Favoritos',
                'profile.tab_history' => 'Histórico',
                'profile.tab_addons' => 'Add-ons',
                'profile.tab_settings' => 'Configurações',
                'profile.role_admin' => 'Administrador',
                'profile.role_plus' => 'Anirium+',
                'profile.role_member' => 'Membro',
                'profile.role_guest' => 'Visitante',
                'profile.filter_entity' => 'Entidade',
                'profile.filter_status' => 'Status',
                'profile.sort_recent' => 'Mais Recentes',
                'profile.sort_alpha' => 'Alfabética',
                'profile.sort_score' => 'Nota',
                'profile.empty_library' => 'Nenhum item adicionado aos favoritos ainda.',
                'profile.empty_history' => 'Nenhum histórico registrado ainda.',
                'profile.last_progress' => 'Último Progresso:',
                'profile.resume_universe' => 'Continuar Universo ❯',
                'profile.official_addons' => 'Add-ons Oficiais Anirium+',
                'profile.community_addons' => 'Add-ons da Comunidade (Stremio)',
                'profile.install_addon' => 'Instalar Add-on',
                'profile.addon_manifest_placeholder' => 'Cole a URL stremio:// ou https://.../manifest.json',
                'profile.addon_btn_install' => 'Instalar',
                'profile.addon_unauthorized' => 'Requer plano Anirium+ ou Administrador',
                'profile.no_addons' => 'Nenhum add-on comunitário instalado.',
                'action.bookmark' => 'Favoritar',
                'action.bookmarked' => 'Favoritado',
                'action.like' => 'Curtir',
                'action.liked' => 'Curtido',
                'action.rate' => 'Avaliar',
                'action.your_score' => 'Sua Nota',
                'action.watched' => 'Assistido',
                'action.mark_watched' => 'Marcar como Assistido',
                'action.status_watching' => 'Consumindo',
                'action.status_completed' => 'Concluído',
                'action.status_plan' => 'Na Fila',
                'action.status_dropped' => 'Pausado',
                'profile.session_secure' => 'Sessão criptografada e autenticada via Google OAuth 2.0',
                'profile.player_pro' => 'Anirium Player Pro',
                'profile.player_pro_desc' => 'Engine P2P com streaming multi-dub e legendas sincronizadas.',
            ],
            'en-US' => [
                'state.loading_context' => 'Loading context compiled on PHP server...',
                'state.no_works_filtered' => 'No works match the active browser filters.',
                'state.no_anime_day' => 'No anime on this day of the week.',
                'state.on_air' => 'On Air',
                'state.watched' => 'Watched',
                'state.error_partial' => 'Error compiling Blade partial for this work.',
                'state.error_connection' => 'Connection failure with PHP backend.',
                'state.no_title' => 'Untitled Entity',
                'state.canon' => 'Canon',
                'state.filler' => 'Filler',
                'state.mixed' => 'Mixed',
                'profile.tab_overview' => 'Overview',
                'profile.tab_library' => 'Favorites',
                'profile.tab_history' => 'History',
                'profile.tab_addons' => 'Add-ons',
                'profile.tab_settings' => 'Settings',
                'profile.role_admin' => 'Administrator',
                'profile.role_plus' => 'Anirium+',
                'profile.role_member' => 'Member',
                'profile.role_guest' => 'Guest',
                'profile.filter_entity' => 'Entity',
                'profile.filter_status' => 'Status',
                'profile.sort_recent' => 'Most Recent',
                'profile.sort_alpha' => 'Alphabetical',
                'profile.sort_score' => 'Score',
                'profile.empty_library' => 'No items added to favorites yet.',
                'profile.empty_history' => 'No history recorded yet.',
                'profile.last_progress' => 'Last Progress:',
                'profile.resume_universe' => 'Resume Universe ❯',
                'profile.official_addons' => 'Official Anirium+ Add-ons',
                'profile.community_addons' => 'Community Add-ons (Stremio)',
                'profile.install_addon' => 'Install Add-on',
                'profile.addon_manifest_placeholder' => 'Paste stremio:// or https://.../manifest.json URL',
                'profile.addon_btn_install' => 'Install',
                'profile.addon_unauthorized' => 'Requires Anirium+ or Administrator plan',
                'profile.no_addons' => 'No community add-ons installed.',
                'action.bookmark' => 'Bookmark',
                'action.bookmarked' => 'Bookmarked',
                'action.like' => 'Like',
                'action.liked' => 'Liked',
                'action.rate' => 'Rate',
                'action.your_score' => 'Your Score',
                'action.watched' => 'Watched',
                'action.mark_watched' => 'Mark as Watched',
                'action.status_watching' => 'Watching',
                'action.status_completed' => 'Completed',
                'action.status_plan' => 'Plan to Watch',
                'action.status_dropped' => 'On Hold',
                'profile.session_secure' => 'Encrypted session authenticated via Google OAuth 2.0',
                'profile.player_pro' => 'Anirium Player Pro',
                'profile.player_pro_desc' => 'P2P engine with multi-dub streaming and synced subtitles.',
            ],
            'es-ES' => [
                'state.loading_context' => 'Cargando contexto compilado en el servidor PHP...',
                'state.no_works_filtered' => 'Ninguna obra coincide con los filtros activos.',
                'state.no_anime_day' => 'No hay anime este día de la semana.',
                'state.on_air' => 'En Emisión',
                'state.watched' => 'Visto',
                'state.error_partial' => 'Error al compilar parcial Blade para esta obra.',
                'state.error_connection' => 'Fallo de conexión con el backend PHP.',
                'state.no_title' => 'Entidad Sin Título',
                'state.canon' => 'Canon',
                'state.filler' => 'Relleno',
                'state.mixed' => 'Mixto',
            ],
            'ja-JP' => [
                'state.loading_context' => 'PHPサーバーでコンテキストをコンパイル中...',
                'state.no_works_filtered' => 'アクティブなフィルターに一致する作品はありません。',
                'state.no_anime_day' => 'この曜日に配信されるアニメはありません。',
                'state.on_air' => '放送中',
                'state.watched' => '視聴済み',
                'state.error_partial' => 'ブレードパーシャルのコンパイルエラー。',
                'state.error_connection' => 'PHPバックエンドとの接続に失敗しました。',
                'state.no_title' => '無題のエンティティ',
                'state.canon' => '原作準拠',
                'state.filler' => 'アニオリ',
                'state.mixed' => '混合',
            ],
            'zh-CN' => [
                'state.loading_context' => '正在PHP服务器上编译上下文...',
                'state.no_works_filtered' => '没有与当前筛选条件匹配的作品。',
                'state.no_anime_day' => '本周该日暂无更新动画。',
                'state.on_air' => '连载中',
                'state.watched' => '已观看',
                'state.error_partial' => '编译Blade局部视图时出错。',
                'state.error_connection' => '与PHP后端连接失败。',
                'state.no_title' => '无标题实体',
                'state.canon' => '正篇',
                'state.filler' => '原创/非主线',
                'state.mixed' => '混合',
            ],
            'ru-RU' => [
                'state.loading_context' => 'Загрузка контекста с PHP-сервера...',
                'state.no_works_filtered' => 'Нет произведений, соответствующих фильтрам.',
                'state.no_anime_day' => 'В этот день недели нет запланированных аниме.',
                'state.on_air' => 'В эфире',
                'state.watched' => 'Просмотрено',
                'state.error_partial' => 'Ошибка компиляции частичного шаблона Blade.',
                'state.error_connection' => 'Сбой подключения к бэкенду PHP.',
                'state.no_title' => 'Без названия',
                'state.canon' => 'Канон',
                'state.filler' => 'Филлер',
                'state.mixed' => 'Смешанный',
            ],
            'it-IT' => [
                'state.loading_context' => 'Caricamento del contesto compilato sul server PHP...',
                'state.no_works_filtered' => 'Nessuna opera corrisponde ai filtri attivi.',
                'state.no_anime_day' => 'Nessun anime in questo giorno della settimana.',
                'state.on_air' => 'In Onda',
                'state.watched' => 'Visto',
                'state.error_partial' => 'Errore nella compilazione della vista Blade.',
                'state.error_connection' => 'Errore di connessione al backend PHP.',
                'state.no_title' => 'Entità Senza Titolo',
                'state.canon' => 'Canonico',
                'state.filler' => 'Filler',
                'state.mixed' => 'Misto',
            ],
            'fr-FR' => [
                'state.loading_context' => 'Chargement du contexte compilé sur le serveur PHP...',
                'state.no_works_filtered' => 'Aucune œuvre ne correspond aux filtres actifs.',
                'state.no_anime_day' => 'Aucun anime ce jour de la semaine.',
                'state.on_air' => 'En Cours',
                'state.watched' => 'Vu',
                'state.error_partial' => 'Erreur lors de la compilation de la vue Blade.',
                'state.error_connection' => 'Échec de connexion avec le backend PHP.',
                'state.no_title' => 'Entité Sans Titre',
                'state.canon' => 'Canon',
                'state.filler' => 'Filler',
                'state.mixed' => 'Mixte',
            ],
            'de-DE' => [
                'state.loading_context' => 'Kontext wird auf dem PHP-Server kompiliert...',
                'state.no_works_filtered' => 'Keine Werke entsprechen den aktiven Filtern.',
                'state.no_anime_day' => 'Kein Anime an diesem Wochentag.',
                'state.on_air' => 'Läuft',
                'state.watched' => 'Gesehen',
                'state.error_partial' => 'Fehler beim Kompilieren des Blade-Partials.',
                'state.error_connection' => 'Verbindungsfehler zum PHP-Backend.',
                'state.no_title' => 'Titellose Entität',
                'state.canon' => 'Kanon',
                'state.filler' => 'Filler',
                'state.mixed' => 'Gemischt',
            ],
            'hi-IN' => [
                'state.loading_context' => 'PHP सर्वर पर संदर्भ लोड हो रहा है...',
                'state.no_works_filtered' => 'सक्रिय फ़िल्टर से कोई कृति मेल नहीं खाती।',
                'state.no_anime_day' => 'सप्ताह के इस दिन कोई एनीमे उपलब्ध नहीं है।',
                'state.on_air' => 'प्रसारित',
                'state.watched' => 'देखा गया',
                'state.error_partial' => 'ब्लेड आंशिक दृश्य संकलित करने में त्रुटि।',
                'state.error_connection' => 'PHP बैकएंड से कनेक्शन विफल।',
                'state.no_title' => 'शीर्षकहीन इकाई',
                'state.canon' => 'कैनन',
                'state.filler' => 'फिलर',
                'state.mixed' => 'मिश्रित',
            ],
        ];

        foreach ($locales as $loc) {
            $path = public_path("i18n/{$loc}.json");
            if (!file_exists($path)) continue;
            $json = json_decode(file_get_contents($path), true);
            $json['strings'] = array_merge($json['strings'] ?? [], $newStrings[$loc] ?? $newStrings['en-US']);
            file_put_contents($path, json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }
        $this->info("   -> Dicionários i18n atualizados com sucesso.");
    }

    private function fixViews(): void
    {
        $viewFiles = [
            resource_path('views/components/geometric/badge.blade.php'),
            resource_path('views/components/shell/action-dock.blade.php'),
            resource_path('views/components/shell/arena.blade.php'),
            resource_path('views/components/shell/header-dock.blade.php'),
            resource_path('views/partials/context-card.blade.php'),
            resource_path('views/partials/explore-grid.blade.php'),
            resource_path('views/partials/entities/arc-view.blade.php'),
            resource_path('views/partials/entities/universe-view.blade.php'),
            resource_path('views/partials/entities/track-view.blade.php'),
            resource_path('views/pages/lobby.blade.php'),
        ];

        foreach ($viewFiles as $file) {
            if (!file_exists($file)) continue;
            $content = file_get_contents($file);

            // Mapeamentos universais de cores fixas para tokens
            $replacements = [
                // Amber (Acento clássico) -> Token Dinâmico
                'bg-amber-400' => 'bg-theme-accent',
                'text-amber-400' => 'text-theme-accent',
                'border-amber-400' => 'border-theme-accent',
                'text-amber-300' => 'text-theme-accent',
                'bg-amber-500' => 'bg-theme-accent',
                'text-amber-500' => 'text-theme-accent',
                'border-amber-500' => 'border-theme-accent',

                // Slate escuro / Texto inverso -> Token Dinâmico
                'text-slate-950' => 'text-theme-inverse',
                'text-slate-900' => 'text-theme-primary',
                'bg-slate-950' => 'bg-theme-base',
                'bg-slate-900' => 'bg-theme-surface',
                'text-slate-400' => 'text-theme-muted',
                'text-slate-500' => 'text-theme-muted',
                'text-slate-300' => 'text-theme-secondary',
                'text-slate-200' => 'text-theme-primary',
                'border-slate-800' => 'border-theme-default',
                'border-slate-700' => 'border-theme-default',

                // Estados Canônicos (Verde / Vermelho / Roxo) -> Variáveis Semânticas de Estado
                'bg-emerald-500/20' => 'bg-[var(--color-state-canon,#10B981)]/20',
                'text-emerald-400' => 'text-[var(--color-state-canon,#10B981)]',
                'text-emerald-300' => 'text-[var(--color-state-canon,#10B981)]',
                'border-emerald-500/30' => 'border-[var(--color-state-canon,#10B981)]/30',
                'border-emerald-500/40' => 'border-[var(--color-state-canon,#10B981)]/40',
                'bg-emerald-400' => 'bg-[var(--color-state-canon,#10B981)]',
                'bg-rose-500/20' => 'bg-[var(--color-state-filler,#F43F5E)]/20',
                'bg-rose-500/25' => 'bg-[var(--color-state-filler,#F43F5E)]/25',
                'text-rose-400' => 'text-[var(--color-state-filler,#F43F5E)]',
                'text-rose-300' => 'text-[var(--color-state-filler,#F43F5E)]',
                'border-rose-500/30' => 'border-[var(--color-state-filler,#F43F5E)]/30',
                'border-rose-500/40' => 'border-[var(--color-state-filler,#F43F5E)]/40',
                'bg-rose-400' => 'bg-[var(--color-state-filler,#F43F5E)]',
                'bg-purple-500/20' => 'bg-[var(--color-state-mixed,#A855F7)]/20',
                'bg-purple-500/25' => 'bg-[var(--color-state-mixed,#A855F7)]/25',
                'text-purple-300' => 'text-[var(--color-state-mixed,#A855F7)]',
                'border-purple-500/40' => 'border-[var(--color-state-mixed,#A855F7)]/40',

                // Indigo Universo -> Variável Semântica
                'bg-indigo-500/20' => 'bg-[var(--color-state-universe,#6366F1)]/20',
                'text-indigo-300' => 'text-[var(--color-state-universe,#6366F1)]',
                'border-indigo-500/30' => 'border-[var(--color-state-universe,#6366F1)]/30',

                // Residuals em lobby.blade.php e arena.blade.php
                'bg-slate-100' => 'bg-theme-raised',
                'bg-slate-600' => 'bg-theme-muted/40',
                'bg-slate-400' => 'bg-theme-muted',
                'text-purple-400' => 'text-[var(--color-state-mixed,#A855F7)]',
                'bg-emerald-500/25' => 'bg-[var(--color-state-canon,#10B981)]/20',
                'bg-emerald-500/10' => 'bg-[var(--color-state-canon,#10B981)]/10',
                'border-emerald-400/30' => 'border-[var(--color-state-canon,#10B981)]/30',
                'border-amber-300/20' => 'border-theme-highlight',
                'bg-emerald-950/80' => 'bg-theme-pill',
                'border-gray-300' => 'border-white',
            ];

            foreach ($replacements as $old => $new) {
                $content = str_replace($old, $new, $content);
            }

            // Textos sem data-i18n
            $content = str_replace('<span>Carregando contexto compilado no servidor PHP...</span>', '<span data-i18n="state.loading_context">Carregando contexto compilado no servidor PHP...</span>', $content);
            $content = str_replace('Carregando contexto ontológico compilado pelo PHP...', '<span data-i18n="state.loading_context">Carregando contexto ontológico compilado pelo PHP...</span>', $content);
            $content = str_replace('Nenhuma obra corresponde aos filtros ativos no navegador.', '<span data-i18n="state.no_works_filtered">Nenhuma obra corresponde aos filtros ativos no navegador.</span>', $content);
            $content = str_replace('Nenhum anime neste dia da semana.', '<span data-i18n="state.no_anime_day">Nenhum anime neste dia da semana.</span>', $content);
            $content = str_replace('No Ar', '<span data-i18n="state.on_air">No Ar</span>', $content);
            $content = str_replace('Assistido', '<span data-i18n="state.watched">Assistido</span>', $content);
            $content = str_replace('>Disponível<', '><span data-i18n="state.on_air">Disponível</span><', $content);
            $content = str_replace('>Erro ao compilar parcial Blade para esta obra.<', ' data-i18n="state.error_partial">Erro ao compilar parcial Blade para esta obra.<', $content);
            $content = str_replace('>Falha de conexão com o backend PHP.<', ' data-i18n="state.error_connection">Falha de conexão com o backend PHP.<', $content);

            // Injeção do processador de Google OAuth Hash (#id_token=...) em lobby.blade.php
            if (basename($file) === 'lobby.blade.php' && !str_contains($content, 'handleGoogleOAuthHash')) {
                $targetTag = "@push('scripts')";
                $oauthScript = "@push('scripts')\n    <script>\n        // PROCESSAMENTO DE AUTENTICACAO GOOGLE OAUTH (#id_token=...)\n        (function handleGoogleOAuthHash() {\n            if (typeof window === 'undefined') return;\n            const hash = window.location.hash;\n            if (hash && (hash.includes('id_token=') || hash.includes('access_token='))) {\n                const params = new URLSearchParams(hash.substring(1));\n                const idToken = params.get('id_token');\n                window.history.replaceState(null, '', window.location.pathname + window.location.search);\n\n                if (idToken) {\n                    fetch('/api/auth/google', {\n                        method: 'POST',\n                        headers: {\n                            'Content-Type': 'application/json',\n                            'Accept': 'application/json',\n                            'X-Requested-With': 'XMLHttpRequest',\n                            'X-CSRF-TOKEN': '{{ csrf_token() }}'\n                        },\n                        body: JSON.stringify({ credential: idToken })\n                    })\n                    .then(res => res.json())\n                    .then(data => {\n                        if (data && data.success) {\n                            window.location.reload();\n                        } else {\n                            console.error('[Anirium Auth] Falha na validacao do token Google:', data);\n                        }\n                    })\n                    .catch(err => {\n                        console.error('[Anirium Auth] Erro de rede ao autenticar com o Google:', err);\n                    });\n                }\n            }\n        })();\n    </script>";
                $content = str_replace($targetTag, $oauthScript, $content);
            }

            // Injeção do Modal de 5 Abas de Perfil Canônico em lobby.blade.php
            if (basename($file) === 'lobby.blade.php' && str_contains($content, 'id="modal-profile"') && !str_contains($content, '<x-modals.user-profile-modal')) {
                $startStr = "<!-- 5. MODAL DE PERFIL / GOOGLE LOGIN (UserProfileModal Oficial) -->";
                $endStr = "@push('scripts')";
                $p1 = strpos($content, $startStr);
                $p2 = strpos($content, $endStr);
                if ($p1 !== false && $p2 !== false) {
                    $sub = "<!-- 5. MODAL DE PERFIL CANÔNICO DE 5 ABAS -->\n    <x-modals.user-profile-modal :user=\"\$user\" :userPreferences=\"\$userPreferences ?? []\" />\n\n    ";
                    $content = substr($content, 0, $p1) . $sub . substr($content, $p2);
                }
            }

            // Injeção dos métodos das 5 abas de usuário e interações no lobby.blade.php
            if (basename($file) === 'lobby.blade.php' && !str_contains($content, 'switchProfileTab')) {
                $targetCode = 'window.openProfileModal = function() {';
                $userMethods = <<<'JS'
        // 9. GERENCIAMENTO DAS 5 ABAS DO PERFIL CANÔNICO DO USUÁRIO
        window.currentProfileTab = 'overview';
        window.userLibraryList = [];
        window.userAddonsList = [];
        window.activeLibEntityFilter = 'all';

        window.openProfileModal = function() {
            const modal = document.getElementById('modal-profile');
            if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
            window.loadUserProfileData();
        };

        window.closeProfileModal = function() {
            const modal = document.getElementById('modal-profile');
            if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
        };

        window.switchProfileTab = function(tab) {
            window.currentProfileTab = tab;
            ['overview', 'library', 'history', 'addons', 'settings'].forEach(t => {
                const btn = document.getElementById(`profile-tab-btn-${t}`);
                const panel = document.getElementById(`profile-panel-${t}`);
                if (btn) {
                    if (t === tab) {
                        btn.className = "profile-tab-btn px-4 py-3 text-xs font-bold font-mono border-b-2 border-theme-accent text-theme-accent transition-colors shrink-0 cursor-pointer";
                    } else {
                        btn.className = "profile-tab-btn px-4 py-3 text-xs font-bold font-mono border-b-2 border-transparent text-theme-muted hover:text-theme-primary transition-colors shrink-0 cursor-pointer";
                    }
                }
                if (panel) {
                    if (t === tab) panel.classList.remove('hidden');
                    else panel.classList.add('hidden');
                }
            });

            if (tab === 'library') window.renderProfileLibrary();
            if (tab === 'history') window.renderProfileHistory();
            if (tab === 'addons') window.loadAccountAddons();
        };

        window.loadUserProfileData = async function() {
            if (!window.currentUser) return;
            try {
                const res = await fetch('/api/entity/preferences');
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.preferences)) {
                        window.userLibraryList = data.preferences;
                        if (window.currentProfileTab === 'library') window.renderProfileLibrary();
                        if (window.currentProfileTab === 'history') window.renderProfileHistory();
                    }
                }
            } catch (err) {
                console.warn('[Anirium User] Falha ao sincronizar preferências:', err);
            }
        };

        window.filterLibraryEntity = function(type) {
            window.activeLibEntityFilter = type;
            ['all', 'work', 'arc', 'universe'].forEach(t => {
                const btn = document.getElementById(`lib-filter-${t}`);
                if (btn) {
                    if (t === type) {
                        btn.className = "px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-theme-accent text-theme-inverse border-theme-accent cursor-pointer";
                    } else {
                        btn.className = "px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-theme-pill text-theme-muted border-theme-default cursor-pointer";
                    }
                }
            });
            window.renderProfileLibrary();
        };

        window.renderProfileLibrary = function() {
            const container = document.getElementById('profile-library-container');
            if (!container) return;

            const filtered = (window.userLibraryList || []).filter(item => {
                if (!item.bookmarked && !item.user_score && !item.status) return false;
                if (window.activeLibEntityFilter === 'all') return true;
                return (item.target_type === window.activeLibEntityFilter);
            });

            if (filtered.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs font-mono text-theme-muted" data-i18n="profile.empty_library">${window.i18n ? window.i18n.t('profile.empty_library') : 'Nenhum item adicionado aos favoritos ainda.'}</div>`;
                return;
            }

            container.innerHTML = filtered.map(item => {
                const title = item.title || item.target_id;
                const statusBadge = item.status ? `<span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-theme-accent/20 text-theme-accent border border-theme-accent/30">${item.status}</span>` : '';
                const scoreBadge = item.user_score ? `<span class="text-xs font-mono font-bold text-theme-accent">★ ${item.user_score}/10</span>` : '';
                return `
                    <div class="p-3.5 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between hover:border-theme-highlight transition-all cursor-pointer group"
                         onclick="window.closeProfileModal(); window.pushNavigation('${item.target_type || 'work'}', '${item.target_id}', '${(title || '').replace(/'/g, "\\'")}')">
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="w-2 h-2 rounded-full bg-theme-accent"></span>
                            <div class="min-w-0">
                                <h5 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">${title}</h5>
                                <p class="text-[10px] font-mono text-theme-muted uppercase">${item.target_type || 'work'}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            ${statusBadge}
                            ${scoreBadge}
                        </div>
                    </div>
                `;
            }).join('');
        };

        window.renderProfileHistory = function() {
            const container = document.getElementById('profile-history-container');
            if (!container) return;

            const universeMap = new Map();
            (window.userLibraryList || []).forEach(item => {
                if (!item.last_interacted_at && !item.progress_seconds && !item.status) return;
                const key = item.universe_id || item.target_id;
                if (!universeMap.has(key)) {
                    universeMap.set(key, item);
                }
            });

            const condensedList = Array.from(universeMap.values());

            if (condensedList.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs font-mono text-theme-muted" data-i18n="profile.empty_history">${window.i18n ? window.i18n.t('profile.empty_history') : 'Nenhum histórico registrado ainda.'}</div>`;
                return;
            }

            container.innerHTML = condensedList.map(item => {
                const uTitle = item.universe_name || item.title || 'Universo Conectado';
                return `
                    <div class="p-4 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between hover:border-theme-accent transition-all cursor-pointer group"
                         onclick="window.closeProfileModal(); window.pushNavigation('universe', '${item.universe_id || item.target_id}', '${uTitle.replace(/'/g, "\\'")}')">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="w-10 h-10 rounded-xl bg-theme-pill border border-theme-default flex items-center justify-center text-base shrink-0">
                                🌌
                            </div>
                            <div class="min-w-0">
                                <h5 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">${uTitle}</h5>
                                <p class="text-[10px] font-mono text-theme-muted mt-0.5">
                                    <span data-i18n="profile.last_progress">Último Progresso:</span> ${item.title || item.target_id}
                                </p>
                            </div>
                        </div>
                        <span class="text-xs font-mono font-bold text-theme-accent shrink-0 group-hover:translate-x-1 transition-transform">
                            Continuar ❯
                        </span>
                    </div>
                `;
            }).join('');
        };

        window.loadAccountAddons = async function() {
            const listContainer = document.getElementById('profile-addons-list');
            if (!listContainer) return;
            try {
                const res = await fetch('/api/addons');
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.addons)) {
                        window.userAddonsList = data.addons.filter(a => a.id !== 'player-pro');
                        window.renderAddonsList();
                    }
                }
            } catch (err) {
                console.warn('[Anirium Addons] Falha ao carregar lista de addons:', err);
            }
        };

        window.renderAddonsList = function() {
            const container = document.getElementById('profile-addons-list');
            if (!container) return;

            if (window.userAddonsList.length === 0) {
                container.innerHTML = `<div class="p-4 text-center text-xs font-mono text-theme-muted" data-i18n="profile.no_addons">${window.i18n ? window.i18n.t('profile.no_addons') : 'Nenhum add-on comunitário instalado.'}</div>`;
                return;
            }

            container.innerHTML = window.userAddonsList.map(a => `
                <div class="p-3.5 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-base">🧩</span>
                        <div class="min-w-0">
                            <h5 class="text-xs font-bold text-theme-primary truncate">${a.name || a.id}</h5>
                            <p class="text-[10px] font-mono text-theme-muted truncate">${a.description || a.version || 'Stremio Community Addon'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" ${a.enabled ? 'checked' : ''} onchange="window.toggleAddon('${a.id}', this.checked)" class="sr-only peer">
                            <div class="w-8 h-4 bg-theme-pill border border-theme-default peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-theme-accent"></div>
                        </label>
                        <button type="button" onclick="window.uninstallAddon('${a.id}')" class="text-theme-muted hover:text-red-400 p-1 transition-colors cursor-pointer" title="Desinstalar">
                            ✕
                        </button>
                    </div>
                </div>
            `).join('');
        };

        window.toggleInstallAddonForm = function() {
            const form = document.getElementById('addon-install-form');
            if (form) form.classList.toggle('hidden');
        };

        window.submitInstallAddon = async function() {
            const input = document.getElementById('addon-manifest-url');
            if (!input || !input.value.trim()) return;
            const val = input.value.trim();

            try {
                let payload = {};
                if (/^(https?|stremio):\/\//i.test(val)) {
                    payload = { manifest_url: val };
                } else {
                    payload = { manifest: JSON.parse(val) };
                }

                const res = await fetch('/api/addons/install', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    input.value = '';
                    window.toggleInstallAddonForm();
                    window.loadAccountAddons();
                } else {
                    alert('URL de manifesto Stremio inválida.');
                }
            } catch (err) {
                alert('Erro ao instalar manifesto do add-on.');
            }
        };

        window.toggleAddon = async function(addonId, enabled) {
            try {
                await fetch('/api/addons/toggle', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({ addon_id: addonId, enabled: enabled })
                });
            } catch (err) {
                console.warn('[Anirium Addons] Falha ao alternar addon:', err);
            }
        };

        window.uninstallAddon = async function(addonId) {
            if (!confirm(`Deseja desinstalar o addon ${addonId}?`)) return;
            try {
                const res = await fetch('/api/addons/uninstall', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({ addon_id: addonId })
                });
                if (res.ok) window.loadAccountAddons();
            } catch (err) {
                console.warn('[Anirium Addons] Falha ao desinstalar:', err);
            }
        };

        // INTERAÇÕES DA BARRA DE ENTIDADE (EntityActions)
        window.toggleEntityBookmark = async function(type, id) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const btn = document.getElementById('btn-action-bookmark');
            const isCurrently = btn && btn.classList.contains('bg-theme-accent');
            const nextVal = !isCurrently;
            
            if (btn) {
                if (nextVal) {
                    btn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-theme-accent text-theme-inverse border-theme-accent shadow-md";
                } else {
                    btn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary";
                }
            }
            await window.submitPreference(id, type, { bookmarked: nextVal });
        };

        window.toggleEntityLike = async function(type, id) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const btn = document.getElementById('btn-action-like');
            const isCurrently = btn && btn.classList.contains('bg-[var(--color-state-filler,#F43F5E)]');
            const nextVal = !isCurrently;
            
            if (btn) {
                if (nextVal) {
                    btn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-[var(--color-state-filler,#F43F5E)] text-white border-[var(--color-state-filler,#F43F5E)] shadow-md";
                } else {
                    btn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary";
                }
            }
            await window.submitPreference(id, type, { liked: nextVal });
        };

        window.submitEntityRating = async function(type, id, score) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const valLabel = document.getElementById('user-rating-value');
            if (valLabel) valLabel.innerText = `${score}/10`;
            await window.submitPreference(id, type, { user_score: score });
        };

        window.setEntityStatus = async function(type, id, status) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            ['watching', 'completed', 'plan_to', 'dropped'].forEach(s => {
                const b = document.getElementById(`btn-status-${s}`);
                if (b) {
                    if (s === status) {
                        b.className = "px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase transition-all cursor-pointer border bg-theme-accent text-theme-inverse border-theme-accent shadow-md";
                    } else {
                        b.className = "px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase transition-all cursor-pointer border bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary";
                    }
                }
            });
            await window.submitPreference(id, type, { status: status });
        };

        window.toggleEntityWatched = async function(type, id) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const btn = document.getElementById('btn-action-watched');
            const isWatched = btn && btn.classList.contains('bg-[var(--color-state-canon,#10B981)]/20');
            const nextStatus = isWatched ? 'watching' : 'completed';

            if (btn) {
                if (!isWatched) {
                    btn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/40";
                } else {
                    btn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary";
                }
            }
            await window.submitPreference(id, type, { status: nextStatus });
        };

JS;
                $content = str_replace($targetCode, $userMethods . "\n        " . $targetCode, $content);
            }

            file_put_contents($file, $content);
            $this->info("   -> Processado: " . basename($file));
        }
    }
}
