# Nyaa Provider Server — contrato mínimo v3

Servidor independente Node.js 24. Nenhuma dependência de Core, conta, Player,
cliente torrent ou processamento de mídia. Código executável: `server.js`.

## Responsabilidade

Receber uma consulta textual pronta, consultar o RSS do Nyaa uma vez e devolver
os campos publicados. O consumidor formula aliases/episódios/temporadas, identifica
resultados, deduplica, escolhe arquivos, mede faixas e processa mídia.

O addon não interpreta títulos, não cria consultas alternativas, não ordena nem
deduplica resultados e não acrescenta trackers, qualidade, codec ou idiomas.
Preserva a ordem do índice e valida somente formato, limites e links seguros.

## HTTP

- `GET /health`: disponibilidade, identidade e versão.
- `GET /manifest`: manifesto instalável, capability `magnet.search` e contrato.
- `GET /search?q=<consulta codificada>`: uma consulta, 1–300 caracteres; somente `q`.
- `OPTIONS`: preflight CORS. Outros métodos: 405; outras rotas: 404.

Exemplo: `/search?q=Example%20S02E03`

```json
{
  "results": [
    { "title": "Título original", "link": "https://nyaa.si/download/123.torrent", "seeders": 9, "leechers": 2 }
  ]
}
```

O exemplo é ilustrativo. `link` preserva o link publicado (HTTP/HTTPS ou magnet).
Se o RSS omitir o link e fornecer info hash válido, produz somente o magnet BTIH,
sem trackers adicionais. Contagens ausentes/inválidas retornam `null`, não zero.
Lista vazia significa busca concluída sem resultados utilizáveis; falha upstream
retorna 502 e timeout retorna 504. Nenhum resultado é inventado.

Limite RSS: 4 MiB. Prazo: até 8 segundos; `X-Search-Timeout-Ms` pode reduzi-lo.
Desconexão do consumidor cancela a consulta. Redirecionamentos upstream não são
seguidos. Categoria RSS fixa `c=1_2` (anime traduzido), sem pesquisa em outros índices.
CORS público; não valida conta/Plus nem transmite mídia. O consumidor continua
responsável por validar links antes de usá-los.

## Execução e testes

```sh
npm test
npm run verify:architecture
PROVIDER_PUBLIC_URL=https://n.anirium.com.br PORT=4001 npm start
```

O Dockerfile usa Node.js 24 e executa testes, verificação de fronteiras e runtime.
`PROVIDER_PUBLIC_URL` deve ser uma origem HTTP(S) sem credenciais/caminho/query.
Sem configuração, o manifesto não inventa um endereço público.

## Migração

Versão 3.0.0 quebra o contrato 2.x: `q`/`results`/`link` substituem os parâmetros
semânticos e `sources`/`magnet`. Não publicar sobre o servidor 2.x enquanto seus
consumidores não forem adaptados ou isolados. A adaptação do Service é outra etapa;
não foi implementada dentro deste addon. `enabled:false` é padrão de instalação,
não estado offline. Instalar manifesto não autoriza automaticamente todas as contas.
