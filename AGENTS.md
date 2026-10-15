<!-- AI-MEMORY-WORKFLOW:START -->
# Continuidade do desenvolvimento

Decisão explícita do usuário: ai-memory é a única memória operacional compartilhada entre Codex e Antigravity. Laya atua somente como motor secundário de análise/cálculo; Obsidian é documentação humana.

- Ao retomar trabalho, recupere contexto relevante pelo ai-memory e mantenha plano, estado, decisões e evidências ali. Não crie memória concorrente no Laya, Jev, SQLite de UniversalAgentRuntime ou vaults de runtime.
- Antes de decisões técnicas relevantes, consulte o Laya com pergunta e evidências curtas pelo comando abaixo. A execução e a decisão final permanecem na conversa principal. Não consulte para cada comando mecânico. Valide as respostas; indisponibilidade não bloqueia trabalho já autorizado e não concede aprovação. Cálculos exatos exigem código determinístico e validação.
- Laya: Python C:/Users/santo/.laya/venv/Scripts/python.exe, script C:/Users/santo/Documents/AI-Memory/bin/laya-calculate.py, parâmetro --file <JSON com question e context>. O resultado é consultivo. Registre resultados relevantes e comprovados no ai-memory. Não use project_brain, project_memory_init, mission-create, project_execute, hierarchy_run ou workers_run como rotina.
- Regras permanentes do processo ficam neste arquivo e nas instruções canônicas do projeto; uma lembrança recuperada não é autorização nem substitui instruções. A existência de memória não garante recuperação de toda informação.
- Execute investigação, edição, build e testes diretamente na conversa principal, preservando o modelo escolhido. Subagentes, executores delegados e ações externas exigem autorização explícita do usuário.
- Obsidian é apenas o editor/navegador dos documentos de desenvolvimento: README.md, docs/, wiki/, decisões arquiteturais e histórico editorial. Mantenha cada documento na pasta do projeto. Não registre o estado operacional em vaults .agent-runtime. Documentação descreve resultados e evidências; ai-memory preserva a continuidade dos agentes.
- Instalação: C:/Users/santo/Documents/AI-Memory/bin/ai-memory.exe. Dados: C:/Users/santo/Documents/AI-Memory/data. Servidor local: http://127.0.0.1:49374; interface de leitura: /web. Não crie outra instância sobre os mesmos dados.
- Ao encerrar uma etapa, registre um resumo compacto do resultado validado, pendências e próximo passo. O usuário autorizou expressamente essa persistência de continuidade. Não armazene segredos nem a conversa inteira.
<!-- AI-MEMORY-WORKFLOW:END -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- DESIGN-FOUNDATIONS:START -->
# Fundamento Universal de UX/UI e Arquitetura de Frontend (Padrão TGCode)

Diretriz lógica permanente definida pelo usuário para todas as telas, componentes e funções:

1. **Casca Branca (Whitecontent Architecture)**:
   - A interface não tem conteúdo intrínseco.
   - Cada componente é um molde puramente geométrico, responsivo e acelerado por hardware: `ElementoVisual = F(Tokens, Strings, Payload)`.
   - O mesmo card serve para anime, episódio, busca, franquia genealógica ou quest.

2. **Tudo Stringado (String-Centric & Parquet Localized)**:
   - Zero hardcode no código-fonte.
   - Dicionários de strings particionados por idioma (ex.: `pt-BR.parquet`, `en-US.parquet`) carregados em milissegundos sem inchar o bundle JS.
   - Troca instantânea de tema (Dark/AMOLED/Cyberpunk) e idioma sem reprocessar regras lógicas.

3. **Anti-Monólito Rigoroso (Micro-Módulos Puros)**:
   - Proibidos arquivos com centenas de linhas. Componentes de casca visual devem possuir entre 30 e 60 linhas de código limpo.
   - Separação estrita: Componentes visuais apenas renderizam geometria; orquestradores apenas coordenam; dados ficam no cliente/Parquet.

4. **Lobby Sempre Visível (No-Scroll Viewport / Dashboard First)**:
   - Toda a composição primária, navegação e controles essenciais visíveis imediatamente na viewport, sem rolagem cega.
   - Organização estruturada em docks, abas limpas e carrosséis fluidos.

5. **Densidade Textual Reduzida ao Mínimo + On-Demand (Tooltip / Popover)**:
   - Menor quantidade possível de caracteres expostos na interface.
   - Geometria limpa e ícones universais. Explicações completas aparecem instantaneamente ao hover/foco.

6. **Loop de Estado e Gamificação com Memória**:
   - A interface reage dinamicamente ao checkpoint do usuário (Níveis 0 a 3, quests ativas, histórico).
   - O navegador apita diretamente na API para sincronização rápida sem recarregar a tela.

7. **Ultra-Leveza e Desempenho Extremo**:
   - O consumo de CPU e RAM no navegador deve ser mínimo para que qualquer PC modesto que rode torrent execute a interface em taxa máxima (60/120 FPS).
<!-- DESIGN-FOUNDATIONS:END -->

