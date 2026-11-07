export function jikanRecord(record) {
  const statuses = { "Currently Airing": "RELEASING", "Not yet aired": "NOT_YET_RELEASED", "Finished Airing": "COMPLETED" };
  return {
    m: {
      idMal: record.mal_id,
      sourceCheckedAt: record.source_checked_at || null,
      metadataSource: "myanimelist-jikan",
      officialPatch: {
        genres_json: JSON.stringify([...(record.genres || []), ...(record.explicit_genres || [])]),
        studios_json: JSON.stringify(record.studios || []),
      },
      title: { romaji: record.title, english: record.title_english, native: record.title_japanese },
      description: record.synopsis,
      averageScore: record.score > 0 ? record.score * 10 : null,
      popularity: record.popularity,
      episodes: record.episodes,
      format: record.type,
      seasonYear: record.year || record.aired?.prop?.from?.year || null,
      coverImage: { extraLarge: record.images?.jpg?.large_image_url },
      genres: [...(record.genres || []), ...(record.explicit_genres || [])].map(genre => genre.name),
      studios: { nodes: record.studios || [] },
      externalLinks: (record.streaming || []).map(link => ({ site: link.name, url: link.url })),
    },
    mappedStatus: statuses[record.status] || "UNKNOWN",
    defaultCat: "all",
  };
}
