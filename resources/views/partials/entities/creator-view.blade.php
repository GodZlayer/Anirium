@props([
    'creator',
    'universe' => null,
    'universes' => [],
    'studios' => [],
    'tracks' => [],
    'formats' => [],
    'totalEpisodes' => 0,
    'works' => [],
    'roles' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
])

@php
    $name = $creator->name ?? 'Criador Canônico';
    $nativeName = $creator->native_name ?? null;
    $leadImage = $creator->image_url ?? ($works[0]->image_url ?? '/assets/icons/actions/search.png');
    $worksCollection = collect($works)->unique('id')->values();
    $animeWorks = $worksCollection->filter(fn($w) => strtolower($w->media ?? 'anime') !== 'manga')->values();
    $mangaWorks = $worksCollection->filter(fn($w) => strtolower($w->media ?? 'anime') === 'manga')->values();
    $totalWorks = $worksCollection->count();

    $formatFormula = isset($formats) && count($formats) > 0
        ? collect($formats)->map(fn($f) => "{$f->total} " . strtolower(str_replace('_', ' ', $f->format ?? 'tv')))->join(' + ')
        : "{$totalWorks} obras";

    $roleLabels = collect($roles)->map(function ($r) {
        return match (strtolower((string) $r)) {
            'author' => 'Autor do Original',
            'director' => 'Diretor',
            'writer' => 'Roteirista',
            'composer' => 'Compositor Musical',
            default => ucfirst((string) $r),
        };
    })->unique()->values()->all();

    $primaryRoleLabel = count($roleLabels) > 0 ? implode(' • ', $roleLabels) : 'Autor & Diretor';
    $defaultTab = $animeWorks->count() > 0 ? 'animes' : ($mangaWorks->count() > 0 ? 'mangas' : (count($tracks) > 0 ? 'tracks' : 'animes'));
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
                <span class="text-theme-accent font-bold truncate max-w-[140px] sm:max-w-[220px]">{{ $name }}</span>
            </nav>
        </div>

        <div class="hidden sm:flex items-center gap-3 shrink-0">
            <span class="px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[11px] font-bold tracking-wider uppercase font-mono">
                ✍️ {{ strtoupper($primaryRoleLabel) }}
            </span>
        </div>
    </header>

    <!-- HUB DO AUTOR / DIRETOR: VIEWPORT 100VH FIXO NO DESKTOP & FLUIDO NO MOBILE -->
    <div class="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 lg:gap-5 p-3 sm:p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO FIXO + ABAS INTERCAMBIÁVEIS -->
        <main class="shrink-0 lg:flex-1 min-w-0 flex flex-col gap-3 lg:gap-4 lg:overflow-hidden">

            <!-- 1. HERO PANORÂMICO DO CRIADOR (IDÊNTICO AO UNIVERSO: min-h-[175px] max-h-[210px]) -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[175px] max-h-[210px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $leadImage }}" class="w-full h-full object-cover object-center filter brightness-[0.35] blur-[1px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/60 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-xl space-y-2 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider bg-orange-500/30 text-orange-300 border border-orange-500/40 shadow-sm">
                                {{ strtoupper($primaryRoleLabel) }}
                            </span>
                            @if($nativeName)
                                <span class="px-2 py-0.5 rounded-lg text-[10px] font-mono text-theme-muted bg-black/60 border border-white/10">
                                    {{ $nativeName }}
                                </span>
                            @endif
                        </div>

                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md line-clamp-1">
                            {{ $name }}
                        </h1>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-lg">
                            Acervo autoral e filmografia de {{ $name }} na malha ontológica ({{ $totalWorks }} produções e {{ count($universes) }} universos conectados).
                        </p>

                        <div class="flex items-center gap-3 pt-1">
                            <button type="button"
                                    onclick="window.switchCreatorTab('{{ $defaultTab }}')"
                                    class="px-3.5 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5 cursor-pointer">
                                <span>▶</span> <span>Explorar Obras ({{ $totalWorks }})</span>
                            </button>

                            <button type="button"
                                    onclick="window.toggleUserBookmark?.('{{ $creator->id ?? '' }}', 'creator')"
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

            <!-- 2. NAVEGAÇÃO EM ABAS DO CRIADOR -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                @if($animeWorks->count() > 0 || $mangaWorks->count() === 0)
                    <button type="button"
                            onclick="window.switchCreatorTab('animes')"
                            id="creator-tab-btn-animes"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all {{ $defaultTab === 'animes' ? 'bg-theme-accent text-theme-inverse shadow-sm' : 'text-theme-muted hover:text-theme-primary' }} cursor-pointer shrink-0">
                        <span>🎬</span> <span>Obras Animadas ({{ $animeWorks->count() }})</span>
                    </button>
                @endif

                @if($mangaWorks->count() > 0)
                    <button type="button"
                            onclick="window.switchCreatorTab('mangas')"
                            id="creator-tab-btn-mangas"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all {{ $defaultTab === 'mangas' ? 'bg-theme-accent text-theme-inverse shadow-sm' : 'text-theme-muted hover:text-theme-primary' }} cursor-pointer shrink-0">
                        <span>📖</span> <span>Mangás & Originais ({{ $mangaWorks->count() }})</span>
                    </button>
                @endif

                @if(count($tracks) > 0)
                    <button type="button"
                            onclick="window.switchCreatorTab('tracks')"
                            id="creator-tab-btn-tracks"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all {{ $defaultTab === 'tracks' ? 'bg-theme-accent text-theme-inverse shadow-sm' : 'text-theme-muted hover:text-theme-primary' }} cursor-pointer shrink-0">
                        <span>🎵</span> <span>Composições Musicais ({{ count($tracks) }})</span>
                    </button>
                @endif

                <button type="button"
                        onclick="window.switchCreatorTab('discussion')"
                        id="creator-tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span> <span data-i18n="discussion.tab_label">Discussão</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS (TRILHOS HORIZONTAIS FLUIDOS) -->
            <div class="min-h-[245px] lg:min-h-0 lg:flex-1 overflow-hidden flex flex-col justify-center">

                <!-- ABA 1: OBRAS ANIMADAS (TRILHO HORIZONTAL w-44 h-[210px] IDÊNTICO AO UNIVERSO) -->
                <div id="creator-tab-pane-animes" class="creator-tab-pane {{ $defaultTab === 'animes' ? 'flex' : 'hidden' }} flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Produções animadas com autoria, direção ou roteiro de {{ $name }}</span>
                        <span class="text-xs font-mono text-theme-accent font-bold">{{ $animeWorks->count() }} produções</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @forelse($animeWorks as $w)
                            @php
                                $wRole = match($w->role ?? '') {
                                    'author' => 'Autor Original',
                                    'director' => 'Diretor',
                                    'writer' => 'Roteiro',
                                    'composer' => 'Compositor',
                                    default => strtoupper($w->role ?? 'Staff'),
                                };
                            @endphp
                            <div class="flex-none w-44 h-[210px] rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-highlight hover:scale-[1.03] transition-all shadow-lg group flex flex-col justify-between"
                                 onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                                <div class="relative w-full h-32 overflow-hidden bg-black shrink-0">
                                    <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all" loading="lazy" onerror="this.src='/assets/icons/actions/search.png'">
                                    <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-black/80 text-theme-accent border border-white/10 uppercase">
                                        {{ $w->format ?? 'TV' }}
                                    </span>
                                    <span class="absolute bottom-1.5 right-1.5 text-[8px] font-bold font-mono px-1.5 py-0.5 rounded bg-orange-500/85 text-black uppercase">
                                        {{ $wRole }}
                                    </span>
                                </div>
                                <div class="p-3 flex-1 flex flex-col justify-between min-w-0">
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors line-clamp-2 leading-tight">
                                        {{ $w->title }}
                                    </h3>
                                    <p class="text-[10px] font-mono text-theme-muted mt-1">
                                        {{ $w->status ?? 'Lançado' }} • {{ ($w->episode_count ?? null) ? $w->episode_count . ' eps' : 'Catalogado' }}
                                    </p>
                                </div>
                            </div>
                        @empty
                            <div class="w-full py-12 text-center text-xs font-mono text-theme-muted">
                                Nenhuma animação direta registrada.
                            </div>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 2: MANGÁS & ORIGINAIS (TRILHO HORIZONTAL w-44 h-[210px]) -->
                @if($mangaWorks->count() > 0)
                <div id="creator-tab-pane-mangas" class="creator-tab-pane {{ $defaultTab === 'mangas' ? 'flex' : 'hidden' }} flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Publicações originais impressas (Mangás / Light Novels) de {{ $name }}</span>
                        <span class="text-xs font-mono text-amber-400 font-bold">{{ $mangaWorks->count() }} publicações</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @foreach($mangaWorks as $w)
                            <div class="flex-none w-44 h-[210px] rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-amber-400 hover:scale-[1.03] transition-all shadow-lg group flex flex-col justify-between"
                                 onclick="window.pushNavigation('manga', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                                <div class="relative w-full h-32 overflow-hidden bg-black shrink-0">
                                    <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all" loading="lazy" onerror="this.src='/assets/icons/actions/search.png'">
                                    <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-black/80 text-amber-400 border border-white/10 uppercase">
                                        {{ $w->format ?? 'MANGA' }}
                                    </span>
                                </div>
                                <div class="p-3 flex-1 flex flex-col justify-between min-w-0">
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-amber-400 transition-colors line-clamp-2 leading-tight">
                                        {{ $w->title }}
                                    </h3>
                                    <p class="text-[10px] font-mono text-theme-muted mt-1">
                                        {{ ($w->episode_count ?? null) ? $w->episode_count . ' caps' : ($w->status ?? 'Original') }}
                                    </p>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 3: COMPOSIÇÕES MUSICAIS -->
                @if(count($tracks) > 0)
                <div id="creator-tab-pane-tracks" class="creator-tab-pane {{ $defaultTab === 'tracks' ? 'flex' : 'hidden' }} flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Trilhas sonoras e temas compostos por {{ $name }}</span>
                        <span class="text-xs font-mono text-pink-400 font-bold">{{ count($tracks) }} faixas</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @foreach($tracks as $tr)
                            @php
                                $rawTr = $tr->title ?? 'Faixa Musical';
                                $cleanSong = preg_match('/"([^"]+)"/', $rawTr, $m) ? $m[1] : $rawTr;
                                $searchQ = urlencode($cleanSong . ' ' . ($tr->work_title ?? $name));
                            @endphp
                            <div class="flex-none w-72 h-[210px] p-4 rounded-2xl border border-theme-default bg-theme-raised/80 hover:bg-theme-raised hover:border-pink-400/50 transition-all cursor-pointer shadow-md group flex flex-col justify-between"
                                 onclick="window.pushNavigation('track', '{{ $tr->id }}', '{{ addslashes($cleanSong) }}')">
                                <div>
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-pink-500/20 text-pink-300 border border-pink-500/30">
                                            🎵 {{ strtoupper($tr->track_type ?? 'OST') }}
                                        </span>
                                        <span class="text-xs text-theme-muted group-hover:text-pink-300">❯</span>
                                    </div>
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-pink-300 transition-colors line-clamp-2 leading-snug">
                                        {{ $rawTr }}
                                    </h3>
                                    <p class="text-[10px] font-mono text-theme-muted truncate mt-1">{{ $tr->work_title ?? 'Obra Associada' }}</p>
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
                <div id="creator-tab-pane-discussion" class="creator-tab-pane hidden flex-col h-full overflow-y-auto no-scrollbar">
                    <x-shell.entity-discussion
                        targetType="creator"
                        :targetId="$creator->id ?? ''" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: SIDEBAR ONTOLÓGICA (3 DOCKS) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: MÉTRICAS DE CARREIRA COM FÓRMULA POR FORMATO -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default/50 space-y-1.5">
                    <div class="flex items-baseline justify-between">
                        <span class="text-[10px] font-mono uppercase tracking-wider text-theme-muted font-bold">Obras do Criador</span>
                        <span class="text-base font-black font-mono text-theme-accent">{{ $totalWorks }}</span>
                    </div>
                    <p class="text-[10px] font-mono text-theme-muted leading-relaxed border-t border-theme-default/30 pt-1">
                        ({{ $formatFormula }})
                    </p>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-white">{{ $animeWorks->count() }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Animações</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-amber-400">{{ $mangaWorks->count() ?: $totalEpisodes }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">{{ $mangaWorks->count() > 0 ? 'Mangás / Novels' : 'Episódios' }}</span>
                    </div>
                </div>
            </div>

            <!-- DOCK 2: UNIVERSOS CONECTADOS -->
            @if(count($universes) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">🌌</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Universos Conectados</h3>
                        </div>
                    </div>
                    <div class="space-y-2">
                        @foreach(collect($universes)->take(4) as $u)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-[var(--color-state-universe,#6366F1)] cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('universe', '{{ $u->id }}', '{{ addslashes($u->name) }}')">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full bg-[var(--color-state-universe,#6366F1)]/20 border border-[var(--color-state-universe,#6366F1)]/40 flex items-center justify-center text-xs shrink-0">
                                        🌌
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[135px]">{{ $u->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted">Franquia Canônica</p>
                                    </div>
                                </div>
                                <span class="text-[9px] font-mono text-theme-accent px-1.5 py-0.5 rounded bg-theme-accent/10 border border-theme-accent/20 shrink-0">
                                    {{ $u->total_works ?? 1 }} obs
                                </span>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

            <!-- DOCK 3: ESTÚDIOS PARCEIROS -->
            @if(count($studios) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">🏢</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Estúdios Parceiros</h3>
                    </div>
                    <div class="space-y-2">
                        @foreach(collect($studios)->take(3) as $st)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full bg-white/10 shrink-0 border border-theme-default flex items-center justify-center font-bold font-mono text-xs text-theme-accent">
                                        🏢
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[140px]">{{ $st->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted">Produção & Animação</p>
                                    </div>
                                </div>
                                <span class="text-[9px] font-mono text-theme-accent px-1.5 py-0.5 rounded bg-theme-accent/10 border border-theme-accent/20 shrink-0">
                                    {{ $st->total_works ?? 1 }} obs
                                </span>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

        </aside>

    </div>
</div>

<script>
window.switchCreatorTab = function(tabName) {
    const tabs = ['animes', 'mangas', 'tracks', 'discussion'];
    tabs.forEach(t => {
        const btn = document.getElementById('creator-tab-btn-' + t);
        const pane = document.getElementById('creator-tab-pane-' + t);
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
