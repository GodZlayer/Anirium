@props([
    'arc',
    'work' => null,
    'universe' => null,
    'episodes' => [],
    'allWorkArcs' => [],
    'otherArcs' => [],
    'creators' => [],
    'studios' => [],
    'tracks' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
])

@php
    $title = $arc->title ?? 'Arco Narrativo';
    $classification = strtolower($arc->classification ?? 'canon');
    $isFiller = $classification === 'filler';
    $startNum = (int) ($arc->start_number ?? ($episodes[0]->number ?? 1));
    $endNum = $arc->end_number ?? (count($episodes) > 0 ? $episodes[count($episodes) - 1]->number : null);
    $leadImage = $work->image_url ?? '/assets/icons/actions/search.png';
    $workTitle = $work->title ?? 'Obra Associada';
    $workMedia = strtolower($work->media ?? 'anime');
    $isManga = $workMedia === 'manga';
    $totalArcEpisodes = count($episodes) ?: ($endNum ? max(1, (int) $endNum - $startNum + 1) : 0);

    // Filtrar trilhas OP/ED que se sobrepõem à faixa de episódios deste arco
    $arcTracks = collect($tracks)->filter(function ($tr) use ($startNum, $endNum) {
        if (preg_match('/\(eps?\s*(\d+)\s*-\s*(\d+|\?)\)/i', $tr->title ?? '', $m)) {
            $tStart = (int) $m[1];
            $tEnd = $m[2] === '?' ? 99999 : (int) $m[2];
            $aEnd = $endNum ? (int) $endNum : $startNum;
            return $tStart <= $aEnd && $tEnd >= $startNum;
        }
        return true;
    })->values();

    // Linha cronológica completa dos arcos da obra
    $arcTimeline = count($allWorkArcs) > 0 ? $allWorkArcs : $otherArcs;
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary">
    <!-- BARRA SUPERIOR: NAVEGAÇÃO ONTOLÓGICA -->
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
                <span class="text-theme-accent font-bold truncate max-w-[140px] sm:max-w-[220px]">{{ $title }}</span>
            </nav>
        </div>

        <div class="hidden sm:flex items-center gap-3 shrink-0">
            <span class="px-3 py-1 rounded-full border text-[11px] font-bold tracking-wider uppercase font-mono {{ $isFiller ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border-[var(--color-state-filler,#F43F5E)]/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/30' }}">
                📜 ARCO {{ strtoupper($classification) }}
            </span>
        </div>
    </header>

    <!-- HUB DO ARCO: VIEWPORT 100VH FIXO NO DESKTOP & FLUIDO NO MOBILE -->
    <div class="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 lg:gap-5 p-3 sm:p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO FIXO + ABAS INTERCAMBIÁVEIS -->
        <main class="shrink-0 lg:flex-1 min-w-0 flex flex-col gap-3 lg:gap-4 lg:overflow-hidden">

            <!-- 1. HERO PANORÂMICO DO ARCO (IDÊNTICO AO UNIVERSO: min-h-[175px] max-h-[210px]) -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[175px] max-h-[210px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $leadImage }}" class="w-full h-full object-cover object-center filter brightness-[0.35] blur-[1px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/60 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-xl space-y-2 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider {{ $isFiller ? 'bg-[var(--color-state-filler,#F43F5E)]/30 text-[var(--color-state-filler,#F43F5E)] border border-[var(--color-state-filler,#F43F5E)]/40' : 'bg-[var(--color-state-canon,#10B981)]/30 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/40' }} shadow-sm">
                                SAGA • {{ strtoupper($classification) }}
                            </span>
                            <span class="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-black/70 text-theme-accent border border-white/10">
                                {{ $isManga ? 'Cap.' : 'Ep.' }} {{ $startNum }}{{ $endNum ? ' ao ' . $endNum : '+' }}
                            </span>
                        </div>

                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md line-clamp-1">
                            {{ $title }}
                        </h1>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-lg">
                            Arco narrativo de {{ $workTitle }} cobrindo do {{ $isManga ? 'capítulo' : 'episódio' }} {{ $startNum }}{{ $endNum ? ' até o ' . $endNum : ' em diante' }}.
                        </p>

                        <!-- Ações Rápidas (Condicional Addon + Favoritar) -->
                        <div class="flex items-center gap-2.5 pt-1 flex-wrap">
                            @if(!$isManga && $work)
                                <button type="button"
                                        data-requires-addon-capability="video"
                                        onclick="window.launchExternalVideoAddon('{{ $work->id }}', '{{ $episodes[0]->id ?? '' }}', '{{ $startNum }}', '{{ addslashes($workTitle) }}')"
                                        class="hidden px-3.5 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg items-center gap-1.5 cursor-pointer">
                                    <span>▶</span> <span>Iniciar Arco (Ep. {{ $startNum }})</span>
                                </button>
                            @elseif($isManga && $work)
                                <button type="button"
                                        data-requires-addon-capability="manga"
                                        onclick="window.launchExternalMangaAddon('{{ $work->id }}', '{{ $startNum }}', '{{ addslashes($workTitle) }}')"
                                        class="hidden px-3.5 py-1.5 rounded-xl bg-amber-400 text-black text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg items-center gap-1.5 cursor-pointer">
                                    <span>📖</span> <span>Iniciar Leitura (Cap. {{ $startNum }})</span>
                                </button>
                            @endif

                            <button type="button"
                                    onclick="window.switchArcTab('episodes')"
                                    class="px-3.5 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-primary text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5">
                                <span>📺</span> <span>Explorar Episódios ({{ $totalArcEpisodes }})</span>
                            </button>

                            <button type="button"
                                    onclick="window.toggleUserBookmark?.('{{ $arc->id ?? '' }}', 'arc')"
                                    class="px-3 py-1.5 rounded-xl bg-theme-pill border border-theme-default text-xs font-mono font-bold {{ !empty($isBookmarked) ? 'text-theme-accent border-theme-accent' : 'text-theme-muted hover:text-white' }} transition-all cursor-pointer flex items-center gap-1.5">
                                <span>📌</span> <span data-i18n="action.bookmark">Favoritar</span>
                            </button>
                        </div>
                    </div>

                    <div class="hidden md:block flex-none w-28 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-theme-default shadow-2xl bg-black transform hover:-rotate-1 transition-transform">
                        <img src="{{ $leadImage }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                    </div>
                </div>
            </section>

            <!-- 2. NAVEGAÇÃO EM ABAS DO ARCO -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchArcTab('episodes')"
                        id="arc-tab-btn-episodes"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0">
                    <span>📺</span> <span>Episódios do Arco ({{ count($episodes) }})</span>
                </button>

                @if(count($arcTimeline) > 0)
                    <button type="button"
                            onclick="window.switchArcTab('chronology')"
                            id="arc-tab-btn-chronology"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>📜</span> <span>Cronologia de Arcos ({{ count($arcTimeline) }})</span>
                    </button>
                @endif

                @if(count($arcTracks) > 0)
                    <button type="button"
                            onclick="window.switchArcTab('tracks')"
                            id="arc-tab-btn-tracks"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>🎵</span> <span>Abertura & Ending ({{ count($arcTracks) }})</span>
                    </button>
                @endif

                <button type="button"
                        onclick="window.switchArcTab('discussion')"
                        id="arc-tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span> <span data-i18n="discussion.tab_label">Discussão</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS (TRILHOS HORIZONTAIS FLUIDOS) -->
            <div class="min-h-[245px] lg:min-h-0 lg:flex-1 overflow-hidden flex flex-col justify-center">

                <!-- ABA 1: EPISÓDIOS DO ARCO (TRILHO HORIZONTAL DE CARDS h-[210px]) -->
                <div id="arc-tab-pane-episodes" class="arc-tab-pane flex flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Sequência exata de episódios pertencentes a {{ $title }}</span>
                        <span class="text-xs font-mono text-theme-accent font-bold">Ep. {{ $startNum }}{{ $endNum ? ' — ' . $endNum : '+' }}</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @forelse($episodes as $ep)
                            <div class="flex-none w-48 h-[210px] rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-highlight hover:scale-[1.03] transition-all shadow-lg group flex flex-col justify-between"
                                 onclick="window.pushNavigation('episode', '{{ $ep->id }}', '{{ addslashes($workTitle) }} • Ep. {{ $ep->number }}')">
                                <div class="relative w-full h-28 overflow-hidden bg-black shrink-0">
                                    <img src="{{ $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all" loading="lazy" onerror="this.src='/assets/icons/actions/search.png'">
                                    <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-black/80 text-theme-accent border border-white/10 uppercase">
                                        EP. {{ $ep->number }}
                                    </span>
                                </div>
                                <div class="p-3 flex-1 flex flex-col justify-between min-w-0">
                                    <div>
                                        <h3 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">
                                            Episódio {{ $ep->number }}
                                        </h3>
                                        <p class="text-[10px] font-mono text-theme-muted mt-0.5">
                                            {{ $ep->air_date_utc ?? 'Catalogado' }}
                                        </p>
                                    </div>
                                    <div class="flex items-center justify-between pt-1.5 border-t border-theme-default/40">
                                        <span class="text-[9px] font-mono text-theme-muted">Ficha ❯</span>
                                        @if($work)
                                            <button type="button"
                                                    data-requires-addon-capability="video"
                                                    onclick="event.stopPropagation(); window.launchExternalVideoAddon('{{ $work->id }}', '{{ $ep->id }}', '{{ $ep->number }}', '{{ addslashes($workTitle) }}')"
                                                    class="hidden px-2 py-0.5 rounded bg-theme-accent text-theme-inverse text-[9px] font-mono font-bold">
                                                ▶ Play
                                            </button>
                                        @endif
                                    </div>
                                </div>
                            </div>
                        @empty
                            <div class="w-full py-12 text-center text-xs font-mono text-theme-muted">
                                Este arco compreende os episódios {{ $startNum }} a {{ $endNum ?? '?' }} de {{ $workTitle }}.
                            </div>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 2: CRONOLOGIA DE ARCOS (ANTERIOR ➔ ATUAL ➔ PRÓXIMO) -->
                @if(count($arcTimeline) > 0)
                <div id="arc-tab-pane-chronology" class="arc-tab-pane hidden flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Progressão cronológica dos arcos dentro de {{ $workTitle }}</span>
                        <span class="text-xs font-mono text-theme-accent font-bold">{{ count($arcTimeline) }} arcos na obra</span>
                    </div>

                    <div class="flex-1 p-5 rounded-3xl bg-theme-raised/60 border border-theme-default flex items-center gap-4 overflow-x-auto no-scrollbar">
                        @foreach($arcTimeline as $aItem)
                            @php
                                $isSelf = ($aItem->id ?? '') === ($arc->id ?? '');
                            @endphp
                            <div class="flex items-center gap-4 shrink-0">
                                <div class="w-60 p-4 rounded-2xl border transition-all cursor-pointer shadow-md {{ $isSelf ? 'bg-theme-accent/15 border-theme-accent ring-2 ring-theme-accent/30 scale-105' : 'bg-theme-card border-theme-default hover:border-theme-accent hover:scale-105' }}"
                                     onclick="window.pushNavigation('arc', '{{ $aItem->id }}', '{{ addslashes($aItem->title) }}')">
                                    <div class="flex items-center justify-between gap-2 mb-1.5">
                                        <span class="px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase {{ ($aItem->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)]' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)]' }}">
                                            {{ strtoupper($aItem->classification ?? 'CANON') }}
                                        </span>
                                        @if($isSelf)
                                            <span class="text-[8px] font-mono font-bold text-theme-accent uppercase">● ARCO ATUAL</span>
                                        @endif
                                    </div>
                                    <h4 class="text-xs font-bold text-theme-primary truncate">{{ $aItem->title }}</h4>
                                    <p class="text-[10px] font-mono text-theme-muted mt-1">
                                        Ep. {{ $aItem->start_number ?? 1 }} ao {{ $aItem->end_number ?? '?' }}
                                    </p>
                                </div>
                                @if(!$loop->last)
                                    <span class="text-theme-accent text-base font-mono font-bold opacity-60">➔</span>
                                @endif
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 3: ABERTURAS & ENDINGS DO ARCO -->
                @if(count($arcTracks) > 0)
                <div id="arc-tab-pane-tracks" class="arc-tab-pane hidden flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Temas musicais (OP / ED) executados durante este arco</span>
                        <span class="text-xs font-mono text-theme-accent font-bold">{{ count($arcTracks) }} faixas</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @foreach($arcTracks as $tr)
                            @php
                                $rawTr = $tr->title ?? 'Faixa Musical';
                                $cleanSong = preg_match('/"([^"]+)"/', $rawTr, $m) ? $m[1] : $rawTr;
                                $searchQ = urlencode($cleanSong . ' ' . $workTitle);
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
                                <div class="pt-2 border-t border-theme-default/40 flex items-center justify-between gap-2">
                                    <a href="https://open.spotify.com/search/{{ $searchQ }}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[9px] font-mono font-bold text-center">
                                        🟢 Spotify
                                    </a>
                                    <a href="https://music.youtube.com/search?q={{ $searchQ }}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[9px] font-mono font-bold text-center">
                                        🔴 YT Music
                                    </a>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 4: DISCUSSÃO COMUNITÁRIA -->
                <div id="arc-tab-pane-discussion" class="arc-tab-pane hidden flex-col h-full overflow-y-auto no-scrollbar">
                    <x-shell.entity-discussion
                        targetType="arc"
                        :targetId="$arc->id ?? ''" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: SIDEBAR ONTOLÓGICA (3 DOCKS) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: HIERARQUIA & ESCOPO NUMÉRICO -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                @if($universe)
                    <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default/50 hover:border-[var(--color-state-universe,#6366F1)] cursor-pointer transition-all group"
                         onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-mono uppercase tracking-wider text-[var(--color-state-universe,#6366F1)] font-bold">🌌 Universo Canônico</span>
                            <span class="text-xs text-theme-muted group-hover:text-white">❯</span>
                        </div>
                        <p class="text-xs font-bold text-white truncate mt-1">{{ $universe->name }}</p>
                    </div>
                @endif

                @if($work)
                    <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default/50 hover:border-theme-accent cursor-pointer transition-all group"
                         onclick="window.pushNavigation('work', '{{ $work->id }}', '{{ addslashes($work->title) }}')">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-mono uppercase tracking-wider text-theme-accent font-bold">🎬 Obra Pertencente</span>
                            <span class="text-xs text-theme-muted group-hover:text-white">❯</span>
                        </div>
                        <p class="text-xs font-bold text-white truncate mt-1">{{ $work->title }}</p>
                    </div>
                @endif

                <div class="grid grid-cols-3 gap-2">
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-white">{{ $startNum }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Início</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-white">{{ $endNum ?? '?' }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Fim</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-[var(--color-state-canon,#10B981)]">{{ $totalArcEpisodes }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Episódios</span>
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
                    </div>
                    <div class="space-y-2">
                        @foreach(collect($creators)->take(4) as $cr)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('creator', '{{ $cr->id }}', '{{ addslashes($cr->name) }}')">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full overflow-hidden bg-black shrink-0 border border-theme-default">
                                        <img src="{{ $cr->image_url ?? '/assets/icons/actions/search.png' }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[140px]">{{ $cr->name }}</h4>
                                        <p class="text-[9px] font-mono {{ ($cr->role ?? '') === 'author' ? 'text-theme-accent font-bold' : 'text-theme-muted' }}">
                                            {{ ($cr->role ?? '') === 'author' ? 'Autor do Original' : (($cr->role ?? '') === 'director' ? 'Diretor' : 'Criação & Roteiro') }}
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
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">🏢</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Estúdios</h3>
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
window.switchArcTab = function(tabName) {
    const tabs = ['episodes', 'chronology', 'tracks', 'discussion'];
    tabs.forEach(t => {
        const btn = document.getElementById('arc-tab-btn-' + t);
        const pane = document.getElementById('arc-tab-pane-' + t);
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
