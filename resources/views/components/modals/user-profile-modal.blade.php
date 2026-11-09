@props([
    'user' => null,
    'userPreferences' => [],
])

@php
    $email = strtolower($user->email ?? '');
    $isAdmin = $email === 'santoss.cog@gmail.com' || ($user && (int)$user->tier === 3);
    $isPlus = !$isAdmin && ($user && (int)$user->tier === 2);
    $isMember = !$isAdmin && !$isPlus && (bool)$user;
    
    $roleI18n = $isAdmin ? 'profile.role_admin' : ($isPlus ? 'profile.role_plus' : ($isMember ? 'profile.role_member' : 'profile.role_guest'));
    $roleLabel = $isAdmin ? 'Administrador' : ($isPlus ? 'Anirium+' : ($isMember ? 'Membro' : 'Visitante'));
    $roleBadgeClass = $isAdmin ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border-[var(--color-state-filler,#F43F5E)]/40' : ($isPlus ? 'bg-theme-accent/20 text-theme-accent border-theme-accent/40' : 'bg-theme-pill text-theme-muted border-theme-default');
@endphp

<div id="modal-profile"
     class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-2xl opacity-0 pointer-events-none transition-all duration-300"
     role="dialog"
     aria-modal="true">
    <div class="relative w-full max-w-2xl max-h-[90vh] rounded-3xl bg-theme-surface border border-theme-default shadow-2xl flex flex-col overflow-hidden">
        
        <!-- HEADER COM AVATAR, IDENTIDADE E BOTÃO FECHAR -->
        <div class="p-6 border-b border-theme-default flex items-center justify-between bg-theme-header">
            <div class="flex items-center gap-4 min-w-0">
                <div class="relative w-14 h-14 rounded-full overflow-hidden border-2 p-0.5 shrink-0 bg-theme-pill {{ $isAdmin ? 'border-[var(--color-state-filler,#F43F5E)]' : ($isPlus ? 'border-theme-accent' : 'border-theme-default') }}">
                    @if($user && $user->avatar)
                        <img src="{{ $user->avatar }}" class="w-full h-full object-cover rounded-full">
                    @else
                        <div class="w-full h-full flex items-center justify-center text-lg font-black text-theme-accent font-mono">
                            {{ $user ? strtoupper(substr($user->name, 0, 1)) : 'A' }}
                        </div>
                    @endif
                </div>

                <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-2">
                        <h3 class="text-base font-bold text-theme-primary truncate">{{ $user ? $user->name : 'Visitante Anirium' }}</h3>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border {{ $roleBadgeClass }}">
                            <span data-i18n="{{ $roleI18n }}">{{ $roleLabel }}</span>
                        </span>
                    </div>
                    <p class="text-xs text-theme-muted font-mono truncate mt-0.5">
                        @if($user) {{ $user->email }} @else <span data-i18n="profile.login_hint">Faça login com o Google para salvar favoritos e desbloquear +24 anos</span> @endif
                    </p>
                </div>
            </div>

            <button type="button"
                    onclick="window.closeProfileModal()"
                    class="p-2 rounded-xl text-theme-muted hover:text-theme-primary hover:bg-theme-raised transition-colors cursor-pointer shrink-0"
                    data-i18n-title="modal.close"
                    title="Fechar">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>

        <!-- 5 ABAS ESTREITAS PADRÃO ANIRIUM -->
        <div class="flex items-center border-b border-theme-default bg-theme-pill px-4 overflow-x-auto no-scrollbar shrink-0">
            <button type="button"
                    id="profile-tab-btn-overview"
                    onclick="window.switchProfileTab('overview')"
                    class="profile-tab-btn px-4 py-3 text-xs font-bold font-mono border-b-2 border-theme-accent text-theme-accent transition-colors shrink-0">
                <span data-i18n="profile.tab_overview">Visão Geral</span>
            </button>
            <button type="button"
                    id="profile-tab-btn-library"
                    onclick="window.switchProfileTab('library')"
                    class="profile-tab-btn px-4 py-3 text-xs font-bold font-mono border-b-2 border-transparent text-theme-muted hover:text-theme-primary transition-colors shrink-0">
                <span data-i18n="profile.tab_library">Favoritos</span>
            </button>
            <button type="button"
                    id="profile-tab-btn-history"
                    onclick="window.switchProfileTab('history')"
                    class="profile-tab-btn px-4 py-3 text-xs font-bold font-mono border-b-2 border-transparent text-theme-muted hover:text-theme-primary transition-colors shrink-0">
                <span data-i18n="profile.tab_history">Histórico</span>
            </button>
            <button type="button"
                    id="profile-tab-btn-addons"
                    onclick="window.switchProfileTab('addons')"
                    class="profile-tab-btn px-4 py-3 text-xs font-bold font-mono border-b-2 border-transparent text-theme-muted hover:text-theme-primary transition-colors shrink-0">
                <span data-i18n="profile.tab_addons">Add-ons</span>
            </button>
            <button type="button"
                    id="profile-tab-btn-settings"
                    onclick="window.switchProfileTab('settings')"
                    class="profile-tab-btn px-4 py-3 text-xs font-bold font-mono border-b-2 border-transparent text-theme-muted hover:text-theme-primary transition-colors shrink-0">
                <span data-i18n="profile.tab_settings">Configurações</span>
            </button>
        </div>

        <!-- CORPO DAS 5 ABAS (ROLÁVEL COM SCROLLBAR DISCRETA) -->
        <div class="flex-1 overflow-y-auto no-scrollbar p-6 bg-theme-base">
            
            <!-- ABA 1: VISÃO GERAL / GAMIFICAÇÃO -->
            <div id="profile-panel-overview" class="profile-panel flex flex-col gap-5">
                <div class="grid grid-cols-3 gap-3 font-mono text-center">
                    <div class="p-4 rounded-2xl bg-theme-raised border border-theme-default flex flex-col gap-1">
                        <span class="text-[10px] text-theme-muted uppercase" data-i18n="profile.streak">Sequência</span>
                        <span class="text-theme-accent font-bold text-base">🔥 {{ $user ? $user->current_streak : 0 }} <span data-i18n="profile.days_suffix">dias</span></span>
                    </div>
                    <div class="p-4 rounded-2xl bg-theme-raised border border-theme-default flex flex-col gap-1">
                        <span class="text-[10px] text-theme-muted uppercase" data-i18n="profile.total_xp">XP Total</span>
                        <span class="text-[var(--color-state-canon,#10B981)] font-bold text-base">⚡ {{ $user ? $user->streak_xp : 0 }}</span>
                    </div>
                    <div class="p-4 rounded-2xl bg-theme-raised border border-theme-default flex flex-col gap-1">
                        <span class="text-[10px] text-theme-muted uppercase" data-i18n="profile.tier">Categoria</span>
                        <span class="text-theme-primary font-bold text-xs truncate">★ {{ $roleLabel }}</span>
                    </div>
                </div>

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
            <div id="profile-panel-addons" class="profile-panel hidden flex flex-col gap-5">
                <!-- Aviso Arquitetural Claro -->
                <div class="p-3.5 rounded-2xl bg-theme-raised/60 border border-theme-default text-[11px] font-mono text-theme-muted leading-relaxed">
                    🧩 <strong class="text-theme-primary">Sistema Aberto de Extensões:</strong> O Anirium opera exclusivamente como catálogo ontológico. O slot de reprodução é modular e aberto: qualquer membro pode instalar e criar add-ons da comunidade (protocolo Stremio/JSON), enquanto assinantes <strong class="text-theme-accent">Anirium+</strong> contam também com o add-on oficial <strong>Anirium Player Pro + Anirium+ Service</strong>.
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
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-xs font-mono uppercase font-bold text-emerald-400 tracking-wider" data-i18n="profile.community_addons">
                                Add-ons da Comunidade (Aberto para Todos os Usuários)
                            </h4>
                            <p class="text-[10px] font-mono text-theme-muted">Compatível com manifestos Stremio e extensões criadas pela comunidade</p>
                        </div>
                        <button type="button"
                                onclick="window.toggleInstallAddonForm()"
                                class="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500 hover:text-black text-emerald-300 text-[10px] font-mono font-bold transition-all cursor-pointer shrink-0">
                            + <span data-i18n="profile.install_addon">Instalar Add-on</span>
                        </button>
                    </div>

                    <!-- Formulário Expansível de Instalação Stremio / Comunidade -->
                    <div id="addon-install-form" class="hidden p-4 rounded-2xl bg-theme-card border border-theme-default flex flex-col gap-3">
                        <input type="text"
                               id="addon-manifest-url"
                               placeholder="Cole a URL stremio://, https://.../manifest.json ou JSON de manifesto da comunidade"
                               data-i18n-placeholder="profile.addon_manifest_placeholder"
                               class="w-full px-3 py-2 rounded-xl bg-theme-surface border border-theme-default text-xs font-mono text-theme-primary placeholder-theme-muted outline-none focus:border-theme-accent">
                        <div class="flex justify-end gap-2">
                            <button type="button"
                                    onclick="window.toggleInstallAddonForm()"
                                    class="px-3 py-1.5 rounded-xl border border-theme-default text-xs font-mono text-theme-muted hover:text-white cursor-pointer"
                                    data-i18n="modal.close">
                                Cancelar
                            </button>
                            <button type="button"
                                    onclick="window.submitInstallAddon()"
                                    class="px-4 py-1.5 rounded-xl bg-theme-accent text-theme-inverse text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer">
                                <span data-i18n="profile.addon_btn_install">Instalar</span>
                            </button>
                        </div>
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
                <!-- Switcher de Conteúdo Adulto (+24 Anos) -->
                <div class="flex items-center justify-between p-4 rounded-2xl bg-theme-raised border border-theme-default">
                    <div class="flex items-center gap-3">
                        <span class="text-xl">🔞</span>
                        <div class="flex flex-col">
                            <span class="text-xs font-bold text-theme-primary" data-i18n="profile.adult_title">Conteúdo Adulto (+24 Anos)</span>
                            <span class="text-[10px] text-theme-muted font-mono" data-i18n="profile.adult_desc">Exibir obras com classificação hentai/erotica</span>
                        </div>
                    </div>
                    <input type="checkbox"
                           id="modal-toggle-adult"
                           {{ $user && $user->adult_content_enabled ? 'checked' : '' }}
                           {{ !$user ? 'disabled' : '' }}
                           onchange="window.toggleAdultPreference(this.checked)"
                           class="w-5 h-5 accent-amber-400 rounded cursor-pointer disabled:opacity-40">
                </div>

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
