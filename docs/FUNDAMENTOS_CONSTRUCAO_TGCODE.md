# Fundamento Universal de Construção de Interfaces (Padrão TGCode)
## Da Abstração Estrutural à Ultra-Leveza: Interface Agnóstica, Stringada e Modular

Este documento formaliza a inteligência e os fundamentos universais de construção de software, interfaces e produtos do TGCode.
Ele **transcende o design visual**. Qualquer design, estética, identidade ou plataforma (web, mobile, desktop, TV, consoles) se encaixa e opera sob essa mesma inteligência de construção.

---

## 1. Princípio da Casca Branca (*Whitecontent Architecture*)
A interface não possui conteúdo intrínseco.
- Cada componente de interface é um molde puramente geométrico, responsivo e acelerado por hardware.
- Nenhum componente contém regras de negócio hardcoded, imagens fixas, cores isoladas ou textos embutidos.
- Todo e qualquer elemento visual opera na assinatura:
  ```text
  ElementoVisual = F(Tokens, Strings, Payload)
  ```
- O mesmo card que representa um anime na vitrine representa um episódio recente, um item de busca, uma franquia genealógica ou uma quest de gamificação. Muda estritamente o payload e os tokens.

---

## 2. String-Centric & Dicionários por Parquet
Tudo o que comunica, identifica, rotula ou estiliza é 100% stringado/tokenizado:
- **Zero Hardcoding**: Não existem strings soltas espalhadas pelo código-fonte.
- **Dicionários por Idioma em Fatias Compactadas**:
  - Em vez de pacotes JS/JSON inchados que pesam no carregamento da aba, os textos de localização residem em fatias compactadas (ex.: `pt-BR.parquet`, `en-US.parquet`).
  - O navegador lê apenas os bytes necessários sob demanda, com custo de memória próximo de zero.
- **Multitasking e Multitemas**: A troca de tema (Dark, AMOLED, Cyberpunk, Ghibli) ou idioma (i18n) é instantânea por remapeamento de strings/tokens na raiz, sem reprocessar regras lógicas.

---

## 3. Anti-Monólito: Decomposição em Micro-Módulos Puros
Monólitos são proibidos. Arquivos com centenas ou milhares de linhas são sintoma de mistura incorreta de responsabilidades.
- **Limite Físico de Extensão**: Módulos de interface operam entre 30 e 60 linhas de código limpo e legível.
- **Separação de Papéis**:
  - **Módulos de Apresentação**: Apenas declaram casca, geometria e eventos.
  - **Orquestradores**: Apenas coordenam o fluxo de dados entre as cascas.
  - **Camada de Dados**: Totalmente desacoplada da renderização.

---

## 4. Lobby Viewport-First (Dashboard Interativo)
Interfaces interativas, de produtividade ou consumo de mídia não devem obrigar o usuário a rolar cegamente a página:
- Toda a composição primária, navegação e comandos essenciais ficam visíveis imediatamente na viewport do usuário.
- O espaço é organizado por docks, abas limpas, carrosséis fluidos e painéis contextuais.

---

## 5. Densidade Textual Mínima & Explicações On-Demand
- Menor quantidade possível de caracteres expostos diretamente na composição principal.
- Uso expressivo de geometria limpa, formas, ícones universais e status visuais intuitivos.
- **On-Demand**: Toda informação detalhada, ficha técnica, sinopse ou contexto aprofundado abre instantaneamente ao hover/foco via componente de `<Tooltip>` ou gavetas laterais não-bloqueantes.

---

## 6. Gamificação como Loop de Estado e Memória
A interface reage continuamente ao *checkpoint* e progresso do usuário:
- **Progresso e Recompensas Visuais**: O ato de interagir com o catálogo, explorar genealogias ou sincronizar histórico atualiza o progresso de quests e metas visuais.
- **Chamadas Diretas de Baixa Latência**: O navegador apita diretamente na API para leitura e gravação segura de checkpoints, atualizando a casca visual sem recarregar a aplicação.
- **Multi-Níveis**:
  - *Nível 0*: Modo Canônico Puro (neutro, anônimo).
  - *Nível 1*: Modo Comunidade (sincronização na nuvem).
  - *Nível 2*: Operador Local (integração direta com o motor local P2P em `127.0.0.1:4004`).
  - *Nível 3*: Desenvolvedor de Addons (cockpit analítico e estúdio de extensões).

---

## 7. Performance Máxima para Hardware Fraco
O objetivo de engenharia do TGCode é a eficiência total:
- O consumo de CPU e RAM no navegador deve ser tão ínfimo que qualquer máquina modesta capaz de rodar um navegador e uma engine de torrent consiga operar a interface em **qualquer resolução e taxa máxima de atualização (60/120 FPS)** sem travamentos ou gargalos.
- A base de dados principal é processada diretamente na memória do cliente através de fatias Parquet particionadas e compactadas.
