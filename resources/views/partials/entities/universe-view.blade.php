@props([
    'universe',
    'works' => [],
    'mangas' => [],
    'arcs' => [],
    'creators' => [],
    'studios' => [],
    'tracks' => [],
    'totalEpisodes' => 0,
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
])

@php
    $name = $universe->name ?? 'Universo Canônico';
    $desc = $universe->description ?? 'Universo de ' . $name . ' — linha do tempo e árvore genealógica de todas as obras, conectando animes, filmes, OVAs, especiais, mangás e arcos narrativos.';
    $totalWorks = count($works);
    $totalMangas = count($mangas);
    $totalArcs = count($arcs);
    $totalEps = $totalEpisodes > 0 ? $totalEpisodes : ($universe->total_episodes ?? 0);
    $leadImage = $universe->image_url ?? ($works[0]->image_url ?? '/assets/icons/actions/search.png');
    
    // Identificar autor principal
    $mainCreator = null;
    foreach ($creators as $c) {
        if (in_array($c->role ?? '', ['author', 'original_creator'])) {
            $mainCreator = $c;
            break;
        }
    }
    if (!$mainCreator && count($creators) > 0) {
        $mainCreator = $creators[0];
    }

    // Identificar estúdio principal
    $mainStudio = count($studios) > 0 ? $studios[0] : null;

    // Trilha sonora principal
    $mainTrack = count($tracks) > 0 ? $tracks[0] : null;
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary">
    <!-- BARRA SUPERIOR: NAVEGAÇÃO ONTOLÓGICA -->
    <header class="h-16 w-full flex items-center justify-between px-6 lg:px-8 border-b border-theme-default bg-theme-header shrink-0 z-20">
        <div class="flex items-center gap-4 min-w-0">
            <button type="button"
                    onclick="window.popNavigation()"
                    class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-accent hover:text-white text-xs font-bold font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                <span id="btn-context-back-label" data-i18n="nav.back">Voltar</span>
            </button>

            <nav id="entity-dynamic-breadcrumb" class="flex items-center gap-2 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar">
                <button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent transition-colors shrink-0" data-i18n="nav.home">Lobby</button>
            </nav>
        </div>

        <div class="flex items-center gap-3 shrink-0">
            <span class="px-3 py-1 rounded-full bg-[var(--color-state-universe,#6366F1)]/20 text-[var(--color-state-universe,#6366F1)] border border-[var(--color-state-universe,#6366F1)]/30 text-[11px] font-bold tracking-wider uppercase font-mono"
                  data-i18n="entity.universe_badge">
                🌌 UNIVERSO ONTOLÓGICO
            </span>
        </div>
    </header>

    <!-- HUB DE UNIVERSO: CONTAINER ROLÁVEL COM BARRA LATERAL FIXA -->
    <div class="flex-1 overflow-y-auto no-scrollbar flex flex-col lg:flex-row gap-6 p-6 lg:p-8">
        
        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO, ABAS, CARROSSÉIS E GENEALOGIA -->
        <main class="flex-1 min-w-0 flex flex-col gap-6">
            
            <!-- 1. HERO PANORÂMICO DO UNIVERSO -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-2xl min-h-[260px] flex flex-col justify-end p-6 md:p-8 group">
                <!-- Imagem Panorâmica de Fundo com Fade -->
                <div class="absolute inset-0 z-0">
                    <img src="{{ $leadImage }}" class="w-full h-full object-cover object-center filter brightness-[0.35] blur-[1px] group-hover:scale-105 transition-transform duration-1000">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/60 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <!-- Conteúdo do Hero -->
                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
                    <div class="max-w-2xl space-y-3">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--color-state-universe,#6366F1)]/30 text-[var(--color-state-universe,#6366F1)] border border-[var(--color-state-universe,#6366F1)]/40 shadow-sm" data-i18n="entity.universe_label">
                            UNIVERSO
                        </span>
                        
                        <h1 class="text-3xl md:text-5xl font-black font-serif tracking-tight text-white drop-shadow-md">
                            {{ $name }}
                        </h1>
                        
                        <p class="text-xs md:text-sm text-theme-muted line-clamp-3 leading-relaxed max-w-xl">
                            {{ $desc }}
                        </p>

                        <!-- Ações Rápidas do Universo -->
                        <div class="flex items-center gap-3 pt-2">
                            <button type="button"
                                    onclick="document.getElementById('section-universe-works')?.scrollIntoView({ behavior: 'smooth' })"
                                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-theme-accent text-theme-inverse hover:brightness-110 font-bold text-xs uppercase tracking-wider font-mono shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer">
                                <span>▶</span>
                                <span data-i18n="universe.explore_btn">Explorar o Universo</span>
                            </button>

                            <button type="button"
                                    onclick="window.toggleUserBookmark?.('{{ $universe->id }}', 'universe')"
                                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-primary font-bold text-xs font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-md">
                                <span class="{{ $isBookmarked ? 'text-theme-accent' : '' }}">🔖</span>
                                <span data-i18n="actions.bookmark">Favoritar</span>
                            </button>
                        </div>
                    </div>

                    <!-- Poster Representativo da Franquia -->
                    <div class="hidden md:block flex-none w-36 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-theme-default shadow-2xl bg-black transform hover:-rotate-1 transition-transform">
                        <img src="{{ $leadImage }}" class="w-full h-full object-cover">
                    </div>
                </div>
            </section>

            <!-- 2. NAVEGAÇÃO EM ABAS DO UNIVERSO -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchUniverseTab('overview')"
                        id="tab-btn-overview"
                        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0">
                    <span>🏠</span> <span data-i18n="universe.tab_overview">Visão Geral</span>
                </button>
                
                <button type="button"
                        onclick="window.switchUniverseTab('works')"
                        id="tab-btn-works"
                        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>🎬</span> <span data-i18n="universe.tab_works">Obras</span> ({{ $totalWorks }})
                </button>

                <button type="button"
                        onclick="window.switchUniverseTab('genealogy')"
                        id="tab-btn-genealogy"
                        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>🧬</span> <span data-i18n="universe.tab_genealogy">Genealogia</span>
                </button>

                <button type="button"
                        onclick="window.switchUniverseTab('arcs')"
                        id="tab-btn-arcs"
                        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>📜</span> <span data-i18n="universe.tab_arcs">Sagas & Arcos</span> ({{ $totalArcs }})
                </button>

                <button type="button"
                        onclick="window.switchUniverseTab('discussion')"
                        id="tab-btn-discussion"
                        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span> <span data-i18n="universe.tab_discussion">Discussão da Franquia</span>
                </button>
            </nav>

            <!-- 3. PAINEL DE VISÃO GERAL & CARROSSÉIS -->
            <div id="universe-panel-overview" class="flex flex-col gap-8">
                
                <!-- A. CARROSSEL DE OBRAS DO UNIVERSO -->
                <section id="section-universe-works" class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-base text-theme-accent">🎬</span>
                            <h2 class="text-sm font-bold uppercase tracking-wider font-mono text-theme-primary" data-i18n="universe.works_title">
                                Obras do Universo
                            </h2>
                        </div>
                        <span class="text-xs font-mono text-theme-muted">{{ $totalWorks }} <span data-i18n="entity.productions_suffix">produções</span></span>
                    </div>

                    <div class="flex items-stretch gap-4 overflow-x-auto no-scrollbar py-2">
                        @forelse($works as $w)
                            <div class="flex-none w-44 rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-highlight hover:scale-[1.03] transition-all shadow-lg group flex flex-col"
                                 onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                                <div class="relative w-full aspect-[16/10] overflow-hidden bg-black">
                                    <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all">
                                    <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-black/80 text-theme-accent border border-white/10 uppercase">
                                        {{ $w->format ?? 'TV' }}
                                    </span>
                                </div>
                                <div class="p-3 flex-1 flex flex-col justify-between">
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors line-clamp-1">
                                        {{ $w->title }}
                                    </h3>
                                    <p class="text-[10px] font-mono text-theme-muted mt-1">
                                        {{ $w->status ?? 'Lançado' }} • {{ $w->episode_count ?? '?' }} eps
                                    </p>
                                </div>
                            </div>
                        @empty
                            <p class="text-xs font-mono text-theme-muted" data-i18n="entity.no_works_in_universe">Nenhuma obra cadastrada.</p>
                        @endforelse
                    </div>
                </section>

                <!-- B. GENEALOGIA DE OBRAS (LINHA DO TEMPO SEQUENCIAL) -->
                <section class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-base text-theme-accent">🧬</span>
                            <h2 class="text-sm font-bold uppercase tracking-wider font-mono text-theme-primary" data-i18n="universe.genealogy_title">
                                Genealogia & Continuidade de Obras
                            </h2>
                        </div>
                    </div>

                    <div class="p-5 rounded-3xl bg-theme-raised/60 border border-theme-default flex items-center gap-3 overflow-x-auto no-scrollbar">
                        @foreach($works->take(4) as $index => $gw)
                            <div class="flex items-center gap-3 shrink-0">
                                <div class="flex items-center gap-3 p-2.5 pr-4 rounded-2xl bg-theme-card border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-105"
                                     onclick="window.pushNavigation('work', '{{ $gw->id }}', '{{ addslashes($gw->title) }}')">
                                    <div class="w-10 h-10 rounded-xl overflow-hidden bg-black shrink-0">
                                        <img src="{{ $gw->image_url ?? $leadImage }}" class="w-full h-full object-cover">
                                    </div>
                                    <div>
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[140px]">{{ $gw->title }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted">{{ $gw->format ?? 'TV' }} • {{ $gw->episode_count ?? '?' }} eps</p>
                                    </div>
                                </div>

                                @if(!$loop->last)
                                    <span class="text-theme-muted text-sm font-mono opacity-50">➔</span>
                                @endif
                            </div>
                        @endforeach
                    </div>
                </section>

                <!-- C. CARROSSEL DE SAGAS & ARCOS NARRATIVOS -->
                <section class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-base text-theme-accent">📜</span>
                            <h2 class="text-sm font-bold uppercase tracking-wider font-mono text-theme-primary" data-i18n="universe.arcs_title">
                                Sagas & Arcos do Universo
                            </h2>
                        </div>
                        <span class="text-xs font-mono text-theme-muted">{{ $totalArcs }} <span data-i18n="entity.arcs_cataloged_suffix">arcos catalogados</span></span>
                    </div>

                    <div class="flex items-stretch gap-4 overflow-x-auto no-scrollbar py-2">
                        @forelse($arcs as $arc)
                            <div class="flex-none w-64 p-4 rounded-2xl border border-theme-default bg-theme-raised/80 hover:bg-theme-raised hover:border-theme-accent transition-all cursor-pointer shadow-md group flex flex-col justify-between"
                                 onclick="window.pushNavigation('arc', '{{ $arc->id }}', '{{ addslashes($arc->title) }}')">
                                <div>
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase {{ ($arc->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border border-[var(--color-state-filler,#F43F5E)]/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' }}">
                                            {{ strtoupper($arc->classification ?? 'CANON') }}
                                        </span>
                                        <span class="text-xs text-theme-muted group-hover:text-theme-accent">❯</span>
                                    </div>
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors line-clamp-2">
                                        {{ $arc->title }}
                                    </h3>
                                </div>
                                <p class="text-[10px] font-mono text-theme-muted mt-3">
                                    {{ $arc->work_title ?? $name }}
                                </p>
                            </div>
                        @empty
                            <p class="text-xs font-mono text-theme-muted" data-i18n="entity.no_arcs">Nenhum arco vinculado.</p>
                        @endforelse
                    </div>
                </section>
            </div>

            <!-- 4. PAINEL DE DISCUSSÃO COMUNITÁRIA (DELTA SYNC) -->
            <div id="universe-panel-discussion" class="hidden flex-col">
                <x-shell.entity-discussion
                    targetType="universe"
                    :targetId="$universe->id ?? ''" />
            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: SIDEBAR ONTOLÓGICA (SOBRE, CRIADORES, ESTÚDIOS, TRILHAS) -->
        <aside class="w-full lg:w-80 flex flex-col gap-5 shrink-0">
            
            <!-- CARD 1: SOBRE O UNIVERSO (MÉTRICAS & DETALHES) -->
            <div class="p-5 rounded-3xl bg-theme-card border border-theme-default space-y-4 shadow-xl">
                <div class="flex items-center gap-2">
                    <span class="text-theme-accent">ℹ️</span>
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold" data-i18n="universe.about_title">
                        Sobre o Universo
                    </h3>
                </div>

                <p class="text-xs text-theme-muted leading-relaxed">
                    {{ $desc }}
                </p>

                <!-- Métricas Consolidadas -->
                <div class="grid grid-cols-3 gap-2 pt-2 border-t border-theme-default">
                    <div class="text-center p-2 rounded-xl bg-theme-raised">
                        <span class="block text-sm font-black font-mono text-theme-accent">{{ $totalWorks }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase" data-i18n="universe.metric_works">Obras</span>
                    </div>
                    <div class="text-center p-2 rounded-xl bg-theme-raised">
                        <span class="block text-sm font-black font-mono text-[var(--color-state-canon,#10B981)]">{{ $totalArcs }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase" data-i18n="universe.metric_arcs">Arcos</span>
                    </div>
                    <div class="text-center p-2 rounded-xl bg-theme-raised">
                        <span class="block text-sm font-black font-mono text-white">{{ $totalEps }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase" data-i18n="universe.metric_eps">Episódios</span>
                    </div>
                </div>

                <!-- Atributos Ontológicos -->
                <div class="space-y-2 pt-2 border-t border-theme-default text-xs font-mono">
                    <div class="flex justify-between items-center">
                        <span class="text-theme-muted" data-i18n="universe.origin_label">Origem:</span>
                        <span class="text-theme-primary font-bold">Mangá</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-theme-muted" data-i18n="universe.genres_label">Gêneros:</span>
                        <span class="text-theme-primary font-bold">Ação, Sobrenatural, Shounen</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-theme-muted" data-i18n="universe.themes_label">Temas:</span>
                        <span class="text-theme-primary font-bold">Espiritualidade, Batalha</span>
                    </div>
                </div>
            </div>

            <!-- CARD 2: PRINCIPAIS CRIADORES (AUTOR, DIRETOR) -->
            @if(count($creators) > 0)
                <div class="p-5 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">👤</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold" data-i18n="universe.creators_title">
                                Principais Criadores
                            </h3>
                        </div>
                    </div>

                    <div class="space-y-2.5">
                        @foreach(collect($creators)->take(3) as $cr)
                            <div class="flex items-center gap-3 p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                                 onclick="window.pushNavigation('creator', '{{ $cr->id }}', '{{ addslashes($cr->name) }}')">
                                <div class="w-9 h-9 rounded-full overflow-hidden bg-black shrink-0 border border-theme-default">
                                    <img src="{{ $cr->image_url ?? '/assets/icons/actions/search.png' }}" class="w-full h-full object-cover">
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-theme-primary truncate">{{ $cr->name }}</h4>
                                    <p class="text-[9px] font-mono text-theme-muted uppercase">{{ $cr->role ?? 'Criador' }}</p>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

            <!-- CARD 3: ESTÚDIOS DE PRODUÇÃO -->
            @if(count($studios) > 0)
                <div class="p-5 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">🏢</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold" data-i18n="universe.studios_title">
                                Estúdios de Animação
                            </h3>
                        </div>
                    </div>

                    <div class="space-y-2">
                        @foreach(collect($studios)->take(2) as $st)
                            <div class="flex items-center gap-3 p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                                 onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')">
                                <div class="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0 border border-theme-default flex items-center justify-center font-bold font-mono text-xs text-theme-accent">
                                    🏢
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-theme-primary truncate">{{ $st->name }}</h4>
                                    <p class="text-[9px] font-mono text-theme-muted" data-i18n="universe.studio_production">Produção & Animação</p>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

            <!-- CARD 4: TRILHAS EM DESTAQUE -->
            @if(count($tracks) > 0)
                <div class="p-5 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">🎵</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold" data-i18n="universe.tracks_title">
                            Trilhas em Destaque
                        </h3>
                    </div>

                    <div class="space-y-2">
                        @foreach(collect($tracks)->take(3) as $tr)
                            <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all group"
                                 onclick="window.pushNavigation('track', '{{ $tr->id }}', '{{ addslashes($tr->title) }}')">
                                <div class="min-w-0 flex items-center gap-2.5">
                                    <span class="text-xs text-theme-muted group-hover:text-theme-accent">▶</span>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate">{{ $tr->title }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted uppercase">{{ $tr->track_type ?? 'OST' }}</p>
                                    </div>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

        </aside>

    </div>
</div>

<script>
window.switchUniverseTab = function(tabName) {
    const overviewPanel = document.getElementById('universe-panel-overview');
    const discussionPanel = document.getElementById('universe-panel-discussion');
    const btnOverview = document.getElementById('tab-btn-overview');
    const btnDiscussion = document.getElementById('tab-btn-discussion');

    if (tabName === 'discussion') {
        if (overviewPanel) overviewPanel.classList.add('hidden');
        if (discussionPanel) {
            discussionPanel.classList.remove('hidden');
            discussionPanel.classList.add('flex');
            window.refreshEntityComments?.();
        }
        if (btnOverview) {
            btnOverview.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0';
        }
        if (btnDiscussion) {
            btnDiscussion.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0';
        }
    } else {
        if (discussionPanel) {
            discussionPanel.classList.add('hidden');
            discussionPanel.classList.remove('flex');
        }
        if (overviewPanel) overviewPanel.classList.remove('hidden');
        if (btnOverview) {
            btnOverview.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0';
        }
        if (btnDiscussion) {
            btnDiscussion.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0';
        }

        if (tabName === 'works') {
            document.getElementById('section-universe-works')?.scrollIntoView({ behavior: 'smooth' });
        }
    }
};
</script>
