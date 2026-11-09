@props([
    'track',
    'works' => [],
    'composer' => null,
    'universe' => null,
    'studios' => [],
    'otherTracks' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
])

@php
    $rawTitle = $track->title ?? 'Faixa Musical';
    $songTitle = $track->song_title ?? $rawTitle;
    $artistName = $track->artist_name ?? ($composer->name ?? 'Intérprete / Compositor Oficial');
    $episodesUsed = $track->episodes_used ?? null;
    $trackType = strtoupper($track->track_type ?? 'OST');
    $leadImage = $works[0]->image_url ?? '/assets/icons/actions/search.png';
    $primaryWork = $works[0] ?? null;
    $searchQuery = urlencode($songTitle . ' ' . ($artistName !== 'Intérprete / Compositor Oficial' ? $artistName : '') . ' ' . ($primaryWork->title ?? 'anime ost'));
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary">
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

        <div class="flex items-center gap-2 shrink-0">
            <span class="px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-bold tracking-wider uppercase font-mono">
                🎵 TRILHA SONORA • {{ $trackType }}
            </span>
        </div>
    </header>

    <!-- HUB DA FAIXA MUSICAL: VIEWPORT 100VH FIXO SEM SCROLL CEGO -->
    <div class="flex-1 overflow-hidden flex flex-col lg:flex-row gap-5 p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO + ABAS INTERCAMBIÁVEIS -->
        <main class="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">

            <!-- 1. HERO PANORÂMICO DA FAIXA MUSICAL -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[185px] max-h-[220px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $leadImage }}" class="w-full h-full object-cover object-center filter brightness-[0.3] blur-[2px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/65 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-2xl space-y-2 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider bg-pink-500/25 text-pink-300 border border-pink-500/40 shadow-sm">
                                {{ $trackType === 'OP' ? 'TEMA DE ABERTURA (OPENING)' : ($trackType === 'ED' ? 'TEMA DE ENCERRAMENTO (ENDING)' : 'TRILHA SONORA (OST)') }}
                            </span>
                            @if($episodesUsed)
                                <span class="px-2 py-0.5 rounded text-[9px] font-mono text-theme-accent bg-black/60 border border-white/10">
                                    {{ $episodesUsed }}
                                </span>
                            @endif
                        </div>

                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md line-clamp-1">
                            {{ $songTitle }}
                        </h1>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-1 font-mono">
                            🎤 {{ $artistName }} • Registro Canônico: {{ $rawTitle }}
                        </p>

                        <div class="flex items-center gap-2.5 pt-1 flex-wrap">
                            <a href="https://www.youtube.com/results?search_query={{ $searchQuery }}"
                               target="_blank" rel="noopener noreferrer"
                               class="px-3.5 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5">
                                <span>▶</span> <span>Ouvir no YouTube / Music ↗</span>
                            </a>

                            <a href="https://open.spotify.com/search/{{ $searchQuery }}"
                               target="_blank" rel="noopener noreferrer"
                               class="px-3 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-xs font-mono font-bold text-emerald-400 transition-all flex items-center gap-1.5">
                                <span>🎧</span> <span>Spotify ↗</span>
                            </a>

                            @if($primaryWork)
                                <button type="button"
                                        onclick="window.pushNavigation('work', '{{ $primaryWork->id }}', '{{ addslashes($primaryWork->title) }}')"
                                        class="px-3 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-xs font-mono font-bold text-theme-primary transition-all cursor-pointer flex items-center gap-1.5">
                                    <span>🎬</span> <span class="truncate max-w-[160px]">{{ $primaryWork->title }}</span>
                                </button>
                            @endif
                        </div>
                    </div>

                    <!-- Disco de Vinil Animado -->
                    <div class="hidden md:flex flex-none w-24 h-24 rounded-full border-4 border-pink-500/40 overflow-hidden shadow-2xl bg-black items-center justify-center relative shrink-0">
                        <img src="{{ $leadImage }}" class="w-full h-full object-cover opacity-80" onerror="this.src='/assets/icons/actions/search.png'">
                        <div class="w-6 h-6 rounded-full bg-theme-base border-2 border-pink-400 absolute"></div>
                    </div>
                </div>
            </section>

            <!-- BARRA DE AÇÕES PESSOAIS -->
            <div class="shrink-0">
                <x-shell.entity-actions
                    targetType="track"
                    :targetId="$track->id ?? ''"
                    :targetTitle="$songTitle"
                    :isBookmarked="$isBookmarked ?? false"
                    :isLiked="$isLiked ?? false"
                    :userScore="$userScore ?? null"
                    :userStatus="$userStatus ?? null" />
            </div>

            <!-- 2. NAVEGAÇÃO EM ABAS -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchEntityTab('structure')"
                        id="tab-btn-structure"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0">
                    <span>🎬</span> <span>Obras Onde Toca ({{ count($works) }})</span>
                </button>

                @if(count($otherTracks) > 0)
                    <button type="button"
                            onclick="window.switchEntityTab('tracks')"
                            id="tab-btn-tracks"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>🎵</span> <span>Outras Faixas da Obra ({{ count($otherTracks) }})</span>
                    </button>
                @endif

                <button type="button"
                        onclick="window.switchEntityTab('discussion')"
                        id="tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span> <span data-i18n="discussion.tab_label">Discussão</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS -->
            <div class="flex-1 overflow-hidden min-h-0 flex flex-col">

                <!-- ABA 1: OBRAS QUE UTILIZAM ESTA FAIXA -->
                <div id="entity-tab-panel-structure" class="flex-1 min-h-0 flex flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Obras Associadas a Esta Trilha</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ count($works) }} produções</span>
                    </div>

                    <div class="flex-1 overflow-y-auto no-scrollbar space-y-2.5 pr-1">
                        @forelse($works as $w)
                            <div class="p-3.5 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-highlight transition-all flex items-center justify-between cursor-pointer group"
                                 onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                                <div class="flex items-center gap-3.5 min-w-0">
                                    <div class="w-12 h-16 rounded-xl overflow-hidden bg-black shrink-0 border border-theme-default">
                                        <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                                    </div>
                                    <div class="truncate">
                                        <span class="inline-block px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase bg-pink-500/20 text-pink-300 border border-pink-500/30 mb-1">
                                            {{ $trackType }} {{ $episodesUsed ? '• ' . $episodesUsed : '' }}
                                        </span>
                                        <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $w->title }}</h4>
                                        <p class="text-[10px] font-mono text-theme-muted">{{ $w->format ?? 'TV' }} • {{ $w->episode_count ?? '?' }} episódios</p>
                                    </div>
                                </div>
                                <span class="text-xs text-theme-muted group-hover:text-theme-accent shrink-0">Ver Obra ❯</span>
                            </div>
                        @empty
                            <p class="text-xs font-mono text-theme-muted">Nenhuma obra vinculada.</p>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 2: OUTRAS FAIXAS DA MESMA OBRA -->
                @if(count($otherTracks) > 0)
                <div id="entity-tab-panel-tracks" class="flex-1 min-h-0 hidden flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Outras Aberturas & Encerramentos de {{ $primaryWork->title ?? 'Obra' }}</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ count($otherTracks) }} faixas</span>
                    </div>
                    <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-2 pr-1">
                        @foreach($otherTracks as $ot)
                            <div class="p-3 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-accent transition-all flex items-center justify-between cursor-pointer group"
                                 onclick="window.pushNavigation('track', '{{ $ot->id }}', '{{ addslashes($ot->title) }}')">
                                <div class="flex items-center gap-3 min-w-0">
                                    <span class="px-2 py-1 rounded-lg bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-mono font-bold uppercase shrink-0">
                                        {{ strtoupper($ot->track_type ?? 'OST') }}
                                    </span>
                                    <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $ot->title }}</h4>
                                </div>
                                <span class="text-xs text-theme-muted group-hover:text-theme-accent shrink-0">🎵 ❯</span>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 3: DISCUSSÃO COMUNITÁRIA -->
                <div id="entity-tab-panel-discussion" class="flex-1 min-h-0 hidden flex-col overflow-hidden">
                    <x-shell.entity-discussion
                        targetType="track"
                        :targetId="$track->id ?? ''" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: DOCKS ONTOLÓGICOS (FICHA MUSICAL, COMPOSITOR, UNIVERSO, ESTÚDIO) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: FICHA DA FAIXA -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default/50 space-y-1">
                    <span class="text-[9px] font-mono uppercase tracking-wider text-pink-300 font-bold block">Intérprete / Artista</span>
                    <strong class="text-xs font-bold text-white block">{{ $artistName }}</strong>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-pink-300">{{ $trackType }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Classificação</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-white">{{ count($otherTracks) + 1 }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Temas na Obra</span>
                    </div>
                </div>
            </div>

            <!-- DOCK 2: COMPOSITOR / UNIVERSO / ESTÚDIO -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Conexões Ontológicas</h3>

                @if($composer)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                         onclick="window.pushNavigation('creator', '{{ $composer->id }}', '{{ addslashes($composer->name) }}')">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-8 h-8 rounded-full bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-xs shrink-0">🎼</div>
                            <div class="min-w-0">
                                <span class="text-[9px] font-mono uppercase text-pink-300 font-bold block">Compositor</span>
                                <h4 class="text-xs font-bold text-theme-primary truncate max-w-[155px]">{{ $composer->name }}</h4>
                            </div>
                        </div>
                        <span class="text-xs text-theme-muted">❯</span>
                    </div>
                @endif

                @if($universe)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-[var(--color-state-universe,#6366F1)] cursor-pointer transition-all"
                         onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-8 h-8 rounded-xl bg-[var(--color-state-universe,#6366F1)]/20 border border-[var(--color-state-universe,#6366F1)]/40 flex items-center justify-center text-xs shrink-0">🌌</div>
                            <div class="min-w-0">
                                <span class="text-[9px] font-mono uppercase text-[var(--color-state-universe,#6366F1)] font-bold block">Universo Canônico</span>
                                <h4 class="text-xs font-bold text-theme-primary truncate max-w-[155px]">{{ $universe->name }}</h4>
                            </div>
                        </div>
                        <span class="text-xs text-theme-muted">❯</span>
                    </div>
                @endif

                @foreach($studios as $st)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                         onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-8 h-8 rounded-xl bg-white/10 border border-theme-default flex items-center justify-center text-xs shrink-0">🏢</div>
                            <div class="min-w-0">
                                <span class="text-[9px] font-mono uppercase text-theme-muted font-bold block">Estúdio da Obra</span>
                                <h4 class="text-xs font-bold text-theme-primary truncate max-w-[155px]">{{ $st->name }}</h4>
                            </div>
                        </div>
                        <span class="text-xs text-theme-muted">❯</span>
                    </div>
                @endforeach
            </div>

        </aside>

    </div>
</div>
