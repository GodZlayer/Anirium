# Validacao basica de conta — 23/10/2026

Escopo: funcoes usuais do tier1, sem certificacao de ausencia de bugs ou de
reproducao Anirium+.

Testes Laravel isolados, SQLite em memoria (phpunit.xml), sem alterar dados da
conta real:

- CatalogLibraryTest e CommunityAddonsTest existentes:13 testes,81 assertions.
- Novos cenarios test_tier_one_can:3 testes,25 assertions.
- Favoritar, curtir, atribuir nota/status/progresso, ler preferencias, consultar
  biblioteca e remover favorito/curtida/nota preservando progresso: passou.
- Publicar e ler comentario com autor; rejeitar comentario vazio: passou.
- Tier1 instalar referencia comunitaria, listar, desativar e remover: passou.
- Isolamento entre contas e compatibilidade de aliases: suite existente passou.

Comandos executados no container anirium_app:

    php artisan test --compact --filter='CatalogLibraryTest|CommunityAddonsTest'
    php artisan test --compact --filter='test_tier_one_can'

A aba real estava guest. O botao Entrar com Google abriu a identificacao do
Google, sem sessao previamente autenticada. Login manual solicitado ao usuario.
Ainda pendente: confirmar retorno da autenticacao e executar os controles na
interface com sessao real. O retorno OAuth observado aponta para anirium.com.br;
nao foi comprovado retorno autenticado para localhost.

Instalacao de referencia nao prova resolucao de dados ou playback pelo Service.
Esses fluxos nao fazem parte desta aprovacao basica de conta.

## Retorno informado pelo usuario

Depois de o usuario informar login concluido, a aba localhost:8080 foi atualizada
e continuou exibindo Entrar com Google. A consulta visual ao dominio de retorno
https://anirium.com.br mostrou Cloudflare Tunnel error1033 em23/10/2026.
Evidencia: storage/app/catalog/probes/tier-one/login-return-error.png.
O botao LolProfileBadge fixa esse dominio como retorno fora de producao.
Nao foi comprovada sessao real autenticada; nao se aprovam os controles visuais
com base apenas nos testes Laravel. Nenhum token foi copiado ou simulado.

## Teste visual com sessao real apos ativar o tunnel

Conta de membro conectada no dominio anirium.com.br (nao Plus/admin).
Login e sessao permaneceram apos recarregar. Favoritar no lobby mudou o estado,
persistiu no reload e apareceu na biblioteca. Curtir e avaliar a obra tambem
persistiram no reload. Discussao publicou e exibiu1mensagem identificada como
teste funcional. Perfil, configuracoes, biblioteca e formulario de instalacao de
addon abriram. Instalacao/desativacao/remocao de addon foram verificadas pelos
testes Laravel isolados; nao se afirma resolucao ou playback na conta real.

Limitacoes observadas: nota cicla1..10 e nao oferece limpar; ficou nota1 na obra
usada no teste. Remocao de favorito no contexto nao atualizou imediatamente a
marcacao no lobby; esta tambem foi removida pelo botao do lobby. Curtida de teste
foi retirada. Comentario de teste permanece publicado. A biblioteca mostrou
1obra, enquanto o titulo da aba indicava2favoritos; contagem necessita ajuste.

Evidencia visual: storage/app/catalog/probes/tier-one/account-discussion.png.
Basicos de conta aprovados com essas limitacoes pontuais, conforme escopo pedido
pelo usuario. Logout nao executado para preservar a sessao entregue. Progresso
foi validado no backend, sem simular reproducao.
