@props([
    'studio',
    'works' => [],
    'formats' => [],
    'totalEpisodes' => 0,
    'universes' => [],
    'creators' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
])

@php
    $name = $studio->name ?? 'Estúdio de Animação';
    $totalWorks = count($works);
    $leadImage = $studio->image_url ?? ($works[0]->image_url ?? '/assets/icons/actions/search.png');
    $backdropImage = $works[0]->image_url ?? $leadImage;

    $formatFormula = isset($formats) && count($formats) > 0
        ? collect($formats)->map(fn($f) => "{$f->total} " . strtolower(str_replace('_', ' ', $f->format)))->join(' + ')
        : "{$totalWorks} produções";
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
            <span class="px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold tracking-wider uppercase font-mono">
                🏢 PRODUTORA & ESTÚDIO
            </span>
        </div>
    </header>

    <!-- HUB DO ESTÚDIO: VIEWPORT 100VH FIXO SEM SCROLL CEGO -->
    <div class="flex-1 overflow-hidden flex flex-col lg:flex-row gap-5 p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO + ABAS INTERCAMBIÁVEIS -->
        <main class="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">

            <!-- 1. HERO PANORÂMICO DO ESTÚDIO -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[180px] max-h-[215px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $backdropImage }}" class="w-full h-full object-cover object-center filter brightness-[0.3] blur-[2px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/65 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-2xl space-y-2 min-w-0">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider bg-teal-500/25 text-teal-300 border border-teal-500/40 shadow-sm">
                            ESTÚDIO DE ANIMAÇÃO
                        </span>

                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md">
                            {{ $name }}
                        </h1>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-xl">
                            Catálogo de animação e produções oficiais do estúdio {{ $name }} ({{ $formatFormula }}).
                        </p>
                    </div>

                    <div class="hidden md:flex flex-none w-24 h-24 rounded-2xl overflow-hidden border-2 border-theme-default p-2 bg-theme-surface/90 items-center justify-center shadow-2xl shrink-0">
                        <img src="{{ $leadImage }}" class="max-w-full max-h-full object-contain" onerror="this.src='/assets/icons/actions/search.png'">
                    </div>
                </div>
            </section>

            <!-- BARRA DE AÇÕES DO USUÁRIO -->
            <div class="shrink-0">
                <x-shell.entity-actions
                    targetType="studio"
                    :targetId="$studio->id ?? ''"
                    :targetTitle="$name"
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
                    <span>🎬</span> <span>Catálogo do Estúdio ({{ $totalWorks }})</span>
                </button>

                @if(count($universes) > 0)
                    <button type="button"
                            onclick="window.switchEntityTab('relations')"
                            id="tab-btn-relations"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>🌌</span> <span>Universos & Franquias ({{ count($universes) }})</span>
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

                <!-- ABA 1: CATÁLOGO DE PRODUÇÕES DO ESTÚDIO -->
                <div id="entity-tab-panel-structure" class="flex-1 min-h-0 flex flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Produções Animadas pelo Estúdio</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ $totalWorks }} produções</span>
                    </div>

                    <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pr-1">
                        @forelse($works as $w)
                            <div class="rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-highlight hover:scale-[1.03] transition-all shadow-md group flex flex-col justify-between"
                                 onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                                <div class="relative w-full aspect-[3/4] overflow-hidden bg-black">
                                    <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all" onerror="this.src='/assets/icons/actions/search.png'" loading="lazy">
                                    <span class="absolute top-1.5 left-1.5 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-black/75 text-theme-accent border border-white/10 uppercase">
                                        {{ $w->format ?? 'TV' }}
                                    </span>
                                </div>
                                <div class="p-2.5">
                                    <p class="text-[11px] font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $w->title }}</p>
                                    <p class="text-[9px] font-mono text-theme-muted mt-0.5">{{ ($w->episode_count ?? null) ? $w->episode_count . ' eps' : ($w->status ?? 'Lançado') }}</p>
                                </div>
                            </div>
                        @empty
                            <p class="col-span-full text-xs font-mono text-theme-muted text-center py-10">Nenhuma obra associada.</p>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 2: UNIVERSOS & FRANQUIAS PRODUZIDAS -->
                @if(count($universes) > 0)
                <div id="entity-tab-panel-relations" class="flex-1 min-h-0 hidden flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Universos Animados por {{ $name }}</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ count($universes) }} universos</span>
                    </div>
                    <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-2.5 pr-1">
                        @foreach($universes as $u)
                            <div class="p-3.5 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-[var(--color-state-universe,#6366F1)] transition-all flex items-center justify-between cursor-pointer group"
                                 onclick="window.pushNavigation('universe', '{{ $u->id }}', '{{ addslashes($u->name) }}')">
                                <div class="flex items-center gap-3 min-w-0">
                                    <div class="w-10 h-10 rounded-xl bg-[var(--color-state-universe,#6366F1)]/20 border border-[var(--color-state-universe,#6366F1)]/40 flex items-center justify-center text-base shrink-0">
                                        🌌
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $u->name }}</h4>
                                        <p class="text-[10px] font-mono text-theme-muted">{{ $u->total_works ?? 1 }} produções deste estúdio</p>
                                    </div>
                                </div>
                                <span class="text-xs text-theme-muted group-hover:text-theme-accent shrink-0">❯</span>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 3: DISCUSSÃO COMUNITÁRIA -->
                <div id="entity-tab-panel-discussion" class="flex-1 min-h-0 hidden flex-col overflow-hidden">
                    <x-shell.entity-discussion
                        targetType="studio"
                        :targetId="$studio->id ?? ''" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: DOCKS ONTOLÓGICOS (MÉTRICAS, UNIVERSOS, DIRETORES FREQUENTES) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: MÉTRICAS DO ESTÚDIO -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default/50 space-y-1.5">
                    <div class="flex items-baseline justify-between">
                        <span class="text-[10px] font-mono uppercase tracking-wider text-theme-muted font-bold">Produções do Estúdio</span>
                        <span class="text-base font-black font-mono text-theme-accent">{{ $totalWorks }}</span>
                    </div>
                    <p class="text-[10px] font-mono text-theme-muted leading-relaxed border-t border-theme-default/30 pt-1">
                        ({{ $formatFormula }})
                    </p>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-white">{{ number_format($totalEpisodes, 0, ',', '.') }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Episódios Animados</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-theme-raised/70 border border-theme-default/50 text-center">
                        <span class="block text-sm font-black font-mono text-teal-400">{{ count($universes) }}</span>
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Franquias</span>
                    </div>
                </div>
            </div>

            <!-- DOCK 2: FRANQUIAS EM DESTAQUE -->
            @if(count($universes) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">🌌</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Principais Franquias</h3>
                    </div>

                    <div class="space-y-2">
                        @foreach(collect($universes)->take(4) as $u)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-[var(--color-state-universe,#6366F1)] cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('universe', '{{ $u->id }}', '{{ addslashes($u->name) }}')">
                                <span class="text-xs font-bold text-theme-primary truncate max-w-[165px]">{{ $u->name }}</span>
                                <span class="text-[9px] font-mono text-theme-accent px-1.5 py-0.5 rounded bg-theme-accent/10 border border-theme-accent/20 shrink-0">
                                    {{ $u->total_works ?? 1 }} obs
                                </span>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

            <!-- DOCK 3: DIRETORES & AUTORES FREQUENTES -->
            @if(count($creators) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">🎬</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Diretores & Criadores</h3>
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
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[135px]">{{ $cr->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted uppercase">{{ $cr->role ?? 'Direção' }}</p>
                                    </div>
                                </div>
                                <span class="text-[9px] font-mono text-theme-accent px-1.5 py-0.5 rounded bg-theme-accent/10 border border-theme-accent/20 shrink-0">
                                    {{ $cr->total_works ?? 1 }} obs
                                </span>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif

        </aside>

    </div>
</div>
