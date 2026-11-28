@props([
    'user' => null,
    'userPreferences' => [],
])

@php
    $email = strtolower($user->email ?? '');
    $isAdmin = $email === 'santoss.cog@gmail.com' || ($user && (int)$user->tier === 3);
    $isPlus = !$isAdmin && ($user && method_exists($user, 'hasActiveAniriumPlus') ? $user->hasActiveAniriumPlus() : ($user && (int)$user->tier === 2));
    $isMember = !$isAdmin && !$isPlus && (bool)$user;
    $plusExpiresAt = $user?->anirium_plus_expires_at;
    $plusDaysLeft = ($isPlus && $plusExpiresAt) ? max(0, (int) ceil(now()->diffInSeconds($plusExpiresAt, false) / 86400)) : null;
    
    $roleI18n = $isAdmin ? 'profile.role_admin' : ($isPlus ? 'profile.role_plus' : ($isMember ? 'profile.role_member' : 'profile.role_guest'));
    $roleLabel = $isAdmin ? 'Administrador' : ($isPlus ? 'Anirium+' : ($isMember ? 'Membro' : 'Visitante'));
    $roleBadgeClass = $isAdmin ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border-[var(--color-state-filler,#F43F5E)]/40' : ($isPlus ? 'bg-theme-accent/20 text-theme-accent border-theme-accent/40' : 'bg-theme-pill text-theme-muted border-theme-default');

    $ageStatus = $user ? (string) ($user->age_verification_status ?? 'unverified') : 'unverified';
    $isAgeVerified = $user && method_exists($user, 'isAgeVerified') ? $user->isAgeVerified() : false;
    $canAccessAdult = $user && method_exists($user, 'canAccessAdultContent') ? $user->canAccessAdultContent() : false;
    $ageBadgeMap = [
        'verified' => ['label' => 'Verificado (+18)', 'class' => 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'],
        'pending' => ['label' => 'Aguardando Aprovação', 'class' => 'bg-amber-500/15 text-amber-300 border-amber-500/30'],
        'rejected' => ['label' => 'Recusado', 'class' => 'bg-red-500/15 text-red-400 border-red-500/30'],
        'underage' => ['label' => 'Bloqueado (-18)', 'class' => 'bg-red-500/20 text-red-300 border-red-500/40'],
        'unverified' => ['label' => 'Não Verificado', 'class' => 'bg-theme-pill text-theme-muted border-theme-default'],
    ];
    $ageBadge = $ageBadgeMap[$ageStatus] ?? $ageBadgeMap['unverified'];
@endphp

<style>
    .anirium-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 199, 102, 0.35) transparent;
    }
    .anirium-scroll::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }
    .anirium-scroll::-webkit-scrollbar-track {
        background: transparent;
    }
    .anirium-scroll::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.14);
        border-radius: 9999px;
        transition: background 0.2s ease;
    }
    .anirium-scroll:hover::-webkit-scrollbar-thumb {
        background: rgba(255, 199, 102, 0.45);
    }
    .anirium-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 199, 102, 0.8);
    }
</style>

