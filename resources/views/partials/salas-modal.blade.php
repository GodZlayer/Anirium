@if($user && ((int) ($user->tier ?? 1) >= 2 || strtolower((string) $user->email) === 'santoss.cog@gmail.com'))
<div id="anirium-salas-modal"
     class="hidden fixed inset-0 z-[9995] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
     role="dialog"
     aria-modal="true"
     aria-labelledby="anirium-salas-title">
    <div class="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0f0f14] text-zinc-100 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div>
                <h2 id="anirium-salas-title" class="text-lg font-bold text-white flex items-center gap-2">
                    <span>👥 Salas &amp; Lives Públicas</span>
                    <span class="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-violet-300">Anirium+</span>
                </h2>
                <p class="text-xs text-zinc-400">Seu handle: <span id="salas-my-handle" class="font-mono text-zinc-200">{{ '@' . ($user->handle ?: explode('@', (string) $user->email)[0]) }}</span></p>
            </div>
            <button type="button" onclick="window.closeSalasModal?.()" class="text-zinc-400 hover:text-white text-xl px-2">✕</button>
        </div>

        <div class="p-6 space-y-6 overflow-y-auto">
            {{-- Buscar sala de amigo por @handle --}}
            <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <h3 class="text-sm font-semibold text-white">Entrar na sala de um amigo</h3>
                <form id="salas-handle-form" class="flex flex-col sm:flex-row gap-2">
                    <input id="salas-handle-input"
                           type="text"
                           placeholder="Digite o @handle (ex: @santoss.cog)"
                           class="flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500">
                    <button type="submit" class="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition">
                        Verificar sala
                    </button>
                </form>
                <div id="salas-handle-result" class="hidden rounded-xl border border-white/10 bg-black/30 p-3.5 text-sm space-y-2"></div>
            </div>

            {{-- Próximos Lançamentos - Live Pública (Anirium) --}}
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-semibold text-white">Lives Públicas de Lançamento (Anirium Live)</h3>
                    <button type="button" onclick="window.refreshSalasLiveSchedule?.()" class="text-xs text-violet-400 hover:text-violet-300">Atualizar</button>
                </div>
                <div id="salas-live-list" class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <p class="text-zinc-400 text-xs col-span-full">Carregando agenda de lives...</p>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
(() => {
    const modal = document.getElementById('anirium-salas-modal');
    const resultBox = document.getElementById('salas-handle-result');
    const liveList = document.getElementById('salas-live-list');

    window.openSalasModal = () => {
        if (!modal) return;
        modal.classList.remove('hidden');
        window.refreshSalasLiveSchedule?.();
    };
    window.closeSalasModal = () => {
        modal?.classList.add('hidden');
    };

    window.refreshSalasLiveSchedule = async () => {
        if (!liveList) return;
        try {
            const res = await fetch('/api/watch-party/live-schedule', { headers: { Accept: 'application/json' } });
            const data = await res.json();
            const lives = Array.isArray(data.lives) ? data.lives : [];
            if (lives.length === 0) {
                liveList.innerHTML = '<p class="text-zinc-400 text-xs col-span-full">Nenhuma Live Pública ativa no momento. As salas abrem automaticamente nos lançamentos.</p>';
                return;
            }
            liveList.innerHTML = lives.map(item => `
                <div class="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 flex flex-col justify-between gap-2">
                    <div>
                        <div class="flex items-center justify-between gap-2">
                            <span class="font-semibold text-white truncate">${item.workTitle || 'Lançamento'}</span>
                            ${item.liveLocked ? '<span class="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">AO VIVO</span>' : '<span class="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">EM BREVE</span>'}
                        </div>
                        <p class="text-xs text-zinc-400 mt-1">Ep ${item.episodeNumber ?? '?'} • ${item.membersCount} assistindo • ${item.controlledBy}</p>
                    </div>
                    <button type="button" onclick="window.closeSalasModal?.(); window.AniriumWatchParty?.openRoom('${item.code}')" class="w-full rounded-lg bg-red-600/90 hover:bg-red-500 py-1.5 text-xs font-semibold text-white transition">
                        Entrar na Live
                    </button>
                </div>
            `).join('');
        } catch (_) {
            liveList.innerHTML = '<p class="text-red-300 text-xs col-span-full">Não foi possível carregar as lives agora.</p>';
        }
    };

    document.getElementById('salas-handle-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const raw = (document.getElementById('salas-handle-input')?.value || '').trim();
        if (!raw || !resultBox) return;
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = '<p class="text-xs text-zinc-400">Verificando sala...</p>';
        try {
            const res = await fetch(`/api/watch-party/by-handle/${encodeURIComponent(raw)}`, { headers: { Accept: 'application/json' } });
            const data = await res.json();
            if (!res.ok || !data.active) {
                resultBox.innerHTML = `<p class="text-xs text-zinc-300">Nenhuma sala ativa encontrada para <strong>${raw}</strong>.</p>`;
                return;
            }
            const passInput = data.hasPassword
                ? '<input id="salas-room-password" type="password" placeholder="Senha da sala" class="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white">'
                : '';
            resultBox.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <div>
                        <p class="font-semibold text-white">Sala ativa de @${data.handle}</p>
                        <p class="text-xs text-zinc-400">Ep ${data.episodeNumber ?? '?'} • ${data.membersCount} na sala ${data.hasPassword ? '• 🔒 Com senha' : '• Aberta'}</p>
                    </div>
                </div>
                ${passInput}
                <button type="button" id="salas-enter-btn" class="w-full rounded-lg bg-violet-600 hover:bg-violet-500 py-2 text-xs font-semibold text-white">
                    Entrar na Sala
                </button>
            `;
            document.getElementById('salas-enter-btn')?.addEventListener('click', () => {
                const pwd = document.getElementById('salas-room-password')?.value || '';
                window.closeSalasModal?.();
                if (window.AniriumWatchParty?.openRoom) {
                    window.AniriumWatchParty.openRoom(data.code, pwd);
                } else {
                    const url = `/?party=${encodeURIComponent(data.code)}` + (pwd ? `&partyPass=${encodeURIComponent(pwd)}` : '');
                    window.location.href = url;
                }
            });
        } catch (_) {
            resultBox.innerHTML = '<p class="text-xs text-red-300">Erro ao consultar sala.</p>';
        }
    });
})();
</script>
@endif
