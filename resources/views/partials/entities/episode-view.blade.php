@props([
    'work',
    'universe' => null,
    'currentArc' => null,
    'currentEpisode',
    'creators' => [],
    'studios' => [],
    'tracks' => [],
    'relations' => [],
    'externalIds' => [],
    'arcs' => [],
    'episodes' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
    'isWatched' => false,
])

@php
    $workTitle = $work->title ?? 'Obra Canônica';
    $media = strtolower($work->media ?? 'anime');
    $format = strtoupper($work->format ?? ($media === 'manga' ? 'MANGA' : 'TV'));
    $isManga = $media === 'manga' || in_array($format, ['MANGA', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'DOUJINSHI', 'NOVEL', 'LIGHT_NOVEL', 'OEL'], true);
    $status = strtoupper($work->status ?? 'COMPLETED');
    $image = $work->image_url ?? '/assets/icons/actions/search.png';
    $epNum = (int) ($currentEpisode->number ?? 1);
    $unitLabel = $isManga ? 'Capítulo' : 'Episódio';
    $unitShort = $isManga ? 'Cap.' : 'Ep.';
    $episodeTitle = $unitLabel . ' ' . $epNum;
    $classification = strtolower($currentEpisode->classification ?? ($currentArc->classification ?? 'canon'));
    $isFiller = $classification === 'filler';
    $airDate = $currentEpisode->air_date_utc ?? ($status === 'RELEASING' ? 'Em exibição' : 'Catalogado');
    $isVirtualEp = !empty($currentEpisode->is_virtual);

    $totalEpisodes = count($episodes) ?: ($work->episode_count ?? 0);
    if ($totalEpisodes <= 0 && count($arcs) > 0) {
        $maxArcEnd = collect($arcs)->max('end_number');
        $maxArcStart = collect($arcs)->max('start_number');
        $totalEpisodes = max((int) $maxArcEnd, (int) $maxArcStart);
    }
    if ($totalEpisodes <= 0) {
        $totalEpisodes = max(1, $epNum);
    }

    // Identificadores externos para Add-ons
    $malId = collect($externalIds)->firstWhere('provider', 'mal')->external_id ?? null;
    $imdbId = collect($externalIds)->firstWhere('provider', 'imdb')->external_id ?? null;
    $anilistId = collect($externalIds)->firstWhere('provider', 'anilist')->external_id ?? null;

    // Filtrar Abertura (OP) e Encerramento (ED) exatos deste episódio
    $episodeTracks = collect($tracks)->filter(function ($tr) use ($epNum) {
        if (preg_match('/\(eps?\s*(\d+)\s*-\s*(\d+|\?)\)/i', $tr->title ?? '', $m)) {
            $start = (int) $m[1];
            $end = $m[2] === '?' ? 99999 : (int) $m[2];
            return $epNum >= $start && $epNum <= $end;
        }
        return true;
    })->values();
    if ($episodeTracks->isEmpty() && count($tracks) > 0) {
        $episodeTracks = collect($tracks)->values();
    }

    $openingTrack = $episodeTracks->first(fn ($t) => strtoupper($t->track_type ?? '') === 'OP');
    $endingTrack = $episodeTracks->first(fn ($t) => strtoupper($t->track_type ?? '') === 'ED');

    // Diretor e Autor Original
    $director = collect($creators)->first(fn ($c) => ($c->role ?? '') === 'director');
    $originalAuthor = collect($creators)->first(fn ($c) => ($c->role ?? '') === 'author') ?? collect($creators)->first();

    // Arco de cobertura (início e fim)
    $arcStart = (int) ($currentArc->start_number ?? 1);
    $arcEnd = $currentArc->end_number ?? $totalEpisodes;

    // Janela de navegação rápida de episódios vizinhos (para o painel de sequência)
    $displayEpisodes = collect($episodes);
    if ($displayEpisodes->isEmpty() && $totalEpisodes > 0) {
        $maxVirtual = min((int) $totalEpisodes, 200);
        $vList = [];
        for ($i = 1; $i <= $maxVirtual; $i++) {
            $vList[] = (object) [
                'id' => ($work->id ?? 'work') . ':ep:' . $i,
                'work_id' => $work->id ?? '',
                'number' => $i,
                'air_date_utc' => null,
                'is_virtual' => true,
            ];
        }
        $displayEpisodes = collect($vList);
    }

    $prevEpNum = $epNum > 1 ? ($epNum - 1) : null;
    $nextEpNum = $epNum < $totalEpisodes ? ($epNum + 1) : null;
    $prevEpObj = $prevEpNum ? ($displayEpisodes->firstWhere('number', $prevEpNum) ?? (object) ['id' => ($work->id ?? 'work') . ':ep:' . $prevEpNum, 'number' => $prevEpNum]) : null;
    $nextEpObj = $nextEpNum ? ($displayEpisodes->firstWhere('number', $nextEpNum) ?? (object) ['id' => ($work->id ?? 'work') . ':ep:' . $nextEpNum, 'number' => $nextEpNum]) : null;
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary"
     id="episode-context-stage"
     data-work-id="{{ $work->id ?? '' }}"
     data-work-title="{{ $workTitle }}"
     data-work-media="{{ $isManga ? 'manga' : 'anime' }}"
     data-mal-id="{{ $malId ?? '' }}"
     data-imdb-id="{{ $imdbId ?? '' }}"
     data-anilist-id="{{ $anilistId ?? '' }}"
     data-episode-id="{{ $currentEpisode->id ?? '' }}"
     data-episode-number="{{ $epNum }}">

    <!-- BARRA SUPERIOR: NAVEGAÇÃO ONTOLÓGICA + CONTROLE ANTERIOR / PRÓXIMO -->
    <header class="h-14 w-full flex items-center justify-between px-3 sm:px-6 lg:px-8 border-b border-theme-default bg-theme-header shrink-0 z-20 gap-2">
        <div class="flex items-center gap-2 sm:gap-4 min-w-0">
            <button type="button"
                    onclick="window.popNavigation()"
                    class="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-accent hover:text-white text-xs font-bold font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                <span data-i18n="nav.back">Voltar</span>
            </button>

            <nav id="entity-dynamic-breadcrumb" class="flex items-center gap-1.5 sm:gap-2 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar py-1">
                <button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent transition-colors shrink-0" data-i18n="nav.home">Lobby</button>
                <span class="opacity-40">❯</span>
                <span class="text-theme-accent font-bold truncate max-w-[160px] sm:max-w-[260px]">{{ $workTitle }} • {{ $unitShort }} {{ $epNum }}</span>
            </nav>
        </div>

        <!-- Controles Diretos de Sequência no Topo (Ep Anterior / Ep Atual / Próximo Ep) -->
        <div class="flex items-center gap-2 shrink-0">
            @if($prevEpObj)
                <button type="button"
                        onclick="window.pushNavigation('episode', '{{ $prevEpObj->id }}', '{{ addslashes($workTitle) }} • {{ $unitShort }} {{ $prevEpObj->number }}')"
                        class="px-2.5 py-1 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-[11px] font-mono font-bold text-theme-muted hover:text-white transition-all cursor-pointer">
                    ❮ {{ $unitShort }} {{ $prevEpObj->number }}
                </button>
            @endif

            <span class="px-3 py-1 rounded-full {{ $isFiller ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border-[var(--color-state-filler,#F43F5E)]/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }} border text-[11px] font-bold tracking-wider uppercase font-mono">
                {{ $isManga ? '📖' : '📺' }} {{ strtoupper($unitShort) }} {{ $epNum }} / {{ $totalEpisodes }} • {{ strtoupper($classification) }}
            </span>

            @if($nextEpObj)
                <button type="button"
                        onclick="window.pushNavigation('episode', '{{ $nextEpObj->id }}', '{{ addslashes($workTitle) }} • {{ $unitShort }} {{ $nextEpObj->number }}')"
                        class="px-2.5 py-1 rounded-xl bg-theme-accent/20 hover:bg-theme-accent border border-theme-accent/40 text-[11px] font-mono font-bold text-theme-accent hover:text-theme-inverse transition-all cursor-pointer">
                    {{ $unitShort }} {{ $nextEpObj->number }} ❯
                </button>
            @endif
        </div>
    </header>

    <!-- HUB EXCLUSIVO DE UNIDADE (EPISÓDIO / CAPÍTULO): VIEWPORT 100VH FIXO NO DESKTOP & FLUIDO NO MOBILE -->
    <div class="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 lg:gap-5 p-3 sm:p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL DA UNIDADE: MONITOR DE EXECUÇÃO / FICHA DO EPISÓDIO + ABAS -->
        <main class="shrink-0 lg:flex-1 min-w-0 flex flex-col gap-3 lg:gap-4 lg:overflow-hidden">

            <!-- 1. CONSOLE PRINCIPAL DA UNIDADE (DESIGN EXCLUSIVO DE EPISÓDIO/CAPÍTULO: PLAYER DOCK + METADADOS DE CENA) -->
            <section class="relative w-full rounded-3xl overflow-hidden border-2 border-emerald-500/30 bg-theme-raised shadow-2xl min-h-[185px] max-h-[220px] flex flex-col md:flex-row items-stretch justify-between p-4 md:p-5 gap-5 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $image }}" class="w-full h-full object-cover object-center filter brightness-[0.22] blur-[3px]" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-theme-base/90 to-theme-base/60"></div>
                </div>

                <!-- MINI-TELA WIDESCREEN 16:9 DO EPISÓDIO / CAPÍTULO (DIFERENCIAÇÃO VISUAL IMEDIATA EM RELAÇÃO À OBRA) -->
                <div class="relative z-10 w-full md:w-64 lg:w-72 h-36 md:h-auto rounded-2xl overflow-hidden border border-white/15 bg-black shrink-0 shadow-2xl flex flex-col justify-between p-3 group/screen">
                    <img src="{{ $image }}" class="absolute inset-0 w-full h-full object-cover filter brightness-75 group-hover/screen:scale-105 transition-transform duration-700" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/50"></div>

                    <div class="relative z-10 flex items-center justify-between">
                        <span class="px-2 py-0.5 rounded bg-emerald-500 text-black text-[9px] font-mono font-black uppercase tracking-wider shadow">
                            UNIDADE #{{ str_pad((string) $epNum, 2, '0', STR_PAD_LEFT) }}
                        </span>
                        <span class="px-2 py-0.5 rounded bg-black/80 text-white/80 border border-white/15 text-[9px] font-mono uppercase">
                            {{ $format }} • {{ $airDate }}
                        </span>
                    </div>

                    <!-- Botão Central de Ação no Frame Widescreen -->
                    <div class="relative z-10 flex items-center justify-center my-auto">
                        @if(!$isManga)
                            <button type="button"
                                    data-requires-addon-capability="video"
                                    onclick="window.launchExternalVideoAddon('{{ $work->id ?? '' }}', '{{ $currentEpisode->id ?? '' }}', '{{ $epNum }}', '{{ addslashes($workTitle) }}')"
                                    class="hidden w-12 h-12 rounded-full bg-theme-accent text-theme-inverse items-center justify-center text-lg font-bold shadow-2xl hover:scale-110 transition-transform cursor-pointer">
                                ▶
                            </button>
                            <button type="button"
                                    onclick="window.openOfficialTrailerModal('{{ addslashes($workTitle . ' Episode ' . $epNum) }}')"
                                    class="px-3 py-1.5 rounded-xl bg-black/75 hover:bg-red-600/90 border border-white/20 text-white text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5">
                                <span>🎬</span> <span>Prévia / PV Oficial</span>
                            </button>
                        @else
                            <button type="button"
                                    data-requires-addon-capability="manga"
                                    onclick="window.launchExternalMangaAddon('{{ $work->id ?? '' }}', '{{ $epNum }}', '{{ addslashes($workTitle) }}')"
                                    class="hidden px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-mono font-bold shadow-2xl hover:scale-105 transition-transform cursor-pointer items-center gap-1.5">
                                📖 Abrir Leitor
                            </button>
                        @endif
                    </div>

                    <div class="relative z-10 flex items-center justify-between text-[9px] font-mono text-white/80">
                        <span>Progresso na Obra</span>
                        <span class="text-emerald-400 font-bold">{{ $epNum }} de {{ $totalEpisodes }} ({{ round(($epNum / max(1, $totalEpisodes)) * 100) }}%)</span>
                    </div>
                </div>

                <!-- METADADOS ONTOLÓGICOS DO EPISÓDIO / CAPÍTULO -->
                <div class="relative z-10 flex-1 flex flex-col justify-between min-w-0">
                    <div class="space-y-1.5">
                        <!-- Trilha de Pertencimento Imediata: Universo -> Obra -> Arco -->
                        <div class="flex items-center gap-1.5 flex-wrap">
                            @if($universe)
                                <button type="button"
                                        onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')"
                                        class="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/40 transition-colors cursor-pointer truncate max-w-[180px]">
                                    🌌 {{ $universe->name }}
                                </button>
                            @endif

                            <button type="button"
                                    onclick="window.pushNavigation('{{ $isManga ? 'manga' : 'work' }}', '{{ $work->id }}', '{{ addslashes($workTitle) }}')"
                                    class="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-theme-accent/20 text-theme-accent border border-theme-accent/30 hover:bg-theme-accent/40 transition-colors cursor-pointer truncate max-w-[200px]">
                                🎬 {{ $workTitle }}
                            </button>

                            @if($currentArc)
                                <button type="button"
                                        onclick="window.pushNavigation('arc', '{{ $currentArc->id }}', '{{ addslashes($currentArc->title) }}')"
                                        class="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/40 transition-colors cursor-pointer truncate max-w-[220px]">
                                    📜 {{ $currentArc->title }}
                                </button>
                            @endif
                        </div>

                        <div class="flex items-baseline gap-3">
                            <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md truncate">
                                {{ $episodeTitle }}
                            </h1>
                            <span class="text-xs font-mono text-emerald-400 font-bold shrink-0">
                                • {{ $workTitle }}
                            </span>
                        </div>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-2xl">
                            @if($currentArc)
                                Parte integrante de <strong class="text-white">{{ $currentArc->title }}</strong> ({{ $unitShort }} {{ $arcStart }} ao {{ $arcEnd }}) na produção <strong class="text-theme-accent">{{ $workTitle }}</strong>.
                            @else
                                {{ $unitLabel }} #{{ $epNum }} da temporada/obra <strong class="text-white">{{ $workTitle }}</strong> ({{ $format }}).
                            @endif
                            @if($openingTrack)
                                Abertura: <span class="text-pink-300">{{ $openingTrack->title }}</span>.
                            @endif
                        </p>
                    </div>

                    <!-- Barra de Ações do Episódio: Oficial vs Add-ons + Anterior/Próximo -->
                    <div class="flex items-center justify-between gap-2 pt-2 border-t border-white/10 flex-wrap">
                        <div class="flex items-center gap-2 flex-wrap">
                            @if(!$isManga)
                                <button type="button"
                                        data-requires-addon-capability="video"
                                        onclick="window.launchExternalVideoAddon('{{ $work->id ?? '' }}', '{{ $currentEpisode->id ?? '' }}', '{{ $epNum }}', '{{ addslashes($workTitle) }}')"
                                        class="hidden px-3.5 py-1.5 rounded-xl bg-emerald-400 text-black text-xs font-mono font-black transition-all hover:scale-105 active:scale-95 shadow-lg items-center gap-1.5 cursor-pointer">
                                    <span>▶</span> <span>Tocar {{ $episodeTitle }} (Player Add-on)</span>
                                </button>

                                <button type="button"
                                        onclick="window.openOfficialTrailerModal('{{ addslashes($workTitle) }}')"
                                        class="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500 border border-red-500/40 text-red-200 hover:text-white text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5">
                                    <span>🎬</span> <span>Trailer da Obra</span>
                                </button>
                            @else
                                <button type="button"
                                        data-requires-addon-capability="manga"
                                        onclick="window.launchExternalMangaAddon('{{ $work->id ?? '' }}', '{{ $epNum }}', '{{ addslashes($workTitle) }}')"
                                        class="hidden px-3.5 py-1.5 rounded-xl bg-amber-400 text-black text-xs font-mono font-black transition-all hover:scale-105 active:scale-95 shadow-lg items-center gap-1.5 cursor-pointer">
                                    <span>📖</span> <span>Ler {{ $episodeTitle }} (Reader Add-on)</span>
                                </button>
                            @endif

                            <button type="button"
                                    onclick="window.toggleUserBookmark?.('{{ !$isVirtualEp ? ($currentEpisode->id ?? $work->id) : ($work->id ?? '') }}', '{{ !$isVirtualEp ? 'episode' : ($isManga ? 'manga' : 'work') }}')"
                                    class="px-3 py-1.5 rounded-xl bg-theme-pill border border-theme-default text-xs font-mono font-bold {{ !empty($isBookmarked) ? 'text-theme-accent border-theme-accent' : 'text-theme-muted hover:text-white' }} transition-all cursor-pointer flex items-center gap-1.5">
                                <span>📌</span> <span>Marcar {{ $unitShort }} {{ $epNum }}</span>
                            </button>
                        </div>

                        <button type="button"
                                onclick="window.pushNavigation('{{ $isManga ? 'manga' : 'work' }}', '{{ $work->id }}', '{{ addslashes($workTitle) }}')"
                                class="px-3 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-[11px] font-mono font-bold text-theme-accent cursor-pointer">
                            Ver Obra Completa ❯
                        </button>
                    </div>
                </div>
            </section>

            <!-- 2. NAVEGAÇÃO EM ABAS EXCLUSIVAS DO EPISÓDIO / CAPÍTULO -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchEpisodeEntityTab(' ficha')"
                        id="ep-tab-btn-ficha"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-emerald-400 text-black shadow-sm cursor-pointer shrink-0">
                    <span>🎛️</span>
                    <span>Raio-X do {{ $unitLabel }} (Arco, OP/ED & Créditos)</span>
                </button>

                <button type="button"
                        onclick="window.switchEpisodeEntityTab('sequence')"
                        id="ep-tab-btn-sequence"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>{{ $isManga ? '📖' : '📺' }}</span>
                    <span>Trocar {{ $unitLabel }} ({{ $epNum }} de {{ $totalEpisodes }})</span>
                </button>

                <button type="button"
                        onclick="window.switchEpisodeEntityTab('discussion')"
                        id="ep-tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span>
                    <span>Discussão do {{ $unitShort }} {{ $epNum }}</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS DO EPISÓDIO -->
            <div class="min-h-[245px] lg:min-h-0 lg:flex-1 overflow-hidden flex flex-col justify-center">

                <!-- ABA 1 (PADRÃO): RAIO-X ONTOLÓGICO DO EPISÓDIO (4 CARDS ESTRUTURAIS: ARCO, ABERTURA OP, ENDING ED, DIREÇÃO/AUTORIA) -->
                <div id="ep-tab-pane-ficha" class="ep-tab-pane flex flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">
                            Composição ontológica exata do {{ $episodeTitle }} dentro de {{ $workTitle }}
                        </span>
                        <span class="text-xs font-mono text-emerald-400 font-bold">
                            Unidade #{{ $epNum }} • {{ strtoupper($classification) }}
                        </span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">

                        <!-- CARD 1: ARCO NARRATIVO DESTE EPISÓDIO -->
                        <div class="flex-none w-64 h-[210px] p-4 rounded-2xl border {{ $currentArc ? 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-400 cursor-pointer' : 'border-theme-default bg-theme-raised/60' }} transition-all shadow-lg flex flex-col justify-between group"
                             @if($currentArc)
                                 onclick="window.pushNavigation('arc', '{{ $currentArc->id }}', '{{ addslashes($currentArc->title) }}')"
                             @endif>
                            <div>
                                <div class="flex items-center justify-between gap-2 mb-2">
                                    <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        📜 ARCO DO {{ strtoupper($unitShort) }} {{ $epNum }}
                                    </span>
                                    @if($currentArc)
                                        <span class="text-xs text-emerald-400 group-hover:translate-x-0.5 transition-transform">Abrir ❯</span>
                                    @endif
                                </div>
                                <h3 class="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-2 leading-snug">
                                    {{ $currentArc->title ?? (' Narrativa Principal de ' . $workTitle) }}
                                </h3>
                                <p class="text-[11px] font-mono text-theme-muted mt-1.5">
                                    @if($currentArc)
                                        Cobre do {{ $unitShort }} {{ $arcStart }} até {{ $arcEnd ?: '?' }}
                                    @else
                                        Progressão direta na temporada ({{ $format }})
                                    @endif
                                </p>
                            </div>
                            <div class="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-mono">
                                <span class="text-theme-muted">Classificação</span>
                                <span class="text-emerald-400 font-bold uppercase">{{ $classification }}</span>
                            </div>
                        </div>

                        <!-- CARD 2: ABERTURA (OPENING) DESTE EPISÓDIO -->
                        @if(!$isManga)
                            @php
                                $opRaw = $openingTrack->title ?? ($episodeTracks[0]->title ?? null);
                                $opId = $openingTrack->id ?? ($episodeTracks[0]->id ?? null);
                                $opClean = $opRaw && preg_match('/"([^"]+)"/', $opRaw, $m) ? $m[1] : ($opRaw ?? 'Tema de Abertura');
                                $opQuery = urlencode($opClean . ' ' . $workTitle);
                            @endphp
                            <div class="flex-none w-68 h-[210px] p-4 rounded-2xl border border-theme-default bg-theme-raised/80 hover:border-pink-400/50 transition-all shadow-lg flex flex-col justify-between group {{ $opId ? 'cursor-pointer' : '' }}"
                                 @if($opId)
                                     onclick="window.pushNavigation('track', '{{ $opId }}', '{{ addslashes($opClean) }}')"
                                 @endif>
                                <div>
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-pink-500/20 text-pink-300 border border-pink-500/30">
                                            🎵 ABERTURA (OP)
                                        </span>
                                        @if($opId)
                                            <span class="text-xs text-theme-muted group-hover:text-pink-300">Ficha ❯</span>
                                        @endif
                                    </div>
                                    <h3 class="text-xs font-bold text-white group-hover:text-pink-300 transition-colors line-clamp-2 leading-snug">
                                        {{ $opRaw ?? ('Abertura de ' . $workTitle) }}
                                    </h3>
                                    <p class="text-[10px] font-mono text-theme-muted mt-1">
                                        Executada no {{ $episodeTitle }}
                                    </p>
                                </div>
                                <div class="pt-2 border-t border-theme-default/40 flex items-center justify-between gap-2">
                                    <a href="https://open.spotify.com/search/{{ $opQuery }}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[9px] font-mono font-bold text-center">
                                        🟢 Spotify
                                    </a>
                                    <a href="https://music.youtube.com/search?q={{ $opQuery }}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[9px] font-mono font-bold text-center">
                                        🔴 YT Music
                                    </a>
                                </div>
                            </div>

                            <!-- CARD 3: ENCERRAMENTO (ENDING) DESTE EPISÓDIO -->
                            @php
                                $edRaw = $endingTrack->title ?? ($episodeTracks[1]->title ?? null);
                                $edId = $endingTrack->id ?? ($episodeTracks[1]->id ?? null);
                                $edClean = $edRaw && preg_match('/"([^"]+)"/', $edRaw, $m2) ? $m2[1] : ($edRaw ?? 'Tema de Encerramento');
                                $edQuery = urlencode($edClean . ' ' . $workTitle);
                            @endphp
                            <div class="flex-none w-68 h-[210px] p-4 rounded-2xl border border-theme-default bg-theme-raised/80 hover:border-pink-400/50 transition-all shadow-lg flex flex-col justify-between group {{ $edId ? 'cursor-pointer' : '' }}"
                                 @if($edId)
                                     onclick="window.pushNavigation('track', '{{ $edId }}', '{{ addslashes($edClean) }}')"
                                 @endif>
                                <div>
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                            🎶 ENDING (ED)
                                        </span>
                                        @if($edId)
                                            <span class="text-xs text-theme-muted group-hover:text-purple-300">Ficha ❯</span>
                                        @endif
                                    </div>
                                    <h3 class="text-xs font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-2 leading-snug">
                                        {{ $edRaw ?? ('Encerramento de ' . $workTitle) }}
                                    </h3>
                                    <p class="text-[10px] font-mono text-theme-muted mt-1">
                                        Créditos finais do {{ $episodeTitle }}
                                    </p>
                                </div>
                                <div class="pt-2 border-t border-theme-default/40 flex items-center justify-between gap-2">
                                    <a href="https://open.spotify.com/search/{{ $edQuery }}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[9px] font-mono font-bold text-center">
                                        🟢 Spotify
                                    </a>
                                    <a href="https://music.youtube.com/search?q={{ $edQuery }}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[9px] font-mono font-bold text-center">
                                        🔴 YT Music
                                    </a>
                                </div>
                            </div>
                        @endif

                        <!-- CARD 4: NAVEGAÇÃO IMEDIATA (ANTERIOR / PRÓXIMO EPISÓDIO) -->
                        <div class="flex-none w-64 h-[210px] p-4 rounded-2xl border border-theme-default bg-theme-raised/80 flex flex-col justify-between shadow-lg">
                            <div>
                                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-theme-accent/20 text-theme-accent border border-theme-accent/30">
                                    ⏭️ CONTINUIDADE IMEDIATA
                                </span>
                                <h3 class="text-xs font-bold text-white mt-2">
                                    Avançar ou Retroceder na Temporada
                                </h3>
                                <p class="text-[10px] font-mono text-theme-muted mt-1">
                                    Você está no {{ $unitLabel }} {{ $epNum }} de {{ $totalEpisodes }}.
                                </p>
                            </div>

                            <div class="space-y-2">
                                @if($nextEpObj)
                                    <button type="button"
                                            onclick="window.pushNavigation('episode', '{{ $nextEpObj->id }}', '{{ addslashes($workTitle) }} • {{ $unitShort }} {{ $nextEpObj->number }}')"
                                            class="w-full py-2 px-3 rounded-xl bg-emerald-400 text-black text-xs font-mono font-black hover:scale-[1.02] transition-transform cursor-pointer flex items-center justify-between">
                                        <span>Próximo: {{ $unitShort }} {{ $nextEpObj->number }}</span>
                                        <span>❯</span>
                                    </button>
                                @endif
                                @if($prevEpObj)
                                    <button type="button"
                                            onclick="window.pushNavigation('episode', '{{ $prevEpObj->id }}', '{{ addslashes($workTitle) }} • {{ $unitShort }} {{ $prevEpObj->number }}')"
                                            class="w-full py-1.5 px-3 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-muted hover:text-white text-[11px] font-mono font-bold transition-colors cursor-pointer flex items-center justify-between">
                                        <span>❮ Anterior: {{ $unitShort }} {{ $prevEpObj->number }}</span>
                                    </button>
                                @endif
                            </div>
                        </div>

                    </div>
                </div>

                <!-- ABA 2: SELETOR DE EPISÓDIOS DA TEMPORADA -->
                <div id="ep-tab-pane-sequence" class="ep-tab-pane hidden flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Todos os {{ $totalEpisodes }} {{ $isManga ? 'capítulos' : 'episódios' }} de {{ $workTitle }}</span>
                        <span class="text-xs font-mono text-emerald-400 font-bold">Selecionado: {{ $unitShort }} {{ $epNum }}</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1" id="ep-sequence-rail">
                        @foreach($displayEpisodes as $ep)
                            @php
                                $isCurrent = ($ep->number ?? 0) == $epNum;
                            @endphp
                            <div class="flex-none w-48 h-[210px] rounded-2xl border {{ $isCurrent ? 'border-emerald-400 ring-2 ring-emerald-400/40 bg-emerald-500/10' : 'border-theme-default bg-theme-raised/80 hover:border-theme-highlight' }} overflow-hidden cursor-pointer hover:scale-[1.03] transition-all shadow-lg group flex flex-col justify-between"
                                 onclick="window.pushNavigation('episode', '{{ $ep->id }}', '{{ addslashes($workTitle) }} • {{ $unitShort }} {{ $ep->number }}')">
                                <div class="relative w-full h-28 overflow-hidden bg-black shrink-0">
                                    <img src="{{ $image }}" class="w-full h-full object-cover group-hover:scale-105 transition-all filter brightness-90" loading="lazy" onerror="this.src='/assets/icons/actions/search.png'">
                                    <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded {{ $isCurrent ? 'bg-emerald-400 text-black' : 'bg-black/80 text-theme-accent border border-white/10' }} uppercase">
                                        {{ $unitShort }} {{ $ep->number }}
                                    </span>
                                    @if($isCurrent)
                                        <span class="absolute top-2 right-2 text-[8px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-400 text-black uppercase">
                                            EM TELA
                                        </span>
                                    @endif
                                </div>
                                <div class="p-3 flex-1 flex flex-col justify-between min-w-0">
                                    <div>
                                        <h3 class="text-xs font-bold {{ $isCurrent ? 'text-emerald-300' : 'text-theme-primary group-hover:text-theme-accent' }} transition-colors truncate">
                                            {{ $unitLabel }} {{ $ep->number }}
                                        </h3>
                                        <p class="text-[10px] font-mono text-theme-muted mt-0.5 truncate">
                                            {{ $ep->air_date_utc ?? 'Catalogado' }}
                                        </p>
                                    </div>
                                    <div class="flex items-center justify-between pt-1.5 border-t border-theme-default/40">
                                        <span class="text-[9px] font-mono {{ $isCurrent ? 'text-emerald-400 font-bold' : 'text-theme-muted' }}">
                                            {{ $isCurrent ? '● Selecionado' : 'Ir para ' . $unitShort . ' ' . $ep->number . ' ❯' }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>

                <!-- ABA 3: DISCUSSÃO DO EPISÓDIO -->
                <div id="ep-tab-pane-discussion" class="ep-tab-pane hidden flex-col h-full overflow-y-auto no-scrollbar">
                    <x-shell.entity-discussion
                        :targetType="!$isVirtualEp ? 'episode' : ($isManga ? 'manga' : 'work')"
                        :targetId="!$isVirtualEp ? ($currentEpisode->id ?? '') : ($work->id ?? '')" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA DO EPISÓDIO: ÁRVORE DE PERTENCIMENTO ONTOLÓGICO + DIREÇÃO & AUTORIA + ESTÚDIO -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: ÁRVORE DE PERTENCIMENTO DO EPISÓDIO (UNIVERSO ➔ OBRA ➔ ARCO ➔ EPISÓDIO) -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-emerald-400 text-xs">🧭</span>
                        <h3 class="text-[11px] font-mono uppercase tracking-wider text-theme-primary font-bold">
                            Hierarquia deste {{ $unitLabel }}
                        </h3>
                    </div>
                    <span class="text-[9px] font-mono text-emerald-400 font-bold">#{{ $epNum }}/{{ $totalEpisodes }}</span>
                </div>

                <!-- Nível 1: Universo -->
                @if($universe)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/70 border border-theme-default/50 hover:border-indigo-400 cursor-pointer transition-all group"
                         onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')">
                        <div class="min-w-0">
                            <span class="text-[8px] font-mono uppercase text-indigo-300 font-bold block">1. Universo (Franquia)</span>
                            <p class="text-xs font-bold text-white truncate group-hover:text-indigo-300">{{ $universe->name }}</p>
                        </div>
                        <span class="text-xs text-theme-muted group-hover:text-white">❯</span>
                    </div>
                @endif

                <!-- Nível 2: Obra / Temporada -->
                <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/70 border border-theme-default/50 hover:border-theme-accent cursor-pointer transition-all group"
                     onclick="window.pushNavigation('{{ $isManga ? 'manga' : 'work' }}', '{{ $work->id }}', '{{ addslashes($workTitle) }}')">
                    <div class="min-w-0">
                        <span class="text-[8px] font-mono uppercase text-theme-accent font-bold block">2. Obra / Temporada ({{ $format }})</span>
                        <p class="text-xs font-bold text-white truncate group-hover:text-theme-accent">{{ $workTitle }}</p>
                    </div>
                    <span class="text-xs text-theme-muted group-hover:text-white">❯</span>
                </div>

                <!-- Nível 3: Arco Narrativo -->
                @if($currentArc)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400 cursor-pointer transition-all group"
                         onclick="window.pushNavigation('arc', '{{ $currentArc->id }}', '{{ addslashes($currentArc->title) }}')">
                        <div class="min-w-0">
                            <span class="text-[8px] font-mono uppercase text-emerald-300 font-bold block">3. Arco Narrativo ({{ $unitShort }} {{ $arcStart }}–{{ $arcEnd ?: '?' }})</span>
                            <p class="text-xs font-bold text-white truncate group-hover:text-emerald-300">{{ $currentArc->title }}</p>
                        </div>
                        <span class="text-xs text-emerald-300">❯</span>
                    </div>
                @endif
            </div>

            <!-- DOCK 2: DIRETOR & AUTOR DO EPISÓDIO -->
            @if(count($creators) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">🎬</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">
                                Diretor & Autor
                            </h3>
                        </div>
                        <span class="text-[9px] font-mono text-theme-muted">Créditos</span>
                    </div>

                    <div class="space-y-2">
                        @foreach(collect($creators)->take(3) as $cr)
                            @php
                                $roleLabel = match($cr->role ?? '') {
                                    'author' => 'Autor Original',
                                    'director' => 'Diretor Geral',
                                    'writer' => 'Roteiro / Composição',
                                    'composer' => 'Trilha Sonora',
                                    default => 'Staff Principal',
                                };
                            @endphp
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('creator', '{{ $cr->id }}', '{{ addslashes($cr->name) }}')">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full overflow-hidden bg-black shrink-0 border border-theme-default">
                                        <img src="{{ $cr->image_url ?? '/assets/icons/actions/search.png' }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[145px]">{{ $cr->name }}</h4>
                                        <p class="text-[9px] font-mono {{ ($cr->role ?? '') === 'director' ? 'text-emerald-400 font-bold' : (($cr->role ?? '') === 'author' ? 'text-theme-accent font-bold' : 'text-theme-muted') }}">
                                            {{ $roleLabel }}
                                        </p>
                                    </div>
                                </div>
                                <span class="text-xs text-theme-muted">❯</span>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

            <!-- DOCK 3: ESTÚDIO DE PRODUÇÃO -->
            @if(count($studios) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">🏢</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">
                            Estúdio
                        </h3>
                    </div>

                    <div class="space-y-2">
                        @foreach(collect($studios)->take(2) as $st)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0 border border-theme-default flex items-center justify-center font-bold font-mono text-xs text-theme-accent">
                                        🏢
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[150px]">{{ $st->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted">Animação & Produção</p>
                                    </div>
                                </div>
                                <span class="text-xs text-theme-muted">❯</span>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

        </aside>

    </div>
</div>

<script>
window.switchEpisodeEntityTab = function(tabName) {
    tabName = (tabName || '').trim();
    const tabs = ['ficha', 'sequence', 'discussion'];
    tabs.forEach(t => {
        const btn = document.getElementById('ep-tab-btn-' + t);
        const pane = document.getElementById('ep-tab-pane-' + t);
        if (btn) {
            if (t === tabName) {
                btn.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-emerald-400 text-black shadow-sm cursor-pointer shrink-0';
            } else {
                btn.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0';
            }
        }
        if (pane) {
            if (t === tabName) {
                pane.classList.remove('hidden');
                pane.classList.add('flex');
                if (t === 'discussion') {
                    window.refreshEntityComments?.();
                }
            } else {
                pane.classList.add('hidden');
                pane.classList.remove('flex');
            }
        }
    });
};

if (window.syncAddonCapabilityButtons) {
    window.syncAddonCapabilityButtons();
}
</script>