<div id="modal-profile"
     class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-2xl opacity-0 pointer-events-none transition-all duration-300"
     role="dialog"
     aria-modal="true">
    <div class="relative w-full max-w-4xl rounded-[28px] bg-theme-surface border border-white/10 shadow-[0_28px_90px_rgba(0,0,0,0.72)] flex flex-col md:flex-row overflow-hidden" style="height: 86vh; max-height: 740px;">

        <!-- SIDEBAR LATERAL ESQUERDA (ESTILO STREMIO / LINEAR / DISCORD) -->
        <aside class="w-full md:w-64 shrink-0 bg-theme-header/95 border-b md:border-b-0 md:border-r border-white/10 flex flex-col justify-between">
            <div class="flex flex-col">
                <!-- Identidade do Usuário -->
                <div class="p-5 border-b border-white/10 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="relative w-11 h-11 rounded-2xl overflow-hidden border-2 p-0.5 shrink-0 bg-theme-pill shadow-md {{ $isAdmin ? 'border-[var(--color-state-filler,#F43F5E)]' : ($isPlus ? 'border-amber-400' : 'border-white/15') }}">
                            @if($user && $user->avatar)
                                <img src="{{ $user->avatar }}" class="w-full h-full object-cover rounded-[10px]">
                            @else
                                <div class="w-full h-full flex items-center justify-center text-base font-black text-theme-accent font-mono">
                                    {{ $user ? strtoupper(substr($user->name, 0, 1)) : 'A' }}
                                </div>
                            @endif
                        </div>
                        <div class="flex flex-col min-w-0">
                            <h3 class="text-sm font-extrabold tracking-tight text-theme-primary truncate">{{ $user ? $user->name : 'Visitante Anirium' }}</h3>
                            <div class="flex items-center gap-1.5 mt-0.5">
                                <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border {{ $roleBadgeClass }}">
                                    <span data-i18n="{{ $roleI18n }}">{{ $roleLabel }}</span>
                                </span>
                                @if($isPlus && $plusDaysLeft !== null)
                                    <span class="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">{{ $plusDaysLeft }}d</span>
                                @endif
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="window.closeProfileModal()" class="md:hidden p-2 rounded-xl text-theme-muted hover:text-theme-primary hover:bg-white/10 cursor-pointer" title="Fechar">✕</button>
                </div>

                <!-- Navegação Vertical (Desktop) / Horizontal (Mobile) -->
                <nav class="flex md:flex-col gap-1 p-3 overflow-x-auto md:overflow-visible no-scrollbar">
                    <button type="button" id="profile-tab-btn-overview"
                            onclick="window.switchProfileTab('overview'); if(document.getElementById('profile-section-heading')) document.getElementById('profile-section-heading').textContent='Visão Geral';"
                            class="profile-tab-btn flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold font-mono text-left border-b-2 md:border-b-0 md:border-l-2 border-theme-accent text-theme-accent bg-white/[0.06] transition-all shrink-0 cursor-pointer">
                        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6"/></svg>
                        <span data-i18n="profile.tab_overview">Visão Geral</span>
                    </button>
                    <button type="button" id="profile-tab-btn-library"
                            onclick="window.switchProfileTab('library'); if(document.getElementById('profile-section-heading')) document.getElementById('profile-section-heading').textContent='Favoritos';"
                            class="profile-tab-btn flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold font-mono text-left border-b-2 md:border-b-0 md:border-l-2 border-transparent text-theme-muted hover:text-theme-primary hover:bg-white/[0.04] transition-all shrink-0 cursor-pointer">
                        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                        <span data-i18n="profile.tab_library">Favoritos</span>
                    </button>
                    <button type="button" id="profile-tab-btn-history"
                            onclick="window.switchProfileTab('history'); if(document.getElementById('profile-section-heading')) document.getElementById('profile-section-heading').textContent='Histórico';"
                            class="profile-tab-btn flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold font-mono text-left border-b-2 md:border-b-0 md:border-l-2 border-transparent text-theme-muted hover:text-theme-primary hover:bg-white/[0.04] transition-all shrink-0 cursor-pointer">
                        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <span data-i18n="profile.tab_history">Histórico</span>
                    </button>
                    <button type="button" id="profile-tab-btn-addons"
                            onclick="window.switchProfileTab('addons'); if(document.getElementById('profile-section-heading')) document.getElementById('profile-section-heading').textContent='Add-ons & Fontes';"
                            class="profile-tab-btn flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold font-mono text-left border-b-2 md:border-b-0 md:border-l-2 border-transparent text-theme-muted hover:text-theme-primary hover:bg-white/[0.04] transition-all shrink-0 cursor-pointer">
                        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"/></svg>
                        <span data-i18n="profile.tab_addons">Add-ons</span>
                    </button>
                    <button type="button" id="profile-tab-btn-settings"
                            onclick="window.switchProfileTab('settings'); if(document.getElementById('profile-section-heading')) document.getElementById('profile-section-heading').textContent='Configurações';"
                            class="profile-tab-btn flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold font-mono text-left border-b-2 md:border-b-0 md:border-l-2 border-transparent text-theme-muted hover:text-theme-primary hover:bg-white/[0.04] transition-all shrink-0 cursor-pointer">
                        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <span data-i18n="profile.tab_settings">Configurações</span>
                    </button>
                </nav>
            </div>

            <!-- Rodapé da Sidebar: Atalho Rápido Anirium+ -->
            @if($user)
            <div class="hidden md:flex flex-col gap-2 p-4 border-t border-white/10">
                <button type="button" onclick="window.openAniriumPlusFlow()"
                        class="w-full py-2.5 px-3.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-between {{ ($isPlus || $isAdmin) ? 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/25' : 'bg-amber-400 text-slate-950 hover:bg-amber-300 shadow-lg shadow-amber-500/20' }}">
                    <span>{{ ($isPlus || $isAdmin) ? '✨ Anirium+ Ativo' : '✨ Torne-se Plus' }}</span>
                    <span class="text-[10px] font-mono opacity-80">{{ $isPlus && $plusDaysLeft !== null ? $plusDaysLeft.'d' : '❯' }}</span>
                </button>
                <p class="text-[10px] font-mono text-theme-muted truncate px-1 opacity-70">{{ $user->email }}</p>
            </div>
            @endif
        </aside>

        <!-- ÁREA PRINCIPAL DE CONTEÚDO -->
        <div class="flex-1 flex flex-col min-w-0 bg-theme-base/95" style="min-height: 0; overflow: hidden;">
            <!-- Barra Superior Limpa -->
            <div class="hidden md:flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                <h2 id="profile-section-heading" class="text-sm font-extrabold tracking-tight text-theme-primary">Visão Geral</h2>
                <button type="button"
                        onclick="window.closeProfileModal()"
                        class="p-2 rounded-xl text-theme-muted hover:text-theme-primary hover:bg-white/10 transition-colors cursor-pointer"
                        data-i18n-title="modal.close"
                        title="Fechar">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>

            <!-- CORPO DAS 5 ABAS (ROLÁVEL COM SCROLL CONTROLADO) -->
            <div class="flex-1 p-6 anirium-scroll" style="min-height: 0; overflow-y: auto;">
            
            <!-- ABA 1: VISÃO GERAL / GAMIFICAÇÃO -->
            <div id="profile-panel-overview" class="profile-panel flex flex-col gap-4">
                <div class="grid grid-cols-3 gap-3 font-mono text-center">
                    <div class="p-4 rounded-2xl bg-theme-raised/80 border border-white/10 flex flex-col gap-1.5 shadow-sm">
                        <span class="text-[10px] text-theme-muted uppercase tracking-wider" data-i18n="profile.streak">Sequência</span>
                        <span class="text-theme-accent font-extrabold text-lg">🔥 {{ $user ? $user->current_streak : 0 }} <span class="text-xs font-semibold" data-i18n="profile.days_suffix">dias</span></span>
                    </div>
                    <div class="p-4 rounded-2xl bg-theme-raised/80 border border-white/10 flex flex-col gap-1.5 shadow-sm">
                        <span class="text-[10px] text-theme-muted uppercase tracking-wider" data-i18n="profile.total_xp">XP Total</span>
                        <span class="text-[var(--color-state-canon,#10B981)] font-extrabold text-lg">⚡ {{ $user ? $user->streak_xp : 0 }}</span>
                    </div>
                    <div class="p-4 rounded-2xl bg-theme-raised/80 border border-white/10 flex flex-col gap-1.5 shadow-sm">
                        <span class="text-[10px] text-theme-muted uppercase tracking-wider" data-i18n="profile.tier">Categoria</span>
                        <span class="text-theme-primary font-extrabold text-sm truncate mt-1">★ {{ $roleLabel }}</span>
                    </div>
                </div>

                @if($user)
                <div id="anirium-plus-overview-card" class="p-4 rounded-2xl border {{ ($isPlus || $isAdmin) ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-amber-400/35 bg-amber-500/10' }} flex flex-wrap items-center justify-between gap-3">
                    <div class="flex flex-col gap-0.5">
                        <h4 class="text-sm font-extrabold {{ ($isPlus || $isAdmin) ? 'text-emerald-300' : 'text-amber-300' }}">
                            @if($isAdmin)
                                ✨ Anirium+ Ativo · Vitalício (Admin)
                            @elseif($isPlus)
                                ✨ Anirium+ Ativo · {{ $plusDaysLeft !== null ? ($plusDaysLeft . ($plusDaysLeft === 1 ? ' dia restante' : ' dias restantes')) : 'Ativo' }}
                            @else
                                ✨ Anirium+
                            @endif
                        </h4>
                        <p class="text-[11px] font-mono text-theme-muted">
                            @if($isPlus && $plusExpiresAt)
                                Válido até {{ $plusExpiresAt->format('d/m/Y') }} · Player Pro, Add-ons e RSS liberados.
                            @elseif($isAdmin)
                                Acesso completo ao Player Pro, Add-ons e RSS.
                            @else
                                15 dias grátis ou a partir de $0.99/mês (+15 dias bônus na 1ª compra).
                            @endif
                        </p>
                    </div>
                    <button type="button"
                            onclick="window.openAniriumPlusFlow()"
                            class="px-4 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer shrink-0 {{ ($isPlus || $isAdmin) ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30' : 'bg-amber-400 text-slate-950 hover:bg-amber-300 shadow-lg shadow-amber-500/20' }}">
                        {{ ($isPlus || $isAdmin) ? 'Renovar / Planos Plus' : 'Torne-se Plus' }}
                    </button>
                </div>

                <!-- MODAL DEDICADO: FLUXO ANIRIUM+ (PARA MIM · PRESENTEAR @ · COMPRAR KEY · RESGATAR · CHECKOUT EMBUTIDO) -->
                <div id="modal-anirium-plus-flow" class="fixed inset-0 z-[60] hidden items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl">
                    <div id="plus-modal-shell" class="w-full max-w-xl max-h-[92vh] rounded-3xl bg-theme-surface border border-white/15 shadow-2xl overflow-hidden flex flex-col transition-all duration-300">
                        <!-- Header -->
                        <div class="px-5 py-4 border-b border-white/10 bg-gradient-to-r from-amber-500/15 via-theme-header to-emerald-500/10 flex items-center justify-between gap-3 shrink-0">
                            <div class="flex flex-col gap-0.5">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <h3 class="text-base font-black tracking-tight text-amber-300">✨ Anirium+</h3>
                                    <span id="plus-rate-pill" class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                                        USD + 3% · Carregando cotação...
                                    </span>
                                </div>
                                <p id="plus-flow-subtitle" class="text-[11px] font-mono text-theme-muted">Escolha para quem deseja ativar o Anirium+</p>
                            </div>
                            <button type="button" onclick="window.closeAniriumPlusFlow()" class="p-2 rounded-xl text-theme-muted hover:text-theme-primary hover:bg-white/10 transition-colors cursor-pointer">✕</button>
                        </div>

                        <!-- Body -->
                        <div class="p-5 flex flex-col gap-4 bg-theme-base overflow-y-auto anirium-scroll">
                            <!-- PASSO 1: MODO + PLANOS / RESGATE -->
                            <div id="plus-step-1" class="flex flex-col gap-4">
                                <!-- Seletor de Modo (4 abas fáceis) -->
                                <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 rounded-2xl bg-theme-raised border border-white/10">
                                    <button type="button" id="plus-mode-self" onclick="window.plusSetMode('self')"
                                            class="px-2.5 py-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer bg-amber-400 text-slate-950 shadow-sm">
                                        ✨ Para mim
                                    </button>
                                    <button type="button" id="plus-mode-gift_user" onclick="window.plusSetMode('gift_user')"
                                            class="px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-theme-muted hover:text-theme-primary hover:bg-white/5">
                                        🎁 Presentear @
                                    </button>
                                    <button type="button" id="plus-mode-gift_key" onclick="window.plusSetMode('gift_key')"
                                            class="px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-theme-muted hover:text-theme-primary hover:bg-white/5">
                                        🔑 Comprar Key
                                    </button>
                                    <button type="button" id="plus-mode-redeem" onclick="window.plusSetMode('redeem')"
                                            class="px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-theme-muted hover:text-theme-primary hover:bg-white/5">
                                        🎟️ Resgatar Key
                                    </button>
                                </div>

                                <!-- Campo @handle (somente no modo Presentear @) -->
                                <div id="plus-gift-user-box" class="hidden flex-col gap-2.5 p-3.5 rounded-2xl bg-gradient-to-br from-fuchsia-500/10 to-amber-500/5 border border-fuchsia-400/30">
                                    <label for="plus-recipient-handle" class="text-[11px] font-bold text-fuchsia-200">
                                        Digite o @ do usuário que vai receber o Anirium+
                                    </label>
                                    <div class="flex items-center gap-2">
                                        <div class="relative flex-1">
                                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-fuchsia-300">@</span>
                                            <input id="plus-recipient-handle" type="text" placeholder="usuario"
                                                   onkeydown="if(event.key==='Enter'){event.preventDefault();window.plusLookupRecipient();}"
                                                   class="w-full pl-7 pr-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs font-mono text-theme-primary placeholder:text-theme-muted/60 focus:outline-none focus:border-fuchsia-400">
                                        </div>
                                        <button type="button" onclick="window.plusLookupRecipient()" id="plus-lookup-btn"
                                                class="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-fuchsia-500/25 border border-fuchsia-400/40 text-fuchsia-200 hover:bg-fuchsia-500/35 transition-colors cursor-pointer shrink-0">
                                            Verificar
                                        </button>
                                    </div>
                                    <div id="plus-recipient-preview" class="hidden items-center gap-2.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30">
                                        <img id="plus-recipient-avatar" src="" alt="" class="w-8 h-8 rounded-full object-cover border border-emerald-400/40 hidden">
                                        <div class="flex flex-col min-w-0">
                                            <span id="plus-recipient-name" class="text-xs font-extrabold text-emerald-200 truncate"></span>
                                            <span id="plus-recipient-meta" class="text-[10px] font-mono text-emerald-300/80 truncate"></span>
                                        </div>
                                        <span class="ml-auto px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold shrink-0">✓ Confirmado</span>
                                    </div>
                                </div>

                                <!-- Info Comprar Key -->
                                <div id="plus-gift-key-info" class="hidden p-3.5 rounded-2xl bg-gradient-to-br from-sky-500/10 to-indigo-500/5 border border-sky-400/30 text-[11px] font-mono text-sky-200/90">
                                    🔑 Após a confirmação do pagamento, uma key exclusiva (<span class="font-bold text-white">ANIRIUM-XXXX-XXXX-XXXX</span>) é gerada na hora para você enviar a qualquer pessoa ou guardar.
                                </div>

                                <!-- Painel de Planos (Self / Gift User / Gift Key) -->
                                <div id="plus-plans-container" class="flex flex-col gap-3">
                                    @if($isMember && !$user->anirium_plus_trial_claimed_at)
                                    <button type="button" id="plus-trial-card" onclick="window.plusSelectPlan('trial')"
                                            class="group w-full text-left p-4 rounded-2xl border border-amber-400/45 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-transparent hover:border-amber-300 transition-all cursor-pointer flex items-center justify-between gap-3">
                                        <div class="flex flex-col gap-0.5">
                                            <div class="text-sm font-black text-amber-300 flex items-center gap-1.5">
                                                <span>🎁 15 Dias Grátis</span>
                                            </div>
                                            <div class="text-[11px] font-mono text-theme-muted">Sem cartão agora · 1 conta Google por rede IPv6</div>
                                        </div>
                                        <span class="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 text-[11px] font-black tracking-wide group-hover:scale-105 transition-transform shrink-0">ATIVAR GRÁTIS</span>
                                    </button>
                                    @endif

                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <!-- Card Mensal -->
                                        <button type="button" onclick="window.plusSelectPlan('monthly')"
                                                class="group relative text-left p-4 rounded-2xl border border-white/15 bg-gradient-to-b from-theme-raised to-black/30 hover:border-emerald-400/60 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-md">
                                            <div class="flex flex-col gap-1.5">
                                                <div class="flex items-center justify-between">
                                                    <span class="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-mono font-bold text-theme-muted uppercase">Mensal</span>
                                                    <span class="text-[10px] font-mono text-emerald-300 font-bold">+30 dias</span>
                                                </div>
                                                <div class="mt-1 flex items-baseline gap-1.5">
                                                    <span class="text-2xl font-black text-theme-primary tracking-tight">US$ 0.99</span>
                                                    <span class="text-[11px] font-mono text-theme-muted">/mês</span>
                                                </div>
                                                <div id="plus-monthly-brl" class="text-xs font-mono font-bold text-emerald-300">≈ R$ --,-- (dólar + 3%)</div>
                                                <p class="text-[11px] text-theme-muted leading-relaxed mt-1">
                                                    Player Pro, Add-ons, RSS e Watch Party liberados{{ !$user->anirium_plus_trial_claimed_at ? ' (+15 dias bônus na 1ª compra para si)' : '' }}.
                                                </p>
                                            </div>
                                            <div class="w-full py-2 rounded-xl bg-white/10 group-hover:bg-emerald-500/20 border border-white/10 group-hover:border-emerald-400/40 text-center text-xs font-extrabold text-theme-primary group-hover:text-emerald-200 transition-colors">
                                                Escolher Mensal ❯
                                            </div>
                                        </button>

                                        <!-- Card Anual -->
                                        <button type="button" onclick="window.plusSelectPlan('annual')"
                                                class="group relative text-left p-4 rounded-2xl border-2 border-emerald-400/50 bg-gradient-to-b from-emerald-500/15 via-theme-raised to-amber-500/10 hover:border-amber-300/80 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-lg shadow-emerald-500/10">
                                            <div class="flex flex-col gap-1.5">
                                                <div class="flex items-center justify-between">
                                                    <span class="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wide">★ Melhor Valor</span>
                                                    <span class="text-[10px] font-mono text-amber-300 font-bold">+365 dias</span>
                                                </div>
                                                <div class="mt-1 flex items-baseline gap-1.5">
                                                    <span class="text-2xl font-black text-emerald-300 tracking-tight">US$ 9.99</span>
                                                    <span class="text-[11px] font-mono text-theme-muted">/ano</span>
                                                </div>
                                                <div id="plus-annual-brl" class="text-xs font-mono font-bold text-amber-300">≈ R$ --,-- (dólar + 3%)</div>
                                                <p class="text-[11px] text-theme-muted leading-relaxed mt-1">
                                                    1 ano inteiro de acesso total com desconto equivalente a 2 meses grátis.
                                                </p>
                                            </div>
                                            <div class="w-full py-2 rounded-xl bg-emerald-400 text-slate-950 group-hover:bg-amber-300 text-center text-xs font-black transition-colors">
                                                Escolher Anual ❯
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                <!-- Painel Resgatar Key + Minhas Keys -->
                                <div id="plus-redeem-container" class="hidden flex-col gap-3">
                                    <div class="p-4 rounded-2xl bg-theme-raised border border-amber-400/30 flex flex-col gap-2.5">
                                        <label for="plus-redeem-input" class="text-xs font-extrabold text-amber-300">
                                            🎟️ Inserir Key do Anirium+
                                        </label>
                                        <p class="text-[11px] font-mono text-theme-muted">
                                            Cole o código recebido (ex: ANIRIUM-ABCD-EFGH-JKLM) para ativar ou somar dias na sua conta.
                                        </p>
                                        <div class="flex items-center gap-2 mt-1">
                                            <input id="plus-redeem-input" type="text" placeholder="ANIRIUM-XXXX-XXXX-XXXX"
                                                   onkeydown="if(event.key==='Enter'){event.preventDefault();window.plusRedeemKey();}"
                                                   class="flex-1 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-xs font-mono uppercase tracking-wider text-theme-primary placeholder:text-theme-muted/50 focus:outline-none focus:border-amber-400">
                                            <button type="button" id="plus-redeem-btn" onclick="window.plusRedeemKey()"
                                                    class="px-4 py-2.5 rounded-xl text-xs font-black bg-amber-400 text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer shrink-0">
                                                Resgatar
                                            </button>
                                        </div>
                                    </div>

                                    <div class="p-3.5 rounded-2xl bg-black/25 border border-white/10 flex flex-col gap-2">
                                        <div class="flex items-center justify-between">
                                            <span class="text-[11px] font-extrabold text-theme-primary">🔑 Minhas Keys Compradas</span>
                                            <button type="button" onclick="window.plusLoadMyKeys()" class="text-[10px] font-mono text-theme-muted hover:text-amber-300 cursor-pointer">Atualizar ↻</button>
                                        </div>
                                        <div id="plus-my-keys-list" class="flex flex-col gap-1.5 text-[11px] font-mono text-theme-muted">
                                            Carregando suas keys...
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- PASSO 2: ESCOLHA DA FORMA DE PAGAMENTO -->
                            <div id="plus-step-2" class="hidden flex-col gap-3">
                                <div id="plus-selected-summary" class="p-3.5 rounded-2xl bg-theme-raised border border-white/15 text-xs font-mono text-theme-primary"></div>

                                <button type="button" onclick="window.plusPayWith('pix', this)"
                                        class="w-full text-left p-4 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/15 transition-all cursor-pointer flex items-center justify-between gap-3">
                                    <div>
                                        <div class="text-sm font-extrabold text-emerald-300">⚡ Pix Instantâneo (Efí Bank)</div>
                                        <div class="text-[11px] font-mono text-theme-muted mt-0.5">QR Code + Copia e Cola aqui mesmo · Liberação em segundos</div>
                                    </div>
                                    <span class="text-xs font-extrabold text-emerald-300 shrink-0">Pagar ❯</span>
                                </button>

                                <button type="button" onclick="window.plusPayWith('checkout', this)"
                                        class="w-full text-left p-4 rounded-2xl border border-sky-400/40 bg-sky-500/10 hover:bg-sky-500/15 transition-all cursor-pointer flex items-center justify-between gap-3">
                                    <div>
                                        <div class="text-sm font-extrabold text-sky-200">🌍 Cartão Global (Crédito) ou Boleto — Efí Bank</div>
                                        <div class="text-[11px] font-mono text-theme-muted mt-0.5">Abre dentro do site · Aceita cartões internacionais (USD + 3% convertido em BRL)</div>
                                    </div>
                                    <span class="text-xs font-extrabold text-sky-200 shrink-0">Continuar ❯</span>
                                </button>

                                <button type="button" onclick="window.plusBackToStep1()" class="self-start text-xs font-mono text-theme-muted hover:text-theme-primary cursor-pointer">← Voltar aos planos</button>
                            </div>

                            <!-- PASSO 3: PIX INLINE / CHECKOUT EMBUTIDO / KEY GERADA -->
                            <div id="plus-step-3" class="hidden flex-col gap-3">
                                <!-- Box Pix -->
                                <div id="plus-pix-box" class="hidden p-4 rounded-2xl border border-emerald-400/30 bg-black/30 flex flex-col gap-2.5">
                                    <div class="flex items-center justify-between gap-2">
                                        <span id="plus-pix-title" class="text-xs font-bold text-emerald-300"></span>
                                        <button type="button" onclick="window.aniriumCopyPix()" id="anirium-plus-pix-copy-btn"
                                                class="px-3 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 cursor-pointer">
                                            Copiar Pix
                                        </button>
                                    </div>
                                    <img id="anirium-plus-pix-qr" src="" alt="QR Code Pix Efí Bank" class="hidden w-44 h-44 rounded-xl bg-white p-2 self-center">
                                    <code id="anirium-plus-pix-code" class="text-[10px] break-all text-emerald-100/80 bg-black/40 p-2.5 rounded-lg"></code>
                                    <p class="text-[11px] font-mono text-emerald-300/80 text-center">⟳ Aguardando confirmação automática da Efí Bank...</p>
                                </div>

                                <!-- Box Checkout Embutido (Iframe + Tradução Global) -->
                                <div id="plus-embed-box" class="hidden flex-col gap-2.5">
                                    <div class="p-3 rounded-2xl bg-sky-500/10 border border-sky-400/30 flex flex-col gap-2">
                                        <div class="flex flex-wrap items-center justify-between gap-2">
                                            <span class="text-[11px] font-extrabold text-sky-200">🌍 Checkout Seguro Efí Bank (Global)</span>
                                            <div class="flex items-center gap-1">
                                                <button type="button" onclick="window.plusSetCheckoutLang('pt')" id="plus-lang-pt" class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-400 text-slate-950 cursor-pointer">PT</button>
                                                <button type="button" onclick="window.plusSetCheckoutLang('en')" id="plus-lang-en" class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/10 text-theme-muted hover:text-white cursor-pointer">EN</button>
                                                <button type="button" onclick="window.plusSetCheckoutLang('es')" id="plus-lang-es" class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/10 text-theme-muted hover:text-white cursor-pointer">ES</button>
                                                <a id="plus-embed-fallback-link" href="#" target="_blank" rel="noopener noreferrer"
                                                   class="ml-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/10 text-sky-200 hover:bg-white/20">
                                                    ↗ Abrir externo
                                                </a>
                                            </div>
                                        </div>
                                        <p id="plus-checkout-lang-guide" class="text-[10px] font-mono text-sky-100/85 leading-relaxed">
                                            Pague com Cartão de Crédito (inclusive internacional) ou Boleto diretamente abaixo. Confirmação automática.
                                        </p>
                                    </div>
                                    <div class="relative w-full h-[460px] rounded-2xl overflow-hidden border border-white/15 bg-white">
                                        <iframe id="anirium-plus-efi-iframe" src="about:blank" title="Checkout Efí Bank"
                                                class="w-full h-full border-0" allow="payment *; clipboard-write"></iframe>
                                    </div>
                                    <p class="text-[11px] font-mono text-emerald-300/80 text-center">⟳ Aguardando confirmação automática do pagamento...</p>
                                </div>

                                <!-- Box Key Gerada após pagamento -->
                                <div id="plus-key-result-box" class="hidden p-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 flex-col gap-2.5 text-center">
                                    <div class="text-sm font-black text-amber-300">🎉 Key Anirium+ Gerada!</div>
                                    <p class="text-[11px] font-mono text-theme-muted">Copie e envie esta key para quem quiser — ela também fica salva em "Resgatar Key → Minhas Keys".</p>
                                    <div class="flex items-center justify-center gap-2 mt-1">
                                        <code id="plus-generated-key-code" class="px-4 py-2 rounded-xl bg-black/50 border border-amber-400/40 text-sm font-mono font-black tracking-widest text-amber-200"></code>
                                        <button type="button" onclick="window.aniriumCopyGeneratedKey()" id="plus-copy-key-btn"
                                                class="px-3.5 py-2 rounded-xl text-xs font-black bg-amber-400 text-slate-950 hover:bg-amber-300 cursor-pointer">
                                            Copiar Key
                                        </button>
                                    </div>
                                </div>

                                <button type="button" onclick="window.plusBackToStep2()" class="self-start text-xs font-mono text-theme-muted hover:text-theme-primary cursor-pointer">← Trocar forma de pagamento</button>
                            </div>

                            <div id="anirium-plus-feedback" class="hidden text-xs font-semibold"></div>
                        </div>
                    </div>
                </div>
                <script>
                    (function () {
                        if (window.openAniriumPlusFlow) return;
                        let selectedPlan = 'monthly';
                        let selectedMode = 'self';
                        let verifiedRecipient = null;
                        let livePricing = null;
                        const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

                        const formatBrl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

                        const setFeedback = (ok, text) => {
                            const el = document.getElementById('anirium-plus-feedback');
                            if (!el) return;
                            if (!text) { el.className = 'hidden'; return; }
                            el.textContent = text;
                            el.className = 'text-xs font-semibold ' + (ok ? 'text-emerald-300' : 'text-rose-300');
                        };

                        const setModalWide = (wide) => {
                            const shell = document.getElementById('plus-modal-shell');
                            if (!shell) return;
                            shell.classList.toggle('max-w-3xl', wide);
                            shell.classList.toggle('max-w-xl', !wide);
                        };

                        const showStep = (n, subtitle) => {
                            [1, 2, 3].forEach((i) => {
                                const el = document.getElementById('plus-step-' + i);
                                if (!el) return;
                                el.classList.toggle('hidden', i !== n);
                                el.classList.toggle('flex', i === n);
                            });
                            const sub = document.getElementById('plus-flow-subtitle');
                            if (sub && subtitle) sub.textContent = subtitle;
                            if (n !== 3) setModalWide(false);
                        };

                        const loadPricing = async () => {
                            try {
                                const res = await fetch('/api/anirium-plus/pricing', { headers: { 'Accept': 'application/json' } });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok || !data.success) return;
                                livePricing = data;
                                const pill = document.getElementById('plus-rate-pill');
                                if (pill && data.rate) {
                                    pill.textContent = `Dólar +3% · US$ 1 = R$ ${Number(data.rate.effective_rate).toFixed(2).replace('.', ',')}`;
                                }
                                const mBrl = document.getElementById('plus-monthly-brl');
                                const aBrl = document.getElementById('plus-annual-brl');
                                if (mBrl && data.plans?.monthly) mBrl.textContent = `≈ ${formatBrl(data.plans.monthly.brl)} (dólar hoje + 3%)`;
                                if (aBrl && data.plans?.annual) aBrl.textContent = `≈ ${formatBrl(data.plans.annual.brl)} (dólar hoje + 3%)`;
                            } catch {}
                        };

                        let activePixTxid = null;
                        const handlePixPaidSse = (ev) => {
                            const st = ev?.detail || {};
                            if (!activePixTxid || (st.txid && st.txid !== activePixTxid)) return;
                            activePixTxid = null;
                            if (st.mode === 'gift_key' && st.gift_key_code) {
                                document.getElementById('plus-pix-box')?.classList.add('hidden');
                                document.getElementById('plus-embed-box')?.classList.add('hidden');
                                setModalWide(false);
                                const keyBox = document.getElementById('plus-key-result-box');
                                const keyEl = document.getElementById('plus-generated-key-code');
                                if (keyEl) keyEl.textContent = st.gift_key_code;
                                if (keyBox) { keyBox.classList.remove('hidden'); keyBox.classList.add('flex'); }
                                setFeedback(true, '✅ Pagamento confirmado pela Efí Bank! Sua key Anirium+ está pronta.');
                            } else if (st.mode === 'gift_user') {
                                setFeedback(true, '✅ Pagamento confirmado! Anirium+ ativado na conta do destinatário!');
                            } else {
                                setFeedback(true, '✅ Pagamento confirmado pela Efí Bank! Anirium+ ativo na sua conta.');
                            }
                        };
                        window.addEventListener('anirium:sse:pix.paid', handlePixPaidSse);

                        const startPoll = (txid) => {
                            activePixTxid = txid || null;
                        };

                        window.plusSetMode = function (mode) {
                            selectedMode = mode;
                            setFeedback(true, '');
                            ['self', 'gift_user', 'gift_key', 'redeem'].forEach((m) => {
                                const btn = document.getElementById('plus-mode-' + m);
                                if (!btn) return;
                                const active = m === mode;
                                btn.className = active
                                    ? 'px-2.5 py-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer bg-amber-400 text-slate-950 shadow-sm'
                                    : 'px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-theme-muted hover:text-theme-primary hover:bg-white/5';
                            });

                            const giftBox = document.getElementById('plus-gift-user-box');
                            const keyInfo = document.getElementById('plus-gift-key-info');
                            const plansBox = document.getElementById('plus-plans-container');
                            const redeemBox = document.getElementById('plus-redeem-container');
                            const trialCard = document.getElementById('plus-trial-card');

                            if (giftBox) { giftBox.classList.toggle('hidden', mode !== 'gift_user'); giftBox.classList.toggle('flex', mode === 'gift_user'); }
                            if (keyInfo) keyInfo.classList.toggle('hidden', mode !== 'gift_key');
                            if (plansBox) { plansBox.classList.toggle('hidden', mode === 'redeem'); plansBox.classList.toggle('flex', mode !== 'redeem'); }
                            if (redeemBox) { redeemBox.classList.toggle('hidden', mode !== 'redeem'); redeemBox.classList.toggle('flex', mode === 'redeem'); }
                            if (trialCard) trialCard.classList.toggle('hidden', mode !== 'self');

                            if (mode === 'redeem') {
                                window.plusLoadMyKeys();
                            }
                        };

                        window.plusLookupRecipient = async function () {
                            const input = document.getElementById('plus-recipient-handle');
                            const btn = document.getElementById('plus-lookup-btn');
                            const preview = document.getElementById('plus-recipient-preview');
                            const handle = (input?.value || '').trim().replace(/^@+/, '');
                            if (!handle) {
                                setFeedback(false, 'Digite o @ do usuário para verificar.');
                                return;
                            }
                            if (btn) btn.disabled = true;
                            setFeedback(true, '');
                            try {
                                const res = await fetch('/api/anirium-plus/lookup-user?handle=' + encodeURIComponent(handle), { headers: { 'Accept': 'application/json' } });
                                const data = await res.json().catch(() => ({}));
                                if (res.ok && data.found && data.user) {
                                    verifiedRecipient = data.user;
                                    const nameEl = document.getElementById('plus-recipient-name');
                                    const metaEl = document.getElementById('plus-recipient-meta');
                                    const avEl = document.getElementById('plus-recipient-avatar');
                                    if (nameEl) nameEl.textContent = data.user.name || ('@' + data.user.handle);
                                    if (metaEl) metaEl.textContent = '@' + data.user.handle + (data.user.is_plus ? ' · Já possui Anirium+ (os dias serão somados)' : ' · Receberá Anirium+ imediatamente');
                                    if (avEl) {
                                        if (data.user.avatar) { avEl.src = data.user.avatar; avEl.classList.remove('hidden'); }
                                        else { avEl.classList.add('hidden'); }
                                    }
                                    if (preview) { preview.classList.remove('hidden'); preview.classList.add('flex'); }
                                } else {
                                    verifiedRecipient = null;
                                    if (preview) { preview.classList.add('hidden'); preview.classList.remove('flex'); }
                                    setFeedback(false, data.message || 'Usuário não encontrado.');
                                }
                            } catch {
                                setFeedback(false, 'Erro ao buscar usuário.');
                            } finally {
                                if (btn) btn.disabled = false;
                            }
                        };

                        window.plusLoadMyKeys = async function () {
                            const list = document.getElementById('plus-my-keys-list');
                            if (!list) return;
                            try {
                                const res = await fetch('/api/anirium-plus/keys', { headers: { 'Accept': 'application/json' } });
                                const data = await res.json().catch(() => ({}));
                                const keys = Array.isArray(data.keys) ? data.keys : [];
                                if (keys.length === 0) {
                                    list.textContent = 'Você ainda não comprou nenhuma key.';
                                    return;
                                }
                                list.innerHTML = '';
                                keys.forEach((k) => {
                                    const row = document.createElement('div');
                                    row.className = 'flex items-center justify-between gap-2 p-2 rounded-xl bg-black/30 border border-white/10';
                                    const left = document.createElement('div');
                                    left.className = 'flex flex-col min-w-0';
                                    const codeEl = document.createElement('span');
                                    codeEl.className = 'font-bold text-amber-200 truncate';
                                    codeEl.textContent = k.code;
                                    const metaEl = document.createElement('span');
                                    metaEl.className = 'text-[10px] text-theme-muted';
                                    metaEl.textContent = `${k.days} dias · ` + (k.redeemed_at ? `Resgatada${k.redeemed_by_handle ? ' por @' + k.redeemed_by_handle : ''}` : 'Disponível');
                                    left.appendChild(codeEl);
                                    left.appendChild(metaEl);

                                    const copyBtn = document.createElement('button');
                                    copyBtn.type = 'button';
                                    copyBtn.className = 'px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-amber-400/20 text-theme-primary cursor-pointer shrink-0';
                                    copyBtn.textContent = 'Copiar';
                                    copyBtn.onclick = () => {
                                        navigator.clipboard?.writeText(k.code);
                                        copyBtn.textContent = 'Copiado!';
                                        setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000);
                                    };
                                    row.appendChild(left);
                                    row.appendChild(copyBtn);
                                    list.appendChild(row);
                                });
                            } catch {
                                list.textContent = 'Não foi possível carregar suas keys.';
                            }
                        };

                        window.plusRedeemKey = async function () {
                            const input = document.getElementById('plus-redeem-input');
                            const btn = document.getElementById('plus-redeem-btn');
                            const code = (input?.value || '').trim();
                            if (!code) {
                                setFeedback(false, 'Digite o código da key Anirium+.');
                                return;
                            }
                            if (btn) btn.disabled = true;
                            setFeedback(true, 'Validando key...');
                            try {
                                const res = await fetch('/api/anirium-plus/keys/redeem', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrf() },
                                    body: JSON.stringify({ code })
                                });
                                const data = await res.json().catch(() => ({}));
                                if (res.ok && data.success) {
                                    setFeedback(true, '✅ ' + (data.message || 'Key resgatada com sucesso!'));
                                } else {
                                    setFeedback(false, data.message || 'Não foi possível resgatar a key.');
                                }
                            } catch {
                                setFeedback(false, 'Erro de conexão ao resgatar key.');
                            } finally {
                                if (btn) btn.disabled = false;
                            }
                        };

                        window.plusSetCheckoutLang = function (lang) {
                            const guides = {
                                pt: 'Pague com Cartão de Crédito (inclusive internacional) ou Boleto diretamente abaixo. Confirmação automática.',
                                en: 'Global Checkout Guide (SejaEfí is in Portuguese): "Cartão de Crédito" = Credit Card · "Nome completo" = Full Name · "Número do cartão" = Card Number · "Validade" = Expiry · "Pagar" = Pay. Billed in BRL (live USD + 3%).',
                                es: 'Guía Global (SejaEfí está en portugués): "Cartão de Crédito" = Tarjeta de Crédito · "Nome completo" = Nombre completo · "Número do cartão" = Número de tarjeta · "Pagar" = Pagar. Cobrado en BRL (USD hoy + 3%).'
                            };
                            const el = document.getElementById('plus-checkout-lang-guide');
                            if (el) el.textContent = guides[lang] || guides.pt;
                            ['pt', 'en', 'es'].forEach((l) => {
                                const b = document.getElementById('plus-lang-' + l);
                                if (!b) return;
                                b.className = l === lang
                                    ? 'px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-400 text-slate-950 cursor-pointer'
                                    : 'px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/10 text-theme-muted hover:text-white cursor-pointer';
                            });
                        };

                        window.openAniriumPlusFlow = function () {
                            setFeedback(true, '');
                            window.plusSetMode('self');
                            showStep(1, 'Passo 1 de 2 · Escolha para quem ativar e o plano');
                            const m = document.getElementById('modal-anirium-plus-flow');
                            if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
                            loadPricing();
                        };

                        window.closeAniriumPlusFlow = function () {
                            if (window._aniriumPixPoll) clearInterval(window._aniriumPixPoll);
                            const iframe = document.getElementById('anirium-plus-efi-iframe');
                            if (iframe) iframe.src = 'about:blank';
                            setModalWide(false);
                            const m = document.getElementById('modal-anirium-plus-flow');
                            if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
                        };

                        window.plusBackToStep1 = () => { setFeedback(true, ''); showStep(1, 'Passo 1 de 2 · Escolha para quem ativar e o plano'); };
                        window.plusBackToStep2 = () => {
                            if (window._aniriumPixPoll) clearInterval(window._aniriumPixPoll);
                            const iframe = document.getElementById('anirium-plus-efi-iframe');
                            if (iframe) iframe.src = 'about:blank';
                            document.getElementById('plus-key-result-box')?.classList.add('hidden');
                            setFeedback(true, '');
                            showStep(2, 'Passo 2 de 2 · Escolha a forma de pagamento');
                        };

                        window.plusSelectPlan = async function (plan) {
                            if (plan === 'trial') {
                                setFeedback(true, 'Ativando 15 dias grátis...');
                                try {
                                    const res = await fetch('/api/anirium-plus/trial', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrf() }
                                    });
                                    const data = await res.json().catch(() => ({}));
                                    if (res.ok && data.success) {
                                        setFeedback(true, data.message || 'Anirium+ ativado por 15 dias!');
                                    } else {
                                        setFeedback(false, data.message || 'Não foi possível ativar os 15 dias grátis.');
                                    }
                                } catch { setFeedback(false, 'Erro de conexão.'); }
                                return;
                            }

                            if (selectedMode === 'gift_user') {
                                const rawHandle = (document.getElementById('plus-recipient-handle')?.value || '').trim().replace(/^@+/, '');
                                if (!rawHandle) {
                                    setFeedback(false, 'Digite e verifique o @ do destinatário antes de escolher o plano.');
                                    return;
                                }
                                if (!verifiedRecipient || verifiedRecipient.handle.toLowerCase() !== rawHandle.toLowerCase()) {
                                    await window.plusLookupRecipient();
                                    if (!verifiedRecipient) return;
                                }
                            }

                            selectedPlan = plan;
                            const planInfo = livePricing?.plans?.[plan];
                            const brlText = planInfo ? ` (${formatBrl(planInfo.brl)} · dólar + 3%)` : '';
                            const modeLabel = selectedMode === 'gift_user'
                                ? `🎁 Presente para @${verifiedRecipient.handle}`
                                : (selectedMode === 'gift_key' ? '🔑 Key Resgatável Anirium+' : '✨ Para sua conta');
                            const planLabel = plan === 'annual' ? 'Anual — US$ 9.99 (+365 dias)' : 'Mensal — US$ 0.99 (+30 dias)';
                            const sum = document.getElementById('plus-selected-summary');
                            if (sum) sum.textContent = `${modeLabel} · ${planLabel}${brlText}`;
                            setFeedback(true, '');
                            showStep(2, 'Passo 2 de 2 · Escolha a forma de pagamento');
                        };

                        window.plusPayWith = async function (method, btn) {
                            if (btn) btn.disabled = true;
                            setFeedback(true, method === 'pix' ? 'Gerando Pix Efí Bank...' : 'Preparando checkout seguro Efí Bank...');
                            try {
                                const endpoint = method === 'pix' ? '/api/anirium-plus/pix' : '/api/anirium-plus/checkout';
                                const payload = { plan: selectedPlan, mode: selectedMode };
                                if (selectedMode === 'gift_user' && verifiedRecipient) {
                                    payload.recipient_handle = verifiedRecipient.handle;
                                }
                                const res = await fetch(endpoint, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrf() },
                                    body: JSON.stringify(payload)
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok || !data.success) {
                                    setFeedback(false, data.message || 'Não foi possível iniciar o pagamento.');
                                    return;
                                }
                                document.getElementById('plus-key-result-box')?.classList.add('hidden');
                                if (method === 'pix') {
                                    const title = document.getElementById('plus-pix-title');
                                    const qr = document.getElementById('anirium-plus-pix-qr');
                                    const code = document.getElementById('anirium-plus-pix-code');
                                    const box = document.getElementById('plus-pix-box');
                                    const embedBox = document.getElementById('plus-embed-box');
                                    if (embedBox) { embedBox.classList.add('hidden'); embedBox.classList.remove('flex'); }
                                    if (title) title.textContent = `Pix Efí (${selectedPlan === 'annual' ? 'US$ 9.99/ano' : 'US$ 0.99/mês'}) — ${formatBrl(data.amount_brl)}`;
                                    if (qr) { if (data.qrcode_image) { qr.src = data.qrcode_image; qr.classList.remove('hidden'); } else { qr.classList.add('hidden'); } }
                                    if (code) code.textContent = data.pix_copy_paste || '';
                                    if (box) box.classList.remove('hidden');
                                    setFeedback(true, '');
                                    showStep(3, 'Finalize o pagamento via Pix');
                                    startPoll(data.txid);
                                } else if (data.payment_url) {
                                    const box = document.getElementById('plus-pix-box');
                                    const embedBox = document.getElementById('plus-embed-box');
                                    const iframe = document.getElementById('anirium-plus-efi-iframe');
                                    const fallback = document.getElementById('plus-embed-fallback-link');
                                    if (box) box.classList.add('hidden');
                                    if (iframe) iframe.src = data.payment_url;
                                    if (fallback) fallback.href = data.payment_url;
                                    if (embedBox) { embedBox.classList.remove('hidden'); embedBox.classList.add('flex'); }
                                    setModalWide(true);
                                    const navLang = (navigator.language || 'pt').toLowerCase();
                                    window.plusSetCheckoutLang(navLang.startsWith('en') ? 'en' : (navLang.startsWith('es') ? 'es' : 'pt'));
                                    setFeedback(true, '');
                                    showStep(3, `Checkout Efí (${formatBrl(data.amount_brl)}) · Conclua abaixo`);
                                    startPoll(data.txid);
                                }
                            } catch {
                                setFeedback(false, 'Erro de conexão com o servidor.');
                            } finally {
                                if (btn) btn.disabled = false;
                            }
                        };

                        window.aniriumCopyPix = function () {
                            const code = document.getElementById('anirium-plus-pix-code')?.textContent || '';
                            if (!code) return;
                            navigator.clipboard?.writeText(code);
                            const btn = document.getElementById('anirium-plus-pix-copy-btn');
                            if (btn) { btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = 'Copiar Pix'; }, 2500); }
                        };

                        window.aniriumCopyGeneratedKey = function () {
                            const code = document.getElementById('plus-generated-key-code')?.textContent || '';
                            if (!code) return;
                            navigator.clipboard?.writeText(code);
                            const btn = document.getElementById('plus-copy-key-btn');
                            if (btn) { btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = 'Copiar Key'; }, 2500); }
                        };
                    })();
                </script>
                @endif

                <div class="p-4 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between">
                    <div>
                        <h4 class="text-xs font-bold text-theme-primary" data-i18n="profile.role_admin">Conta Canônica</h4>
                        <p class="text-[10px] font-mono text-theme-muted mt-0.5" data-i18n="profile.session_secure">Sessão criptografada e autenticada via Google OAuth 2.0</p>
                    </div>
                    <span class="w-3 h-3 rounded-full bg-[var(--color-state-canon,#10B981)] shadow-md"></span>
                </div>
            </div>

            <!-- ABA 2: BIBLIOTECA DE FAVORITOS (FILTRADA POR ENTIDADES + PROGRESSO + ORDEM) -->
            <div id="profile-panel-library" class="profile-panel hidden flex flex-col gap-4">
                <!-- Barra de Filtros e Ordenação -->
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <button type="button"
                                onclick="window.filterLibraryEntity('all')"
                                id="lib-filter-all"
                                class="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-theme-accent text-theme-inverse border-theme-accent cursor-pointer">
                            <span data-i18n="explore.filter_all">Todos</span>
                        </button>
                        <button type="button"
                                onclick="window.filterLibraryEntity('work')"
                                id="lib-filter-work"
                                class="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-theme-pill text-theme-muted border-theme-default cursor-pointer">
                            <span data-i18n="explore.filter_anime">Obras</span>
                        </button>
                        <button type="button"
                                onclick="window.filterLibraryEntity('arc')"
                                id="lib-filter-arc"
                                class="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-theme-pill text-theme-muted border-theme-default cursor-pointer">
                            <span data-i18n="explore.filter_arcs">Arcos</span>
                        </button>
                        <button type="button"
                                onclick="window.filterLibraryEntity('universe')"
                                id="lib-filter-universe"
                                class="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-theme-pill text-theme-muted border-theme-default cursor-pointer">
                            <span data-i18n="explore.filter_universes">Universos</span>
                        </button>
                    </div>

                    <div class="flex items-center gap-2">
                        <select id="lib-sort-select"
                                onchange="window.sortLibraryList(this.value)"
                                class="px-2.5 py-1 rounded-lg bg-theme-pill border border-theme-default text-theme-primary text-[10px] font-mono outline-none cursor-pointer">
                            <option value="recent" data-i18n="profile.sort_recent">Mais Recentes</option>
                            <option value="alpha" data-i18n="profile.sort_alpha">Alfabética</option>
                            <option value="score" data-i18n="profile.sort_score">Nota Pessoal</option>
                        </select>
                    </div>
                </div>

                <!-- Lista de Cards da Biblioteca -->
                <div id="profile-library-container" class="flex flex-col gap-2 min-h-[160px]">
                    <div class="p-8 text-center text-xs font-mono text-theme-muted" data-i18n="profile.empty_library">
                        Nenhum item adicionado aos favoritos ainda.
                    </div>
                </div>
            </div>

            <!-- ABA 3: HISTÓRICO CONDENSADO POR UNIVERSOS -->
            <div id="profile-panel-history" class="profile-panel hidden flex flex-col gap-3">
                <div id="profile-history-container" class="flex flex-col gap-3 min-h-[160px]">
                    <div class="p-8 text-center text-xs font-mono text-theme-muted" data-i18n="profile.empty_history">
                        Nenhum histórico registrado ainda.
                    </div>
                </div>
            </div>

            <!-- ABA 4: ADD-ONS & ARQUITETURA MODULAR ABERTA -->
            <div id="profile-panel-addons" data-csrf="{{ csrf_token() }}" class="profile-panel hidden flex flex-col gap-5">
                <!-- Aviso Arquitetural Limpo -->
                <div class="px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10 text-[11px] font-mono text-theme-muted">
                    🧩 <strong class="text-theme-primary">Extensões Abertas:</strong> Instale add-ons Stremio, feeds RSS (<code class="text-theme-accent">{query}</code>) ou legendas (<code class="text-theme-accent">{subquery}</code>).
                </div>

                <!-- Seção 1: Add-ons Oficiais Anirium+ -->
                <div class="flex flex-col gap-2.5">
                    <div class="flex items-center justify-between">
                        <h4 class="text-xs font-mono uppercase font-bold text-theme-accent tracking-wider" data-i18n="profile.official_addons">
                            Extensão Oficial Anirium+ (Exclusivo Assinantes)
                        </h4>
                        <span id="profile-service-health-pill" class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border bg-theme-pill text-theme-muted border-theme-default">
                            Service 4004: Verificando...
                        </span>
                    </div>
                    
                    <div class="p-4 rounded-2xl bg-theme-raised border border-theme-default flex flex-col gap-3">
                        <div class="flex items-center justify-between gap-4">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-10 h-10 rounded-xl bg-theme-accent/10 border border-theme-accent/30 flex items-center justify-center text-theme-accent shrink-0">
                                    ⚡
                                </div>
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <h5 class="text-xs font-bold text-theme-primary truncate" data-i18n="profile.player_pro">Anirium Player Pro (v1.0.0)</h5>
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-theme-accent/20 text-theme-accent border border-theme-accent/30" data-i18n="profile.role_plus">ANIRIUM+</span>
                                    </div>
                                    <p class="text-[10px] text-theme-muted truncate mt-0.5" data-i18n="profile.player_pro_desc">Add-on oficial com suporte ao Anirium+ Service (127.0.0.1:4004), multi-áudio e legendas sincronizadas.</p>
                                </div>
                            </div>

                            <div class="shrink-0">
                                @if($isAdmin || $isPlus)
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" id="addon-toggle-player-pro" checked onchange="window.toggleAddon('player-pro', this.checked)" class="sr-only peer">
                                        <div class="w-9 h-5 bg-theme-pill border border-theme-default peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-theme-accent"></div>
                                    </label>
                                @else
                                    <span class="px-2.5 py-1 rounded-lg bg-theme-pill border border-theme-default text-[10px] font-mono text-theme-muted" data-i18n="profile.addon_unauthorized">Requer Anirium+</span>
                                @endif
                            </div>
                        </div>

                        <!-- Add-on Oficial 2: Anirium Manga Reader Pro -->
                        <div class="pt-3 border-t border-theme-default/60 flex items-center justify-between gap-4">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                                    📖
                                </div>
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <h5 class="text-xs font-bold text-theme-primary truncate">Anirium Manga Reader Pro (v1.0.0)</h5>
                                        <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">ANIRIUM+</span>
                                    </div>
                                    <p class="text-[10px] text-theme-muted truncate mt-0.5">Leitor oficial para capítulos de mangás e novels (imagens, CBZ e PDF).</p>
                                </div>
                            </div>

                            <div class="shrink-0">
                                @if($isAdmin || $isPlus)
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" id="addon-toggle-manga-reader-pro" onchange="window.toggleAddon('manga-reader-pro', this.checked)" class="sr-only peer">
                                        <div class="w-9 h-5 bg-theme-pill border border-theme-default peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-400"></div>
                                    </label>
                                @else
                                    <span class="px-2.5 py-1 rounded-lg bg-theme-pill border border-theme-default text-[10px] font-mono text-theme-muted">Requer Anirium+</span>
                                @endif
                            </div>
                        </div>

                        <!-- Controle e Download do Daemon Local Anirium+ Service -->
                        <div class="pt-2.5 border-t border-theme-default/60 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                            <span class="text-theme-muted">Daemon Local: <code class="text-theme-accent">http://127.0.0.1:4004</code></span>
                            <div class="flex items-center gap-2">
                                <button type="button"
                                        onclick="window.checkAniriumServiceHealth()"
                                        class="px-2.5 py-1 rounded-lg bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-primary cursor-pointer transition-all">
                                    🔄 Testar Conexão
                                </button>
                                <a href="ms-windows-store://pdp/?productid=9MV35DDQ6SBD"
                                   class="px-2.5 py-1 rounded-lg bg-theme-accent/15 hover:bg-theme-accent/25 border border-theme-accent/40 text-theme-accent font-bold transition-all">
                                    🪟 Microsoft Store
                                </a>
                                <a href="/download/service"
                                   class="px-2.5 py-1 rounded-lg bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-muted hover:text-white transition-all">
                                    ⬇ Instalador (.exe)
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Seção 2: Add-ons da Comunidade (Stremio & Manifests Abertos para Todos) -->
                <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <h4 class="text-xs font-mono uppercase font-bold text-emerald-400 tracking-wider" data-i18n="profile.community_addons">
                                    Add-ons da Comunidade (Aberto para Todos os Usuários)
                                </h4>
                                <span id="profile-addons-inspect-status" class="hidden text-[10px] font-mono text-theme-muted"></span>
                            </div>
                            <p class="text-[10px] font-mono text-theme-muted">Compatível com manifestos Stremio e extensões criadas pela comunidade</p>
                        </div>
                        <button type="button"
                                onclick="window.openExploreAddonModal ? window.openExploreAddonModal() : window.toggleInstallAddonForm()"
                                class="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500 hover:text-black text-emerald-300 text-[10px] font-mono font-bold transition-all cursor-pointer shrink-0">
                            + <span data-i18n="profile.install_addon">Explorar / Instalar Add-on</span>
                        </button>
                    </div>

                    <!-- Container de Lista de Addons Comunitários -->
                    <div id="profile-addons-list" class="flex flex-col gap-2 min-h-[80px]">
                        <div class="p-4 text-center text-xs font-mono text-theme-muted" data-i18n="profile.no_addons">
                            Nenhum add-on comunitário instalado.
                        </div>
                    </div>
                </div>
            </div>

            <!-- ABA 5: CONFIGURAÇÕES & SESSÃO -->
            <div id="profile-panel-settings" class="profile-panel hidden flex flex-col gap-4">
                <!-- Switcher & Verificação de Idade (+18 Anos) -->
                <div class="flex flex-col gap-3 p-4 rounded-2xl bg-theme-raised border border-theme-default">
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="text-xl shrink-0">🔞</span>
                            <div class="flex flex-col min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="text-xs font-bold text-theme-primary" data-i18n="profile.adult_title">Conteúdo Adulto (+18 Anos)</span>
                                    <span id="age-verify-status-badge" class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border {{ $ageBadge['class'] }}">
                                        {{ $ageBadge['label'] }}
                                    </span>
                                </div>
                                <span class="text-[10px] text-theme-muted font-mono mt-0.5" data-i18n="profile.adult_desc">Exibir obras com classificação hentai/erotica</span>
                            </div>
                        </div>
                        <input type="checkbox"
                               id="modal-toggle-adult"
                               {{ $canAccessAdult ? 'checked' : '' }}
                               {{ !$isAgeVerified ? 'disabled' : '' }}
                               onchange="window.toggleAdultPreference(this.checked)"
                               class="w-5 h-5 accent-amber-400 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                    </div>

                    <div id="age-verify-feedback" class="hidden p-2.5 rounded-xl text-[11px] font-mono border"></div>

                    @if($user)
                        <div id="age-verify-controls" class="{{ $isAgeVerified ? 'hidden' : 'flex' }} flex-col gap-3 pt-3 border-t border-theme-default">
                            <p id="age-verify-underage-msg" class="{{ $ageStatus === 'underage' ? '' : 'hidden' }} p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-[11px] font-mono text-red-300">
                                Esta conta está bloqueada para conteúdo adulto (+18 anos não atingidos).
                            </p>

                            <div id="age-verify-manual-box" class="{{ $ageStatus === 'underage' ? 'hidden' : 'flex' }} flex-col gap-3 p-3.5 rounded-xl bg-black/25 border border-theme-default">
                                <p class="text-[11px] text-theme-muted font-mono leading-relaxed">
                                    Informe sua data de nascimento real. Esta informação é salva apenas uma vez e nunca mais poderá ser alterada.
                                </p>
                                <div id="age-verify-manual-fields" class="{{ $ageStatus === 'underage' ? 'hidden' : 'flex' }} flex-col gap-3">
                                    <div class="flex flex-col gap-1">
                                        <label for="age-verify-birth-date" class="text-[10px] font-mono uppercase text-theme-muted">Data de Nascimento Real</label>
                                        <input type="date"
                                               id="age-verify-birth-date"
                                               min="1900-01-01"
                                               max="{{ now()->toDateString() }}"
                                               class="w-full px-3 py-2 rounded-xl bg-theme-base border border-theme-default text-xs font-mono text-theme-primary focus:outline-none focus:border-theme-accent">
                                    </div>
                                    <label class="flex items-start gap-2 text-[11px] font-mono text-theme-secondary cursor-pointer select-none">
                                        <input type="checkbox"
                                               id="age-verify-declaration"
                                               class="mt-0.5 w-4 h-4 accent-amber-400 rounded shrink-0">
                                        <span>Declaro sob minha responsabilidade ter 18 anos ou mais</span>
                                    </label>
                                    <div class="flex justify-end">
                                        <button type="button"
                                                id="btn-submit-manual-age"
                                                onclick="window.submitManualAgeVerification()"
                                                class="px-4 py-2 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold hover:scale-[1.02] active:scale-95 transition-all cursor-pointer">
                                            Salvar Data de Nascimento
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    @endif
                </div>

                @if($isAdmin)
                    <div id="admin-age-verifications-panel" class="flex flex-col gap-3 p-4 rounded-2xl bg-theme-raised border border-[var(--color-state-filler,#F43F5E)]/30">
                        <div class="flex items-center justify-between gap-2">
                            <h4 class="text-xs font-bold font-mono uppercase tracking-wider text-theme-primary">
                                Painel Admin • Verificações de Maioridade (+18)
                            </h4>
                            <button type="button"
                                    onclick="window.loadAdminAgeVerifications()"
                                    class="px-3 py-1 rounded-lg bg-theme-pill border border-theme-default text-[10px] font-mono font-bold text-theme-primary hover:border-theme-highlight cursor-pointer">
                                Atualizar
                            </button>
                        </div>
                        <div id="admin-age-verifications-list" class="flex flex-col gap-2 text-xs font-mono text-theme-muted">
                            Carregando solicitações...
                        </div>
                    </div>
                @endif

                @if($user)
                    <!-- Logout Seguro -->
                    <form action="/logout" method="POST" class="w-full pt-2">
                        @csrf
                        <button type="submit" class="w-full py-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-xs hover:bg-red-500/20 transition-all cursor-pointer font-mono uppercase tracking-wider">
                            <span data-i18n="auth.logout">Encerrar Sessão Ativa</span>
                        </button>
                    </form>
                @else
                    <!-- Botão Oficial Google OAuth -->
                    <a href="/auth/google" class="flex items-center justify-center gap-3 w-full py-3.5 rounded-2xl bg-white hover:bg-theme-raised text-theme-inverse font-bold text-sm shadow-xl transition-all hover:scale-[1.02]">
                        <svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                        <span data-i18n="auth.google">Entrar com o Google</span>
                    </a>
                @endif
            </div>

            </div>
        </div>
    </div>
</div>
<script src="/js/anirium-addons-manager.js?v=3"></script>
