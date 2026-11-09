@props([
    'track',
    'composer' => null,
    'works' => [],
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
    $artistName = $track->artist_name ?? ($composer->name ?? null);
    $episodesUsed = $track->episodes_used ?? null;
    $trackType = strtoupper($track->track_type ?? 'OST');
    $primaryWork = $works[0] ?? null;
    $leadImage = $primaryWork->image_url ?? '/assets/icons/actions/search.png';
    $searchQuery = urlencode($songTitle . ($artistName ? ' ' . $artistName : '') . ($primaryWork ? ' ' . $primaryWork->title : ''));
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
                <span class="text-theme-accent font-bold truncate max-w-[140px] sm:max-w-[220px]">{{ $songTitle }}</span>
            </nav>
        </div>

        <div class="hidden sm:flex items-center gap-3 shrink-0">
            <span class="px-3 py-1 rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30 text-[11px] font-bold tracking-wider uppercase font-mono">
                🎵 {{ $trackType === 'OP' ? 'OPENING (ABERTURA)' : ($trackType === 'ED' ? 'ENDING (ENCERRAMENTO)' : $trackType) }}
            </span>
        </div>
    </header>

    <!-- HUB DA TRILHA SONORA: VIEWPORT 100VH FIXO NO DESKTOP & FLUIDO NO MOBILE -->
    <div class="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 lg:gap-5 p-3 sm:p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO FIXO + ABAS INTERCAMBIÁVEIS -->
        <main class="shrink-0 lg:flex-1 min-w-0 flex flex-col gap-3 lg:gap-4 lg:overflow-hidden">

            <!-- 1. HERO PANORÂMICO DA MÚSICA (IDÊNTICO AO UNIVERSO: min-h-[175px] max-h-[210px]) -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[175px] max-h-[210px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $leadImage }}" class="w-full h-full object-cover object-center filter brightness-[0.32] blur-[1px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/60 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-xl space-y-2 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider bg-pink-500/30 text-pink-300 border border-pink-500/40 shadow-sm">
                                {{ $trackType }} • TRILHA SONORA OFICIAL
                            </span>
                            @if($episodesUsed)
                                <span class="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-black/70 text-theme-accent border border-white/10">
                                    📺 {{ $episodesUsed }}
                                </span>
                            @endif
                        </div>

                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md line-clamp-1">
                            {{ $songTitle }}
                        </h1>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-lg">
                            @if($artistName)
                                Interpretada por <strong class="text-theme-primary">{{ $artistName }}</strong>
                            @endif
                            @if($primaryWork)
                                • Tema oficial de <strong class="text-theme-accent">{{ $primaryWork->title }}</strong>
                            @endif
                        </p>

                        <!-- Ações Oficiais de Streaming de Áudio (100% Legal / Sempre Visíveis) -->
                        <div class="flex items-center gap-2.5 pt-1 flex-wrap">
                            <a href="https://open.spotify.com/search/{{ $searchQuery }}"
                               target="_blank" rel="noopener noreferrer"
                               class="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-500/40 text-emerald-300 hover:text-black text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5 cursor-pointer">
                                <span>🟢</span> <span>Spotify</span>
                            </a>

                            <a href="https://music.youtube.com/search?q={{ $searchQuery }}"
                               target="_blank" rel="noopener noreferrer"
                               class="px-3.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500 border border-red-500/40 text-red-200 hover:text-white text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5 cursor-pointer">
                                <span>🔴</span> <span>YouTube Music</span>
                            </a>

                            <button type="button"
                                    onclick="window.openOfficialTrailerModal('{{ addslashes($songTitle . ' ' . ($artistName ?? '') . ' ' . ($primaryWork->title ?? '')) }}')"
                                    class="px-3 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-xs font-mono font-bold text-theme-primary transition-all cursor-pointer flex items-center gap-1.5">
                                <span>▶</span> <span>YouTube Oficial</span>
                            </button>

                            <button type="button"
                                    onclick="window.toggleUserBookmark?.('{{ $track->id ?? '' }}', 'track')"
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

            <!-- 2. NAVEGAÇÃO EM ABAS DA MÚSICA -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchTrackTab('works')"
                        id="track-tab-btn-works"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0">
                    <span>🎬</span> <span>Obras Onde Toca ({{ count($works) }})</span>
                </button>

                @if(count($otherTracks) > 0)
                    <button type="button"
                            onclick="window.switchTrackTab('other')"
                            id="track-tab-btn-other"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>🎵</span> <span>Outras Músicas da Obra ({{ count($otherTracks) }})</span>
                    </button>
                @endif

                <button type="button"
                        onclick="window.switchTrackTab('discussion')"
                        id="track-tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span> <span data-i18n="discussion.tab_label">Discussão</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS (TRILHOS HORIZONTAIS FLUIDOS) -->
            <div class="min-h-[245px] lg:min-h-0 lg:flex-1 overflow-hidden flex flex-col justify-center">

                <!-- ABA 1: OBRAS ONDE TOCA (TRILHO HORIZONTAL w-48 h-[210px]) -->
                <div id="track-tab-pane-works" class="track-tab-pane flex flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Produções animadas que utilizam {{ $songTitle }} como tema oficial</span>
                        <span class="text-xs font-mono text-theme-accent font-bold">{{ count($works) }} produções</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @forelse($works as $w)
                            <div class="flex-none w-48 h-[210px] rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-highlight hover:scale-[1.03] transition-all shadow-lg group flex flex-col justify-between"
                                 onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                                <div class="relative w-full h-32 overflow-hidden bg-black shrink-0">
                                    <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all" onerror="this.src='/assets/icons/actions/search.png'">
                                    <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-black/80 text-pink-300 border border-pink-500/30 uppercase">
                                        {{ $trackType }} {{ $episodesUsed ? '• ' . $episodesUsed : '' }}
                                    </span>
                                </div>
                                <div class="p-3 flex-1 flex flex-col justify-between min-w-0">
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors line-clamp-2 leading-tight">
                                        {{ $w->title }}
                                    </h3>
                                    <p class="text-[10px] font-mono text-theme-muted mt-1">
                                        {{ $w->format ?? 'TV' }} • {{ ($w->episode_count ?? null) ? $w->episode_count . ' eps' : 'Catalogado' }}
                                    </p>
                                </div>
                            </div>
                        @empty
                            <div class="w-full py-12 text-center text-xs font-mono text-theme-muted">
                                Nenhuma obra diretamente vinculada.
                            </div>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 2: OUTRAS MÚSICAS DA OBRA (TRILHO HORIZONTAL w-72 h-[210px]) -->
                @if(count($otherTracks) > 0)
                <div id="track-tab-pane-other" class="track-tab-pane hidden flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Demais aberturas e encerramentos de {{ $primaryWork->title ?? 'Obra' }}</span>
                        <span class="text-xs font-mono text-pink-400 font-bold">{{ count($otherTracks) }} faixas</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @foreach($otherTracks as $ot)
                            @php
                                $otRaw = $ot->title ?? 'Faixa';
                                $otClean = preg_match('/"([^"]+)"/', $otRaw, $m) ? $m[1] : $otRaw;
                                $otQuery = urlencode($otClean . ' ' . ($primaryWork->title ?? ''));
                            @endphp
                            <div class="flex-none w-72 h-[210px] p-4 rounded-2xl border border-theme-default bg-theme-raised/80 hover:bg-theme-raised hover:border-pink-400/50 transition-all cursor-pointer shadow-md group flex flex-col justify-between"
                                 onclick="window.pushNavigation('track', '{{ $ot->id }}', '{{ addslashes($otClean) }}')">
                                <div>
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-pink-500/20 text-pink-300 border border-pink-500/30">
                                            🎵 {{ strtoupper($ot->track_type ?? 'OST') }}
                                        </span>
                                        <span class="text-xs text-theme-muted group-hover:text-pink-300">❯</span>
                                    </div>
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-pink-300 transition-colors line-clamp-2 leading-snug">
                                        {{ $otRaw }}
                                    </h3>
                                </div>
                                <div class="pt-2 border-t border-theme-default/40 flex items-center justify-between gap-2">
                                    <a href="https://open.spotify.com/search/{{ $otQuery }}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[9px] font-mono font-bold text-center">
                                        🟢 Spotify
                                    </a>
                                    <a href="https://music.youtube.com/search?q={{ $otQuery }}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                                       class="flex-1 py-1.5 px-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[9px] font-mono font-bold text-center">
                                        🔴 YT Music
                                    </a>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 3: DISCUSSÃO COMUNITÁRIA -->
                <div id="track-tab-pane-discussion" class="track-tab-pane hidden flex-col h-full overflow-y-auto no-scrollbar">
                    <x-shell.entity-discussion
                        targetType="track"
                        :targetId="$track->id ?? ''" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: SIDEBAR ONTOLÓGICA (3 DOCKS) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: FICHA MUSICAL & REGISTRO -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default/50 space-y-1">
                    <span class="text-[9px] font-mono uppercase text-theme-muted block">Registro Original no Catálogo</span>
                    <p class="text-[11px] font-mono text-white leading-relaxed">{{ $rawTitle }}</p>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-pink-400">{{ $trackType }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Função</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-xs font-black font-mono text-white truncate px-1">{{ $episodesUsed ?: 'Geral' }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Cobertura</span>
                    </div>
                </div>
            </div>

            <!-- DOCK 2: ARTISTA & COMPOSITOR -->
            @if($composer || $artistName)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">🎤</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Artista & Composição</h3>
                    </div>

                    @if($composer)
                        <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-[1.02]"
                             onclick="window.pushNavigation('creator', '{{ $composer->id }}', '{{ addslashes($composer->name) }}')">
                            <div class="min-w-0">
                                <h4 class="text-xs font-bold text-theme-primary truncate">{{ $composer->name }}</h4>
                                <p class="text-[9px] font-mono text-theme-accent">Compositor Creditado</p>
                            </div>
                            <span class="text-xs text-theme-muted">❯</span>
                        </div>
                    @elseif($artistName)
                        <div class="p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default">
                            <h4 class="text-xs font-bold text-theme-primary truncate">{{ $artistName }}</h4>
                            <p class="text-[9px] font-mono text-theme-muted">Artista / Intérprete Original</p>
                        </div>
                    @endif
                </div>
            @endif

            <!-- DOCK 3: HIERARQUIA (UNIVERSO, OBRA & ESTÚDIO) -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                <div class="flex items-center gap-2">
                    <span class="text-theme-accent">🌌</span>
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Hierarquia Ontológica</h3>
                </div>

                @if($universe)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-[var(--color-state-universe,#6366F1)] cursor-pointer transition-all"
                         onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')">
                        <div class="min-w-0">
                            <span class="text-[9px] font-mono uppercase text-[var(--color-state-universe,#6366F1)] font-bold block">Universo</span>
                            <strong class="text-xs text-white truncate block">{{ $universe->name }}</strong>
                        </div>
                        <span class="text-xs text-theme-muted">❯</span>
                    </div>
                @endif

                @if($primaryWork)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                         onclick="window.pushNavigation('work', '{{ $primaryWork->id }}', '{{ addslashes($primaryWork->title) }}')">
                        <div class="min-w-0">
                            <span class="text-[9px] font-mono uppercase text-theme-accent font-bold block">Obra Principal</span>
                            <strong class="text-xs text-white truncate block">{{ $primaryWork->title }}</strong>
                        </div>
                        <span class="text-xs text-theme-muted">❯</span>
                    </div>
                @endif

                @foreach(collect($studios)->take(2) as $st)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                         onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')">
                        <div class="min-w-0">
                            <span class="text-[9px] font-mono uppercase text-teal-400 font-bold block">Estúdio</span>
                            <strong class="text-xs text-white truncate block">{{ $st->name }}</strong>
                        </div>
                        <span class="text-xs text-theme-muted">❯</span>
                    </div>
                @endforeach
            </div>

        </aside>

    </div>
</div>

<script>
window.switchTrackTab = function(tabName) {
    const tabs = ['works', 'other', 'discussion'];
    tabs.forEach(t => {
        const btn = document.getElementById('track-tab-btn-' + t);
        const pane = document.getElementById('track-tab-pane-' + t);
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
</script>
