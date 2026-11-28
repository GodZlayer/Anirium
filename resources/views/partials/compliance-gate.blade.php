{{-- Global Cookie Consent (LGPD / GDPR / CCPA) & Extension Blocker Gate --}}
<div id="anirium-cookie-gate"
     style="display:none;position:fixed;inset:0;z-index:99998;align-items:center;justify-content:center;background:rgba(0,0,0,0.78);backdrop-filter:blur(8px);padding:16px;"
     role="dialog"
     aria-modal="true"
     aria-labelledby="anirium-cookie-title">
    <div class="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f0f12] text-zinc-100 shadow-2xl p-6 space-y-4">
        <div class="space-y-1.5">
            <h2 id="anirium-cookie-title" class="text-lg font-semibold tracking-tight text-white">
                Sua privacidade e experiência no Anirium
            </h2>
            <p class="text-sm text-zinc-300 leading-relaxed">
                Usamos cookies e armazenamento local para manter sua sessão segura, sincronizar seu progresso no player e melhorar o desempenho da plataforma. O Anirium <strong class="text-white">não exibe anúncios de terceiros</strong>.
            </p>
        </div>

        <div id="anirium-cookie-prefs" class="hidden rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3 text-sm">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <p class="font-medium text-white">Essenciais e Sessão</p>
                    <p class="text-xs text-zinc-400">Autenticação, segurança, cache local e comunicação com o player.</p>
                </div>
                <span class="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                    Sempre ativo
                </span>
            </div>
            <label class="flex items-start justify-between gap-4 cursor-pointer">
                <div>
                    <p class="font-medium text-white">Desempenho e Diagnóstico</p>
                    <p class="text-xs text-zinc-400">Telemetria técnica de qualidade, legendas e estabilidade da reprodução.</p>
                </div>
                <input id="anirium-pref-performance"
                       type="checkbox"
                       checked
                       class="mt-1 h-4 w-4 rounded border-white/20 bg-zinc-900 accent-violet-500">
            </label>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-end gap-2.5 pt-1">
            <button type="button"
                    id="anirium-cookie-toggle-prefs"
                    class="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-medium text-zinc-300 hover:bg-white/5 transition">
                Preferências
            </button>
            <button type="button"
                    id="anirium-cookie-essential"
                    class="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-white hover:bg-white/10 transition">
                Apenas essenciais
            </button>
            <button type="button"
                    id="anirium-cookie-accept"
                    class="rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 transition">
                Aceitar e continuar
            </button>
        </div>
    </div>
</div>

<div id="anirium-blocker-gate"
     style="display:none;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);backdrop-filter:blur(12px);padding:16px;"
     role="alertdialog"
     aria-modal="true"
     aria-labelledby="anirium-blocker-title">
    <div class="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0f12] text-zinc-100 shadow-2xl p-6 space-y-4 text-center">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
        </div>
        <div class="space-y-2">
            <h2 id="anirium-blocker-title" class="text-lg font-semibold text-white">
                Uma extensão está interferindo no Anirium
            </h2>
            <p class="text-sm text-zinc-300 leading-relaxed">
                Não exibimos anúncios. Porém, identificamos um bloqueador ativo que interfere na comunicação do player, no cache local e na estabilidade da plataforma.
            </p>
            <p class="text-xs text-zinc-400">
                Adicione <span class="font-mono text-zinc-200">{{ request()->getHost() }}</span> à lista de sites permitidos e recarregue para continuar.
            </p>
        </div>
        <button type="button"
                id="anirium-blocker-reload"
                class="w-full rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition">
            Já liberei — Recarregar
        </button>
    </div>
</div>

<script>
(() => {
    const CONSENT_KEY = 'anirium_consent_v1';
    const CONSENT_VERSION = 1;

    function readConsent() {
        try {
            const raw = localStorage.getItem(CONSENT_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.version === CONSENT_VERSION) {
                    return parsed;
                }
            }
        } catch (_) {}
        return null;
    }

    function saveConsent(performance) {
        const consent = {
            version: CONSENT_VERSION,
            essential: true,
            performance: Boolean(performance),
            updatedAt: new Date().toISOString(),
        };
        window.aniriumConsent = consent;
        try {
            localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
        } catch (_) {}
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${CONSENT_KEY}=${encodeURIComponent(JSON.stringify(consent))}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
        window.dispatchEvent(new CustomEvent('anirium:consent-updated', { detail: consent }));
        const modal = document.getElementById('anirium-cookie-gate');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    function initCookieGate() {
        const existing = readConsent();
        if (existing) {
            window.aniriumConsent = existing;
            return;
        }
        const modal = document.getElementById('anirium-cookie-gate');
        const prefsPanel = document.getElementById('anirium-cookie-prefs');
        const toggleBtn = document.getElementById('anirium-cookie-toggle-prefs');
        const essentialBtn = document.getElementById('anirium-cookie-essential');
        const acceptBtn = document.getElementById('anirium-cookie-accept');
        const perfCheckbox = document.getElementById('anirium-pref-performance');

        if (!modal) return;
        modal.style.display = 'flex';

        toggleBtn?.addEventListener('click', () => {
            prefsPanel?.classList.toggle('hidden');
        });
        essentialBtn?.addEventListener('click', () => saveConsent(false));
        acceptBtn?.addEventListener('click', () => {
            const allowPerf = prefsPanel && !prefsPanel.classList.contains('hidden')
                ? Boolean(perfCheckbox?.checked)
                : true;
            saveConsent(allowPerf);
        });
    }

    function showBlockerGate() {
        const gate = document.getElementById('anirium-blocker-gate');
        if (gate) {
            gate.style.display = 'flex';
            document.documentElement.style.overflow = 'hidden';
        }
    }

    function initBlockerDetection() {
        const reloadBtn = document.getElementById('anirium-blocker-reload');
        reloadBtn?.addEventListener('click', () => window.location.reload());

        // 1. DOM bait check
        const bait = document.createElement('div');
        bait.className = 'adsbox ad-banner pub_300x250';
        bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;';
        document.body.appendChild(bait);

        // 2. Local script bait check
        const script = document.createElement('script');
        script.src = '/assets/ad-check.js?_=' + Date.now();
        script.async = true;
        let scriptBlocked = false;
        script.onerror = () => {
            scriptBlocked = true;
            showBlockerGate();
        };
        document.head.appendChild(script);

        // 3. Tracking-blocker check (catches Edge Tracking Prevention / uBlock blocking Cloudflare beacon)
        fetch('https://static.cloudflareinsights.com/beacon.min.js', { mode: 'no-cors', cache: 'no-store' })
            .catch(() => {
                scriptBlocked = true;
                showBlockerGate();
            });

        window.setTimeout(() => {
            const style = window.getComputedStyle(bait);
            const domBlocked = bait.offsetHeight === 0 || style.display === 'none' || style.visibility === 'hidden';
            bait.remove();
            if (scriptBlocked || domBlocked || window.__aniriumClientCheck !== true) {
                showBlockerGate();
            }
        }, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initCookieGate();
            initBlockerDetection();
        });
    } else {
        initCookieGate();
        initBlockerDetection();
    }
})();
</script>
