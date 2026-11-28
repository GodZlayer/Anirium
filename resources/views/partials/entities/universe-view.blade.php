@props([
    'universe',
    'works' => [],
    'mangas' => [],
    'arcs' => [],
    'genealogy' => [],
    'authors' => [],
    'studios' => [],
    'formats' => [],
    'totalEpisodes' => 0,
    'totalChapters' => 0,
    'totalVolumes' => 0,
    'workProgressMap' => [],
    'isAniriumPlus' => false,
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
])

@php
    $worksCol = collect($works);
    $mangasCol = collect($mangas);
    $arcsCol = collect($arcs);
    $genealogyCol = collect($genealogy);

    $leadImage = $universe->image_url ?? ($worksCol->first()->image_url ?? ($mangasCol->first()->image_url ?? '/assets/icons/actions/search.png'));
    $name = $universe->name ?? 'Universo';

    $altRelationTypes = ['SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'SUMMARY', 'CHARACTER', 'OTHER'];
    $altIds = $genealogyCol
        ->filter(fn ($g) => in_array(strtoupper((string) ($g->relation_type ?? '')), $altRelationTypes, true))
        ->pluck('id')
        ->map(fn ($id) => (string) $id)
        ->flip()
        ->all();

    $canonWorks = collect();
    $altWorks = collect();
    foreach ($worksCol as $w) {
        $wid = (string) ($w->id ?? '');
        $fmt = strtoupper((string) ($w->format ?? 'TV'));
        if (isset($altIds[$wid]) || in_array($fmt, ['SPECIAL', 'OVA', 'ONA', 'MUSIC'], true)) {
            $altWorks->push($w);
        } else {
            $canonWorks->push($w);
        }
    }
    if ($canonWorks->isEmpty() && $altWorks->isNotEmpty()) {
        $canonWorks = $altWorks;
        $altWorks = collect();
    }
    $allSecondary = $altWorks->concat($mangasCol)->values();

    $arcsByWork = [];
    foreach ($arcsCol as $arc) {
        $awid = (string) ($arc->work_id ?? '');
        if ($awid !== '') {
            $arcsByWork[$awid][] = $arc;
        }
    }
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary">
    <!-- TOP BAR -->
    <header class="h-12 w-full flex items-center justify-between px-3 sm:px-5 border-b border-theme-default bg-theme-header shrink-0 z-20 gap-2">
        <div class="flex items-center gap-2 min-w-0">
            <button type="button" onclick="window.popNavigation()" title="Voltar"
                    class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-accent text-xs font-bold font-mono cursor-pointer shrink-0">
                ← <span class="hidden sm:inline" data-i18n="nav.back">Voltar</span>
            </button>

            <nav id="entity-dynamic-breadcrumb" class="flex items-center gap-1.5 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar">
                <button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent shrink-0 cursor-pointer" data-i18n="nav.home">Lobby</button>
                <span class="opacity-40">❯</span>
                <span class="text-theme-accent font-bold truncate max-w-[200px] sm:max-w-[280px]">{{ $name }}</span>
            </nav>
        </div>

        <div class="flex items-center gap-2 shrink-0 relative">
            <span class="hidden sm:inline px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-400/30 text-[10px] font-mono font-bold uppercase">
                {{ $canonWorks->count() }} canônicas · {{ $arcsCol->count() }} arcos
            </span>
            <button type="button"
                    title="Autores e estúdios do universo"
                    onclick="document.getElementById('univ-info-popover')?.classList.toggle('hidden')"
                    class="w-7 h-7 rounded-lg bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-muted hover:text-white text-xs font-mono font-bold flex items-center justify-center cursor-pointer">
                ⓘ
            </button>

            <div id="univ-info-popover" class="hidden absolute right-0 top-9 w-72 max-h-[65vh] overflow-y-auto rounded-2xl bg-theme-card border border-theme-default shadow-2xl p-3.5 z-50 space-y-2.5 text-left">
                @if(count($authors) > 0)
                    <div class="space-y-1">
                        <div class="text-[10px] font-mono uppercase text-theme-muted">Autores</div>
                        <div class="flex flex-wrap gap-1">
                            @foreach(collect($authors)->take(6) as $au)
                                <button type="button" onclick="window.pushNavigation('creator', '{{ $au->id }}', '{{ addslashes($au->name) }}')" class="px-2 py-0.5 rounded-md bg-theme-raised border border-theme-default text-[10px] hover:border-theme-accent cursor-pointer">{{ $au->name }}</button>
                            @endforeach
                        </div>
                    </div>
                @endif
                @if(count($studios) > 0)
                    <div class="space-y-1 pt-2 border-t border-theme-default/60">
                        <div class="text-[10px] font-mono uppercase text-theme-muted">Estúdios</div>
                        <div class="flex flex-wrap gap-1">
                            @foreach(collect($studios)->take(6) as $st)
                                <button type="button" onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')" class="px-2 py-0.5 rounded-md bg-theme-raised border border-theme-default text-[10px] hover:border-theme-accent cursor-pointer">{{ $st->name }}</button>
                            @endforeach
                        </div>
                    </div>
                @endif
            </div>
        </div>
    </header>

    <!-- LOBBY 100VH FIXO NO DESKTOP -->
    <div class="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-3 p-3 sm:p-4 min-h-0">

        <!-- ESQUERDA: HERO COMPACTO + FLUXO CANÔNICO (OBRAS & ARCOS) + ALTERNATIVOS RECOLHIDO -->
        <main class="flex-1 min-w-0 flex flex-col gap-3 lg:overflow-hidden">

            <!-- HERO COMPACTO -->
            <section class="relative w-full rounded-2xl overflow-hidden border border-theme-default bg-theme-raised p-4 shrink-0">
                <div class="absolute inset-0 z-0 pointer-events-none">
                    <img src="{{ $leadImage }}" class="w-full h-full object-cover object-center filter brightness-[0.22] blur-[2px] scale-105" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base via-theme-base/80 to-theme-base/40"></div>
                </div>

                <div class="relative z-10 flex items-center gap-4">
                    <div class="hidden sm:block w-16 aspect-[3/4] rounded-xl overflow-hidden border border-theme-default bg-black shrink-0 shadow-lg">
                        <img src="{{ $leadImage }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                    </div>

                    <div class="flex-1 min-w-0 space-y-2">
                        <h1 class="text-xl md:text-2xl font-black font-serif text-white truncate" title="{{ $name }}">{{ $name }}</h1>
                        <div class="flex flex-wrap items-center gap-2">
                            <x-shell.entity-rating target-type="universe" :target-id="(string) ($universe->id ?? '')" :user-score="$userScore" compact />
                            <button type="button"
                                    data-bookmark-btn
                                    data-entity-id="{{ $universe->id }}"
                                    data-bookmarked="{{ !empty($isBookmarked) ? '1' : '0' }}"
                                    onclick="window.toggleUserBookmark?.('{{ $universe->id }}', 'universe', this)"
                                    id="universe-btn-fav"
                                    title="Favoritar"
                                    class="px-2.5 py-1.5 rounded-xl bg-theme-pill border border-theme-default text-xs font-mono {{ !empty($isBookmarked) ? 'text-theme-accent border-theme-accent' : 'text-theme-muted hover:text-white' }} cursor-pointer">
                                <span data-bookmark-icon>{{ !empty($isBookmarked) ? '♥' : '♡' }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- FLUXO CANÔNICO (OBRAS & ARCOS) -->
            <section class="flex-1 min-h-0 flex flex-col gap-2">
                <div class="flex items-center justify-between shrink-0">
                    <span class="text-xs font-mono font-bold uppercase tracking-wider text-theme-primary">
                        Fluxo Canônico (Obras & Arcos)
                    </span>
                    @if($allSecondary->count() > 0)
                        <button type="button"
                                onclick="document.getElementById('univ-alt-drawer')?.classList.toggle('hidden')"
                                class="px-2.5 py-1 rounded-lg bg-theme-pill border border-theme-default text-[10px] font-mono font-bold text-theme-muted hover:text-white cursor-pointer">
                            🌿 Alternativos & Spin-offs ({{ $allSecondary->count() }}) ▾
                        </button>
                    @endif
                </div>

                <div class="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2.5 pr-0.5">
                    @foreach($canonWorks as $idx => $work)
                        @php
                            $wid = (string) ($work->id ?? '');
                            $wProgress = $workProgressMap[$wid] ?? ['status' => 'none', 'watched' => 0, 'total' => (int) ($work->episode_count ?? 0), 'percent' => 0];
                            $workArcs = $arcsByWork[$wid] ?? [];
                            $wFormat = strtoupper((string) ($work->format ?? 'TV'));
                        @endphp
                        <div class="rounded-2xl bg-theme-card border border-theme-default hover:border-theme-accent/70 transition-all p-3 flex items-center gap-3.5">
                            <div class="relative w-16 sm:w-20 aspect-[3/4] rounded-xl overflow-hidden bg-black border border-theme-default shrink-0 cursor-pointer group"
                                 onclick="window.pushNavigation('work', '{{ $wid }}', '{{ addslashes($work->title ?? 'Obra') }}')">
                                <img src="{{ $work->image_url ?? '/assets/icons/actions/search.png' }}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src='/assets/icons/actions/search.png'">
                                <span class="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/80 text-[8px] font-mono font-bold text-white">#{{ $idx + 1 }}</span>

                                @if(($wProgress['status'] ?? 'none') !== 'none')
                                    <div class="absolute top-1 right-1">
                                        <x-shell.watch-badge :status="$wProgress['status']" :watched="$wProgress['watched'] ?? 0" :total="$wProgress['total'] ?? 0" :percent="$wProgress['percent'] ?? 0" complete-label="Completo" />
                                    </div>
                                @endif

                                @if(($wProgress['status'] ?? 'none') === 'partial' && ($wProgress['percent'] ?? 0) > 0)
                                    <div class="absolute bottom-0 inset-x-0 h-1 bg-black/60"><div class="h-full bg-amber-400" style="width: {{ min(100, (int) $wProgress['percent']) }}%"></div></div>
                                @elseif(($wProgress['status'] ?? 'none') === 'completed')
                                    <div class="absolute bottom-0 inset-x-0 h-1 bg-emerald-400"></div>
                                @endif
                            </div>

                            <div class="flex-1 min-w-0 space-y-1.5">
                                <div class="flex items-center justify-between gap-2">
                                    <button type="button" onclick="window.pushNavigation('work', '{{ $wid }}', '{{ addslashes($work->title ?? 'Obra') }}')" class="text-sm font-bold text-white hover:text-theme-accent truncate cursor-pointer text-left">
                                        {{ $work->title ?? 'Obra' }}
                                    </button>
                                    <span class="text-[10px] font-mono text-theme-muted shrink-0">{{ $wFormat }} · {{ (int) ($work->episode_count ?? 0) ?: '—' }} eps</span>
                                </div>

                                @if(count($workArcs) > 0)
                                    <div class="flex flex-wrap gap-1">
                                        @foreach($workArcs as $arc)
                                            <button type="button"
                                                    onclick="window.pushNavigation('arc', '{{ $arc->id }}', '{{ addslashes($arc->title ?? 'Arco') }}')"
                                                    title="{{ $arc->title ?? 'Arco' }}"
                                                    class="px-2 py-0.5 rounded-md bg-theme-raised border border-theme-default hover:border-theme-accent text-[10px] font-mono text-theme-primary hover:text-theme-accent cursor-pointer truncate max-w-[200px]">
                                                {{ $arc->title ?? 'Arco' }}
                                            </button>
                                        @endforeach
                                    </div>
                                @endif
                            </div>
                        </div>
                    @endforeach

                    <!-- ALTERNATIVOS & SPIN-OFFS (RECOLHIDO POR PADRÃO) -->
                    @if($allSecondary->count() > 0)
                        <div id="univ-alt-drawer" class="hidden pt-2 border-t border-theme-default/60 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                            @foreach($allSecondary as $sec)
                                @php
                                    $sid = (string) ($sec->id ?? '');
                                    $sProg = $workProgressMap[$sid] ?? ['status' => 'none', 'watched' => 0, 'total' => 0, 'percent' => 0];
                                @endphp
                                <div class="rounded-xl bg-theme-raised border border-theme-default hover:border-theme-accent overflow-hidden cursor-pointer flex flex-col group/sec"
                                     onclick="window.pushNavigation('work', '{{ $sid }}', '{{ addslashes($sec->title ?? 'Obra') }}')">
                                    <div class="relative aspect-[3/4] w-full bg-black overflow-hidden">
                                        <img src="{{ $sec->image_url ?? '/assets/icons/actions/search.png' }}" class="w-full h-full object-cover group-hover/sec:scale-105 transition-transform duration-500" onerror="this.src='/assets/icons/actions/search.png'">
                                        <span class="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/80 text-[8px] font-mono font-bold text-white">{{ strtoupper((string) ($sec->format ?? 'EXTRA')) }}</span>
                                        @if(($sProg['status'] ?? 'none') !== 'none')
                                            <div class="absolute top-1 right-1">
                                                <x-shell.watch-badge :status="$sProg['status']" :watched="$sProg['watched'] ?? 0" :total="$sProg['total'] ?? 0" :percent="$sProg['percent'] ?? 0" complete-label="Completo" />
                                            </div>
                                        @endif
                                        @if(($sProg['status'] ?? 'none') === 'partial' && ($sProg['percent'] ?? 0) > 0)
                                            <div class="absolute bottom-0 inset-x-0 h-1 bg-black/60"><div class="h-full bg-amber-400" style="width: {{ min(100, (int) $sProg['percent']) }}%"></div></div>
                                        @elseif(($sProg['status'] ?? 'none') === 'completed')
                                            <div class="absolute bottom-0 inset-x-0 h-1 bg-emerald-400"></div>
                                        @endif
                                    </div>
                                    <div class="p-2">
                                        <span class="text-[11px] font-bold text-theme-primary line-clamp-1">{{ $sec->title ?? 'Obra' }}</span>
                                    </div>
                                </div>
                            @endforeach
                        </div>
                    @endif
                </div>
            </section>
        </main>

        <!-- DIREITA (LOBBY): DISCUSSÃO DO UNIVERSO SEMPRE VISÍVEL -->
        <aside class="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col min-h-[260px] lg:min-h-0">
            <x-shell.entity-discussion
                target-type="universe"
                :target-id="(string) ($universe->id ?? '')"
            />
        </aside>
    </div>
</div>

<script>
if (window.refreshEntityComments) {
    window.refreshEntityComments('universe', '{{ $universe->id ?? '' }}');
}
</script>
