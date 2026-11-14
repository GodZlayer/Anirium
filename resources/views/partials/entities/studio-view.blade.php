@props([
    'studio',
    'universe' => null,
    'universes' => [],
    'creators' => [],
    'formats' => [],
    'totalEpisodes' => 0,
    'works' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
])

@php
    $name = $studio->name ?? 'Estúdio de Animação';
    $leadImage = $studio->image_url ?? ($works[0]->image_url ?? '/assets/icons/actions/search.png');
    $worksCollection = collect($works)->unique('id')->values();
    $totalWorks = $worksCollection->count();

    $formatFormula = isset($formats) && count($formats) > 0
        ? collect($formats)->map(fn($f) => "{$f->total} " . strtolower(str_replace('_', ' ', $f->format ?? 'tv')))->join(' + ')
        : "{$totalWorks} produções";
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
            <span class="px-3 py-1 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30 text-[11px] font-bold tracking-wider uppercase font-mono">
                🏢 ESTÚDIO DE ANIMAÇÃO
            </span>
        </div>
    </header>

    <!-- HUB DO ESTÚDIO: VIEWPORT 100VH FIXO NO DESKTOP & FLUIDO NO MOBILE -->
    <div class="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 lg:gap-5 p-3 sm:p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO FIXO + ABAS INTERCAMBIÁVEIS -->
        <main class="shrink-0 lg:flex-1 min-w-0 flex flex-col gap-3 lg:gap-4 lg:overflow-hidden">

            <!-- 1. HERO PANORÂMICO DO ESTÚDIO (IDÊNTICO AO UNIVERSO: min-h-[175px] max-h-[210px]) -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[175px] max-h-[210px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $leadImage }}" class="w-full h-full object-cover object-center filter brightness-[0.35] blur-[1px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/60 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-xl space-y-2 min-w-0">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider bg-teal-500/30 text-teal-300 border border-teal-500/40 shadow-sm">
                            ESTÚDIO DE PRODUÇÃO & ANIMAÇÃO
                        </span>

                        <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md line-clamp-1">
                            {{ $name }}
                        </h1>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-lg">
                            Catálogo técnico e produções animadas de {{ $name }} ({{ $totalWorks }} obras e {{ number_format($totalEpisodes, 0, ',', '.') }} episódios).
                        </p>

                        <div class="flex items-center gap-3 pt-1">
                            <button type="button"
                                    onclick="window.switchStudioTab('works')"
                                    class="px-3.5 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5 cursor-pointer">
                                <span>▶</span> <span>Explorar Produções ({{ $totalWorks }})</span>
                            </button>

                            <button type="button"
                                    onclick="window.toggleUserBookmark?.('{{ $studio->id ?? '' }}', 'studio')"
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

            <!-- 2. NAVEGAÇÃO EM ABAS DO ESTÚDIO -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default overflow-x-auto no-scrollbar shrink-0">
                <button type="button"
                        onclick="window.switchStudioTab('works')"
                        id="studio-tab-btn-works"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0">
                    <span>🎬</span> <span>Produções Animadas ({{ $totalWorks }})</span>
                </button>

                @if(count($universes) > 0)
                    <button type="button"
                            onclick="window.switchStudioTab('universes')"
                            id="studio-tab-btn-universes"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>🌌</span> <span>Franquias & Universos ({{ count($universes) }})</span>
                    </button>
                @endif

                <button type="button"
                        onclick="window.switchStudioTab('discussion')"
                        id="studio-tab-btn-discussion"
                        class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                    <span>💬</span> <span data-i18n="discussion.tab_label">Discussão</span>
                </button>
            </nav>

            <!-- 3. CONTAINER DE CONTEÚDO DAS ABAS (TRILHOS HORIZONTAIS FLUIDOS) -->
            <div class="min-h-[245px] lg:min-h-0 lg:flex-1 overflow-hidden flex flex-col justify-center">

                <!-- ABA 1: PRODUÇÕES ANIMADAS (TRILHO HORIZONTAL w-44 h-[210px] IGUAL AO UNIVERSO) -->
                <div id="studio-tab-pane-works" class="studio-tab-pane flex flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none gap-2">
                        <span class="text-xs font-mono text-theme-muted truncate">Séries de TV, filmes, OVAs e especiais animados por {{ $name }}</span>
                        <div class="flex items-center gap-2 shrink-0">
                            <span class="text-xs font-mono text-theme-accent font-bold">{{ $totalWorks }} produções</span>
                            @if($worksCollection->count() > 1)
                                <div class="flex items-center gap-1">
                                    <button type="button" onclick="window.scrollEntityRail('studio-works-rail', -1)" class="w-7 h-7 rounded-xl bg-theme-pill hover:bg-theme-accent hover:text-theme-inverse border border-theme-default text-theme-primary flex items-center justify-center text-xs font-bold transition-all cursor-pointer shadow">❮</button>
                                    <button type="button" onclick="window.scrollEntityRail('studio-works-rail', 1)" class="w-7 h-7 rounded-xl bg-theme-pill hover:bg-theme-accent hover:text-theme-inverse border border-theme-default text-theme-primary flex items-center justify-center text-xs font-bold transition-all cursor-pointer shadow">❯</button>
                                </div>
                            @endif
                        </div>
                    </div>

                    <div class="relative flex-1 flex items-center min-h-0">
                        @if($worksCollection->count() > 3)
                            <button type="button" onclick="window.scrollEntityRail('studio-works-rail', -1)" class="absolute left-1.5 z-20 w-9 h-9 rounded-full bg-black/85 hover:bg-theme-accent text-white hover:text-theme-inverse border border-white/20 shadow-2xl flex items-center justify-center text-sm font-bold transition-all hover:scale-110 active:scale-95 cursor-pointer">❮</button>
                        @endif
                        <div id="studio-works-rail" data-draggable-rail="true" class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1 px-1 scroll-smooth cursor-grab active:cursor-grabbing">
                            @forelse($worksCollection as $w)
                                <div class="flex-none w-44 h-[210px] rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-highlight hover:scale-[1.03] transition-all shadow-lg group flex flex-col justify-between"
                                     onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                                    <div class="relative w-full h-32 overflow-hidden bg-black shrink-0">
                                        <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all pointer-events-none" loading="lazy" onerror="this.src='/assets/icons/actions/search.png'">
                                        <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-black/80 text-theme-accent border border-white/10 uppercase">
                                            {{ $w->format ?? 'TV' }}
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
                                    Nenhuma obra associada a este estúdio.
                                </div>
                            @endforelse
                        </div>
                        @if($worksCollection->count() > 3)
                            <button type="button" onclick="window.scrollEntityRail('studio-works-rail', 1)" class="absolute right-1.5 z-20 w-9 h-9 rounded-full bg-black/85 hover:bg-theme-accent text-white hover:text-theme-inverse border border-white/20 shadow-2xl flex items-center justify-center text-sm font-bold transition-all hover:scale-110 active:scale-95 cursor-pointer">❯</button>
                        @endif
                    </div>
                </div>

                <!-- ABA 2: FRANQUIAS & UNIVERSOS ANIMADOS (TRILHO HORIZONTAL w-64 h-[210px]) -->
                @if(count($universes) > 0)
                <div id="studio-tab-pane-universes" class="studio-tab-pane hidden flex-col justify-between h-full gap-2">
                    <div class="flex items-center justify-between flex-none">
                        <span class="text-xs font-mono text-theme-muted">Universos narrativos com temporadas ou filmes animados por {{ $name }}</span>
                        <span class="text-xs font-mono text-theme-accent font-bold">{{ count($universes) }} universos</span>
                    </div>

                    <div class="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 py-1">
                        @foreach($universes as $u)
                            <div class="flex-none w-64 h-[210px] p-4 rounded-2xl border border-theme-default bg-theme-raised/80 hover:bg-theme-raised hover:border-[var(--color-state-universe,#6366F1)] transition-all cursor-pointer shadow-md group flex flex-col justify-between"
                                 onclick="window.pushNavigation('universe', '{{ $u->id }}', '{{ addslashes($u->name) }}')">
                                <div>
                                    <div class="flex items-center justify-between gap-2 mb-2">
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-[var(--color-state-universe,#6366F1)]/20 text-[var(--color-state-universe,#6366F1)] border border-[var(--color-state-universe,#6366F1)]/30">
                                            🌌 UNIVERSO
                                        </span>
                                        <span class="text-xs text-theme-muted group-hover:text-theme-accent">❯</span>
                                    </div>
                                    <h3 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors line-clamp-2 leading-snug">
                                        {{ $u->name }}
                                    </h3>
                                </div>
                                <div class="mt-2 pt-2 border-t border-theme-default/40">
                                    <p class="text-[10px] font-mono text-theme-accent truncate">
                                        {{ $u->total_works ?? 1 }} produções deste estúdio
                                    </p>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
                @endif

                <!-- ABA 3: DISCUSSÃO COMUNITÁRIA -->
                <div id="studio-tab-pane-discussion" class="studio-tab-pane hidden flex-col h-full overflow-y-auto no-scrollbar">
                    <x-shell.entity-discussion
                        targetType="studio"
                        :targetId="$studio->id ?? ''" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: SIDEBAR ONTOLÓGICA (3 DOCKS) -->
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
                        <span class="text-[9px] font-mono text-theme-muted uppercase">Episódios</span>
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
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full bg-[var(--color-state-universe,#6366F1)]/20 border border-[var(--color-state-universe,#6366F1)]/40 flex items-center justify-center text-xs shrink-0">
                                        🌌
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[135px]">{{ $u->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted">Universo Animado</p>
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

            <!-- DOCK 3: DIRETORES & CRIADORES FREQUENTES -->
            @if(count($creators) > 0)
                <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-2.5 shadow-xl">
                    <div class="flex items-center gap-2">
                        <span class="text-theme-accent">✍️</span>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Diretores & Autores</h3>
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
                                        <p class="text-[9px] font-mono text-theme-muted">
                                            {{ ($cr->role ?? '') === 'director' ? 'Diretor' : (($cr->role ?? '') === 'author' ? 'Autor do Original' : 'Criação') }}
                                        </p>
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

<script>
window.switchStudioTab = function(tabName) {
    const tabs = ['works', 'universes', 'discussion'];
    tabs.forEach(t => {
        const btn = document.getElementById('studio-tab-btn-' + t);
        const pane = document.getElementById('studio-tab-pane-' + t);
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
