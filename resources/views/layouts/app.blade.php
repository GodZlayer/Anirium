<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark h-full w-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>{{ config('app.name', 'Anirium') }} — Plataforma Ontológica</title>

    <!-- Favicon Oficial Anirium -->
    <link rel="icon" type="image/png" href="/assets/logos/Anirium-favicon.png?v=2">
    <link rel="shortcut icon" href="/favicon.ico?v=2">

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
    <style>
        #global-site-loader {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 999999 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            background-color: #0B0B0D !important;
            opacity: 1;
            transition: opacity 0.5s ease-out;
            pointer-events: auto;
            user-select: none;
            -webkit-user-select: none;
        }
        #global-site-loader.loader-hidden {
            opacity: 0 !important;
            pointer-events: none !important;
        }
        @keyframes aniriumOrbitSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        @keyframes aniriumPulseGlow {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.08); opacity: 1; }
        }
        .anirium-orbit-ring {
            width: 72px;
            height: 72px;
            border-radius: 9999px;
            border: 2px solid rgba(255, 199, 102, 0.15);
            border-top: 2px solid #FFC766;
            animation: aniriumOrbitSpin 1s linear infinite;
        }
        .anirium-mascot-glow {
            animation: aniriumPulseGlow 2s ease-in-out infinite;
        }
    </style>

    <div id="global-site-loader">
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 32px;">
            <!-- Glow Cósmico Dourado de Fundo -->
            <div style="position: absolute; inset: -16px; background-color: rgba(255, 199, 102, 0.1); border-radius: 9999px; filter: blur(32px); pointer-events: none;"></div>

            <!-- Mascote Oficial Anirium com Anel de Órbita -->
            <div style="position: relative; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center;">
                <div class="anirium-orbit-ring" style="position: absolute; inset: 0;"></div>
                <img src="/assets/logos/Anirium-favicon.png"
                     alt="Anirium"
                     class="anirium-mascot-glow"
                     style="width: 44px; height: 44px; object-fit: contain; filter: drop-shadow(0 0 12px rgba(255,199,102,0.6));">
            </div>

            <!-- Identidade & Status de Sincronização -->
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;">
                <img src="/assets/logos/Anirium-Textlogo.png"
                     alt="Anirium"
                     style="height: 24px; width: auto; object-fit: contain; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.8));">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="display: inline-block; width: 6px; height: 6px; border-radius: 9999px; background-color: #FFC766;"></span>
                    <span id="global-loader-text" style="font-size: 11px; font-family: monospace; letter-spacing: 0.15em; text-transform: uppercase; font-weight: bold; color: #FFC766;">
                        Sincronizando Plataforma...
                    </span>
                </div>
            </div>

            <!-- Barra de Progresso Determinística -->
            <div style="width: 200px; height: 4px; background-color: rgba(255, 255, 255, 0.1); border-radius: 9999px; overflow: hidden;">
                <div id="global-loader-bar" style="height: 100%; background: linear-gradient(90deg, #FFC766, #FFA726); border-radius: 9999px; width: 25%; transition: width 0.3s ease;"></div>
            </div>
        </div>
    </div>

    <!-- Script Inline Imediato para Controle do Loader Global -->
    <script>
        window.updateGlobalSiteLoader = function(percent, message) {
            const bar = document.getElementById('global-loader-bar');
            if (bar && percent !== undefined) bar.style.width = `${Math.min(100, Math.max(5, percent))}%`;
            const txt = document.getElementById('global-loader-text');
            if (txt && message) txt.innerText = message;
        };

        window.hideGlobalSiteLoader = function() {
            const loader = document.getElementById('global-site-loader');
            if (loader && !loader.classList.contains('loader-hidden')) {
                window.updateGlobalSiteLoader(100, 'Catálogo Pronto!');
                setTimeout(() => {
                    loader.classList.add('loader-hidden');
                    setTimeout(() => {
                        loader.style.display = 'none';
                    }, 550);
                }, 250);
            }
        };
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
