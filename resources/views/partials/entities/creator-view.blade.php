@props([
    'creator',
    'works' => [],
    'roles' => [],
    'formats' => [],
    'totalEpisodes' => 0,
    'universe' => null,
    'universes' => [],
    'studios' => [],
    'tracks' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
])

@php
    $name = $creator->name ?? 'Criador / Autor';
    $nativeName = $creator->native_name ?? '';
    $worksCollection = collect($works)->unique('id')->values();
    $totalWorks = $worksCollection->count();
    $animeWorks = $worksCollection->filter(fn($w) => strtolower($w->media ?? 'anime') !== 'manga')->values();
    $mangaWorks = $worksCollection->filter(fn($w) => strtolower($w->media ?? 'anime') === 'manga')->values();
    $leadImage = $creator->image_url ?? ($worksCollection[0]->image_url ?? '/assets/icons/actions/search.png');
    $backdropImage = $worksCollection[0]->image_url ?? $leadImage;

    $roleLabels = collect($roles)->map(fn($r) => match($r) {
        'author' => 'Autor Original',
        'director' => 'Diretor',
        'writer' => 'Roteirista',
        'composer' => 'Compositor Musical',
        default => strtoupper($r),
    })->unique()->values()->all();

    if (empty($roleLabels) && count($tracks) > 0) {
        $roleLabels = ['Compositor Musical'];
    }

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
            <span class="px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] font-bold tracking-wider uppercase font-mono">
                ✍️ {{ implode(' • ', $roleLabels ?: ['AUTOR / DIRETOR']) }}
            </span>
        </div>
    </header>

    <!-- HUB DO CRIADOR: VIEWPORT 100VH FIXO SEM SCROLL CEGO -->
    <div class="flex-1 overflow-hidden flex flex-col lg:flex-row gap-5 p-4 lg:p-6 min-h-0">

        <!-- COLUNA PRINCIPAL: HERO PANORÂMICO + ABAS INTERCAMBIÁVEIS -->
        <main class="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">

            <!-- 1. HERO PANORÂMICO DO CRIADOR / DIRETOR -->
            <section class="relative w-full rounded-3xl overflow-hidden border border-theme-default bg-theme-raised shadow-xl min-h-[180px] max-h-[215px] flex flex-col justify-end p-5 md:p-6 group shrink-0">
                <div class="absolute inset-0 z-0">
                    <img src="{{ $backdropImage }}" class="w-full h-full object-cover object-center filter brightness-[0.3] blur-[2px] group-hover:scale-105 transition-transform duration-1000" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/65 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-transparent to-transparent"></div>
                </div>

                <div class="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                    <div class="max-w-2xl space-y-2 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            @foreach($roleLabels as $rl)
                                <span class="px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider bg-orange-500/25 text-orange-300 border border-orange-500/40 shadow-sm">
                                    {{ $rl }}
                                </span>
                            @endforeach
                        </div>

                        <div class="flex items-baseline gap-3 flex-wrap">
                            <h1 class="text-2xl md:text-3xl font-black font-serif tracking-tight text-white drop-shadow-md">
                                {{ $name }}
                            </h1>
                            @if($nativeName)
                                <span class="text-xs font-mono text-theme-accent">{{ $nativeName }}</span>
                            @endif
                        </div>

                        <p class="text-[11px] md:text-xs text-theme-muted line-clamp-2 leading-relaxed max-w-xl">
                            Acervo ontológico e filmografia/bibliografia de {{ $name }} com {{ $totalWorks }} produções catalogadas ({{ $formatFormula }}).
                        </p>
                    </div>

                    <div class="hidden md:block flex-none w-24 h-24 rounded-full overflow-hidden border-2 border-theme-accent shadow-2xl bg-black shrink-0">
                        <img src="{{ $leadImage }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                    </div>
                </div>
            </section>

            <!-- BARRA DE AÇÕES PESSOAIS -->
            <div class="shrink-0">
                <x-shell.entity-actions
                    targetType="creator"
                    :targetId="$creator->id ?? ''"
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
                    <span>🎬</span> <span>Obras & Produções ({{ $totalWorks }})</span>
                </button>

                @if(count($tracks) > 0)
                    <button type="button"
                            onclick="window.switchEntityTab('tracks')"
                            id="tab-btn-tracks"
                            class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0">
                        <span>🎵</span> <span>Composições Musicais ({{ count($tracks) }})</span>
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

                <!-- ABA 1: CATÁLOGO DE OBRAS DO AUTOR / DIRETOR -->
                <div id="entity-tab-panel-structure" class="flex-1 min-h-0 flex flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Filmografia & Bibliografia Canônica</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ $animeWorks->count() }} animes • {{ $mangaWorks->count() }} mangás</span>
                    </div>

                    <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pr-1">
                        @forelse($worksCollection as $w)
                            @php
                                $wKind = strtolower($w->media ?? 'anime') === 'manga' ? 'manga' : 'work';
                                $wRole = match($w->role ?? '') {
                                    'author' => 'Autor Original',
                                    'director' => 'Diretor',
                                    'writer' => 'Roteiro',
                                    'composer' => 'Compositor',
                                    default => strtoupper($w->role ?? 'Staff'),
                                };
                            @endphp
                            <div class="rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-highlight hover:scale-[1.03] transition-all shadow-md group flex flex-col justify-between"
                                 onclick="window.pushNavigation('{{ $wKind }}', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                                <div class="relative w-full aspect-[3/4] overflow-hidden bg-black">
                                    <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all" onerror="this.src='/assets/icons/actions/search.png'" loading="lazy">
                                    <span class="absolute top-1.5 left-1.5 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-black/75 text-theme-accent border border-white/10 uppercase">
                                        {{ $w->format ?? 'TV' }}
                                    </span>
                                    <span class="absolute bottom-1.5 right-1.5 text-[8px] font-bold font-mono px-1.5 py-0.5 rounded bg-orange-500/80 text-black uppercase">
                                        {{ $wRole }}
                                    </span>
                                </div>
                                <div class="p-2.5">
                                    <p class="text-[11px] font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $w->title }}</p>
                                    <p class="text-[9px] font-mono text-theme-muted mt-0.5">{{ ($w->episode_count ?? null) ? $w->episode_count . ' un.' : ($w->status ?? 'Catalogado') }}</p>
                                </div>
                            </div>
                        @empty
                            <p class="col-span-full text-xs font-mono text-theme-muted text-center py-10">Nenhuma obra associada.</p>
                        @endforelse
                    </div>
                </div>

                <!-- ABA 2: COMPOSIÇÕES MUSICAIS -->
                @if(count($tracks) > 0)
                <div id="entity-tab-panel-tracks" class="flex-1 min-h-0 hidden flex-col p-4 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                    <div class="flex items-center justify-between mb-3 flex-none">
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Trilhas Sonoras Compostas</h3>
                        <span class="text-[11px] font-mono text-theme-muted">{{ count($tracks) }} faixas</span>
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
                                        <p class="text-[10px] font-mono text-theme-muted truncate">{{ $tr->work_title ?? 'Obra Associada' }}</p>
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
                        targetType="creator"
                        :targetId="$creator->id ?? ''" />
                </div>

            </div>

        </main>

        <!-- COLUNA LATERAL FIXA: DOCKS ONTOLÓGICOS (MÉTRICAS, UNIVERSOS, ESTÚDIOS PARCEIROS) -->
        <aside class="w-full lg:w-80 flex flex-col gap-3 shrink-0 overflow-y-auto no-scrollbar">

            <!-- DOCK 1: MÉTRICAS DE CARREIRA -->
            <div class="p-4 rounded-3xl bg-theme-card border border-theme-default space-y-3 shadow-xl">
                <div class="p-3 rounded-2xl bg-theme-raised/70 border border-theme-default/50 space-y-1.5">
                    <div class="flex items-baseline justify-between">
                        <span class="text-[10px] font-mono uppercase tracking-wider text-theme-muted font-bold">Total no Acervo</span>
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
                        @foreach($universes as $u)
                            <div class="flex items-center justify-between p-2.5 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-[var(--color-state-universe,#6366F1)] cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('universe', '{{ $u->id }}', '{{ addslashes($u->name) }}')">
                                <div class="min-w-0 pr-2">
                                    <h4 class="text-xs font-bold text-theme-primary truncate max-w-[165px]">{{ $u->name }}</h4>
                                    <p class="text-[9px] font-mono text-theme-muted">Franquia Canônica</p>
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
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-theme-accent">🏢</span>
                            <h3 class="text-xs font-mono uppercase tracking-wider text-theme-primary font-bold">Estúdios Parceiros</h3>
                        </div>
                    </div>

                    <div class="space-y-2">
                        @foreach($studios as $st)
                            <div class="flex items-center justify-between p-2 rounded-2xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all hover:scale-[1.02]"
                                 onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-full bg-white/10 shrink-0 border border-theme-default flex items-center justify-center text-xs">🏢</div>
                                    <div class="min-w-0">
                                        <h4 class="text-xs font-bold text-theme-primary truncate max-w-[140px]">{{ $st->name }}</h4>
                                        <p class="text-[9px] font-mono text-theme-muted">Colaboração</p>
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
