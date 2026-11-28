@if($user && ((int) ($user->tier ?? 1) >= 2 || strtolower((string) $user->email) === 'santoss.cog@gmail.com'))
{{-- PALCO 4: VIEW HISTÓRICO (Exclusivo Anirium+) --}}
<section id="view-history" class="view-stage hidden h-full flex flex-col gap-3 p-4 overflow-y-auto">
    <div class="p-4 rounded-3xl border border-theme-default bg-theme-card backdrop-blur-xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 flex-none">
        <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-2xl border border-theme-accent/30 bg-[#0E1118] text-theme-accent backdrop-blur-md">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div>
                <div class="flex items-center gap-2">
                    <h1 class="text-base font-bold text-white tracking-tight">Histórico</h1>
                    <span class="px-2 py-0.5 rounded-full border border-theme-accent/30 bg-[#0E1118] text-[10px] font-bold text-theme-accent">LIVE</span>
                </div>
                <p class="text-xs text-theme-muted">Último episódio visto de cada obra — sincronizado em tempo real.</p>
            </div>
        </div>
    </div>

    <div id="history-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 flex-1 content-start">
        <p class="text-xs text-theme-muted col-span-full px-2">Carregando histórico...</p>
    </div>
</section>

{{-- PALCO 5: VIEW LANÇAMENTOS 5H + BUSCA @HANDLE (Exclusivo Anirium+) --}}
<section id="view-launches" class="view-stage hidden h-full flex flex-col gap-3 p-4 overflow-y-auto">
    {{-- Header Oficial: Lançamentos + Busca por @handle integrada --}}
    <div class="p-4 rounded-3xl border border-theme-default bg-theme-card backdrop-blur-xl shadow-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 flex-none">
        <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-2xl border border-theme-accent/30 bg-[#0E1118] text-theme-accent backdrop-blur-md">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <div>
                <div class="flex items-center gap-2">
                    <h1 class="text-base font-bold text-white tracking-tight">Lançamentos (Próximas 5h)</h1>
                    <span class="px-2.5 py-0.5 rounded-full border border-theme-accent/30 bg-[#0E1118] text-[10px] font-bold text-theme-accent">ANIRIUM LIVE</span>
                </div>
                <p class="text-xs text-theme-muted">Seu handle: <span class="font-mono text-white">{{ '@' . ($user->handle ?: explode('@', (string) $user->email)[0]) }}</span> • Entrada liberada nos 5 min de loading.</p>
            </div>
        </div>

        <form id="launches-handle-form" class="flex items-center gap-2">
            <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-theme-default bg-theme-pill text-xs focus-within:border-theme-highlight transition-all flex-1 sm:w-64">
                <span class="text-theme-accent font-bold">@</span>
                <input id="launches-handle-input"
                       type="text"
                       placeholder="Entrar na sala de um amigo..."
                       class="bg-transparent border-none outline-none w-full text-xs text-white placeholder-slate-500 font-medium">
            </div>
            <button type="submit" class="px-4 py-2 rounded-full bg-theme-accent text-theme-inverse text-xs font-bold shadow-md hover:opacity-90 transition cursor-pointer shrink-0">
                Entrar
            </button>
        </form>
    </div>

    <div id="launches-handle-result" class="hidden p-4 rounded-3xl border border-theme-highlight/40 bg-theme-card backdrop-blur-xl shadow-lg text-xs space-y-2 flex-none"></div>

    <div id="launches-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 flex-1 content-start">
        <p class="text-xs text-theme-muted col-span-full px-2">Carregando lançamentos...</p>
    </div>
</section>

<script>
(() => {
    let launchCountdownTimer = null;

    function fmtCountdown(sec) {
        const s = Math.max(0, Math.floor(sec));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    }

    window.openContinueEpisode = (episodeId, label = 'Episódio') => {
        if (!episodeId) return;
        if (typeof window.pushNavigation === 'function') {
            window.pushNavigation('episode', episodeId, label);
            return;
        }
        window.location.href = `/view/episode/${encodeURIComponent(episodeId)}`;
    };

    window.renderHistoryTab = async () => {
        const grid = document.getElementById('history-grid');
        if (!grid) return;
        grid.innerHTML = '<p class="text-xs text-theme-muted col-span-full px-2">Carregando histórico...</p>';
        try {
            const res = await fetch('/api/watch-party/history', { headers: { Accept: 'application/json' } });
            const data = await res.json();
            const items = Array.isArray(data.items) ? data.items : [];
            if (items.length === 0) {
                grid.innerHTML = '<div class="col-span-full p-6 rounded-3xl border border-theme-default bg-theme-card text-center text-xs text-theme-muted">Nenhum episódio assistido recentemente.</div>';
                return;
            }
            grid.innerHTML = items.map(item => {
                const pct = item.durationSeconds > 0 ? Math.min(100, Math.round((item.positionSeconds / item.durationSeconds) * 100)) : (item.isWatched ? 100 : 0);
                const bg = item.image
                    ? `<img src="${item.image}" alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy">`
                    : `<div class="absolute inset-0 bg-theme-pill"></div>`;
                const actionHtml = item.continueTarget
                    ? `<button type="button" onclick="window.openContinueEpisode('${item.continueTarget.episodeId}')" class="w-full py-1.5 rounded-full bg-theme-accent text-theme-inverse text-[11px] font-bold shadow-md hover:opacity-90 transition cursor-pointer">${item.continueTarget.label}</button>`
                    : `<span class="inline-flex items-center justify-center w-full py-1 rounded-full border border-theme-accent/40 bg-black/60 text-[11px] font-semibold text-theme-accent">Em dia</span>`;
                return `
                    <div class="group relative aspect-[2/3] rounded-3xl overflow-hidden border border-theme-default bg-theme-card shadow-lg flex flex-col justify-end">
                        ${bg}
                        <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>
                        <div class="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-bold text-theme-accent">
                            EP ${item.episodeNumber}
                        </div>
                        <div class="relative z-10 p-3 space-y-2">
                            <h3 class="text-xs font-bold text-white line-clamp-2 leading-tight">${item.workTitle || 'Obra'}</h3>
                            <div class="h-1 w-full rounded-full bg-white/15 overflow-hidden">
                                <div class="h-full bg-theme-accent transition-all duration-300" data-progress-work="${item.workId}" style="width:${pct}%"></div>
                            </div>
                            ${actionHtml}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (_) {
            grid.innerHTML = '<p class="text-xs text-red-400 col-span-full px-2">Não foi possível carregar o histórico.</p>';
        }
    };

    window.enterAutoLiveLaunch = async (item) => {
        if (item.code) {
            window.location.href = `/?party=${encodeURIComponent(item.code)}`;
            return;
        }
        try {
            const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
            const xsrf = match ? decodeURIComponent(match[1]) : '';
            const res = await fetch('/api/watch-party/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}) },
                body: JSON.stringify({
                    mode: 'live_launch',
                    workId: item.workId,
                    episodeId: item.episodeId || null,
                    episodeNumber: item.episodeNumber || 1,
                    launchAt: item.launchAt,
                    isPublic: true,
                }),
            });
            const data = await res.json();
            if (res.ok && data.code) {
                window.location.href = `/?party=${encodeURIComponent(data.code)}`;
            }
        } catch (_) {}
    };

    window.renderLaunchesTab = async () => {
        const grid = document.getElementById('launches-grid');
        if (!grid) return;
        if (launchCountdownTimer) {
            clearInterval(launchCountdownTimer);
            launchCountdownTimer = null;
        }
        try {
            const res = await fetch('/api/watch-party/live-schedule', { headers: { Accept: 'application/json' } });
            const data = await res.json();
            const lives = Array.isArray(data.lives) ? data.lives : [];
            if (lives.length === 0) {
                grid.innerHTML = '<div class="col-span-full p-6 rounded-3xl border border-theme-default bg-theme-card text-center text-xs text-theme-muted">Nenhum lançamento agendado nas próximas 5 horas.</div>';
                return;
            }
            const loadedAt = Date.now();
            const renderCards = () => {
                const elapsed = Math.floor((Date.now() - loadedAt) / 1000);
                grid.innerHTML = lives.map(item => {
                    const rem = Math.max(0, (item.secondsUntilOpen || 0) - elapsed);
                    const canEnter = item.canEnterRoom || rem === 0;
                    const badge = item.liveLocked
                        ? '<span class="px-2.5 py-0.5 rounded-full bg-red-600 text-[10px] font-bold text-white">AO VIVO</span>'
                        : (canEnter
                            ? '<span class="px-2.5 py-0.5 rounded-full border border-theme-accent/40 bg-[#0E1118] text-[10px] font-bold text-theme-accent">LOADING 5M</span>'
                            : `<span class="px-2.5 py-0.5 rounded-full border border-theme-default bg-theme-pill text-[10px] font-mono text-white">${fmtCountdown(rem)}</span>`);
                    const btn = canEnter
                        ? `<button type="button" onclick="window.enterAutoLiveLaunch?.(${JSON.stringify(item).replace(/"/g, '&quot;')})" class="w-full py-2 rounded-full bg-theme-accent text-theme-inverse text-xs font-bold shadow-md hover:opacity-90 transition cursor-pointer">Entrar na Sala</button>`
                        : `<button type="button" disabled class="w-full py-2 rounded-full border border-theme-default bg-theme-pill text-xs font-semibold text-theme-muted cursor-not-allowed">Libera em ${fmtCountdown(rem)}</button>`;
                    const bg = item.image
                        ? `<img src="${item.image}" alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy">`
                        : `<div class="absolute inset-0 bg-theme-pill"></div>`;
                    return `
                        <div class="group relative aspect-[2/3] rounded-3xl overflow-hidden border border-theme-default bg-theme-card shadow-lg flex flex-col justify-end">
                            ${bg}
                            <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>
                            <div class="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1">
                                <span class="px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-theme-accent">EP ${item.episodeNumber ?? '?'}</span>
                                ${badge}
                            </div>
                            <div class="relative z-10 p-3 space-y-2">
                                <h3 class="text-xs font-bold text-white line-clamp-2 leading-tight">${item.workTitle || 'Lançamento'}</h3>
                                ${btn}
                            </div>
                        </div>
                    `;
                }).join('');
            };
            renderCards();
            launchCountdownTimer = setInterval(renderCards, 1000);
        } catch (_) {
            grid.innerHTML = '<p class="text-xs text-red-400 col-span-full px-2">Não foi possível carregar os lançamentos.</p>';
        }
    };

    // Progresso em tempo real em todas as telas + card "Último EP visto" na Home
    const PROGRESS_KEY = 'anirium_live_progress_v1';
    window.aniriumLiveProgress = (() => {
        try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') || {}; } catch (_) { return {}; }
    })();

    function renderHomeLastWatched(latest) {
        const homeView = document.getElementById('view-home');
        if (!homeView || !latest || !latest.workId) return;
        let strip = document.getElementById('home-last-watched-strip');
        if (!strip) {
            strip = document.createElement('div');
            strip.id = 'home-last-watched-strip';
            strip.className = 'px-4 pt-3 flex-none';
            homeView.prepend(strip);
        }
        const pct = latest.durationSeconds > 0
            ? Math.min(100, Math.round((latest.positionSeconds / latest.durationSeconds) * 100))
            : (latest.isWatched ? 100 : 0);
        const epTarget = latest.continueTarget?.episodeId || latest.episodeId;
        const btnLabel = latest.continueTarget?.label || (latest.isWatched ? 'Em dia' : `Continuar Ep ${latest.episodeNumber}`);
        strip.innerHTML = `
            <div class="p-3.5 rounded-3xl border border-theme-default bg-theme-card backdrop-blur-xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div class="space-y-1 flex-1 min-w-0">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-theme-accent">Último EP visto</span>
                    <p class="text-sm font-bold text-white truncate">${latest.title || latest.workTitle || 'Obra'} — Ep ${latest.episodeNumber}</p>
                    <div class="h-1.5 w-full max-w-md rounded-full bg-theme-pill overflow-hidden">
                        <div class="h-full bg-theme-accent transition-all duration-300" style="width:${pct}%"></div>
                    </div>
                </div>
                ${epTarget && (!latest.isWatched || latest.continueTarget) ? `<button type="button" onclick="window.openContinueEpisode('${epTarget}')" class="shrink-0 px-4 py-2 rounded-full bg-theme-accent text-theme-inverse text-xs font-bold shadow-md hover:opacity-90 transition cursor-pointer">${btnLabel}</button>` : `<span class="shrink-0 px-3 py-1.5 rounded-full border border-theme-default bg-theme-pill text-xs font-semibold text-theme-accent">Em dia</span>`}
            </div>
        `;
    }

    function applyLiveProgressToAllScreens(payload) {
        if (!payload || !payload.workId) return;
        window.aniriumLiveProgress[payload.workId] = payload;
        try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(window.aniriumLiveProgress)); } catch (_) {}

        renderHomeLastWatched(payload);

        const pct = payload.durationSeconds > 0
            ? Math.min(100, Math.round((payload.positionSeconds / payload.durationSeconds) * 100))
            : (payload.isWatched ? 100 : 0);
        document.querySelectorAll(`[data-progress-work="${payload.workId}"]`).forEach(el => {
            el.style.width = `${pct}%`;
        });
    }

    window.addEventListener('message', (event) => {
        const d = event.data;
        if (d && d.type === 'ANIRIUM_EPISODE_PROGRESS') {
            applyLiveProgressToAllScreens(d);
        }
    });

    window.addEventListener('anirium:sse:progress.updated', (event) => {
        if (event?.detail) {
            applyLiveProgressToAllScreens(event.detail);
        }
    });

    const savedList = Object.values(window.aniriumLiveProgress).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    if (savedList.length > 0) {
        renderHomeLastWatched(savedList[0]);
    } else {
        fetch('/api/watch-party/history', { headers: { Accept: 'application/json' } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d && Array.isArray(d.items) && d.items.length > 0) renderHomeLastWatched(d.items[0]); })
            .catch(() => {});
    }

    document.getElementById('launches-handle-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const raw = (document.getElementById('launches-handle-input')?.value || '').trim();
        const box = document.getElementById('launches-handle-result');
        if (!raw || !box) return;
        box.classList.remove('hidden');
        box.innerHTML = '<p class="text-xs text-theme-muted">Verificando sala...</p>';
        try {
            const res = await fetch(`/api/watch-party/by-handle/${encodeURIComponent(raw)}`, { headers: { Accept: 'application/json' } });
            const data = await res.json();
            if (!res.ok || !data.active) {
                box.innerHTML = `<p class="text-xs text-theme-muted">Nenhuma sala ativa encontrada para <strong class="text-white">@${raw.replace(/^@/, '')}</strong>.</p>`;
                return;
            }
            const passInput = data.hasPassword
                ? '<input id="launches-room-password" type="password" placeholder="Senha da sala" class="w-full rounded-full border border-theme-default bg-theme-pill px-4 py-2 text-xs text-white outline-none">'
                : '';
            box.innerHTML = `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <p class="text-sm font-bold text-white">Sala ativa de @${data.handle}</p>
                        <p class="text-xs text-theme-muted">Ep ${data.episodeNumber ?? '?'} • ${data.membersCount} na sala ${data.hasPassword ? '• 🔒 Com senha' : '• Aberta'}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        ${passInput}
                        <button type="button" id="launches-enter-btn" class="px-4 py-2 rounded-full bg-theme-accent text-theme-inverse text-xs font-bold shadow-md hover:opacity-90 transition cursor-pointer shrink-0">Entrar na Sala</button>
                    </div>
                </div>
            `;
            document.getElementById('launches-enter-btn')?.addEventListener('click', () => {
                const pwd = document.getElementById('launches-room-password')?.value || '';
                window.location.href = `/?party=${encodeURIComponent(data.code)}` + (pwd ? `&partyPass=${encodeURIComponent(pwd)}` : '');
            });
        } catch (_) {
            box.innerHTML = '<p class="text-xs text-red-400">Erro ao consultar sala.</p>';
        }
    });
})();
</script>
@endif
