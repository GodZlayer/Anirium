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

1. **Tudo Stringado (String-Centric Architecture)**:
   - Textos, links de imagens, paletas de cores, identificadores, metadados e módulos de contexto são 100% stringados/tokenizados.
   - Nada de valores 'hardcoded' soltos nos componentes.
   - Permite troca instantânea de temas (Dark/Light/AMOLED/Cyberpunk), suporte trivial a i18n/localização e reaproveitamento modular uniforme (ex: o mesmo card de anime é um módulo reaproveitado N vezes recebendo apenas o payload de strings).

2. **Lobby Sempre Visível (No-Scroll Viewport First)**:
   - Toda a composição primária e controles essenciais devem estar visíveis na viewport sem exigir rolagem cega da página.
   - Design enxuto, minimalista e direto ao ponto.

3. **Densidade Textual Reduzida ao Limite da Razão**:
   - Menor quantidade possível de caracteres/textos expostos diretamente na interface.
   - Uso intensivo de formas visuais limpas: ícones expressivos, imagens, status gráficos e geometria intuitiva.

4. **Explicações Completas On-Demand (Tooltip / Popover)**:
   - Toda e qualquer informação detalhada, contextual ou explicativa fica acessível sob demanda através de tooltips instantâneos ao hover/foco.
   - A interface respira visualmente sem perder profundidade funcional.

5. **Fluxo de UX Modular e Não-Linear**:
   - Todas as jornadas são compostas por setups modulares que suportam ramificações, loops de estado e navegação bidirecional contínua.
<!-- DESIGN-FOUNDATIONS:END -->

