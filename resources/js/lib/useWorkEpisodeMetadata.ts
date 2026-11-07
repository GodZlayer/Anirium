import { useEffect, useState } from "react";
import { loadEpisodeMetadata } from "./episodeMetadataLoader.mjs";

export function useWorkEpisodeMetadata(work: any) {
  const [document, setDocument] = useState<any>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setDocument((previous: any) => previous?.mal_id === Number(work?.mal_id ?? work?.id) ? previous : null);
    setErrorUrl(null);
    if (work?.episodes_metadata_url) {
      loadEpisodeMetadata(work, { signal: controller.signal }).then(value => {
        if (!controller.signal.aborted) setDocument(value);
      }).catch(error => {
        if (!controller.signal.aborted) {
          setErrorUrl(work.episodes_metadata_url);
          console.warn("[Episode metadata]", error.message);
        }
      });
    }
    return () => controller.abort();
  }, [work?.catalog_key, work?.episodes_metadata_url]);
  return { document: document?.mal_id === Number(work?.mal_id ?? work?.id) ? document : null,
    error: Boolean(work?.episodes_metadata_url && errorUrl === work.episodes_metadata_url) };
}
