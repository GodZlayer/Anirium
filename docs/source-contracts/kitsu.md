# Kitsu: contrato tecnico e estado de admissao

Estado: leitor implementado e validado, **nao admitido na coleta/publicacao automatica**.
Falta verificar as condicoes de reutilizacao e redistribuicao dos dados. A licenca
Apache mencionada na documentacao do software nao foi tomada como licenca do acervo.
A pagina de termos nao forneceu conteudo verificavel nesta consulta.

## Contrato

- Documentacao: https://hummingbird-me.github.io/api-docs/
- Modelos: https://github.com/hummingbird-me/kitsu-server/blob/the-future/app/models/media_relationship.rb
- API observada: `https://kitsu.app/api/edge`, leitura publica GET, JSON:API,
  cabecalho `Accept: application/vnd.api+json`. Sem contas, tokens ou dados sociais.
- Identidade: par `anime|manga` + ID do recurso, nunca titulo. Novels continuam no
  namespace externo `manga`, com tipo interno NOVEL quando subtipo explicito.
- Campos: titulo e variantes, sinopse, status, subtipo, datas, contagens positivas,
  mappings e relacoes. Zero/ausente nao cria episodios, capitulos ou volumes.
- Ratings Kitsu nao substituem score MAL. Imagens, generos e documentos de episodios
  ainda nao sao importados por este leitor.
- Mappings automaticos: `myanimelist/anime|manga`, `anilist/anime|manga`, e AniDB para
  anime. Uma referencia AniList recebida nao provoca consulta direta ao AniList.
  Mapeamentos TVDB de serie/temporada ficam fora ate contrato de granularidade proprio.
- Relacoes: prequel, sequel, alternative_setting, alternative_version, side_story,
  parent_story, summary, full_story, spinoff, adaptation, character, other.
  `spinoff` normaliza para `spin_off`; valores novos e payload bruto sao preservados.
  Relacao de adaptacao nao comprova canon; a fonte nao fornece arcos ou filler aqui.
- Paginacao: colecoes de mappings e media-relationships consultadas separadamente,
  `page[limit]=20`, `page[offset]`, `links.next`. Uma inclusao na resposta da obra
  nao comprova que toda a colecao foi recebida. Origem, caminho, parametros, offsets,
  identidades repetidas e orcamento sao verificados antes de seguir outra pagina.
- Atualizacao: `observed_at` registra a leitura; `source_updated_at` conserva o
  timestamp declarado pelo recurso. Nao apresentar timestamp do download como
  atualizacao editorial da obra.
- Limites: nao foi confirmado limite numerico oficial. O contrato reserva intervalo
  conservador local de 1500 ms; o futuro coletor deve usar o cliente compartilhado
  com timeout, Retry-After, orcamento e checkpoint. O leitor recebe esse cliente por
  parametro e nao cria outro servico nem executa chamadas sozinho.

## Validacao real de 22/10/2026

O mapping MAL anime11757 resolveu Kitsu anime6589 (Sword Art Online). Tres GETs
separados de obra/mappings/relacoes confirmaram sete relacoes: uma sequel,
uma alternative_version, duas adaptation para manga e tres other. Foram preservadas
as referencias MAL11757, AniDB8692 e AniList11757, sem fundir por titulo nem inferir
arcos/canonicidade. Evidencias locais privadas em
`storage/app/catalog/probes/kitsu/{sao,reader-contract,sao-contract}.json`.

Testes cobrem midias com mesmo ID, ausencia de MAL, mappings contraditorios,
propriedade de relacoes, inclusoes ausentes, paginacao multipla, links externos,
alteracao de recurso/parametros, repeticao de offset e esgotamento do orcamento.
Isso valida o leitor, nao a permissao de redistribuicao nem uma coleta integral.
