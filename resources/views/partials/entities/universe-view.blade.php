@props([
    'universe',
    'works' => [],
    'mangas' => [],
    'arcs' => [],
    'genealogy' => [],
    'creators' => [],
    'studios' => [],
    'tracks' => [],
    'totalEpisodes' => 0,
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
])

@php
    $name = $universe->name ?? 'Universo Canônico';
    $totalWorks = count($works);
    $totalMangas = count($mangas);
    $totalArcs = count($arcs);
    $totalEps = $totalEpisodes > 0 ? $totalEpisodes : ($universe->total_episodes ?? 0);
    $leadImage = $universe->image_url ?? ($works[0]->image_url ?? '/assets/icons/actions/search.png');
    
    // Sinopse contextual
    $desc = $universe->description ?? ($works[0]->synopsis ?? "Linha do tempo oficial e árvore genealógica de {$name}, conectando todas as obras canônicas, arcos narrativos e produções derivadas.");

    // Autores e Criadores Principais
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

    $mainStudio = count($studios) > 0 ? $studios[0] : null;

    // Relações cronológicas / genealógicas
    $genealogyList = collect($genealogy ?? []);
    $prequelsSequels = $genealogyList->whereIn('relation_type', ['prequel', 'sequel']);
    $sideStories = $genealogyList->whereIn('relation_type', ['side_story', 'spin_off', 'parent_story']);
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary">
    <!-- BARRA SUPERIOR: NAVEGAÇÃO ONTOLÓGICA FRACTAL -->
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

    <!-- HUB DE UNIVERSO: SPLIT GEOMÉTRICO (WHITE CONTENT TGCODE) -->
    <div class="flex-1 flex flex-col lg:flex-row overflow-hidden p-6 lg:p-8 gap-6 relative">
        
        <!-- ESQUERDA: HERO, IDENTIDADE DO UNIVERSO, AÇÕES E MÉTRICAS -->
        <aside class="w-full lg:w-2/5 flex flex-col gap-5 overflow-y-auto no-scrollbar shrink-0">
            <!-- Hero Panorâmico -->
            <div class="relative w-full aspect-video rounded-3xl bg-theme-raised border border-theme-default overflow-hidden shadow-2xl group shrink-0">
                <img src="{{ $leadImage }}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 filter brightness-75">
                <div class="absolute inset-0 bg-gradient-to-t from-theme-base via-theme-base/40 to-transparent"></div>
                <div class="absolute bottom-4 left-4 right-4">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--color-state-universe,#6366F1)] text-white uppercase tracking-wider mb-1.5 inline-block">
                        UNIVERSO
                    </span>
                    <h1 class="text-2xl font-black text-white font-serif tracking-tight truncate">{{ $name }}</h1>
                    <p class="text-xs text-theme-secondary font-mono mt-0.5">
                        {{ $totalWorks }} obras • {{ $totalArcs }} sagas • {{ $totalEps }} episódios
                    </p>
                </div>
            </div>

            <!-- Barra de Ações Unificadas do Usuário (ID atômico do universo) -->
            <x-shell.entity-actions
                targetType="universe"
                :targetId="$universe->id ?? ''"
                :targetTitle="$name"
                :isBookmarked="$isBookmarked ?? false"
                :isLiked="$isLiked ?? false"
                :userScore="$userScore ?? null"
                :userStatus="$userStatus ?? null" />

            <!-- Sinopse Oficial Contextual -->
            <div class="p-5 rounded-2xl bg-theme-card border border-theme-default space-y-2">
                <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">
                    Visão Geral do Universo
                </h3>
                <p class="text-xs leading-relaxed text-theme-secondary">
                    {{ $desc }}
                </p>
            </div>

            <!-- Criadores & Estúdios Principais -->
            @if(count($creators) > 0 || count($studios) > 0)
                <div class="p-5 rounded-2xl bg-theme-card border border-theme-default space-y-3">
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-muted font-bold">
                        Núcleo Criativo & Produção
                    </h3>
                    <div class="space-y-2">
                        @foreach(collect($creators)->take(2) as $cr)
                            <div class="flex items-center gap-3 p-2 rounded-xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                                 onclick="window.pushNavigation('creator', '{{ $cr->id }}', '{{ addslashes($cr->name) }}')">
                                <div class="w-8 h-8 rounded-full overflow-hidden bg-black shrink-0 border border-theme-default">
                                    <img src="{{ $cr->image_url ?? '/assets/icons/actions/search.png' }}" class="w-full h-full object-cover">
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-theme-primary truncate">{{ $cr->name }}</h4>
                                    <p class="text-[9px] font-mono text-theme-muted uppercase">{{ $cr->role ?? 'Criador' }}</p>
                                </div>
                            </div>
                        @endforeach

                        @foreach(collect($studios)->take(1) as $st)
                            <div class="flex items-center gap-3 p-2 rounded-xl bg-theme-raised/60 border border-theme-default hover:border-theme-accent cursor-pointer transition-all"
                                 onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')">
                                <div class="w-8 h-8 rounded-full overflow-hidden bg-theme-pill shrink-0 border border-theme-default flex items-center justify-center font-bold text-xs text-theme-accent">
                                    🏢
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-theme-primary truncate">{{ $st->name }}</h4>
                                    <p class="text-[9px] font-mono text-theme-muted uppercase">Estúdio de Animação</p>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>
            @endif
        </aside>

        <!-- DIREITA: ABAS ESTRUTURAIS (OBRAS, GENEALOGIA/CRONOLOGIA, SAGAS & ARCOS, DISCUSSÃO) -->
        <main class="w-full lg:w-3/5 flex flex-col gap-4 overflow-hidden">
            <!-- Alternador de Abas do Universo -->
            <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-theme-raised border border-theme-default shrink-0 overflow-x-auto no-scrollbar">
                <button type="button"
                        onclick="window.switchUniverseTab('works')"
                        id="tab-btn-works"
                        class="flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer whitespace-nowrap">
                    <span>🎬 Obras</span> ({{ $totalWorks }})
                </button>

                <button type="button"
                        onclick="window.switchUniverseTab('genealogy')"
                        id="tab-btn-genealogy"
                        class="flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer whitespace-nowrap">
                    <span>🧬 Genealogia & Cronologia</span> ({{ count($genealogyList) }})
                </button>

                <button type="button"
                        onclick="window.switchUniverseTab('arcs')"
                        id="tab-btn-arcs"
                        class="flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer whitespace-nowrap">
                    <span>📜 Sagas & Arcos</span> ({{ $totalArcs }})
                </button>

                <button type="button"
                        onclick="window.switchUniverseTab('discussion')"
                        id="tab-btn-discussion"
                        class="flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer whitespace-nowrap">
                    <span>💬 Discussão</span>
                </button>
            </nav>

            <!-- ABA 1: OBRAS DO UNIVERSO (GRID PURO RESPONSIVO) -->
            <div id="universe-panel-works" class="flex-1 min-h-0 flex flex-col p-5 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                <div class="flex items-center justify-between mb-3 flex-none">
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">
                        Todas as Obras da Franquia
                    </h3>
                    <span class="text-[11px] font-mono text-theme-muted">{{ $totalWorks }} produções</span>
                </div>

                <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-3 pr-1">
                    @forelse($works as $w)
                        <div class="rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-accent hover:scale-[1.02] transition-all shadow-md group flex flex-col"
                             onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                            <div class="relative w-full aspect-[16/10] overflow-hidden bg-black">
                                <img src="{{ $w->image_url ?? $leadImage }}" class="w-full h-full object-cover group-hover:scale-105 transition-all">
                                <span class="absolute top-2 left-2 text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-black/80 text-theme-accent border border-white/10 uppercase">
                                    {{ $w->format ?? 'TV' }}
                                </span>
                            </div>
                            <div class="p-3 flex-1 flex flex-col justify-between">
                                <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors line-clamp-1">
                                    {{ $w->title }}
                                </h4>
                                <p class="text-[10px] font-mono text-theme-muted mt-1">
                                    {{ $w->status ?? 'Lançado' }} • {{ $w->episode_count ?? '?' }} eps
                                </p>
                            </div>
                        </div>
                    @empty
                        <p class="text-xs font-mono text-theme-muted col-span-3">Nenhuma obra catalogada no universo.</p>
                    @endforelse
                </div>
            </div>

            <!-- ABA 2: GENEALOGIA & CRONOLOGIA (ORDEM DE LANÇAMENTO, PREQUELS, SEQUELS E SIDE-STORIES) -->
            <div id="universe-panel-genealogy" class="flex-1 min-h-0 hidden flex-col p-5 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                <div class="flex items-center justify-between mb-3 flex-none">
                    <div>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">
                            Genealogia & Continuidade
                        </h3>
                        <p class="text-[10px] font-mono text-theme-muted">Ordem cronológica de lançamento, prequels, sequências e histórias paralelas.</p>
                    </div>
                    <span class="text-[11px] font-mono text-theme-muted">{{ count($genealogyList) }} conexões</span>
                </div>

                <div class="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-1">
                    <!-- Continuidade Canônica Direta (Prequel / Sequel) -->
                    @if($prequelsSequels->isNotEmpty())
                        <div class="space-y-2">
                            <h4 class="text-[11px] font-mono font-bold text-theme-primary uppercase flex items-center gap-1.5">
                                <span>🔗</span> Linha Temporal Principal (Sequências & Prequels)
                            </h4>
                            <div class="space-y-2">
                                @foreach($prequelsSequels as $rel)
                                    <div class="p-3 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-accent transition-all flex items-center justify-between cursor-pointer group"
                                         onclick="window.pushNavigation('work', '{{ $rel->to_work_id }}', '{{ addslashes($rel->to_title) }}')">
                                        <div class="flex items-center gap-3 min-w-0">
                                            <div class="w-10 h-10 rounded-xl overflow-hidden bg-black shrink-0">
                                                <img src="{{ $rel->image_url ?? $leadImage }}" class="w-full h-full object-cover">
                                            </div>
                                            <div class="min-w-0">
                                                <h5 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">
                                                    {{ $rel->to_title }}
                                                </h5>
                                                <p class="text-[10px] font-mono text-theme-muted">
                                                    {{ $rel->format ?? 'TV' }} • {{ $rel->episode_count ?? '?' }} episódios
                                                </p>
                                            </div>
                                        </div>
                                        <span class="px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase shrink-0 {{ $rel->relation_type === 'sequel' ? 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' : 'bg-theme-accent/20 text-theme-accent border border-theme-accent/30' }}">
                                            {{ $rel->relation_type === 'sequel' ? 'Sequência ➔' : '⮌ Prequel' }}
                                        </span>
                                    </div>
                                @endforeach
                            </div>
                        </div>
                    @endif

                    <!-- Histórias Paralelas & Derivadas (Side-Stories & Spin-offs) -->
                    @if($sideStories->isNotEmpty())
                        <div class="space-y-2 pt-2 border-t border-theme-default">
                            <h4 class="text-[11px] font-mono font-bold text-theme-primary uppercase flex items-center gap-1.5">
                                <span>🌌</span> Side-Stories & Histórias Paralelas
                            </h4>
                            <div class="space-y-2">
                                @foreach($sideStories as $side)
                                    <div class="p-3 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-accent transition-all flex items-center justify-between cursor-pointer group"
                                         onclick="window.pushNavigation('work', '{{ $side->to_work_id }}', '{{ addslashes($side->to_title) }}')">
                                        <div class="flex items-center gap-3 min-w-0">
                                            <div class="w-10 h-10 rounded-xl overflow-hidden bg-black shrink-0">
                                                <img src="{{ $side->image_url ?? $leadImage }}" class="w-full h-full object-cover">
                                            </div>
                                            <div class="min-w-0">
                                                <h5 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">
                                                    {{ $side->to_title }}
                                                </h5>
                                                <p class="text-[10px] font-mono text-theme-muted">
                                                    {{ $side->format ?? 'TV' }} • {{ $side->episode_count ?? '?' }} episódios
                                                </p>
                                            </div>
                                        </div>
                                        <span class="px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase bg-theme-pill text-theme-muted border border-theme-default shrink-0">
                                            {{ $side->relation_type === 'spin_off' ? 'Spin-off' : 'Side-Story' }}
                                        </span>
                                    </div>
                                @endforeach
                            </div>
                        </div>
                    @endif

                    @if($genealogyList->isEmpty())
                        <p class="text-xs font-mono text-theme-muted">Relações cronológicas diretas em catalogação.</p>
                    @endif
                </div>
            </div>

            <!-- ABA 3: SAGAS & ARCOS DO UNIVERSO (MAPA PRECISO: DE OBRA/TEMP/EP ATÉ OBRA/TEMP/EP) -->
            <div id="universe-panel-arcs" class="flex-1 min-h-0 hidden flex-col p-5 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                <div class="flex items-center justify-between mb-3 flex-none">
                    <div>
                        <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">
                            Sagas & Arcos Narrativos
                        </h3>
                        <p class="text-[10px] font-mono text-theme-muted">Mapeamento exato de obras, temporadas e episódios onde cada arco ocorre.</p>
                    </div>
                    <span class="text-[11px] font-mono text-theme-muted">{{ $totalArcs }} arcos</span>
                </div>

                <div class="flex-1 overflow-y-auto no-scrollbar space-y-2.5 pr-1">
                    @forelse($arcs as $arc)
                        <div class="p-3.5 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-accent transition-all flex items-center justify-between cursor-pointer group"
                             onclick="window.pushNavigation('arc', '{{ $arc->id }}', '{{ addslashes($arc->title) }}')">
                            <div class="flex items-center gap-3.5 min-w-0">
                                <span class="w-2.5 h-2.5 rounded-full shrink-0 {{ ($arc->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]' : 'bg-[var(--color-state-canon,#10B981)]' }}"></span>
                                <div class="min-w-0">
                                    <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">
                                        {{ $arc->title }}
                                    </h4>
                                    <!-- Acontece na obra tal temporada tal ep tal até obra tal temporada tal ep tal -->
                                    <p class="text-[10px] font-mono text-theme-muted mt-0.5 truncate">
                                        <span class="text-theme-accent font-bold">Local:</span> {{ $arc->span_description ?? $arc->work_title }}
                                    </p>
                                </div>
                            </div>
                            <span class="px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase shrink-0 {{ ($arc->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border border-[var(--color-state-filler,#F43F5E)]/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' }}">
                                {{ strtoupper($arc->classification ?? 'CANON') }}
                            </span>
                        </div>
                    @empty
                        <p class="text-xs font-mono text-theme-muted">Nenhum arco catalogado.</p>
                    @endforelse
                </div>
            </div>

            <!-- ABA 4: DISCUSSÃO DA FRANQUIA (DELTA SYNC COMMUNITY) -->
            <div id="universe-panel-discussion" class="flex-1 min-h-0 hidden flex-col overflow-hidden">
                <x-shell.entity-discussion
                    targetType="universe"
                    :targetId="$universe->id ?? ''" />
            </div>
        </main>
    </div>
