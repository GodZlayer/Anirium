@php
    $totalWorks = count($works);
    $totalArcs = count($arcs);
    $totalEps = $totalEpisodes ?? 0;
    $leadImage = $universe->image_url ?? ($works[0]->image_url ?? '/assets/icons/actions/search.png');
    $desc = $universe->description ?? "Linha do tempo e ontologia oficial de {$universe->name}, conectando produções, arcos narrativos e genealogia de continuidade.";
    $name = $universe->name ?? 'Universo Canônico';
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary">
    <!-- BARRA SUPERIOR: NAVEGAÇÃO ONTOLÓGICA -->
    <header class="h-14 w-full flex items-center justify-between px-6 lg:px-8 border-b border-theme-default bg-theme-header shrink-0 z-20">
        <div class="flex items-center gap-4 min-w-0">
            <button type="button"
                    onclick="window.popNavigation()"
                    class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-accent hover:text-white text-xs font-bold font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                <span data-i18n="nav.back">Voltar</span>
            </button>

            <!-- Trilha Dinâmica Viva -->
            <nav id="dynamic-breadcrumb" class="flex items-center gap-2 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar py-1">
                <span class="hover:text-theme-primary cursor-pointer transition-colors" onclick="window.switchTab('home')">Lobby</span>
                <span class="opacity-40">❯</span>
                <span class="text-theme-accent font-bold truncate max-w-[200px]">{{ $name }}</span>
            </nav>
        </div>

        <div class="flex items-center gap-3">
            <span class="px-3 py-1 rounded-full bg-[var(--color-state-universe,#6366F1)]/20 text-[var(--color-state-universe,#6366F1)] border border-[var(--color-state-universe,#6366F1)]/30 text-[11px] font-bold tracking-wider uppercase font-mono"
                  data-i18n="entity.universe_badge">
                🌌 UNIVERSO ONTOLÓGICO
            </span>
        </div>
    </header>

    <!-- HUB DE UNIVERSO: VIEWPORT 100VH FIXO SEM SCROLL VERTICAL CEGO -->
    <div class="flex-1 overflow-hidden flex flex-col lg:flex-row gap-5 p-4 lg:p-6 min-h-0">
        
        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO FIXO + ABAS INTERCAMBIÁVEIS -->
        <main class="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">
            
            <!-- 1. HERO PANORÂMICO DO UNIVERSO -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[180px] max-h-[220px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <!-- Imagem Panorâmica de Fundo com Fade -->
                <div class="absolute inset-0 z-0">
                    <img src="{{ $leadImage }}" class="w-full h-full object-cover object-center filter brightness-[0.35] blur-[1px] group-hover:scale-105 transition-transform duration-1000">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/60 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <!-- Conteúdo do Hero -->
                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-xl space-y-2">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider bg-[var(--color-state-universe,#6366F1)]/30 text-[var(--color-state-universe,#6366F1)] border border-[var(--color-state-universe,#6366F1)]/40 shadow-sm" data-i18n="entity.universe_label">
                            UNIVERSO
                        </span>
                        
                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md line-clamp-1">
                            {{ $name }}
                        </h1>
                        
                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-lg">
                            {{ $desc }}
                        </p>

                        <!-- Ações Rápidas -->
                        <div class="flex items-center gap-3 pt-1">
                            <button type="button"
                                    onclick="window.switchUniverseTab('works')"
                                    class="px-3.5 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5 cursor-pointer">
                                <span>▶</span> <span data-i18n="universe.explore_action">Explorar Obras</span>
                            </button>

                            <button type="button"
                                    onclick="window.toggleUserBookmark?.('{{ $universe->id }}', 'universe')"
                                    id="universe-btn-fav"
                                    class="px-3 py-1.5 rounded-xl bg-theme-pill border border-theme-default text-xs font-mono font-bold {{ !empty($isBookmarked) ? 'text-theme-accent border-theme-accent' : 'text-theme-muted hover:text-white' }} transition-all cursor-pointer flex items-center gap-1.5">
                                <span>📌</span> <span data-i18n="action.bookmark">Favoritar</span>
                            </button>
                        </div>
                    </div>

                    <!-- Poster Representativo da Franquia com Tilt 3D -->
                    <div class="hidden md:block flex-none w-28 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-theme-default shadow-2xl bg-black transform hover:-rotate-1 transition-transform">
                        <img src="{{ $leadImage }}" class="w-full h-full object-cover">
                    </div>
                </div>
            </section>

            <!-- 2. NAVEGAÇÃO EM ABAS DO UNIVERSO -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchUniverseTab('works')"
                        id="tab-btn-works"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0">
                    <span>🎬</span> <span data-i18n="universe.tab_works">Obras</span> ({{ $totalWorks }})
                </button>

                <button type="button"
                        onclick="window.switchUniverseTab('genealogy')"
                        id="tab-btn-genealogy"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>🧬</span> <span data-i18n="universe.tab_genealogy">Genealogia & Cronologia</span>
                </button>

                <button type="button"
                        onclick="window.switchUniverseTab('arcs')"
                        id="tab-btn-arcs"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>📜</span> <span data-i18n="universe.tab_arcs">Sagas & Arcos</span> ({{ $totalArcs }})
                </button>

                <button type="button"
                        onclick="window.switchUniverseTab('discussion')"
                        id="tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span> <span data-i18n="universe.tab_discussion">Discussão</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS (100% RESPONSIVO, SEM SCROLL VERTICAL NA PÁGINA) -->
            <div class="flex-1 overflow-hidden min-h-0 flex flex-col justify-center">
                
                <!-- ABA 1: OBRAS DO UNIVERSO (GRID HORIZONTAL FLUIDO PAGINADO) -->
                <div id="universe-tab-works" class="universe-tab-pane flex flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Catálogo de animações e produções canônicas</span>
                        <span class="text-xs font-mono text-theme-accent font-bold">{{ $totalWorks }} <span data-i18n="entity.productions_suffix">produções</span></span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @forelse($works as $w)
                            <div class="flex-none w-44 h-[210px] rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-highlight hover:scale-[1.03] transition-all shadow-lg group flex flex-col justify-between"
                                 onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                                <div class="relative w-full h-32 overflow-hidden bg-black shrink-0">
                                    <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all">
                                    <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-black/80 text-theme-accent border border-white/10 uppercase">
                                        {{ $w->format ?? 'TV' }}
                                    </span>
                                </div>
                                <div class="p-3 flex-1 flex flex-col justify-between min-w-0">
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors line-clamp-2 leading-tight">
                                        {{ $w->title }}
                                    </h3>
                                    <p class="text-[10px] font-mono text-theme-muted mt-1">
                                        {{ $w->status ?? 'Lançado' }} • {{ $w->episode_count ?? '?' }} eps
                                    </p>
                                </div>
                            </div>
                        @empty
                            <div class="w-full py-12 text-center text-xs font-mono text-theme-muted" data-i18n="entity.no_works_in_universe">
                                Nenhuma obra cadastrada para este universo.
                            </div>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 2: GENEALOGIA DE OBRAS (LINHA DO TEMPO SEQUENCIAL) -->
                <div id="universe-tab-genealogy" class="universe-tab-pane hidden flex flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Continuidade cronológica oficial e conexões canônicas</span>
                        <span class="text-xs font-mono text-theme-accent font-bold">{{ count($genealogy) }} conexões</span>
                    </div>

                    <div class="flex-1 p-5 rounded-3xl bg-theme-raised/60 border border-theme-default flex items-center gap-4 overflow-x-auto no-scrollbar">
                        @forelse($genealogy as $index => $item)
                            <div class="flex items-center gap-4 shrink-0">
                                <div class="flex items-center gap-3 p-3 pr-4 rounded-2xl bg-theme-card border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-105 shadow-md"
                                     onclick="window.pushNavigation('work', '{{ $item->id }}', '{{ addslashes($item->title) }}')">
                                    <div class="w-12 h-12 rounded-xl overflow-hidden bg-black shrink-0 border border-theme-default">
                                        <img src="{{ $item->image_url ?? $leadImage }}" class="w-full h-full object-cover">
                                    </div>
                                    <div>
                                        <div class="flex items-center gap-2">
                                            <h4 class="text-xs font-bold text-theme-primary truncate max-w-[140px]">{{ $item->title }}</h4>
                                            @if(!empty($item->relation_type))
                                                <span class="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase bg-theme-accent/20 text-theme-accent border border-theme-accent/30">
                                                    {{ $item->relation_type === 'side_story' ? 'Side-Story' : ($item->relation_type === 'sequel' ? 'Sequência' : ($item->relation_type === 'prequel' ? 'Prequel' : $item->relation_type)) }}
                                                </span>
                                            @endif
                                        </div>
                                        <p class="text-[10px] font-mono text-theme-muted mt-0.5">
                                            {{ $item->format ?? 'TV' }} {{ $item->episode_count ? '• ' . $item->episode_count . ' eps' : '' }}
                                        </p>
                                    </div>
                                </div>

                                @if(!$loop->last)
                                    <span class="text-theme-accent text-base font-mono font-bold opacity-60">➔</span>
                                @endif
                            </div>
                        @empty
                            <div class="w-full py-12 text-center text-xs font-mono text-theme-muted">
                                Nenhuma relação genealógica registrada ainda.
                            </div>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 3: SAGAS & ARCOS NARRATIVOS (CARDS COM COBERTURA EXATA DE EPISÓDIOS) -->
                <div id="universe-tab-arcs" class="universe-tab-pane hidden flex flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Faixas narrativas canônicas com de/até de temporadas e episódios</span>
                        <span class="text-xs font-mono text-theme-accent font-bold">{{ $totalArcs }} <span data-i18n="entity.arcs_cataloged_suffix">arcos</span></span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @forelse($arcs as $arc)
                            <div class="flex-none w-64 h-[210px] p-4 rounded-2xl border border-theme-default bg-theme-raised/80 hover:bg-theme-raised hover:border-theme-accent transition-all cursor-pointer shadow-md group flex flex-col justify-between"
                                 onclick="window.pushNavigation('arc', '{{ $arc->id }}', '{{ addslashes($arc->title) }}')">
                                <div>
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase {{ ($arc->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border border-[var(--color-state-filler,#F43F5E)]/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' }}">
                                            {{ strtoupper($arc->classification ?? 'CANON') }}
                                        </span>
                                        <span class="text-xs text-theme-muted group-hover:text-theme-accent">❯</span>
                                    </div>
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors line-clamp-2 leading-snug">
                                        {{ $arc->title }}
                                    </h3>
                                </div>
                                <div class="mt-2 pt-2 border-t border-theme-default/40">
                                    <p class="text-[10px] font-mono text-theme-accent truncate" title="{{ $arc->span_description ?? ($arc->work_title ?? $name) }}">
                                        {{ $arc->span_description ?? ($arc->work_title ?? $name) }}
                                    </p>
                                </div>
                            </div>
                        @empty
                            <div class="w-full py-12 text-center text-xs font-mono text-theme-muted" data-i18n="entity.no_arcs">
                                Nenhum arco narrativo vinculado a este universo.
                            </div>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 4: DISCUSSÃO COMUNITÁRIA (DELTA SYNC) -->
                <div id="universe-tab-discussion" class="universe-tab-pane hidden flex-col h-full overflow-y-auto no-scrollbar">
                    <x-shell.entity-discussion
                        targetType="universe"
                        :targetId="$universe->id ?? ''" />
                </div>
            </div>

        </main>

        <!-- COLUNA LATERAL FIXA (SIDEBAR ONTOLÓGICA ORGANIZADA EM DOCKS LIMPOS) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3.5 shrink-0 overflow-y-auto no-scrollbar">
            
            <!-- DOCK 1: SOBRE O UNIVERSO & MÉTRICAS CONSOLIDADAS -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">ℹ️</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold" data-i18n="universe.about_title">
                            Sobre o Universo
                        </h3>
                    </div>
                </div>

                <!-- Métricas Consolidadas -->
                <div class="grid grid-cols-3 gap-2">
                    <div class="text-center p-2 rounded-xl bg-theme-raised border border-theme-default/40">
                        <span class="block text-sm font-black font-mono text-theme-accent">{{ $totalWorks }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase" data-i18n="universe.metric_works">Obras</span>
                    </div>
                    <div class="text-center p-2 rounded-xl bg-theme-raised border border-theme-default/40">
                        <span class="block text-sm font-black font-mono text-[var(--color-state-canon,#10B981)]">{{ $totalArcs }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase" data-i18n="universe.metric_arcs">Arcos</span>
                    </div>
                    <div class="text-center p-2 rounded-xl bg-theme-raised border border-theme-default/40">
                        <span class="block text-sm font-black font-mono text-white">{{ $totalEps }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase" data-i18n="universe.metric_eps">Episódios</span>
                    </div>
                </div>

                <!-- Formatos Reais Presentes no Catálogo -->
                @if(isset($formats) && count($formats) > 0)
                    <div class="pt-2 border-t border-theme-default/40">
                        <span class="text-[10px] font-mono uppercase font-bold text-theme-muted block mb-1.5">Formatos no Catálogo</span>
                        <div class="flex flex-wrap gap-1.5">
                            @foreach($formats as $fmt)
                                <span class="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-theme-raised border border-theme-default/60 text-theme-primary">
                                    {{ $fmt->format }} ({{ $fmt->total }})
                                </span>
                            @endforeach
                        </div>
                    </div>
                @endif
            </div>

            <!-- DOCK 2: PRINCIPAIS CRIADORES (AUTOR, DIRETOR, DESIGNER) -->
            @if(count($creators) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">👤</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold" data-i18n="universe.creators_title">
                                Principais Criadores
                            </h3>
                        </div>
                    </div>

                    <div class="space-y-2">
                        @foreach(collect($creators)->take(3) as $cr)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('creator', '{{ $cr->id }}', '{{ addslashes($cr->name) }}')">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full overflow-hidden bg-black shrink-0 border border-theme-default">
                                        <img src="{{ $cr->image_url ?? '/assets/icons/actions/search.png' }}" class="w-full h-full object-cover">
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate">{{ $cr->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted uppercase">{{ $cr->role ?? 'Criador' }}</p>
                                    </div>
                                </div>
                                @if(!empty($cr->total_works))
                                    <span class="text-[9px] font-mono text-theme-accent px-1.5 py-0.5 rounded bg-theme-accent/10 border border-theme-accent/20 shrink-0">
                                        {{ $cr->total_works }} obs
                                    </span>
                                @endif
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

            <!-- DOCK 3: ESTÚDIOS DE ANIMAÇÃO -->
            @if(count($studios) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">🏢</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold" data-i18n="universe.studios_title">
                                Estúdios de Animação
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
                                        <h4 class="text-xs font-bold text-theme-primary truncate">{{ $st->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted" data-i18n="universe.studio_production">Produção</p>
                                    </div>
                                </div>
                                @if(!empty($st->total_works))
                                    <span class="text-[9px] font-mono text-theme-accent px-1.5 py-0.5 rounded bg-theme-accent/10 border border-theme-accent/20 shrink-0">
                                        {{ $st->total_works }} obs
                                    </span>
                                @endif
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

            <!-- DOCK 4: TRILHAS EM DESTAQUE -->
            @if(count($tracks) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2 shadow-xl">
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">🎵</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold" data-i18n="universe.tracks_title">
                            Trilhas em Destaque
                        </h3>
                    </div>

                    <div class="space-y-1.5">
                        @foreach(collect($tracks)->take(3) as $tr)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all group"
                                 onclick="window.pushNavigation('track', '{{ $tr->id }}', '{{ addslashes($tr->title) }}')">
                                <div class="min-w-0 flex items-center gap-2">
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
    const tabs = ['works', 'genealogy', 'arcs', 'discussion'];
    
    // Atualiza botões
    tabs.forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        const pane = document.getElementById('universe-tab-' + t);
        
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
                if (t === 'discussion') {
                    pane.classList.add('flex');
                    window.refreshEntityComments?.();
                } else {
                    pane.classList.add('flex');
                }
            } else {
                pane.classList.add('hidden');
                pane.classList.remove('flex');
            }
        }
    });
};
</script>
