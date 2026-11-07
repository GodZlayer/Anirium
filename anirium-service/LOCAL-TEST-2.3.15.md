# Teste funcional local — 2.3.15.0

Este build não está assinado/certificado pela Microsoft. Testar o executável
fora do pacote não comprova instalação, atualização ou desinstalação MSIX.
Não desative proteções, não ignore avisos de segurança e não instale certificados.

## Artefato exato

Executável: `release/msix-2.3.15.0/payload/anirium-service.exe`.
Mantenha a pasta `tools` ao lado dele; não use o download público antigo.
SHA256: `2D51DB5456A2C31048966183915715D1C351A3B9C3E06C23B036396AA04FB8F4`.
Os diagnósticos do executável com suas ferramentas incluídas passaram durante
o build. A interface nativa e a reprodução autenticada ainda não foram validadas.

## Sequência manual

1. Execute o build local apenas se o Windows permitir normalmente. Se houver
   bloqueio de segurança/assinatura, pare e registre o aviso, sem contorná-lo.
2. Confira janela/tray e `http://127.0.0.1:4004/health`. Não exponha essa porta.
3. Entre em https://anirium.com.br pela autenticação normal; ative Anirium+
   no perfil (beta gratuito) e habilite o plugin Player Pro.
4. Instale/habilite no perfil o manifesto do provider autorizado para seu teste.
   A publicação de https://n.anirium.com.br/manifest não habilita automaticamente
   o addon da conta. Não use um token de teste nem altere o banco para autorizar.
5. Abra um episódio cuja distribuição e uso estejam autorizados. Confirme que
   aparecem somente qualidades, idiomas de áudio e legendas realmente existentes.
6. Teste seek no começo/meio/fim, mudança de qualidade, áudio e ciclo das
   alternativas de legenda por idioma. Observe sincronismo, buffer e transição
   entre janelas; testes automatizados não provaram reprodução sem interrupção.
7. Verifique o bloqueio de uma segunda sessão de Player da mesma conta e a
   revogação ao sair. Não interrompa sessões de outras pessoas.
8. Encerre o Service pelo tray. Verifique o estado offline e reprodução por
   arquivo local/link HTTP direto, sem magnet no Player Pro.

Registre versão, episódio autorizado, opções exibidas, ação executada e erro
observado. Não compartilhe tokens, cookies, credenciais ou dados privados.
Não publique release nem substitua a submissão 2.2.1 antes da validação manual.