</div>

<script>
window.switchUniverseTab = function(tabName) {
    const panels = {
        works: document.getElementById('universe-panel-works'),
        genealogy: document.getElementById('universe-panel-genealogy'),
        arcs: document.getElementById('universe-panel-arcs'),
        discussion: document.getElementById('universe-panel-discussion'),
    };

    const buttons = {
        works: document.getElementById('tab-btn-works'),
        genealogy: document.getElementById('tab-btn-genealogy'),
        arcs: document.getElementById('tab-btn-arcs'),
        discussion: document.getElementById('tab-btn-discussion'),
    };

    // Alternar visibilidade dos painéis
    Object.keys(panels).forEach(key => {
        if (!panels[key]) return;
        if (key === tabName) {
            panels[key].classList.remove('hidden');
            panels[key].classList.add('flex');
            if (key === 'discussion') {
                window.refreshEntityComments?.();
            }
        } else {
            panels[key].classList.add('hidden');
            panels[key].classList.remove('flex');
        }
    });

    // Alternar estilos dos botões
    Object.keys(buttons).forEach(key => {
        if (!buttons[key]) return;
        if (key === tabName) {
            buttons[key].className = 'flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer whitespace-nowrap';
        } else {
            buttons[key].className = 'flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer whitespace-nowrap';
        }
    });
};
</script>
