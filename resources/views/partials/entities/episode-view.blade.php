@props([
    'work',
    'universe' => null,
    'currentArc' => null,
    'currentEpisode',
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
    'episodeProgress' => ['status' => 'none', 'percent' => 0, 'progress_seconds' => 0],
    'isAniriumPlus' => false,
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
    'isWatched' => false,
])

@php
    $workTitle = $work->title ?? 'Obra';
    $media = strtolower($work->media ?? 'anime');
    $format = strtoupper($work->format ?? ($media === 'manga' ? 'MANGA' : 'TV'));
    $isManga = $media === 'manga' || in_array($format, ['MANGA', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'DOUJINSHI', 'NOVEL', 'LIGHT_NOVEL', 'OEL'], true);
    $status = strtoupper($work->status ?? 'COMPLETED');
    $image = $currentEpisode->image_url ?? ($work->image_url ?? '/assets/icons/actions/search.png');
    $epNum = (int) ($currentEpisode->number ?? 1);
    $unitLabel = $isManga ? 'Capítulo' : 'Episódio';
    $unitShort = $isManga ? 'Cap.' : 'Ep.';
    $episodeTitle = !empty($currentEpisode->title) ? $currentEpisode->title : ($unitLabel . ' ' . $epNum);

    $scheduleMaxEp = (int) ($work->latest_episode_num ?? 0);
    $epAirTs = !empty($currentEpisode->air_date_utc) ? strtotime($currentEpisode->air_date_utc) : 0;
    if ($scheduleMaxEp > 0 && $epNum <= $scheduleMaxEp && $epAirTs > time()) {
        $epAirTs = 0;
    }
    $isEpUnreleased = ($epAirTs > 0 && $epAirTs > time())
        || in_array($status, ['NOT_YET_RELEASED', 'NOT_YET_AIRED', 'UPCOMING', 'UNRELEASED'], true)
        || ($status === 'RELEASING' && $scheduleMaxEp > 0 && $epNum > $scheduleMaxEp && $epAirTs <= 0);
    $airDateFormatted = $epAirTs > 0 ? date('d/m/Y', $epAirTs) : null;

    $totalEpisodes = max(count($episodes), (int) ($work->episode_count ?? 0), $epNum, 1);
    $malId = collect($externalIds)->firstWhere('provider', 'mal')->external_id ?? null;
    $imdbId = collect($externalIds)->firstWhere('provider', 'imdb')->external_id ?? null;
    $anilistId = collect($externalIds)->firstWhere('provider', 'anilist')->external_id ?? null;
    $epTargetId = !empty($currentEpisode->id) ? (string) $currentEpisode->id : (($work->id ?? 'work') . ':ep:' . $epNum);

    $nowTs = time();
    $hasFutureEpisodes = false;
    $displayEpisodes = collect($episodes)->filter(function ($ep) use ($nowTs, &$hasFutureEpisodes) {
        if (!empty($ep->air_date_utc)) {
            $ts = strtotime($ep->air_date_utc);
            if ($ts > 0 && $ts > $nowTs) {
                $hasFutureEpisodes = true;
                return false;
            }
        }
        return true;
    })->values();

    $knownMaxEp = (int) ($displayEpisodes->max('number') ?? 0);
    $isOngoingOrFuture = $hasFutureEpisodes || in_array($status, ['RELEASING', 'AIRING', 'CURRENT', 'CURRENTLY_AIRING', 'NOT_YET_RELEASED', 'NOT_YET_AIRED', 'UPCOMING', 'UNRELEASED'], true);
    $targetMaxEp = $isOngoingOrFuture
        ? max($knownMaxEp, $scheduleMaxEp, $epNum)
        : max($knownMaxEp, $totalEpisodes, $epNum);
    if ($displayEpisodes->count() < $targetMaxEp) {
        $maxVirtual = min($targetMaxEp, 500);
        $vList = $displayEpisodes->all();
        $existingNums = $displayEpisodes->pluck('number')->flip()->all();
        for ($i = 1; $i <= $maxVirtual; $i++) {
            if (! isset($existingNums[$i])) {
                $vList[] = (object) [
                    'id' => ($work->id ?? 'work') . ':ep:' . $i,
                    'work_id' => $work->id ?? '',
                    'number' => $i,
                    'air_date_utc' => null,
                    'is_virtual' => true,
                ];
            }
        }
        $displayEpisodes = collect($vList)->sortBy('number')->values();
    }

    $prevEp = $displayEpisodes->firstWhere('number', $epNum - 1);
    $nextEp = $displayEpisodes->firstWhere('number', $epNum + 1);
    $epStatus = $isWatched ? 'completed' : ($episodeProgress['status'] ?? 'none');
    $epPercent = $isWatched ? 100 : (int) ($episodeProgress['percent'] ?? 0);
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary"
     id="work-context-stage"
     data-work-id="{{ $work->id ?? '' }}"
     data-work-title="{{ $workTitle }}"
     data-work-english-title="{{ $englishTitle ?? '' }}"
     data-work-romaji-title="{{ $romajiTitle ?? '' }}"
     data-work-native-title="{{ $nativeTitle ?? '' }}"
     data-work-aliases="{{ json_encode($titleAliases ?? []) }}"
     data-work-media="{{ $isManga ? 'manga' : 'anime' }}"
     data-work-format="{{ $format }}"
     data-episode-count="{{ $displayEpisodes->count() }}"
     data-mal-id="{{ $malId ?? '' }}"
     data-imdb-id="{{ $imdbId ?? '' }}"
     data-anilist-id="{{ $anilistId ?? '' }}"
     data-episode-id="{{ $epTargetId }}"
     data-episode-number="{{ $epNum }}">

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
                <button type="button" onclick="window.pushNavigation('work', '{{ $work->id }}', '{{ addslashes($workTitle) }}')" class="hover:text-theme-accent truncate max-w-[160px] cursor-pointer">{{ $workTitle }}</button>
                <span class="opacity-40">❯</span>
                <span class="text-theme-accent font-bold shrink-0">{{ $unitShort }} {{ $epNum }}</span>
            </nav>
        </div>

        <div class="flex items-center gap-1.5 shrink-0 relative">
            @if($prevEp)
                <button type="button" onclick="window.pushNavigation('episode', '{{ $prevEp->id }}', '{{ addslashes($workTitle . ' • ' . $unitLabel . ' ' . $prevEp->number) }}')"
                        class="px-2 py-1 rounded-lg bg-theme-pill border border-theme-default text-[11px] font-mono text-theme-muted hover:text-white cursor-pointer">
                    ‹ {{ $prevEp->number }}
                </button>
            @endif
            @if($nextEp)
                <button type="button" onclick="window.pushNavigation('episode', '{{ $nextEp->id }}', '{{ addslashes($workTitle . ' • ' . $unitLabel . ' ' . $nextEp->number) }}')"
                        class="px-2 py-1 rounded-lg bg-theme-pill border border-theme-default text-[11px] font-mono text-theme-muted hover:text-white cursor-pointer">
                    {{ $nextEp->number }} ›
                </button>
            @endif
            @if($isAniriumPlus && !$isManga && !empty($currentEpisode->id))
                <button type="button"
                        title="Criar Watch Party sincronizada via rede torrent P2P"
                        onclick="window.AniriumWatchParty?.createRoom('{{ $currentEpisode->id }}')"
                        class="px-2.5 py-1 rounded-lg bg-violet-600/90 hover:bg-violet-500 border border-violet-400/30 text-[11px] font-semibold text-white cursor-pointer flex items-center gap-1">
                    <span>👥</span><span class="hidden sm:inline">Watch Party</span>
                </button>
            @endif

            <!-- INFO SOB DEMANDA (ARCO, OP/ED, EQUIPE) -->
            <button type="button"
                    title="Arco, OP/ED e equipe"
                    onclick="document.getElementById('ep-info-popover')?.classList.toggle('hidden')"
                    class="w-7 h-7 rounded-lg bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-muted hover:text-white text-xs font-mono font-bold flex items-center justify-center cursor-pointer">
                ⓘ
            </button>

            <div id="ep-info-popover" class="hidden absolute right-0 top-9 w-72 max-h-[65vh] overflow-y-auto rounded-2xl bg-theme-card border border-theme-default shadow-2xl p-3.5 z-50 space-y-2.5 text-left">
                @if($airDateFormatted)
                    <div class="text-[10px] font-mono text-theme-muted">Lançamento: <strong class="text-theme-primary">{{ $airDateFormatted }}</strong></div>
                @endif
                @if($currentArc)
                    <button type="button" onclick="window.pushNavigation('arc', '{{ $currentArc->id }}', '{{ addslashes($currentArc->title) }}')" class="w-full text-left px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-mono text-emerald-300 cursor-pointer">
                        Arco: {{ $currentArc->title }}
                    </button>
                @endif
                @if(count($tracks) > 0)
                    <div class="space-y-1 pt-1 border-t border-theme-default/60">
                        <div class="text-[10px] font-mono uppercase text-theme-muted">OP / ED</div>
                        @foreach(collect($tracks)->take(4) as $tr)
                            <button type="button" onclick="window.pushNavigation('track', '{{ $tr->id }}', '{{ addslashes($tr->title ?? 'Música') }}')" class="w-full text-left px-2 py-1 rounded-md bg-theme-raised border border-theme-default text-[10px] truncate hover:border-theme-accent cursor-pointer">{{ $tr->title ?? 'Faixa' }}</button>
                        @endforeach
                    </div>
                @endif
                @if(count($creators) > 0)
                    <div class="space-y-1 pt-1 border-t border-theme-default/60">
                        <div class="text-[10px] font-mono uppercase text-theme-muted">Equipe</div>
                        <div class="flex flex-wrap gap-1">
                            @foreach(collect($creators)->take(4) as $cr)
                                <button type="button" onclick="window.pushNavigation('creator', '{{ $cr->id }}', '{{ addslashes($cr->name) }}')" class="px-2 py-0.5 rounded-md bg-theme-raised border border-theme-default text-[10px] hover:border-theme-accent cursor-pointer">{{ $cr->name }}</button>
                            @endforeach
                        </div>
                    </div>
                @endif
            </div>
        </div>
    </header>

    <!-- LOBBY 100VH FIXO NO DESKTOP: PALCO DO EPISÓDIO/PLAYER À ESQUERDA + DISCUSSÃO À DIREITA -->
    <div class="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-3 p-3 sm:p-4 min-h-0">

        <!-- ESQUERDA: PALCO DO PLAYER / EPISÓDIO + NOTA + SELETOR RÁPIDO -->
        <main class="flex-1 min-w-0 flex flex-col gap-3 lg:overflow-hidden">

            <!-- PALCO VISUAL DO EPISÓDIO (EXIBE O PLAYER INLINE AUTOMATICAMENTE QUANDO A CONTA POSSUI ADD-ON DE VÍDEO) -->
            <section id="episode-inline-player-stage" class="relative flex-1 min-h-[260px] rounded-2xl overflow-hidden border border-theme-default bg-black flex flex-col justify-end p-4 group">
                <img src="{{ $image }}" class="absolute inset-0 w-full h-full object-cover opacity-55 group-hover:scale-105 transition-transform duration-700" onerror="this.src='/assets/icons/actions/search.png'">
                <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/30"></div>

                <!-- Badges superiores (ocultos quando o player inline está ativo) -->
                <div id="episode-stage-badges" class="absolute top-3 left-3 flex items-center gap-2 z-10">
                    <span class="px-2 py-0.5 rounded-md bg-black/80 text-[10px] font-mono font-bold text-white border border-white/10">
                        {{ $unitShort }} {{ $epNum }} / {{ $displayEpisodes->count() }}
                    </span>
                    @if($epStatus !== 'none')
                        <x-shell.watch-badge :status="$epStatus" :percent="$epPercent" complete-label="Assistido" partial-label="Parcial" />
                    @endif
                </div>

                <!-- HOST DO PLAYER INLINE (SUBSTITUI O BACKDROP/PLAY ICON QUANDO HÁ ADD-ON DE VÍDEO NA CONTA) -->
                @if(!$isEpUnreleased && !$isManga)
                    <div id="episode-inline-player-host" class="hidden absolute inset-0 z-20 bg-black"></div>
                @endif
            </section>

            <!-- BARRA DE TÍTULO, NOTA E AÇÕES DO EPISÓDIO (SEMPRE VISÍVEL ABAIXO DO PLAYER) -->
            <div class="shrink-0 flex flex-wrap items-center justify-between gap-2 px-1">
                <h1 class="text-base sm:text-lg font-black font-serif text-white truncate max-w-full" title="{{ $episodeTitle }}">
                    {{ $unitLabel }} {{ $epNum }}@if($episodeTitle !== ($unitLabel . ' ' . $epNum)) — {{ $episodeTitle }}@endif
                </h1>

                <div class="flex flex-wrap items-center gap-2">
                    <x-shell.entity-rating
                        target-type="episode"
                        :target-id="$epTargetId"
                        :user-score="$userScore"
                        compact
                    />

                    @if($isEpUnreleased)
                        <span class="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold">
                            ⏳ Transmissão Futura (Não Lançado)
                        </span>
                    @elseif($isManga)
                        <button type="button"
                                data-requires-addon-capability="manga"
                                onclick="window.launchExternalMangaAddon('{{ $work->id ?? '' }}', '{{ $epNum }}', '{{ addslashes($workTitle) }}')"
                                class="hidden px-3.5 py-1.5 rounded-xl bg-amber-400 text-black text-xs font-mono font-bold items-center gap-1.5 cursor-pointer">
                            📖 Ler {{ $unitShort }} {{ $epNum }}
                        </button>
                    @endif

                    <button type="button"
                            data-bookmark-btn
                            data-entity-id="{{ $epTargetId }}"
                            data-bookmarked="{{ !empty($isBookmarked) ? '1' : '0' }}"
                            onclick="window.toggleUserBookmark?.('{{ $epTargetId }}', 'episode', this)"
                            title="Favoritar"
                            class="px-2.5 py-1.5 rounded-xl bg-theme-pill border border-theme-default text-xs font-mono {{ !empty($isBookmarked) ? 'text-theme-accent border-theme-accent' : 'text-theme-muted hover:text-white' }} cursor-pointer">
                        <span data-bookmark-icon>{{ !empty($isBookmarked) ? '♥' : '♡' }}</span>
                    </button>
                </div>
            </div>

            <!-- SELETOR RÁPIDO DE EPISÓDIOS (FIXO NA BASE) -->
            @if($displayEpisodes->count() > 1)
                <div data-draggable-rail="true" class="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 py-0.5">
                    @foreach($displayEpisodes as $ep)
                        @php
                            $n = (int) ($ep->number ?? 1);
                            $isCurrent = $n === $epNum;
                            $epId = !empty($ep->id) ? (string) $ep->id : (($work->id ?? 'work') . ':ep:' . $n);
                            $pStatus = ($episodeProgressMap[$n]['status'] ?? 'none');
                        @endphp
                        <button type="button"
                                onclick="window.pushNavigation('episode', '{{ $epId }}', '{{ addslashes($workTitle . ' • ' . $unitLabel . ' ' . $n) }}')"
                                class="px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold shrink-0 flex items-center gap-1 cursor-pointer transition-all {{ $isCurrent ? 'bg-theme-accent text-theme-inverse border-theme-accent' : 'bg-theme-card text-theme-muted border-theme-default hover:border-theme-accent hover:text-white' }}">
                            <span>{{ $n }}</span>
                            @if($pStatus === 'completed')
                                <span class="w-1.5 h-1.5 rounded-full {{ $isCurrent ? 'bg-black/60' : 'bg-emerald-400' }}" title="Assistido"></span>
                            @elseif($pStatus === 'partial')
                                <span class="w-1.5 h-1.5 rounded-full {{ $isCurrent ? 'bg-black/60' : 'bg-amber-400' }}" title="Parcial"></span>
                            @endif
                        </button>
                    @endforeach
                </div>
            @endif
        </main>

        <!-- DIREITA (LOBBY): DISCUSSÃO DO EPISÓDIO SEMPRE VISÍVEL -->
        <aside class="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col min-h-[260px] lg:min-h-0">
            <x-shell.entity-discussion
                target-type="episode"
                :target-id="$epTargetId"
            />
        </aside>
    </div>
</div>

<script>
if (window.syncAddonCapabilityButtons) {
    window.syncAddonCapabilityButtons();
}
if (window.refreshEntityComments) {
    window.refreshEntityComments('episode', '{{ $epTargetId }}');
}
@if(!$isEpUnreleased && !$isManga)
if (window.hasActiveAddonCapability && window.hasActiveAddonCapability('video') && window.mountInlineEpisodePlayer) {
    window.mountInlineEpisodePlayer('{{ $work->id ?? '' }}', '{{ $epTargetId }}', '{{ $epNum }}', '{{ addslashes($workTitle) }}');
}
@endif
</script>
