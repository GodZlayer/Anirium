@props([
    'arc',
    'work' => null,
    'universe' => null,
    'episodes' => [],
    'otherArcs' => [],
    'creators' => [],
    'studios' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
])

@php
    $arcTitle = $arc->title ?? 'Arco Canônico';
    $isFiller = ($arc->classification ?? '') === 'filler';
    $isMixed = ($arc->classification ?? '') === 'mixed';
    $badgeText = $isFiller ? 'FILLER' : ($isMixed ? 'MISTO' : 'CÂNON');
    $badgeStyle = $isFiller
        ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border-[var(--color-state-filler,#F43F5E)]/40'
        : ($isMixed
            ? 'bg-[var(--color-state-mixed,#A855F7)]/20 text-[var(--color-state-mixed,#A855F7)] border-[var(--color-state-mixed,#A855F7)]/40'
            : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/40');

    $workTitle = $work->title ?? 'Obra Vinculada';
    $workImage = $work->image_url ?? '/assets/icons/actions/search.png';
    $universeName = $universe->name ?? 'Universo Canônico';
    $totalEpisodes = count($episodes);
    $startEp = $arc->start_number ?? ($episodes[0]->number ?? 1);
    $endEp = $arc->end_number ?? ($totalEpisodes > 0 ? ($episodes[$totalEpisodes - 1]->number ?? $totalEpisodes) : $startEp);
    $spanCount = max(1, ($endEp && $startEp && $endEp >= $startEp) ? ($endEp - $startEp + 1) : $totalEpisodes);
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

        <div class="flex items-center gap-2.5 shrink-0">
            <span class="px-3 py-1 rounded-full border text-[10px] font-bold tracking-wider uppercase font-mono {{ $badgeStyle }}">
                📜 SAGA • {{ $badgeText }}
            </span>
        </div>
    </header>

    <!-- HUB DE ARCO: VIEWPORT 100VH FIXO SEM SCROLL CEGO -->
    <div class="flex-1 overflow-hidden flex flex-col lg:flex-row gap-5 p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO + ABAS INTERCAMBIÁVEIS -->
        <main class="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">

            <!-- 1. HERO PANORÂMICO DO ARCO NARRATIVO -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[180px] max-h-[215px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $workImage }}" class="w-full h-full object-cover object-center filter brightness-[0.32] blur-[1px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/65 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-2xl space-y-2 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider {{ $badgeStyle }}">
                                ARCO NARRATIVO • {{ $badgeText }}
                            </span>
                            <span class="px-2 py-0.5 rounded text-[9px] font-mono text-theme-accent bg-black/60 border border-white/10">
                                Episódios {{ $startEp }} ao {{ $endEp }}
                            </span>
                        </div>

                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md line-clamp-1">
                            {{ $arcTitle }}
                        </h1>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-xl">
                            Segmento narrativo oficial de <strong>{{ $workTitle }}</strong>, abrangendo do episódio {{ $startEp }} ao {{ $endEp }} ({{ $spanCount }} episódios catalogados).
                        </p>

                        <div class="flex items-center gap-2.5 pt-1 flex-wrap">
                            @if($work)
                                <button type="button"
                                        onclick="window.pushNavigation('work', '{{ $work->id }}', '{{ addslashes($workTitle) }}')"
                                        class="px-3.5 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5 cursor-pointer">
                                    <span>🎬</span> <span class="truncate max-w-[180px]">Abrir {{ $workTitle }}</span>
                                </button>
                            @endif

                            @if($universe)
                                <button type="button"
                                        onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universeName) }}')"
                                        class="px-3 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-xs font-mono font-bold text-theme-primary transition-all cursor-pointer flex items-center gap-1.5">
                                    <span>🌌</span> <span class="truncate max-w-[160px]">{{ $universeName }}</span>
                                </button>
                            @endif
                        </div>
                    </div>

                    <div class="hidden md:block flex-none w-28 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-theme-default shadow-2xl bg-black transform hover:-rotate-1 transition-transform shrink-0">
                        <img src="{{ $workImage }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                    </div>
                </div>
            </section>

            <!-- BARRA DE AÇÕES DO USUÁRIO -->
            <div class="shrink-0">
                <x-shell.entity-actions
                    targetType="arc"
                    :targetId="$arc->id ?? ''"
                    :targetTitle="$arcTitle"
                    :isBookmarked="$isBookmarked ?? false"
                    :isLiked="$isLiked ?? false"
                    :userScore="$userScore ?? null"
                    :userStatus="$userStatus ?? null" />
            </div>

            <!-- 2. NAVEGAÇÃO EM ABAS DO ARCO -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchEntityTab('structure')"
                        id="tab-btn-structure"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0">
                    <span>📺</span> <span data-i18n="entity.member_episodes">Episódios do Arco</span> ({{ $totalEpisodes }})
                </button>

                @if(count($otherArcs) > 0)
                    <button type="button"
                            onclick="window.switchEntityTab('relations')"
                            id="tab-btn-relations"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>📜</span> <span>Outras Sagas da Obra ({{ count($otherArcs) }})</span>
                    </button>
                @endif

                <button type="button"
                        onclick="window.switchEntityTab('discussion')"
                        id="tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span> <span data-i18n="discussion.tab_label">Discussão da Saga</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS -->
            <div class="flex-1 overflow-hidden min-h-0 flex flex-col">

                <!-- ABA 1: EPISÓDIOS DO ARCO -->
                <div id="entity-tab-panel-structure" class="flex-1 min-h-0 flex flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Unidades Episódicas da Saga (Ep. {{ $startEp }} ao {{ $endEp }})</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ $totalEpisodes }} catalogados</span>
                    </div>

                    <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-2 pr-1">
                        @forelse($episodes as $ep)
                            <div class="p-3 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-highlight transition-all flex items-center justify-between cursor-pointer group"
                                 onclick="window.pushNavigation('episode', '{{ $ep->id }}', 'Episódio {{ $ep->number }}')">
                                <div class="flex items-center gap-3 min-w-0">
                                    <span class="w-7 h-7 rounded-xl bg-theme-pill flex items-center justify-center text-xs font-bold font-mono text-theme-accent shrink-0">
                                        {{ $ep->number }}
                                    </span>
                                    <div class="truncate">
                                        <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">
                                            {{ isset($ep->title) && $ep->title ? $ep->title : ('Episódio ' . ($ep->number ?? '?')) }}
                                        </h4>
                                        <p class="text-[10px] font-mono text-theme-muted">{{ $ep->air_date_utc ?? 'Catalogado na saga' }}</p>
                                    </div>
                                </div>
                                <span class="text-[10px] font-mono text-theme-muted group-hover:text-theme-accent shrink-0">Ficha & Add-ons ❯</span>
                            </div>
                        @empty
                            <div class="col-span-full py-10 text-center space-y-2">
                                <p class="text-xs font-mono text-theme-muted">Esta saga compreende os episódios {{ $startEp }} até {{ $endEp }} de {{ $workTitle }}.</p>
                                @if($work)
                                    <button type="button"
                                            onclick="window.pushNavigation('work', '{{ $work->id }}', '{{ addslashes($workTitle) }}')"
                                            class="px-4 py-2 rounded-xl bg-theme-pill border border-theme-accent/40 text-xs font-mono font-bold text-theme-accent cursor-pointer">
                                        Ver Todos os Episódios na Obra ❯
                                    </button>
                                @endif
                            </div>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 2: OUTRAS SAGAS DA OBRA -->
                @if(count($otherArcs) > 0)
                <div id="entity-tab-panel-relations" class="flex-1 min-h-0 hidden flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Sequência de Sagas de {{ $workTitle }}</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ count($otherArcs) }} arcos irmãos</span>
                    </div>
                    <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-2.5 pr-1">
                        @foreach($otherArcs as $oa)
                            <div class="p-3.5 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-accent transition-all flex items-center justify-between cursor-pointer group"
                                 onclick="window.pushNavigation('arc', '{{ $oa->id }}', '{{ addslashes($oa->title) }}')">
                                <div class="min-w-0 pr-2">
                                    <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $oa->title }}</h4>
                                    <p class="text-[10px] font-mono text-theme-muted mt-0.5">Episódios {{ $oa->start_number ?? 1 }} a {{ $oa->end_number ?? '?' }}</p>
                                </div>
                                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 {{ ($oa->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border border-[var(--color-state-filler,#F43F5E)]/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' }}">
                                    {{ strtoupper($oa->classification ?? 'CANON') }}
                                </span>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 3: DISCUSSÃO COMUNITÁRIA -->
                <div id="entity-tab-panel-discussion" class="flex-1 min-h-0 hidden flex-col overflow-hidden">
                    <x-shell.entity-discussion
                        targetType="arc"
                        :targetId="$arc->id ?? ''" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: DOCKS ONTOLÓGICOS (ESCOPO, OBRA, UNIVERSO, STAFF) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: ESCOPO NUMÉRICO DA SAGA -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default/50 flex items-center justify-between">
                    <div>
                        <span class="text-[10px] font-mono uppercase tracking-wider text-theme-muted font-bold block">Faixa de Episódios</span>
                        <span class="text-sm font-black font-mono text-white">Ep. {{ $startEp }} ➔ Ep. {{ $endEp }}</span>
                    </div>
                    <span class="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase border {{ $badgeStyle }}">
                        {{ $badgeText }}
                    </span>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-theme-accent">{{ $spanCount }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Duração (Eps)</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-white">{{ count($otherArcs) + 1 }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Arcos na Obra</span>
                    </div>
                </div>
            </div>

            <!-- DOCK 2: OBRA E UNIVERSO VINCULADOS -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Hierarquia Ontológica</h3>

                @if($work)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                         onclick="window.pushNavigation('work', '{{ $work->id }}', '{{ addslashes($workTitle) }}')">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-9 h-12 rounded-xl overflow-hidden bg-black shrink-0 border border-theme-default">
                                <img src="{{ $workImage }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                            </div>
                            <div class="min-w-0">
                                <span class="text-[9px] font-mono uppercase text-theme-accent font-bold block">🎬 Obra Principal</span>
                                <h4 class="text-xs font-bold text-theme-primary truncate max-w-[155px]">{{ $workTitle }}</h4>
                            </div>
                        </div>
                        <span class="text-xs text-theme-muted">❯</span>
                    </div>
                @endif

                @if($universe)
                    <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-[var(--color-state-universe,#6366F1)] cursor-pointer transition-all"
                         onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universeName) }}')">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-9 h-9 rounded-xl bg-[var(--color-state-universe,#6366F1)]/20 border border-[var(--color-state-universe,#6366F1)]/40 flex items-center justify-center text-sm shrink-0">
                                🌌
                            </div>
                            <div class="min-w-0">
                                <span class="text-[9px] font-mono uppercase text-[var(--color-state-universe,#6366F1)] font-bold block">Universo Canônico</span>
                                <h4 class="text-xs font-bold text-theme-primary truncate max-w-[155px]">{{ $universeName }}</h4>
                            </div>
                        </div>
                        <span class="text-xs text-theme-muted">❯</span>
                    </div>
                @endif
            </div>

            <!-- DOCK 3: CRIADORES & ESTÚDIO DA OBRA -->
            @if(count($creators) > 0 || count($studios) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2 shadow-xl">
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Criação & Estúdio</h3>
                    @foreach(collect($creators)->take(2) as $cr)
                        <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                             onclick="window.pushNavigation('creator', '{{ $cr->id }}', '{{ addslashes($cr->name) }}')">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <div class="w-7 h-7 rounded-full overflow-hidden bg-black shrink-0 border border-theme-default">
                                    <img src="{{ $cr->image_url ?? '/assets/icons/actions/search.png' }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-theme-primary truncate max-w-[155px]">{{ $cr->name }}</h4>
                                    <p class="text-[9px] font-mono text-theme-muted uppercase">{{ $cr->role ?? 'Autor' }}</p>
                                </div>
                            </div>
                            <span class="text-xs text-theme-muted">❯</span>
                        </div>
                    @endforeach
                    @foreach(collect($studios)->take(2) as $st)
                        <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                             onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <div class="w-7 h-7 rounded-full bg-white/10 shrink-0 border border-theme-default flex items-center justify-center text-xs">🏢</div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-theme-primary truncate max-w-[155px]">{{ $st->name }}</h4>
                                    <p class="text-[9px] font-mono text-theme-muted">Estúdio de Produção</p>
                                </div>
                            </div>
                            <span class="text-xs text-theme-muted">❯</span>
                        </div>
                    @endforeach
                </div>
            @endif

        </aside>

    </div>
</div>
