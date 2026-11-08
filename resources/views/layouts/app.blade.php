<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark h-full w-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>{{ config('app.name', 'Anirium') }} — Plataforma Ontológica</title>

    <!-- Favicon Oficial Anirium -->
    <link rel="icon" type="image/png" href="/assets/logos/Anirium-favicon.png">
    <link rel="shortcut icon" href="/favicon.ico">

    <!-- Tailwind CSS v4 / App Stylesheet -->
    @vite(['resources/css/app.css'])

    <!-- Tokens Universais de Design TGCode Inicializados -->
    <style>
        :root {
            --color-bg-base: #0B0B0D;
            --color-bg-surface: #1A1A1F;
            --color-bg-raised: #23232A;
            --color-border-default: rgba(255, 255, 255, 0.1);
            --color-border-highlight: #FFC766;
            --color-text-primary: #FFF9F0;
            --color-text-secondary: #EADCC8;
            --color-text-muted: #8E8E93;
            --color-accent-primary: #FFC766;
            --color-state-canon: #10B981;
            --color-state-filler: #F43F5E;
            --color-state-mixed: #A855F7;
            --color-header-bg: #0E1118;
            --color-card-bg: #141720;
            --color-pill-bg: #1C202E;
            --bg-canvas: var(--color-bg-base);
            --surface-elevated: var(--color-bg-surface);
            --surface-border: var(--color-border-default);
        }
        body {
            background-color: var(--color-bg-base);
            color: var(--color-text-primary);
            user-select: none;
            -webkit-user-select: none;
        }
    </style>
</head>
<body class="h-full w-full overflow-hidden antialiased bg-theme-base text-theme-primary font-sans">
    <!-- HUD DE CARREGAMENTO INICIAL DETERMINÍSTICO (Padrão TGCode: Frame 0 com mascote oficial e spinner ouro) -->
    <div id="global-site-loader" class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0B0B0D] select-none pointer-events-auto transition-opacity duration-500 ease-out">
        <div class="relative flex flex-col items-center justify-center gap-6 p-8">
            <!-- Glow Cósmico Dourado de Fundo -->
            <div class="absolute -inset-4 bg-[#FFC766]/10 rounded-full blur-3xl pointer-events-none animate-pulse"></div>

            <!-- Mascote Oficial Anirium com Anel de Órbita -->
            <div class="relative w-20 h-20 flex items-center justify-center">
                <div class="absolute inset-0 rounded-full border-2 border-[#FFC766]/20 border-t-[#FFC766] animate-spin"></div>
                <img src="/assets/logos/Anirium-favicon.png"
                     alt="Anirium"
                     class="w-12 h-12 object-contain drop-shadow-[0_0_15px_rgba(255,199,102,0.6)] animate-pulse">
            </div>

            <!-- Identidade & Status de Sincronização -->
            <div class="flex flex-col items-center gap-2 text-center">
                <img src="/assets/logos/Anirium-Textlogo.png"
                     alt="Anirium"
                     class="h-6 w-auto object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                <div class="flex items-center gap-2">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#FFC766] animate-ping"></span>
                    <span class="text-[11px] font-mono tracking-widest uppercase font-bold text-[#FFC766]" id="global-loader-text">
                        Sincronizando Plataforma...
                    </span>
                </div>
            </div>

            <!-- Barra de Progresso Sutil -->
            <div class="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                <div id="global-loader-bar" class="h-full bg-gradient-to-r from-[#FFC766] to-[#FFA726] rounded-full w-1/3 transition-all duration-300"></div>
            </div>
        </div>
    </div>

    <!-- Script Inline Imediato para Controle do Loader Global -->
    <script>
        window.hideGlobalSiteLoader = function() {
            const loader = document.getElementById('global-site-loader');
            if (loader && !loader.classList.contains('opacity-0')) {
                const bar = document.getElementById('global-loader-bar');
                if (bar) bar.style.width = '100%';
                setTimeout(() => {
                    loader.classList.add('opacity-0', 'pointer-events-none');
                    setTimeout(() => {
                        loader.style.display = 'none';
                    }, 500);
                }, 200);
            }
        };
        // Auto-dismiss de segurança máxima após 3.5 segundos para garantir que o usuário nunca fique preso
        setTimeout(() => {
            if (window.hideGlobalSiteLoader) window.hideGlobalSiteLoader();
        }, 3500);
    </script>

    <!-- Viewport Fixa Anti-Scroll Cego (Padrão TGCode) -->
    <main class="relative h-screen w-screen flex flex-col justify-between overflow-hidden bg-theme-base">
        {{ $slot }}
    </main>

    <!-- Host de Modais Ontológicos Globais -->
    <div id="modal-container" class="relative z-50"></div>

    <script src="/js/theme-lang-engine.js"></script>
    @stack('scripts')
</body>
</html>
