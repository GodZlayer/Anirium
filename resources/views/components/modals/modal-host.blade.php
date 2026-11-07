@props([
    'id' => 'global-modal',
    'title' => '',
])

<div id="{{ $id }}"
     class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-overlay backdrop-blur-xl opacity-0 pointer-events-none transition-all duration-300"
     role="dialog"
     aria-modal="true">
    
    <!-- Painel Geométrico Central (100% Tokenizado) -->
    <div class="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-theme-surface border border-theme-default shadow-2xl overflow-hidden transform scale-95 transition-transform duration-300"
         id="{{ $id }}-panel">
        
        <!-- Header do Modal -->
        <div class="h-14 flex items-center justify-between px-6 border-b border-theme-default bg-theme-header">
            <h2 class="text-base font-bold text-theme-primary tracking-wide truncate" id="{{ $id }}-title">
                {{ $title }}
            </h2>
            <button type="button"
                    class="p-2 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-raised transition-colors cursor-pointer"
                    title="Fechar"
                    data-i18n-title="modal.close"
                    onclick="window.closeEntityModal()">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>

        <!-- Conteúdo do Modal -->
        <div class="flex-1 overflow-y-auto no-scrollbar p-6 bg-theme-base text-theme-primary" id="{{ $id }}-body">
            {{ $slot }}
        </div>
    </div>
</div>
