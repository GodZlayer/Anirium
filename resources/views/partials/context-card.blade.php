@props([
    'work',
    'universe' => null,
    'currentArc' => null,
    'currentEpisode' => null,
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
    $title = $work->title ?? 'Obra Canônica';
    $media = strtolower($work->media ?? 'anime');
    $format = strtoupper($work->format ?? ($media === 'manga' ? 'MANGA' : 'TV'));
    $isManga = $media === 'manga' || in_array($format, ['MANGA', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'DOUJINSHI', 'NOVEL', 'LIGHT_NOVEL', 'OEL'], true);
    $status = strtoupper($work->status ?? 'COMPLETED');
    $image = $work->image_url ?? '/assets/icons/actions/search.png';
    $synopsis = strip_tags($work->synopsis ?? 'Sinopse oficial catalogada na malha ontológica relacional.');
    $isEpisodeMode = !empty($currentEpisode);
    $epNum = $isEpisodeMode ? ($currentEpisode->number ?? 1) : 1;
    $episodeTitle = $isEpisodeMode ? (($isManga ? 'Capítulo ' : 'Episódio ') . $epNum) : null;
    $totalEpisodes = count($episodes) ?: ($work->episode_count ?? 0);
    $totalArcs = count($arcs);
    $totalRelations = count($relations);
    $totalTracks = count($tracks);

    // Se a obra possui episode_count (ex: 12 eps), mas a tabela catalog_episodes ainda não populou as linhas individuais,
    // gera as unidades episódicas virtuais canônicas (1..N) para que o trilho de Episódios/Capítulos sempre exiba os cards!
    $displayEpisodes = collect($episodes);
    if ($displayEpisodes->isEmpty() && $totalEpisodes > 0) {
        $maxVirtual = min((int) $totalEpisodes, 200);
        $virtualList = [];
        for ($i = 1; $i <= $maxVirtual; $i++) {
            $virtualList[] = (object) [
                'id' => ($work->id ?? 'work') . ':ep:' . $i,
                'work_id' => $work->id ?? '',
                'number' => $i,
                'air_date_utc' => null,
                'is_virtual' => true,
            ];
        }
        $displayEpisodes = collect($virtualList);
    } elseif ($displayEpisodes->isEmpty() && $format === 'MOVIE') {
        $displayEpisodes = collect([
            (object) [
                'id' => ($work->id ?? 'work') . ':ep:1',
                'work_id' => $work->id ?? '',
                'number' => 1,
                'air_date_utc' => null,
                'is_virtual' => true,
            ],
        ]);
        $totalEpisodes = 1;
    }

    // Identificadores externos para resolução aberta de Add-ons (Comunidade / Stremio & Anirium+)
    $malId = collect($externalIds)->firstWhere('provider', 'mal')->external_id ?? null;
    $imdbId = collect($externalIds)->firstWhere('provider', 'imdb')->external_id ?? null;
    $anilistId = collect($externalIds)->firstWhere('provider', 'anilist')->external_id ?? null;

    // Filtrar faixas OP/ED que se aplicam ao episódio atual (quando em modo Episódio)
    $episodeTracks = collect($tracks);
    if ($isEpisodeMode && $totalTracks > 0) {
        $filtered = collect($tracks)->filter(function ($tr) use ($epNum) {
            if (preg_match('/\(eps?\s*(\d+)\s*-\s*(\d+|\?)\)/i', $tr->title ?? '', $m)) {
                $start = (int) $m[1];
                $end = $m[2] === '?' ? 99999 : (int) $m[2];
                return $epNum >= $start && $epNum <= $end;
            }
            return true;
        });
        if ($filtered->isNotEmpty()) {
            $episodeTracks = $filtered->values();
        }
    }

    // Aba padrão na Obra / Mangá / Episódio é SEMPRE Episódios (ou Capítulos)
    $defaultTab = 'episodes';
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary"
     id="work-context-stage"
     data-work-id="{{ $work->id ?? '' }}"
     data-work-title="{{ $title }}"
     data-work-media="{{ $isManga ? 'manga' : 'anime' }}"
     data-mal-id="{{ $malId ?? '' }}"
     data-imdb-id="{{ $imdbId ?? '' }}"
     data-anilist-id="{{ $anilistId ?? '' }}"
     data-episode-id="{{ $currentEpisode->id ?? ($episodes[0]->id ?? '') }}"
     data-episode-number="{{ $epNum }}">

    <!-- BARRA SUPERIOR: NAVEGAÇÃO ONTOLÓGICA -->
    <header class="h-14 w-full flex items-center justify-between px-3 sm:px-6 lg:px-8 border-b border-theme-default bg-theme-header shrink-0 z-20 gap-2">
        <div class="flex items-center gap-2 sm:gap-4 min-w-0">
            <button type="button"
                    onclick="window.popNavigation()"
                    class="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-accent hover:text-white text-xs font-bold font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                <span data-i18n="nav.back">Voltar</span>
            </button>

            <!-- Trilha Dinâmica Viva -->
            <nav id="entity-dynamic-breadcrumb" class="flex items-center gap-1.5 sm:gap-2 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar py-1">
                <button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent transition-colors shrink-0" data-i18n="nav.home">Lobby</button>
                <span class="opacity-40">❯</span>
                <span class="text-theme-accent font-bold truncate max-w-[140px] sm:max-w-[240px]">{{ $isEpisodeMode ? ($title . ' • ' . $episodeTitle) : $title }}</span>
            </nav>
        </div>

        <div class="hidden sm:flex items-center gap-3 shrink-0">
            @if($isEpisodeMode)
                <span class="px-3 py-1 rounded-full bg-theme-accent/20 text-theme-accent border border-theme-accent/30 text-[11px] font-bold tracking-wider uppercase font-mono">
                    📺 {{ strtoupper($episodeTitle) }} • {{ $format }}
                </span>
            @elseif($isManga)
                <span class="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold tracking-wider uppercase font-mono">
                    📖 {{ $format }} ONTOLÓGICO
                </span>
            @else
                <span class="px-3 py-1 rounded-full bg-theme-accent/20 text-theme-accent border border-theme-accent/30 text-[11px] font-bold tracking-wider uppercase font-mono">
                    🎬 {{ $format }} • {{ $status === 'RELEASING' ? 'EM EXIBIÇÃO' : 'CATALOGADO' }}
                </span>
            @endif
        </div>
    </header>

    <!-- HUB DE OBRA / MANGÁ / EPISÓDIO: VIEWPORT 100VH FIXO NO DESKTOP & FLUIDO NO MOBILE -->
    <div class="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 lg:gap-5 p-3 sm:p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO FIXO + ABAS INTERCAMBIÁVEIS -->
        <main class="shrink-0 lg:flex-1 min-w-0 flex flex-col gap-3 lg:gap-4 lg:overflow-hidden">

            <!-- 1. HERO PANORÂMICO COMPACTO (EXATAMENTE NO PADRÃO DO UNIVERSO: 175px - 210px) -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[175px] max-h-[210px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <!-- Imagem Panorâmica de Fundo com Fade -->
                <div class="absolute inset-0 z-0">
                    <img src="{{ $image }}" class="w-full h-full object-cover object-center filter brightness-[0.35] blur-[1px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/60 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <!-- Conteúdo do Hero -->
                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-xl space-y-2 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider {{ $isManga ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40' : 'bg-theme-accent/30 text-theme-accent border border-theme-accent/40' }} shadow-sm">
                                {{ $isEpisodeMode ? strtoupper($episodeTitle) : ($isManga ? 'MANGÁ / IMPRESSO' : 'OBRA • ' . $format) }}
                            </span>
                            @if($universe)
                                <span onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')"
                                      class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-black/70 text-theme-muted hover:text-white border border-white/10 cursor-pointer hover:border-[var(--color-state-universe,#6366F1)] transition-all">
                                    <span>No Universo:</span> <strong class="text-theme-accent">{{ $universe->name }}</strong>
                                </span>
                            @endif
                            @if($currentArc)
                                <span onclick="window.pushNavigation('arc', '{{ $currentArc->id }}', '{{ addslashes($currentArc->title) }}')"
                                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/40 cursor-pointer hover:scale-105 transition-transform">
                                    📜 {{ $currentArc->title }}
                                </span>
                            @endif
                        </div>

                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md line-clamp-1">
                            {{ $isEpisodeMode ? ($episodeTitle . ' — ' . $title) : $title }}
                        </h1>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-lg">
                            {{ $synopsis }}
                        </p>

                        <!-- Ações Rápidas: OFICIAL (Sempre Visível) vs ADD-ON (Condicional por Capacidade) -->
                        <div class="flex items-center gap-2.5 pt-1 flex-wrap">
                            @if(!$isManga)
                                <!-- OFICIAL / LEGAL: Trailer Oficial no YouTube (Sempre visível para obras animadas/filmes) -->
                                <button type="button"
                                        onclick="window.openOfficialTrailerModal('{{ addslashes($title) }}')"
                                        class="px-3.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500 border border-red-500/40 text-red-200 hover:text-white text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5 cursor-pointer">
                                    <span>🎬</span> <span>Trailer Oficial</span>
                                </button>

                                <!-- CONDICIONAL POR ADD-ON DE VÍDEO (Anirium Player Pro / Addon de Stream da Comunidade) -->
                                <button type="button"
                                        data-requires-addon-capability="video"
                                        onclick="window.launchExternalVideoAddon('{{ $work->id ?? '' }}', '{{ $currentEpisode->id ?? ($episodes[0]->id ?? '') }}', '{{ $epNum }}', '{{ addslashes($title) }}')"
                                        class="hidden px-3.5 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg items-center gap-1.5 cursor-pointer">
                                    <span>▶</span>
                                    <span>{{ $isEpisodeMode ? ('Tocar Episódio ' . $epNum) : ($format === 'MOVIE' ? 'Reproduzir Filme' : ('Tocar Ep. ' . $epNum)) }}</span>
                                </button>
                            @else
                                <!-- CONDICIONAL POR ADD-ON DE LEITURA / MANGÁ (Manga Reader Pro / Addon Reader da Comunidade) -->
                                <button type="button"
                                        data-requires-addon-capability="manga"
                                        onclick="window.launchExternalMangaAddon('{{ $work->id ?? '' }}', '{{ $epNum }}', '{{ addslashes($title) }}')"
                                        class="hidden px-3.5 py-1.5 rounded-xl bg-amber-400 text-black text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg items-center gap-1.5 cursor-pointer">
                                    <span>📖</span>
                                    <span>{{ $isEpisodeMode ? ('Ler Capítulo ' . $epNum) : 'Ler Capítulos (Reader Add-on)' }}</span>
                                </button>
                            @endif

                            <!-- Ação Oficial de Catálogo: Favoritar -->
                            <button type="button"
                                    onclick="window.toggleUserBookmark?.('{{ ($isEpisodeMode && empty($currentEpisode->is_virtual)) ? ($currentEpisode->id ?? $work->id) : ($work->id ?? '') }}', '{{ ($isEpisodeMode && empty($currentEpisode->is_virtual)) ? 'episode' : ($isManga ? 'manga' : 'work') }}')"
                                    class="px-3 py-1.5 rounded-xl bg-theme-pill border border-theme-default text-xs font-mono font-bold {{ !empty($isBookmarked) ? 'text-theme-accent border-theme-accent' : 'text-theme-muted hover:text-white' }} transition-all cursor-pointer flex items-center gap-1.5">
                                <span>📌</span> <span data-i18n="action.bookmark">Favoritar</span>
                            </button>
                        </div>
                    </div>

                    <!-- Poster Representativo com Tilt 3D (Idêntico ao Universo: w-28 aspect-[3/4]) -->
                    <div class="hidden md:block flex-none w-28 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-theme-default shadow-2xl bg-black transform hover:-rotate-1 transition-transform">
                        <img src="{{ $image }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                    </div>
                </div>
            </section>

            <!-- 2. NAVEGAÇÃO EM ABAS DA OBRA / EPISÓDIO (SEM GENEALOGIA E SEM SAGAS, QUE PERTENCEM EXCLUSIVAMENTE AO UNIVERSO) -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchWorkEntityTab('episodes')"
                        id="work-tab-btn-episodes"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all {{ $defaultTab === 'episodes' ? 'bg-theme-accent text-theme-inverse shadow-sm' : 'text-theme-muted hover:text-theme-primary' }} cursor-pointer shrink-0">
                    <span>{{ $isManga ? '📖' : '📺' }}</span>
                    <span>{{ $isEpisodeMode ? ($isManga ? 'Sequência de Capítulos' : 'Episódios da Obra') : ($isManga ? 'Capítulos & Volumes' : 'Episódios') }} ({{ $totalEpisodes }})</span>
                </button>

                @if(!$isManga && $totalTracks > 0)
                    <button type="button"
                             onclick="window.switchWorkEntityTab('tracks')"
                             id="work-tab-btn-tracks"
                             class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>🎵</span>
                        <span>{{ $isEpisodeMode ? 'Abertura & Ending do Episódio' : 'Aberturas & Endings' }} ({{ count($episodeTracks) }})</span>
                    </button>
                @endif

                <button type="button"
                        onclick="window.switchWorkEntityTab('discussion')"
                        id="work-tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span>
                    <span data-i18n="discussion.tab_label">Discussão</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS (TRILHOS HORIZONTAIS FLUIDOS SEM SCROLL VERTICAL NA PÁGINA) -->
            <div class="min-h-[245px] lg:min-h-0 lg:flex-1 overflow-hidden flex flex-col justify-center">

                <!-- ABA 1: EPISÓDIOS / CAPÍTULOS (TRILHO HORIZONTAL DE CARDS h-[210px]) -->
                <div id="work-tab-pane-episodes" class="work-tab-pane {{ $defaultTab === 'episodes' ? 'flex' : 'hidden' }} flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">
                            {{ $isEpisodeMode ? ('Navegação contínua da temporada • Selecionado: ' . $episodeTitle) : ($isManga ? 'Volumes e capítulos catalogados desta publicação' : 'Episódios catalogados nesta produção audiovisual') }}
                        </span>
                        <span class="text-xs font-mono text-theme-accent font-bold">
                            {{ $totalEpisodes }} {{ $isManga ? 'capítulos/un.' : 'episódios' }}
                        </span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @forelse($displayEpisodes as $ep)
                            @php
                                $isCurrentEp = $isEpisodeMode && (($currentEpisode->id ?? '') === $ep->id || ($currentEpisode->number ?? 0) == $ep->number);
                                $isVirtualEp = !empty($ep->is_virtual);
                            @endphp
                            <div class="flex-none w-52 h-[210px] rounded-2xl border {{ $isCurrentEp ? 'border-theme-accent ring-2 ring-theme-accent/30 bg-theme-raised' : 'border-theme-default bg-theme-raised/80 hover:border-theme-highlight' }} overflow-hidden cursor-pointer hover:scale-[1.03] transition-all shadow-lg group flex flex-col justify-between"
                                 onclick="window.pushNavigation('episode', '{{ $ep->id }}', '{{ addslashes($title) }} • {{ $isManga ? 'Cap.' : 'Ep.' }} {{ $ep->number }}')">
                                <div class="relative w-full h-28 overflow-hidden bg-black shrink-0">
                                    <img src="{{ $image }}" class="w-full h-full object-cover group-hover:scale-105 transition-all filter brightness-90" loading="lazy" onerror="this.src='/assets/icons/actions/search.png'">
                                    <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded {{ $isCurrentEp ? 'bg-theme-accent text-theme-inverse' : 'bg-black/80 text-theme-accent border border-white/10' }} uppercase">
                                        {{ $isManga ? 'CAP. ' : 'EP. ' }}{{ $ep->number }}
                                    </span>
                                    @if($isCurrentEp)
                                        <span class="absolute top-2 right-2 text-[8px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-500/90 text-black uppercase">
                                            ATUAL
                                        </span>
                                    @endif
                                </div>
                                <div class="p-3 flex-1 flex flex-col justify-between min-w-0">
                                    <div>
                                        <h3 class="text-xs font-bold {{ $isCurrentEp ? 'text-theme-accent' : 'text-theme-primary group-hover:text-theme-accent' }} transition-colors truncate">
                                            {{ $isManga ? 'Capítulo ' : 'Episódio ' }}{{ $ep->number }}
                                        </h3>
                                        <p class="text-[10px] font-mono text-theme-muted mt-0.5 truncate">
                                            {{ $ep->air_date_utc ?? ($status === 'RELEASING' ? 'Em lançamento' : 'Catalogado') }}
                                        </p>
                                    </div>
                                    <div class="flex items-center justify-between pt-1.5 border-t border-theme-default/40">
                                        <span class="text-[9px] font-mono text-theme-muted group-hover:text-theme-accent transition-colors">{{ $isManga ? 'Abrir Capítulo ❯' : 'Abrir Episódio ❯' }}</span>
                                        @if(!$isManga)
                                            <button type="button"
                                                    data-requires-addon-capability="video"
                                                    onclick="event.stopPropagation(); window.launchExternalVideoAddon('{{ $work->id ?? '' }}', '{{ $ep->id }}', '{{ $ep->number }}', '{{ addslashes($title) }}')"
                                                    class="hidden px-2 py-0.5 rounded bg-theme-accent text-theme-inverse text-[9px] font-mono font-bold hover:scale-105 transition-transform">
                                                ▶ Play
                                            </button>
                                        @else
                                            <button type="button"
                                                    data-requires-addon-capability="manga"
                                                    onclick="event.stopPropagation(); window.launchExternalMangaAddon('{{ $work->id ?? '' }}', '{{ $ep->number }}', '{{ addslashes($title) }}')"
                                                    class="hidden px-2 py-0.5 rounded bg-amber-400 text-black text-[9px] font-mono font-bold hover:scale-105 transition-transform">
                                                📖 Ler
                                            </button>
                                        @endif
                                    </div>
                                </div>
                            </div>
                        @empty
                            <div class="w-full h-[210px] rounded-3xl bg-theme-raised/50 border border-theme-default p-5 flex items-center justify-between gap-6">
                                <div class="space-y-2 max-w-xl">
                                    <span class="text-[10px] font-mono uppercase text-theme-accent font-bold">Catálogo Editorial & Estrutural</span>
                                    <h3 class="text-sm font-bold text-white">{{ $title }} ({{ $format }})</h3>
                                    <p class="text-xs text-theme-muted line-clamp-3 leading-relaxed">{{ $synopsis }}</p>
                                </div>
                                <div class="flex flex-col gap-2 shrink-0">
                                    @if(!$isManga)
                                        <button type="button"
                                                data-requires-addon-capability="video"
                                                onclick="window.launchExternalVideoAddon('{{ $work->id ?? '' }}', '', '1', '{{ addslashes($title) }}')"
                                                class="hidden px-4 py-2 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold cursor-pointer">
                                            ▶ Reproduzir via Add-on
                                        </button>
                                    @else
                                        <button type="button"
                                                data-requires-addon-capability="manga"
                                                onclick="window.launchExternalMangaAddon('{{ $work->id ?? '' }}', '1', '{{ addslashes($title) }}')"
                                                class="hidden px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-mono font-bold cursor-pointer">
                                            📖 Abrir no Manga Reader Add-on
                                        </button>
                                    @endif
                                </div>
                            </div>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 2: ABERTURAS & ENDINGS (OFICIAL: PLATAFORMAS DE ÁUDIO SPOTIFY / YOUTUBE MUSIC) -->
                @if(!$isManga && $totalTracks > 0)
                <div id="work-tab-pane-tracks" class="work-tab-pane hidden flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">
                            {{ $isEpisodeMode ? ('Temas musicais (OP / ED) vinculados à faixa do ' . $episodeTitle) : 'Aberturas (OP), Encerramentos (ED) e OSTs oficiais desta obra' }}
                        </span>
                        <span class="text-xs font-mono text-theme-accent font-bold">{{ count($episodeTracks) }} faixas</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @foreach($episodeTracks as $tr)
                            @php
                                $rawTr = $tr->title ?? 'Faixa Musical';
                                $cleanSong = $rawTr;
                                if (preg_match('/"([^"]+)"/', $rawTr, $m)) {
                                    $cleanSong = $m[1];
                                }
                                $searchAudioQuery = urlencode($cleanSong . ' ' . $title);
                            @endphp
                            <div class="flex-none w-72 h-[210px] p-4 rounded-2xl border border-theme-default bg-theme-raised/80 hover:bg-theme-raised hover:border-pink-400/50 transition-all cursor-pointer shadow-md group flex flex-col justify-between"
                                 onclick="window.pushNavigation('track', '{{ $tr->id }}', '{{ addslashes($cleanSong) }}')">
                                <div>
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-pink-500/20 text-pink-300 border border-pink-500/30">
                                            🎵 {{ strtoupper($tr->track_type ?? 'THEME') }}
                                        </span>
                                        <span class="text-xs text-theme-muted group-hover:text-pink-300">Ficha ❯</span>
                                    </div>
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-pink-300 transition-colors line-clamp-2 leading-snug">
                                        {{ $rawTr }}
                                    </h3>
                                </div>

                                <!-- Plataformas Oficiais de Streaming de Áudio (100% Legal / Sempre Visíveis) -->
                                <div class="pt-2 border-t border-theme-default/40 flex items-center justify-between gap-2">
                                    <a href="https://open.spotify.com/search/{{ $searchAudioQuery }}"
                                       target="_blank" rel="noopener noreferrer"
                                       onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[9px] font-mono font-bold text-center transition-all">
                                        🟢 Spotify
                                    </a>
                                    <a href="https://music.youtube.com/search?q={{ $searchAudioQuery }}"
                                       target="_blank" rel="noopener noreferrer"
                                       onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[9px] font-mono font-bold text-center transition-all">
                                        🔴 YT Music
                                    </a>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 5: DISCUSSÃO COMUNITÁRIA -->
                <div id="work-tab-pane-discussion" class="work-tab-pane hidden flex-col h-full overflow-y-auto no-scrollbar">
                    <x-shell.entity-discussion
                        :targetType="($isEpisodeMode && empty($currentEpisode->is_virtual)) ? 'episode' : ($isManga ? 'manga' : 'work')"
                        :targetId="($isEpisodeMode && empty($currentEpisode->is_virtual)) ? ($currentEpisode->id ?? '') : ($work->id ?? '')" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: SIDEBAR ONTOLÓGICA (3 DOCKS NO PADRÃO DO UNIVERSO) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: VÍNCULO COM O UNIVERSO & MÉTRICAS DA OBRA -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                <div class="flex items-center gap-2">
                    <span class="text-theme-accent text-xs">👑</span>
                    <h3 class="text-[11px] font-mono uppercase tracking-wider text-theme-primary font-bold">
                        Vínculo com o Universo & Métricas da Obra
                    </h3>
                </div>

                @if($universe)
                    <div class="flex items-center justify-between gap-2.5 p-2.5 rounded-2xl bg-theme-raised/70 border border-theme-default/50 hover:border-[var(--color-state-universe,#6366F1)] cursor-pointer transition-all group"
                         onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-10 h-10 rounded-xl overflow-hidden bg-black shrink-0 border border-theme-default">
                                <img src="{{ $image }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                            </div>
                            <div class="min-w-0">
                                <p class="text-xs font-bold text-white truncate group-hover:text-theme-accent transition-colors">
                                    {{ $universe->name }}
                                </p>
                                <span class="text-[9px] font-mono text-theme-muted block">Universo (Franquia)</span>
                            </div>
                        </div>
                        <span class="text-xs text-theme-accent group-hover:translate-x-0.5 transition-transform shrink-0">❯</span>
                    </div>
                @endif

                @if($isEpisodeMode)
                    <div class="p-2.5 rounded-2xl bg-theme-raised/70 border border-theme-default/50 hover:border-theme-accent cursor-pointer transition-all group"
                         onclick="window.pushNavigation('{{ $isManga ? 'manga' : 'work' }}', '{{ $work->id }}', '{{ addslashes($title) }}')">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-mono uppercase tracking-wider text-theme-accent font-bold">🎬 Obra / Temporada</span>
                            <span class="text-xs text-theme-muted group-hover:text-white">❯</span>
                        </div>
                        <p class="text-xs font-bold text-white truncate mt-1">{{ $title }} ({{ $format }})</p>
                    </div>
                @endif

                <div class="flex items-center justify-between px-1 text-[11px] font-mono text-theme-muted">
                    <span>📺 {{ $format }} • {{ $totalEpisodes ?: '?' }} {{ $isManga ? 'Capítulos' : 'Episódios' }}</span>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase {{ $status === 'RELEASING' ? 'bg-theme-accent/20 text-theme-accent border border-theme-accent/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' }}">
                        {{ $status === 'RELEASING' ? 'Em Exibição' : 'Concluída' }}
                    </span>
                </div>

                <div class="grid grid-cols-3 gap-2">
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-[var(--color-state-canon,#10B981)]">{{ $totalArcs }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Arcos</span>
                    </div>

                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-white">{{ $totalEpisodes ?: '?' }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">{{ $isManga ? 'Capítulos' : 'Episódios' }}</span>
                    </div>

                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-pink-400">{{ $totalTracks }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Músicas (OP/ED)</span>
                    </div>
                </div>
            </div>

            <!-- DOCK 2: DIREÇÃO & AUTORIA -->
            @if(count($creators) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">✍️</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">
                                Direção & Autoria
                            </h3>
                        </div>
                        <span class="text-[9px] font-mono text-theme-muted">Criação</span>
                    </div>

                    <div class="space-y-2">
                        @foreach(collect($creators)->take(4) as $cr)
                            @php
                                $roleLabel = match($cr->role ?? '') {
                                    'author' => 'Autor do Original',
                                    'director' => 'Diretor',
                                    'writer' => 'Roteirista',
                                    'composer' => 'Compositor Musical',
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
                                        <p class="text-[9px] font-mono {{ ($cr->role ?? '') === 'author' ? 'text-theme-accent font-bold' : 'text-theme-muted' }}">
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

            <!-- DOCK 3: ESTÚDIOS -->
            @if(count($studios) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">🏢</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">
                                Estúdios
                            </h3>
                        </div>
                    </div>

                    <div class="space-y-2">
                        @foreach(collect($studios)->take(3) as $st)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0 border border-theme-default flex items-center justify-center font-bold font-mono text-xs text-theme-accent">
                                        🏢
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[150px]">{{ $st->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted">Produção & Animação</p>
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
window.switchWorkEntityTab = function(tabName) {
    const tabs = ['episodes', 'tracks', 'discussion'];
    tabs.forEach(t => {
        const btn = document.getElementById('work-tab-btn-' + t);
        const pane = document.getElementById('work-tab-pane-' + t);
        if (btn) {
            if (t === tabName) {
                btn.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0';
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
