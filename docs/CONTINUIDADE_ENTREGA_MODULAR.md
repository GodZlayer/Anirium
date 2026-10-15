# Continuidade e Entrega Modular: Novo Anirium (Padrão TGCode)

## 1. Resumo Executivo da Entrega
- **Arquitetura 2-Tier Consolidada**:
  - **Edge Estático / GitHub Pages (`anirium.com.br`)**: Interface leve, rápida e desacoplada, servida via CDN da Cloudflare com CNAME apontado para `godzlayer.github.io`. Lê fatias modulares Parquet (`public/data/*.parquet`) em memória com `hyparquet`, garantindo vitrine instantânea sem consulta a backend de catálogo.
  - **Núcleo de APIs e Dados Canônicos (`api.anirium.com.br`)**: Operando em container Docker isolado (`anirium_core`), com banco PostgreSQL 16 (`anirium_canonical`) contendo 36.552 títulos e rotas canônicas seguras (`/api/catalog`, `/api/user`, `/api/schedule`, `/api/sources`). Túnel Cloudflare ativo e saudável conectando a borda diretamente a `http://anirium-core:3000`.
  - **Loopback de Streaming Pessoal (`anirium-service.exe`)**: Engine P2P em `127.0.0.1:4004`, mantendo estrita neutralidade legal.

- **Fundamentos TGCode Implementados**:
  - **100% Stringado e Tokenizado**: Dicionário central [src/lib/designStrings.ts](file:///c:/Users/santo/Documents/Animeflix/src/lib/designStrings.ts) contendo paletas (Dark, AMOLED, Cyberpunk), tipografia, raios, strings de navegação, status e gamificação.
  - **Lobby Viewport-First**: Composição primária enxuta, sem rolagem cega necessária para encontrar ações e controles essenciais.
  - **Densidade Textual Mínima**: Ícones expressivos e status visuais limpos.
  - **Explicações On-Demand**: Componente [src/components/Tooltip.tsx](file:///c:/Users/santo/Documents/Animeflix/src/components/Tooltip.tsx) acionado ao hover/foco.
  - **Gamificação Adaptativa**: Ajuste dinâmico de visibilidade e recursos com base no nível da conta (Níveis 0 a 3).
  - **Resolução Transparente de Origem de API**: [src/lib/apiConfig.ts](file:///c:/Users/santo/Documents/Animeflix/src/lib/apiConfig.ts) garantindo que chamadas client-side acessem `https://api.anirium.com.br` quando servidas estaticamente em `anirium.com.br`.

## 2. Status dos Serviços
- `https://api.anirium.com.br/api/catalog` $\rightarrow$ `HTTP/1.1 200 OK` (Edge GRU via Cloudflare Tunnel).
- `https://anirium.com.br/` $\rightarrow$ `HTTP/1.1 200 OK` (Edge Cloudflare / GitHub Pages).
- Repositório sincronizado em `origin main` (commit `45fd883`).
