# Deployment: provider mínimo v3

Código local: 3.0.0, contrato `GET /search?q=...` -> `{ "results": [...] }`.
Origem pública existente: `https://n.anirium.com.br`.
Verificação pública em 04/10/2026: servidor 3.0.0 online, manifesto com origem
correta e busca real retornando 47 resultados com exatamente os quatro campos.
Isso valida o addon publicado, não a compatibilidade dos consumidores antigos.

Publicação v3 autorizada pelo usuário em 04/10/2026, aceitando quebra dos consumidores
2.x, pois somente ele utiliza o sistema. Consumidores antigos enviam título/episódio
e esperam `sources`/`magnet`; serão adaptados posteriormente. A imagem isolada foi
validada. Integração com Service/conta/Player continua sendo outra etapa.
Após pedido explícito de remover o container antigo, o container v2 sem volumes
foi removido e a imagem final v3 publicada como `anirium_addon_nyaa`, na rede
`animeflix_anirium_network`, com alias `anirium-addon-nyaa-p2p` e porta4001.
Imagem final: `sha256:24bc608f80b6027e07634a6edccde5ec1b77a2a3958fb77ee0a9b410e771d7e4`.
Container de teste `anirium_nyaa_minimal_v3` na porta4101 removido em 04/10/2026
a pedido do usuário; não tinha volumes. Somente o container público permanece.

Build independente:

```sh
docker build -t anirium-nyaa:minimal-v3 .
docker run --rm -p 127.0.0.1:4101:4001 -e PROVIDER_PUBLIC_URL=http://127.0.0.1:4101 anirium-nyaa:minimal-v3
```

Não copiar certificados, tokens, estado de conta ou código do Core para a imagem.
Para publicação posterior, preservar o túnel existente e seus demais hostnames.
O hostname do provider deve encaminhar diretamente para seu container na porta4001,
nunca passar por uma rota de proxy do Core. A lista de resultados não contém mídia.

Aceitação: manifesto v3 explícito; consulta exata única; apenas quatro campos por
resultado; dados ausentes como null; sem heurísticas/dedup/ranking; falha502/504;
sem endpointstream; cancelamento e limiteRSS; consumidores conscientes da versão.
