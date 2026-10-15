export interface StreamingLink {
  id?: number;
  site: string;
  url: string;
  type?: string;
  language?: string | null;
  icon?: string | null;
}

export interface CatalogSourceRelation { namespace: "anilist:media"; fromId: string; fromType: string; toId: string; toType: string; relationType: string; }

/** Observed provider metadata; absent fields are unknown, not display defaults. */
export interface CatalogSourceNode {
  namespace: "anilist:media";
  id: string;
  type: string;
  format?: string;
  episodes?: number | null;
}

export interface Anime {
  textVariants?: CatalogTextVariant[];
  assetRefs?: Array<{assetId:string;slot:string;backend:"https";revision:number;verification:"unverified"}>;
  mal_id: number;
  /** Canonical work ID; legacy mal_id remains the compatibility route key. */
  entityId?: string;
  workEntityId?: string;
  seasonEntityId?: string;
  universeEntityId?: string;
  /** Confirmed AniList namespace, never inferred from the legacy field name. */
  idAnilist?: number;
  sourceRelations?: CatalogSourceRelation[];
  sourceNodes?: CatalogSourceNode[];
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_portuguese?: string;
  synonyms?: string[];
  matched_title?: string;
  matched_reason?: string;
  images: {
    jpg: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
    webp: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
  };
  trailer?: {
    youtube_id?: string;
    url?: string;
    embed_url?: string;
  };
  banner_image?: string;
  synopsis?: string;
  score?: number; // Nota canônica legada / fallback
  score_mal?: number; // Nível 2: Nota MyAnimeList (ex: 8.75)
  score_anilist?: number; // Nível 2: Nota AniList (ex: 86%)
  score_imdb?: number; // Nível 2: Nota IMDb consolidada da obra
  score_episodes_avg?: number; // Nível 2: Média ponderada dos episódios avaliados
  score_work_general?: number; // Nível 2: Nota Geral Consolidada da Obra
  scored_by?: number;
  rank?: number;
  popularity?: number;
  episodes?: number | null;
  status?: string;
  rating?: string;
  genres: Array<{ mal_id: number; name: string }>;
  tags?: Array<{ id: number; name: string; category?: string }>;
  studios?: Array<{ mal_id: number; name: string }>;
  year?: number;
  format?: string;
  season?: string;
  idMal?: number;
  universe_id?: string; // ID ou raiz do universo canônico
  franchise_root?: string; // Nome canônico da franquia pai (ex: "Bleach", "Fate", "JoJo")
  relation_type?: string; // "MAIN", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY", "ALTERNATIVE"
  next_airing_episode?: {
    episode: number;
    airingAt: number;
  };
  latestAiredEpisode?: number;
  streaming_links?: StreamingLink[];
  seasons?: Array<{
    id: number;
    entityId?: string;
    idMal?: number;
    seasonNumber: number;
    title: string;
    title_english?: string;
    format: string; // "TV", "MOVIE", "OVA", "SPECIAL", "SPINOFF"
    episodes: number | null;
    status: string;
    year?: number;
    cover: string;
    streaming_links?: StreamingLink[];
  }>;
}

export interface CatalogTextVariant {
  field: string;
  locale: string;
  form: string;
  sourceKey: string;
  value: string;
  revision?: number;
}

export interface AiringSchedule {
  id: number;
  airingAt: number; // Unix timestamp
  timeUntilAiring: number;
  episode: number;
  anime: Anime;
}

export interface EpisodeScoreInfo {
  episodeNumber: number;
  title?: string;
  airingAt?: number;
  score_community?: number;
  score_imdb?: number;
  score_final?: number;
  votes_count?: number;
}

export interface CanonicalFranchise {
  id: string;
  rootTitle: string;
  title_portuguese?: string;
  title_english?: string;
  representativeAnime: Anime;
  worksCount: number;
  seasonsCount: number;
  averageScore: number;
  score_franchise_avg?: number; // Nível 3: Média ponderada master de todas as obras
  score_franchise_peak?: number; // Nível 3: Maior nota individual registrada na franquia
  maxScore: number;
  scoreCount: number;
  genres: Array<{ mal_id: number; name: string }>;
  tags: Array<{ id: number; name: string; category?: string }>;
  formats: string[];
  yearsRange: string;
  memberAnimes?: Anime[];
}
