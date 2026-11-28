@props([
    'work',
    'universe' => null,
    'currentArc' => null,
    'currentEpisode' => null,
    'creators' => [],
    'studios' => [],
    'tracks' => [],
    'relations' => [],
    'externalIds' => [],
    'englishTitle' => '',
    'romajiTitle' => '',
    'nativeTitle' => '',
    'titleAliases' => [],
    'arcs' => [],
    'episodes' => [],
    'episodeProgressMap' => [],
    'workProgress' => ['status' => 'none', 'watched' => 0, 'total' => 0, 'percent' => 0],
    'isAniriumPlus' => false,
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
    'isWatched' => false,
])

@php
    $title = $work->title ?? 'Obra';
    $media = strtolower($work->media ?? 'anime');
    $format = strtoupper($work->format ?? ($media === 'manga' ? 'MANGA' : 'TV'));
    $isManga = $media === 'manga' || in_array($format, ['MANGA', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'DOUJINSHI', 'NOVEL', 'LIGHT_NOVEL', 'OEL'], true);
    $image = $work->image_url ?? '/assets/icons/actions/search.png';
    $synopsis = strip_tags($work->synopsis ?? '');
    $epNum = !empty($currentEpisode) ? (int) ($currentEpisode->number ?? 1) : 1;
    $status = strtoupper($work->status ?? 'COMPLETED');
    $scheduleMaxEp = (int) ($work->latest_episode_num ?? 0);
    $isUnreleased = in_array($status, ['NOT_YET_RELEASED', 'NOT_YET_AIRED', 'UPCOMING', 'UNRELEASED'], true);

    $totalEpisodes = max(count($episodes), (int) ($work->episode_count ?? 0));
    if ($totalEpisodes <= 0 && count($arcs) > 0) {
        $totalEpisodes = max((int) collect($arcs)->max('end_number'), (int) collect($arcs)->max('start_number'));
    }
    if ($totalEpisodes <= 0 && ! $isUnreleased) {
        $totalEpisodes = 1;
    }

    $nowTs = time();
    $displayEpisodes = collect($episodes)->filter(function ($ep) use ($nowTs) {
        if (!empty($ep->air_date_utc)) {
            $ts = strtotime($ep->air_date_utc);
            if ($ts > 0 && $ts > $nowTs) {
                return false;
            }
        }
        return true;
    })->values();

    $knownMaxEp = (int) ($displayEpisodes->max('number') ?? 0);
    if ($isUnreleased) {
        $targetMaxEp = 0;
    } elseif ($status === 'RELEASING') {
        $airedFrontier = max($knownMaxEp, $scheduleMaxEp);
        $targetMaxEp = $airedFrontier > 0 ? $airedFrontier : max(1, (int) $totalEpisodes);
    } else {
        $targetMaxEp = max($knownMaxEp, $scheduleMaxEp, (int) $totalEpisodes, 1);
    }

    if (! $isUnreleased && ($targetMaxEp > $knownMaxEp || $displayEpisodes->count() < $targetMaxEp)) {
        $maxVirtual = min($targetMaxEp, 500);
        $virtualList = $displayEpisodes->all();
        $existingNums = $displayEpisodes->pluck('number')->flip()->all();
        for ($i = 1; $i <= $maxVirtual; $i++) {
            if (! isset($existingNums[$i])) {
                $virtualList[] = (object) [
                    'id' => ($work->id ?? 'work') . ':ep:' . $i,
                    'work_id' => $work->id ?? '',
                    'number' => $i,
                    'air_date_utc' => null,
                    'is_virtual' => true,
                ];
            }
        }
        $displayEpisodes = collect($virtualList)->sortBy('number')->values();
    }

    $totalEpisodes = $displayEpisodes->count();
    $malId = collect($externalIds)->firstWhere('provider', 'mal')->external_id ?? null;
    $imdbId = collect($externalIds)->firstWhere('provider', 'imdb')->external_id ?? null;
    $anilistId = collect($externalIds)->firstWhere('provider', 'anilist')->external_id ?? null;
    $communityScore = $work->score ?? null;
    $targetEntityId = (string) ($work->id ?? '');
    $targetEntityType = $isManga ? 'manga' : 'work';
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary"
     id="work-context-stage"
     data-work-id="{{ $work->id ?? '' }}"
     data-work-title="{{ $title }}"
     data-work-english-title="{{ $englishTitle ?? '' }}"
     data-work-romaji-title="{{ $romajiTitle ?? '' }}"
     data-work-native-title="{{ $nativeTitle ?? '' }}"
     data-work-aliases="{{ json_encode($titleAliases ?? []) }}"
     data-work-media="{{ $isManga ? 'manga' : 'anime' }}"
     data-work-format="{{ $format }}"
     data-episode-count="{{ $totalEpisodes }}"
     data-mal-id="{{ $malId ?? '' }}"
     data-imdb-id="{{ $imdbId ?? '' }}"
     data-anilist-id="{{ $anilistId ?? '' }}"
     data-episode-id="{{ $currentEpisode->id ?? ($episodes[0]->id ?? '') }}"
     data-episode-number="{{ $epNum }}">

    <!-- TOP BAR -->
    <header class="h-12 w-full flex items-center justify-between px-3 sm:px-5 border-b border-theme-default bg-theme-header shrink-0 z-20 gap-2">
        <div class="flex items-center gap-2 min-w-0">
            <button type="button"
                    onclick="window.popNavigation()"
                    title="Voltar"
                    class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-accent text-xs font-bold font-mono cursor-pointer shrink-0">
                ← <span class="hidden sm:inline" data-i18n="nav.back">Voltar</span>
            </button>

            <nav id="entity-dynamic-breadcrumb" class="flex items-center gap-1.5 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar">
                <button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent shrink-0 cursor-pointer" data-i18n="nav.home">Lobby</button>
                @if($universe)
                    <span class="opacity-40">❯</span>
                    <button type="button" onclick="window.pushNavigation('universe', '{{ $universe->id }}', '{{ addslashes($universe->name) }}')" class="hover:text-theme-accent truncate max-w-[140px] cursor-pointer">{{ $universe->name }}</button>
                @endif
                <span class="opacity-40">❯</span>
                <span class="text-theme-accent font-bold truncate max-w-[180px] sm:max-w-[260px]">{{ $title }}</span>
            </nav>
        </div>

        <!-- INFO SOB DEMANDA (TOOLTIP / POPOVER) -->
        <div class="flex items-center gap-2 shrink-0 relative group/info">
            <span class="hidden sm:inline px-2 py-0.5 rounded-md bg-theme-pill border border-theme-default text-[10px] font-mono text-theme-muted uppercase">
                {{ $format }} · {{ $totalEpisodes }} {{ $isManga ? 'capítulos' : 'episódios' }}
            </span>
            <button type="button"
                    title="Sinopse, equipe, estúdios e músicas"
                    onclick="document.getElementById('work-info-popover')?.classList.toggle('hidden')"
                    class="w-7 h-7 rounded-lg bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-muted hover:text-white text-xs font-mono font-bold flex items-center justify-center cursor-pointer">
                ⓘ
            </button>

            <!-- Popover sob demanda -->
            <div id="work-info-popover" class="hidden absolute right-0 top-9 w-80 max-h-[70vh] overflow-y-auto rounded-2xl bg-theme-card border border-theme-default shadow-2xl p-4 z-50 space-y-3 text-left">
                @if($synopsis !== '')
                    <p class="text-xs text-theme-muted leading-relaxed">{{ $synopsis }}</p>
                @endif
                @if(count($creators) > 0)
                    <div class="space-y-1 pt-2 border-t border-theme-default/60">
                        <div class="text-[10px] font-mono uppercase text-theme-muted">Equipe</div>
                        <div class="flex flex-wrap gap-1">
                            @foreach(collect($creators)->take(6) as $cr)
                                <button type="button" onclick="window.pushNavigation('creator', '{{ $cr->id }}', '{{ addslashes($cr->name) }}')" class="px-2 py-0.5 rounded-md bg-theme-raised border border-theme-default text-[10px] hover:border-theme-accent cursor-pointer">{{ $cr->name }}</button>
                            @endforeach
                        </div>
                    </div>
                @endif
                @if(count($studios) > 0)
                    <div class="space-y-1 pt-2 border-t border-theme-default/60">
                        <div class="text-[10px] font-mono uppercase text-theme-muted">Estúdios</div>
                        <div class="flex flex-wrap gap-1">
                            @foreach(collect($studios)->take(4) as $st)
                                <button type="button" onclick="window.pushNavigation('studio', '{{ $st->id }}', '{{ addslashes($st->name) }}')" class="px-2 py-0.5 rounded-md bg-theme-raised border border-theme-default text-[10px] hover:border-theme-accent cursor-pointer">{{ $st->name }}</button>
                            @endforeach
                        </div>
                    </div>
                @endif
                @if(count($tracks) > 0)
                    <div class="space-y-1 pt-2 border-t border-theme-default/60">
                        <div class="text-[10px] font-mono uppercase text-theme-muted">OP / ED</div>
                        <div class="space-y-1">
                            @foreach(collect($tracks)->take(5) as $tr)
                                <button type="button" onclick="window.pushNavigation('track', '{{ $tr->id }}', '{{ addslashes($tr->title ?? 'Música') }}')" class="w-full text-left px-2 py-1 rounded-md bg-theme-raised border border-theme-default text-[10px] truncate hover:border-theme-accent cursor-pointer">{{ $tr->title ?? 'Faixa' }}</button>
                            @endforeach
                        </div>
                    </div>
                @endif
            </div>
        </div>
    </header>

    <!-- LOBBY 100VH FIXO NO DESKTOP -->
    <div class="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-3 p-3 sm:p-4 min-h-0">

        <!-- COLUNA ESQUERDA: CARD ÚNICO DE LOBBY (POSTER + TÍTULO/NOTA/AÇÕES + EPISÓDIOS JUNTOS) -->
        <main class="flex-1 min-w-0 flex flex-col lg:overflow-hidden min-h-0">

            <section class="relative flex-1 min-h-0 w-full rounded-2xl overflow-hidden border border-theme-default bg-theme-raised p-4 sm:p-5 flex flex-col md:flex-row gap-5">
                <div class="absolute inset-0 z-0 pointer-events-none">
                    <img src="{{ $image }}" class="w-full h-full object-cover object-center filter brightness-[0.20] blur-[2px] scale-105" onerror="this.src='/assets/icons/actions/search.png'">
                    <div class="absolute inset-0 bg-gradient-to-r from-theme-base/95 via-theme-base/80 to-theme-base/60"></div>
                </div>

                <!-- Poster à Esquerda -->
                <div class="relative z-10 hidden sm:block shrink-0 rounded-2xl overflow-hidden border border-theme-default bg-black shadow-2xl self-center md:self-stretch"
                     style="width: 220px; max-height: 100%;">
                    <img src="{{ $image }}" class="w-full h-full object-cover" onerror="this.src='/assets/icons/actions/search.png'">
                    @if(($workProgress['status'] ?? 'none') !== 'none')
                        <div class="absolute top-2 right-2">
                            <x-shell.watch-badge :status="$workProgress['status']" :watched="$workProgress['watched'] ?? 0" :total="$workProgress['total'] ?? 0" :percent="$workProgress['percent'] ?? 0" complete-label="Completo" />
                        </div>
                    @endif
                    @if(($workProgress['status'] ?? 'none') === 'partial' && ($workProgress['percent'] ?? 0) > 0)
                        <div class="absolute bottom-0 inset-x-0 h-1 bg-black/60"><div class="h-full bg-amber-400" style="width: {{ min(100, (int) $workProgress['percent']) }}%"></div></div>
                    @elseif(($workProgress['status'] ?? 'none') === 'completed')
                        <div class="absolute bottom-0 inset-x-0 h-1 bg-emerald-400"></div>
                    @endif
                </div>

                <!-- Direita do Card: Título + Nota + Ações + Episódios no mesmo espaço -->
                <div class="relative z-10 flex-1 min-w-0 min-h-0 flex flex-col justify-between gap-4">
                    <!-- Cabeçalho: Título + Nota 1-10 + Ações -->
                    <div class="space-y-2.5 shrink-0">
                        <h1 class="text-2xl md:text-3xl font-black font-serif text-white truncate" title="{{ $title }}">{{ $title }}</h1>

                        <div class="flex flex-wrap items-center gap-2">
                            <x-shell.entity-rating
                                :target-type="$targetEntityType"
                                :target-id="$targetEntityId"
                                :user-score="$userScore"
                                :community-score="$communityScore"
                                compact
                            />

                            @if(!$isManga && !$isUnreleased)
                                <button type="button"
                                        data-requires-addon-capability="video"
                                        onclick="window.launchExternalVideoAddon('{{ $work->id ?? '' }}', '{{ $currentEpisode->id ?? ($episodes[0]->id ?? '') }}', '{{ $epNum }}', '{{ addslashes($title) }}')"
                                        title="Reproduzir via Add-on de Player"
                                        class="hidden px-3.5 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold hover:opacity-90 cursor-pointer items-center gap-1.5 shadow-md">
                                    ▶ {{ $format === 'MOVIE' ? 'Play' : ('Ep. ' . $epNum) }}
                                </button>
                            @elseif($isManga)
                                <button type="button"
                                        data-requires-addon-capability="manga"
                                        onclick="window.launchExternalMangaAddon('{{ $work->id ?? '' }}', '{{ $epNum }}', '{{ addslashes($title) }}')"
                                        title="Ler via Add-on"
                                        class="hidden px-3.5 py-1.5 rounded-xl bg-amber-400 text-black text-xs font-mono font-bold hover:opacity-90 cursor-pointer items-center gap-1.5">
                                    📖 Ler
                                </button>
                            @endif

                            @if(!$isManga)
                                <button type="button"
                                        onclick="window.openOfficialTrailerModal('{{ addslashes($title) }}')"
                                        title="Trailer Oficial"
                                        class="px-2.5 py-1.5 rounded-xl bg-theme-pill border border-theme-default text-xs font-mono text-theme-muted hover:text-white cursor-pointer">
                                    🎬
                                </button>
                            @endif

                            <button type="button"
                                    data-bookmark-btn
                                    data-entity-id="{{ $targetEntityId }}"
                                    data-bookmarked="{{ !empty($isBookmarked) ? '1' : '0' }}"
                                    onclick="window.toggleUserBookmark?.('{{ $targetEntityId }}', '{{ $targetEntityType }}', this)"
                                    title="Favoritar"
                                    class="px-2.5 py-1.5 rounded-xl bg-theme-pill border border-theme-default text-xs font-mono {{ !empty($isBookmarked) ? 'text-theme-accent border-theme-accent' : 'text-theme-muted hover:text-white' }} cursor-pointer">
                                <span data-bookmark-icon>{{ !empty($isBookmarked) ? '♥' : '♡' }}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Episódios integrados no mesmo espaço -->
                    <div class="flex-1 min-h-0 flex flex-col gap-2 pt-3 border-t border-white/10">
                        <div class="flex items-center justify-between shrink-0">
                            <span class="text-[11px] font-mono font-bold uppercase tracking-wider text-theme-muted">
                                {{ $totalEpisodes }} {{ $isManga ? 'capítulos' : 'episódios' }}
                            </span>
                            @if(count($displayEpisodes) > 3)
                                <div class="flex items-center gap-1">
                                    <button type="button" onclick="window.scrollEntityRail('work-episodes-rail', -1)" class="w-6 h-6 rounded-lg bg-theme-pill border border-theme-default text-theme-muted hover:text-white text-xs cursor-pointer">‹</button>
                                    <button type="button" onclick="window.scrollEntityRail('work-episodes-rail', 1)" class="w-6 h-6 rounded-lg bg-theme-pill border border-theme-default text-theme-muted hover:text-white text-xs cursor-pointer">›</button>
                                </div>
                            @endif
                        </div>

                        @if(count($displayEpisodes) > 0)
                            <div id="work-episodes-rail" data-draggable-rail="true" class="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-1">
                                <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                                    @foreach($displayEpisodes as $ep)
                                        @php
                                            $num = (int) ($ep->number ?? 1);
                                            $epTargetId = !empty($ep->id) ? (string) $ep->id : (($work->id ?? 'work') . ':ep:' . $num);
                                            $epLabel = ($isManga ? 'Capítulo ' : 'Episódio ') . $num;
                                            $epThumb = $ep->image_url ?? $image;
                                            $epProg = $episodeProgressMap[$num] ?? ['status' => 'none', 'percent' => 0];
                                        @endphp
                                        <div class="rounded-xl bg-black/50 border border-white/10 hover:border-theme-accent transition-all overflow-hidden flex flex-col group cursor-pointer"
                                             title="{{ !empty($ep->title) ? $ep->title : $epLabel }}"
                                             onclick="window.pushNavigation('episode', '{{ $epTargetId }}', '{{ addslashes($title . ' • ' . $epLabel) }}')">
                                            <div class="relative aspect-video w-full bg-black overflow-hidden">
                                                <img src="{{ $epThumb }}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src='/assets/icons/actions/search.png'">
                                                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/25"></div>

                                                <span class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono font-bold text-white">
                                                    {{ $isManga ? 'CAP' : 'EP' }} {{ $num }}
                                                </span>

                                                @if(($epProg['status'] ?? 'none') !== 'none')
                                                    <div class="absolute top-1.5 right-1.5">
                                                        <x-shell.watch-badge :status="$epProg['status']" :percent="$epProg['percent'] ?? 0" complete-label="Assistido" partial-label="Parcial" />
                                                    </div>
                                                @endif

                                                @if(($epProg['status'] ?? 'none') === 'partial' && ($epProg['percent'] ?? 0) > 0)
                                                    <div class="absolute bottom-0 inset-x-0 h-1 bg-black/60"><div class="h-full bg-amber-400" style="width: {{ min(100, (int) $epProg['percent']) }}%"></div></div>
                                                @elseif(($epProg['status'] ?? 'none') === 'completed')
                                                    <div class="absolute bottom-0 inset-x-0 h-1 bg-emerald-400"></div>
                                                @endif
                                            </div>

                                            <div class="px-2.5 py-2 flex items-center justify-between gap-1.5">
                                                <span class="text-[11px] font-bold text-theme-primary truncate group-hover:text-theme-accent">
                                                    {{ !empty($ep->title) ? $ep->title : $epLabel }}
                                                </span>
                                                @if(!$isManga)
                                                    <button type="button"
                                                            data-requires-addon-capability="video"
                                                            title="Tocar {{ $epLabel }}"
                                                            onclick="event.stopPropagation(); window.launchExternalVideoAddon('{{ $work->id ?? '' }}', '{{ $epTargetId }}', '{{ $num }}', '{{ addslashes($title) }}')"
                                                            class="hidden px-2 py-0.5 rounded-md bg-theme-accent text-theme-inverse text-[10px] font-mono font-bold hover:opacity-90 cursor-pointer shrink-0">
                                                        ▶
                                                    </button>
                                                @endif
                                            </div>
                                        </div>
                                    @endforeach
                                </div>
                            </div>
                        @else
                            <div class="p-6 rounded-xl bg-black/30 border border-white/10 text-center text-xs font-mono text-theme-muted">
                                Em breve
                            </div>
                        @endif
                    </div>
                </div>
            </section>
        </main>

        <!-- COLUNA DIREITA (LOBBY): DISCUSSÃO DA OBRA FIXA NA TELA -->
        <aside class="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col min-h-[260px] lg:min-h-0">
            <x-shell.entity-discussion
                :target-type="$targetEntityType"
                :target-id="$targetEntityId"
            />
        </aside>
    </div>
</div>

<script>
if (window.syncAddonCapabilityButtons) {
    window.syncAddonCapabilityButtons();
}
if (window.refreshEntityComments) {
    window.refreshEntityComments('{{ $targetEntityType }}', '{{ $targetEntityId }}');
}
</script>
