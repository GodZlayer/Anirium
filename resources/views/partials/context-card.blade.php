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
    $score = $work->score ?? '8.5';
    $image = $work->image_url ?? '/assets/icons/actions/search.png';
    $synopsis = strip_tags($work->synopsis ?? 'Sinopse oficial catalogada na malha ontológica relacional.');
    $isEpisodeMode = !empty($currentEpisode);
    $epNum = $isEpisodeMode ? ($currentEpisode->number ?? 1) : 1;
    $episodeTitle = $isEpisodeMode ? ('Episódio ' . $epNum) : null;
    $totalEpisodes = count($episodes) ?: ($work->episode_count ?? 0);
    $totalArcs = count($arcs);
    $totalRelations = count($relations);
    $totalTracks = count($tracks);

    // Identificadores externos para resolução aberta de Add-ons (Comunidade / Stremio & Anirium+)
    $malId = collect($externalIds)->firstWhere('provider', 'mal')->external_id ?? null;
    $imdbId = collect($externalIds)->firstWhere('provider', 'imdb')->external_id ?? null;
    $anilistId = collect($externalIds)->firstWhere('provider', 'anilist')->external_id ?? null;

    // Aba padrão inteligente:
    // - Se clicou em um episódio -> abre direto na aba 'player' (Slot de Extensões & Ficha do Episódio)
    // - Se for obra com arcos -> 'structure'
    // - Se não tiver arcos mas tiver episódios -> 'episodes'
    $defaultTab = $isEpisodeMode
        ? 'player'
        : ($totalArcs > 0 || $totalRelations > 0 || $isManga ? 'structure' : ($totalEpisodes > 0 ? 'episodes' : 'structure'));
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
    <header class="h-14 w-full flex items-center justify-between px-6 lg:px-8 border-b border-theme-default bg-theme-header shrink-0 z-20">
        <div class="flex items-center gap-4 min-w-0">
            <button type="button"
                    onclick="window.popNavigation()"
                    class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-accent hover:text-white text-xs font-bold font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                <span id="btn-context-back-label" data-i18n="nav.back">Voltar</span>
            </button>

            <nav id="entity-dynamic-breadcrumb" class="flex items-center gap-2 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar py-1">
                <button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent transition-colors shrink-0" data-i18n="nav.home">Lobby</button>
            </nav>
        </div>

        <div class="flex items-center gap-2.5 shrink-0">
            @if($isEpisodeMode)
                <span class="px-2.5 py-1 rounded-full border border-theme-accent/40 text-[10px] font-mono font-bold text-theme-accent bg-theme-accent/15 uppercase">
                    📺 {{ $episodeTitle }}
                </span>
            @endif
            <span class="px-2.5 py-1 rounded-full border border-theme-default text-[10px] font-mono font-bold text-theme-accent bg-theme-pill uppercase">
                {{ $isManga ? '📖 ' . $format : '🎬 ' . $format }}
            </span>
            <span class="px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold uppercase {{ $status === 'RELEASING' ? 'bg-theme-accent/20 text-theme-accent border-theme-accent/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/30' }}">
                {{ $status === 'RELEASING' ? 'Em Exibição' : 'Catalogado' }}
            </span>
        </div>
    </header>

    <!-- HUB DA OBRA / MANGÁ / EPISÓDIO: VIEWPORT 100VH FIXO SEM SCROLL CEGO -->
    <div class="flex-1 overflow-hidden flex flex-col lg:flex-row gap-5 p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO + ABAS INTERCAMBIÁVEIS -->
        <main class="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">

            <!-- 1. HERO PANORÂMICO DA OBRA / EPISÓDIO -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[185px] max-h-[225px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $image }}" class="w-full h-full object-cover object-center filter brightness-[0.32] blur-[1px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/65 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-2xl space-y-2 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider bg-theme-accent/25 text-theme-accent border border-theme-accent/40 shadow-sm">
                                {{ $isEpisodeMode ? 'UNIDADE EPISÓDICA' : ($isManga ? 'OBRA IMPRESSA / MANGÁ' : 'OBRA ANIMADA') }}
                            </span>
                            @if($currentArc)
                                <span onclick="window.pushNavigation('arc', '{{ $currentArc->id }}', '{{ addslashes($currentArc->title) }}')"
                                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/40 cursor-pointer hover:scale-105 transition-transform">
                                    📜 {{ $currentArc->title }}
                                </span>
                            @endif
                            @if($malId)
                                <span class="px-2 py-0.5 rounded text-[9px] font-mono text-theme-muted bg-black/50 border border-white/10">
                                    MAL #{{ $malId }}
                                </span>
                            @endif
                        </div>

                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md line-clamp-1">
                            {{ $isEpisodeMode ? ($title . ' • ' . $episodeTitle) : $title }}
                        </h1>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-xl">
                            {{ $synopsis }}
                        </p>

                        <!-- Ações Rápidas Ontológicas -->
                        <div class="flex items-center gap-2.5 pt-1 flex-wrap">
                            @if(!$isManga && count($episodes) > 0)
                                <button type="button"
                                        onclick="window.switchEntityTab('episodes')"
                                        class="px-3.5 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5 cursor-pointer">
                                    <span>📺</span> <span>Ver Episódios ({{ count($episodes) }})</span>
                                </button>
                            @endif

                            @if(!$isManga)
                                <button type="button"
                                        onclick="window.openAddonStageForEpisode('{{ $work->id ?? '' }}', '{{ $currentEpisode->id ?? ($episodes[0]->id ?? '') }}', '{{ $epNum }}')"
                                        class="px-3.5 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-accent/40 text-theme-accent text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md">
                                    <span>🧩</span> <span>Slot de Extensão / Add-ons (Ep. {{ $epNum }})</span>
                                </button>
                            @endif

                            @if($universe)
                                <button type="button"
                                        onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')"
                                        class="px-3 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-xs font-mono font-bold text-theme-primary transition-all cursor-pointer flex items-center gap-1.5">
                                    <span>🌌</span> <span class="truncate max-w-[160px]">{{ $universe->name }}</span>
                                </button>
                            @endif
                        </div>
                    </div>

                    <!-- Poster Representativo com Tilt 3D -->
                    <div class="hidden md:block flex-none w-28 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-theme-default shadow-2xl bg-black transform hover:-rotate-1 transition-transform shrink-0">
                        <img src="{{ $image }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                    </div>
                </div>
            </section>

            <!-- BARRA DE AÇÕES PESSOAIS DO USUÁRIO -->
            <div class="shrink-0">
                <x-shell.entity-actions
                    :targetType="$isEpisodeMode ? 'episode' : ($isManga ? 'manga' : 'work')"
                    :targetId="$isEpisodeMode ? ($currentEpisode->id ?? '') : ($work->id ?? '')"
                    :targetTitle="$isEpisodeMode ? ($title . ' - ' . $episodeTitle) : $title"
                    :isBookmarked="$isBookmarked ?? false"
                    :isLiked="$isLiked ?? false"
                    :userScore="$userScore ?? null"
                    :userStatus="$userStatus ?? null"
                    :isWatched="$isWatched ?? false" />
            </div>

            <!-- 2. NAVEGAÇÃO EM ABAS DA OBRA -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchEntityTab('structure')"
                        id="tab-btn-structure"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all {{ $defaultTab === 'structure' ? 'bg-theme-accent text-theme-inverse shadow-sm' : 'text-theme-muted hover:text-theme-primary' }} cursor-pointer shrink-0">
                    <span>📜</span>
                    <span>{{ $isManga ? 'Estrutura & Relações' : 'Sagas & Genealogia' }} ({{ $totalArcs + $totalRelations }})</span>
                </button>

                @if(count($episodes) > 0)
                    <button type="button"
                            onclick="window.switchEntityTab('episodes')"
                            id="tab-btn-episodes"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all {{ $defaultTab === 'episodes' ? 'bg-theme-accent text-theme-inverse shadow-sm' : 'text-theme-muted hover:text-theme-primary' }} cursor-pointer shrink-0">
                        <span>📺</span>
                        <span>{{ $isManga ? 'Capítulos' : 'Episódios' }} ({{ count($episodes) }})</span>
                    </button>
                @endif

                @if(!$isManga)
                    <button type="button"
                            onclick="window.switchEntityTab('player'); window.mountAddonStage()"
                            id="tab-btn-player"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all {{ $defaultTab === 'player' ? 'bg-theme-accent text-theme-inverse shadow-sm' : 'text-theme-muted hover:text-theme-primary' }} cursor-pointer shrink-0">
                        <span>🧩</span>
                        <span>Extensões & Reprodução {{ $isEpisodeMode ? '(Ep. ' . $epNum . ')' : '' }}</span>
                    </button>
                @endif

                @if($totalTracks > 0)
                    <button type="button"
                            onclick="window.switchEntityTab('tracks')"
                            id="tab-btn-tracks"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>🎵</span>
                        <span>Trilhas Sonoras ({{ $totalTracks }})</span>
                    </button>
                @endif

                <button type="button"
                        onclick="window.switchEntityTab('discussion')"
                        id="tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span>
                    <span data-i18n="discussion.tab_label">Discussão</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS -->
            <div class="flex-1 overflow-hidden min-h-0 flex flex-col">

                <!-- ABA 1: SAGAS & ARCOS + RELAÇÕES GENEALÓGICAS -->
                <div id="entity-tab-panel-structure" class="flex-1 min-h-0 {{ $defaultTab === 'structure' ? 'flex' : 'hidden' }} flex-col gap-3 p-4 rounded-3xl bg-theme-card border border-theme-default overflow-y-auto no-scrollbar">
                    @if(count($arcs) > 0)
                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Sagas & Arcos Narrativos</h3>
                                <span class="text-[11px] font-mono text-theme-muted">{{ count($arcs) }} arcos</span>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                @foreach($arcs as $arc)
                                    <div class="p-3.5 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-accent transition-all flex items-center justify-between cursor-pointer group"
                                         onclick="window.pushNavigation('arc', '{{ $arc->id }}', '{{ addslashes($arc->title) }}')">
                                        <div class="flex items-center gap-3 min-w-0">
                                            <span class="w-2.5 h-2.5 rounded-full shrink-0 {{ ($arc->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]' : 'bg-[var(--color-state-canon,#10B981)]' }}"></span>
                                            <div class="min-w-0">
                                                <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $arc->title }}</h4>
                                                <p class="text-[10px] font-mono text-theme-muted">Episódios {{ $arc->start_number ?? 1 }} a {{ $arc->end_number ?? '?' }}</p>
                                            </div>
                                        </div>
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 {{ ($arc->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border border-[var(--color-state-filler,#F43F5E)]/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' }}">
                                            {{ strtoupper($arc->classification ?? 'CANON') }}
                                        </span>
                                    </div>
                                @endforeach
                            </div>
                        </div>
                    @endif

                    @if(count($relations) > 0)
                        <div class="space-y-2 pt-1">
                            <div class="flex items-center justify-between">
                                <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Conexões & Obras Relacionadas</h3>
                                <span class="text-[11px] font-mono text-theme-muted">{{ count($relations) }} relações</span>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                @foreach($relations as $rel)
                                    @php
                                        $relKind = strtolower($rel->media ?? 'anime') === 'manga' ? 'manga' : 'work';
                                        $relLabel = match($rel->relation_type ?? '') {
                                            'prequel' => 'Prequel (Anterior)',
                                            'sequel' => 'Sequência',
                                            'adaptation' => 'Adaptação',
                                            'side_story' => 'Side-Story',
                                            'parent_story' => 'Obra Principal',
                                            'spin_off' => 'Spin-Off',
                                            default => strtoupper(str_replace('_', ' ', $rel->relation_type ?? 'Relacionado')),
                                        };
                                    @endphp
                                    <div class="p-2.5 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-accent transition-all flex items-center justify-between gap-3 cursor-pointer group"
                                         onclick="window.pushNavigation('{{ $relKind }}', '{{ $rel->id }}', '{{ addslashes($rel->title) }}')">
                                        <div class="flex items-center gap-3 min-w-0">
                                            <div class="w-11 h-14 rounded-xl overflow-hidden bg-black shrink-0 border border-theme-default">
                                                <img src="{{ $rel->image_url ?? $image }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                                            </div>
                                            <div class="min-w-0">
                                                <span class="inline-block px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase bg-theme-accent/15 text-theme-accent border border-theme-accent/30 mb-0.5">
                                                    {{ $relLabel }}
                                                </span>
                                                <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $rel->title }}</h4>
                                                <p class="text-[10px] font-mono text-theme-muted">{{ strtoupper($rel->format ?? 'TV') }} {{ $rel->episode_count ? '• ' . $rel->episode_count . ' un.' : '' }}</p>
                                            </div>
                                        </div>
                                        <span class="text-xs text-theme-muted group-hover:text-theme-accent shrink-0">❯</span>
                                    </div>
                                @endforeach
                            </div>
                        </div>
                    @endif

                    @if(count($arcs) === 0 && count($relations) === 0)
                        <div class="p-4 rounded-2xl bg-theme-raised/50 border border-theme-default space-y-2">
                            <h4 class="text-xs font-mono font-bold uppercase text-theme-accent">Ficha Técnica & Sinopse Completa</h4>
                            <p class="text-xs text-theme-secondary leading-relaxed">{{ $synopsis }}</p>
                            <div class="pt-2 flex flex-wrap gap-2 text-[10px] font-mono text-theme-muted">
                                <span class="px-2.5 py-1 rounded-lg bg-theme-pill border border-theme-default">Formato: {{ $format }}</span>
                                <span class="px-2.5 py-1 rounded-lg bg-theme-pill border border-theme-default">Status: {{ $status }}</span>
                                @if($totalEpisodes > 0)
                                    <span class="px-2.5 py-1 rounded-lg bg-theme-pill border border-theme-default">Unidades: {{ $totalEpisodes }}</span>
                                @endif
                            </div>
                        </div>
                    @endif
                </div>

                <!-- ABA 2: GRADE DE EPISÓDIOS -->
                @if(count($episodes) > 0)
                <div id="entity-tab-panel-episodes" class="flex-1 min-h-0 {{ $defaultTab === 'episodes' ? 'flex' : 'hidden' }} flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Índice de Episódios Catalogados</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ count($episodes) }} unidades</span>
                    </div>
                    <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-2 pr-1">
                        @foreach($episodes as $ep)
                            @php
                                $isActiveEp = $isEpisodeMode && ($currentEpisode->id ?? '') === $ep->id;
                            @endphp
                            <div class="p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer group {{ $isActiveEp ? 'border-theme-accent bg-theme-accent/15' : 'border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-highlight' }}"
                                 onclick="window.pushNavigation('episode', '{{ $ep->id }}', 'Episódio {{ $ep->number }}')">
                                <div class="flex items-center gap-3 min-w-0">
                                    <span class="w-7 h-7 rounded-xl {{ $isActiveEp ? 'bg-theme-accent text-theme-inverse' : 'bg-theme-pill text-theme-accent' }} flex items-center justify-center text-xs font-mono font-bold shrink-0">
                                        {{ $ep->number }}
                                    </span>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold {{ $isActiveEp ? 'text-theme-accent' : 'text-theme-primary group-hover:text-theme-accent' }} transition-colors truncate">
                                            Episódio {{ $ep->number }}
                                        </h4>
                                        <p class="text-[10px] font-mono text-theme-muted">{{ $ep->air_date_utc ?? 'Catalogado' }}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                    @if($isActiveEp)
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-theme-accent/20 text-theme-accent border border-theme-accent/30">
                                            SELECIONADO
                                        </span>
                                    @else
                                        <span class="text-[10px] font-mono text-theme-muted group-hover:text-theme-accent">Ficha & Add-ons ❯</span>
                                    @endif
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 3: SLOT MODULAR DE EXTENSÕES (ARQUITETURA ABERTA DE ADD-ONS + ANIRIUM+ PLAYER PRO) -->
                @if(!$isManga)
                <div id="entity-tab-panel-player" class="flex-1 min-h-0 {{ $defaultTab === 'player' ? 'flex' : 'hidden' }} flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-y-auto no-scrollbar gap-3">
                    <!-- Cabeçalho de Arquitetura Modular -->
                    <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-theme-default">
                        <div class="flex items-center gap-2">
                            <span class="w-2.5 h-2.5 rounded-full bg-theme-accent animate-pulse"></span>
                            <h3 class="text-xs font-mono font-bold uppercase tracking-wider text-theme-primary">
                                Slot Modular de Extensões • {{ $title }} (Ep. <span id="addon-stage-ep-label">{{ $epNum }}</span>)
                            </h3>
                        </div>
                        <div class="flex items-center gap-2">
                            <span id="addon-service-badge" class="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border bg-theme-pill text-theme-muted border-theme-default">
                                Verificando Extensões...
                            </span>
                            <button type="button"
                                    onclick="window.openProfileModal(); window.switchProfileTab('addons');"
                                    class="px-2.5 py-1 rounded-lg bg-theme-pill hover:bg-white/10 border border-theme-default text-[10px] font-mono font-bold text-theme-accent cursor-pointer transition-all">
                                ⚙️ Gerenciar Add-ons
                            </button>
                        </div>
                    </div>

                    <!-- Área Dinâmica do Player / Provedor Modular -->
                    <div id="addon-player-stage-viewport" class="flex-1 min-h-[220px] rounded-2xl bg-black/75 border border-theme-default relative overflow-hidden flex flex-col items-center justify-center p-4">
                        <video id="anirium-modular-video" class="hidden w-full h-full max-h-[340px] object-contain bg-black rounded-xl" controls playsinline></video>

                        <div id="addon-stage-placeholder" class="max-w-lg text-center space-y-3">
                            <div class="w-12 h-12 rounded-2xl bg-theme-accent/15 border border-theme-accent/30 flex items-center justify-center text-xl mx-auto text-theme-accent">
                                🧩
                            </div>
                            <h4 class="text-sm font-bold text-white font-serif">Catálogo Ontológico & Arquitetura Aberta de Add-ons</h4>
                            <p class="text-[11px] font-mono text-theme-muted leading-relaxed">
                                O Anirium é um catálogo ontológico e não hospeda nem transmite mídia nativamente. A reprodução funciona de forma modular através de <strong>Add-ons da Comunidade</strong> (abertos para qualquer usuário) ou do add-on oficial <strong>Anirium Player Pro + Anirium+ Service</strong> (exclusivo para assinantes Anirium+).
                            </p>
                            <div id="addon-stage-actions" class="flex flex-wrap items-center justify-center gap-2 pt-1">
                                <button type="button"
                                        onclick="window.probeAndRunAddons()"
                                        class="px-4 py-2 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer">
                                    ⚡ Conectar Add-ons Ativos
                                </button>
                                <label class="px-3.5 py-2 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-xs font-mono font-bold text-theme-primary cursor-pointer transition-all">
                                    📂 Abrir Arquivo Local (.mp4/.mkv)
                                    <input type="file" accept="video/*,.mkv" class="hidden" onchange="window.loadLocalVideoFileInStage(this)">
                                </label>
                                <button type="button"
                                        onclick="window.promptDirectStreamUrl()"
                                        class="px-3.5 py-2 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-xs font-mono font-bold text-theme-muted hover:text-white cursor-pointer transition-all">
                                    🔗 Link Direto HTTP
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Lista de Streams Resolvidos pelos Add-ons (Comunidade / Anirium+ Service / Canais Oficiais) -->
                    <div id="addon-resolved-streams-bar" class="grid grid-cols-1 md:grid-cols-3 gap-2.5 shrink-0">
                        <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default flex items-center justify-between">
                            <div>
                                <span class="text-[9px] font-mono uppercase text-theme-accent font-bold block">Add-on Oficial Anirium+</span>
                                <strong class="text-xs text-theme-primary">Anirium Player Pro (4004)</strong>
                            </div>
                            <button type="button"
                                    onclick="window.connectAniriumPlusService()"
                                    class="px-2.5 py-1 rounded-lg bg-theme-accent/20 border border-theme-accent/40 text-theme-accent text-[10px] font-mono font-bold hover:bg-theme-accent hover:text-theme-inverse transition-all cursor-pointer">
                                Conectar
                            </button>
                        </div>

                        <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default flex items-center justify-between">
                            <div>
                                <span class="text-[9px] font-mono uppercase text-emerald-400 font-bold block">Arquitetura Aberta</span>
                                <strong class="text-xs text-theme-primary" id="community-addons-count-label">Add-ons da Comunidade</strong>
                            </div>
                            <button type="button"
                                    onclick="window.queryCommunityAddonStreams()"
                                    class="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold hover:bg-emerald-500 hover:text-black transition-all cursor-pointer">
                                Buscar Fontes
                            </button>
                        </div>

                        <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default flex items-center justify-between">
                            <div>
                                <span class="text-[9px] font-mono uppercase text-theme-muted font-bold block">Distribuição Oficial</span>
                                <strong class="text-xs text-theme-primary">Crunchyroll / Netflix</strong>
                            </div>
                            <a href="https://www.crunchyroll.com/search?q={{ urlencode($title) }}"
                               target="_blank" rel="noopener noreferrer"
                               class="px-2.5 py-1 rounded-lg bg-theme-pill border border-theme-default text-theme-primary text-[10px] font-mono font-bold hover:border-theme-accent transition-all">
                                Oficial ↗
                            </a>
                        </div>
                    </div>
                </div>
                @endif

                <!-- ABA 4: TRILHAS SONORAS DA OBRA -->
                @if($totalTracks > 0)
                <div id="entity-tab-panel-tracks" class="flex-1 min-h-0 hidden flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Trilhas Sonoras & Temas (OP / ED / OST)</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ $totalTracks }} faixas</span>
                    </div>
                    <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-2 pr-1">
                        @foreach($tracks as $tr)
                            <div class="p-3 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-accent transition-all flex items-center justify-between cursor-pointer group"
                                 onclick="window.pushNavigation('track', '{{ $tr->id }}', '{{ addslashes($tr->title) }}')">
                                <div class="flex items-center gap-3 min-w-0">
                                    <span class="px-2 py-1 rounded-lg bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-mono font-bold uppercase shrink-0">
                                        {{ strtoupper($tr->track_type ?? 'OST') }}
                                    </span>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $tr->title }}</h4>
                                        <p class="text-[10px] font-mono text-theme-muted truncate">{{ $tr->composer_name ?? 'Trilha Oficial Catalogada' }}</p>
                                    </div>
                                </div>
                                <span class="text-xs text-theme-muted group-hover:text-theme-accent shrink-0">🎵 ❯</span>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 5: DISCUSSÃO COMUNITÁRIA -->
                <div id="entity-tab-panel-discussion" class="flex-1 min-h-0 hidden flex-col overflow-hidden">
                    <x-shell.entity-discussion
                        :targetType="$isEpisodeMode ? 'episode' : 'work'"
                        :targetId="$isEpisodeMode ? ($currentEpisode->id ?? '') : ($work->id ?? '')" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: DOCKS ONTOLÓGICOS (UNIVERSO, CRIADORES, ESTÚDIOS, TRILHAS) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: UNIVERSO CANÔNICO & MÉTRICAS DA OBRA -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                @if($universe)
                    <div class="p-3 rounded-2xl bg-theme-raised/80 border border-[var(--color-state-universe,#6366F1)]/40 hover:border-[var(--color-state-universe,#6366F1)] cursor-pointer transition-all group"
                         onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-mono uppercase tracking-wider text-[var(--color-state-universe,#6366F1)] font-bold">🌌 Universo Canônico</span>
                            <span class="text-xs text-theme-muted group-hover:text-white">❯</span>
                        </div>
                        <h4 class="text-xs font-bold text-white group-hover:text-theme-accent transition-colors truncate mt-1">
                            {{ $universe->name }}
                        </h4>
                    </div>
                @endif

                <div class="grid grid-cols-3 gap-2">
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-theme-accent">{{ $format }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Formato</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-white">{{ $totalEpisodes ?: '?' }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">{{ $isManga ? 'Capítulos' : 'Episódios' }}</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-[var(--color-state-canon,#10B981)]">{{ $totalArcs }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Arcos</span>
                    </div>
                </div>
            </div>

            <!-- DOCK 2: AUTORES & DIREÇÃO -->
            @if(count($creators) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">✍️</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Autores & Direção</h3>
                        </div>
                        <span class="text-[9px] font-mono text-theme-muted">{{ count($creators) }}</span>
                    </div>

                    <div class="space-y-2">
                        @foreach(collect($creators)->take(4) as $cr)
                            @php
                                $roleLabel = match($cr->role ?? '') {
                                    'author' => 'Autor Original',
                                    'director' => 'Diretor',
                                    'writer' => 'Roteiro / Composição',
                                    'composer' => 'Compositor Musical',
                                    default => strtoupper($cr->role ?? 'Staff'),
                                };
                            @endphp
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('creator', '{{ $cr->id }}', '{{ addslashes($cr->name) }}')">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full overflow-hidden bg-black shrink-0 border border-theme-default">
                                        <img src="{{ $cr->image_url ?? '/assets/icons/actions/search.png' }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[155px]">{{ $cr->name }}</h4>
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

            <!-- DOCK 3: ESTÚDIOS DE PRODUÇÃO -->
            @if(count($studios) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">🏢</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Estúdios</h3>
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
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[160px]">{{ $st->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted">Produção & Animação</p>
                                    </div>
                                </div>
                                <span class="text-xs text-theme-muted">❯</span>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

            <!-- DOCK 4: TRILHAS SONORAS EM DESTAQUE -->
            @if(count($tracks) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">🎵</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Temas (OP/ED)</h3>
                        </div>
                        <span class="text-[9px] font-mono text-theme-muted">{{ count($tracks) }}</span>
                    </div>

                    <div class="space-y-1.5">
                        @foreach(collect($tracks)->take(3) as $tr)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                                 onclick="window.pushNavigation('track', '{{ $tr->id }}', '{{ addslashes($tr->title) }}')">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase bg-pink-500/20 text-pink-300 border border-pink-500/30 shrink-0">
                                        {{ strtoupper($tr->track_type ?? 'OST') }}
                                    </span>
                                    <span class="text-[11px] font-bold text-theme-primary truncate max-w-[155px]">{{ $tr->title }}</span>
                                </div>
                                <span class="text-xs text-theme-muted shrink-0">❯</span>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

        </aside>

    </div>
</div>
@if($defaultTab === 'player')
<script>
    if (typeof window.mountAddonStage === 'function') {
        setTimeout(() => window.mountAddonStage(), 50);
    }
</script>
@endif
