/** Source-backed editorial example, not an ingestion seed or a claim of complete coverage. */
export type EditorialRelation = 'shared-universe' | 'adaptation-of' | 'same-creator';
export type CanonStatus = 'confirmed' | 'excluded' | 'disputed' | 'unknown';
export interface ReferenceTitle {
  key: string;
  title: string;
  medium: 'manga' | 'tv' | 'film' | 'novel';
  credits: { person: string; role: 'creator' | 'writer' | 'original-story' | 'illustrator'; source: string }[];
  canon: { continuity: 'bleach-manga'; status: CanonStatus; source: string | null };
  source: string;
  episodeCount?: number;
  releaseYear?: number;
}
const sources = {
  franchise: 'https://www.viz.com/bleach',
  universe: 'https://www.viz.com/blog/posts/bleach-anime-is-coming-back',
  tv: 'https://bleach-anime.com/en/',
  arcs: 'https://bleach-anime.com/stories/',
  films: 'https://bleach-anime.com/bd-box/movie.html',
  cfyow: 'https://www.viz.com/manga-books/novel/bleach-can-t-fear-your-own-world-volume-1/product/6339',
  wedding: 'https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-703412-7',
  cours: 'https://bleach-anime.com/story/',
  novels: 'https://j-books.shueisha.co.jp/books/search_BLEACH.html',
} as const;
const unknown = { continuity: 'bleach-manga', status: 'unknown', source: null } as const;
const creator = { person: 'Tite Kubo', role: 'creator', source: sources.franchise } as const;
export const bleachReferenceCase: {
  observedOn: string;
  productionSeed: false;
  titles: ReferenceTitle[];
  relations: { from: string; to: string; type: EditorialRelation; source: string }[];
  narrativePositions: { titleKey: string; afterArc: string; source: string }[];
  arcs: { key: string; title: string; source: string; episodeMembership: 'pending' }[];
  releaseGroups: { key: string; titleKey: string; scheme: string; ordinal: number; source: string }[];
  releases: { titleKey: string; territory: string; medium: 'print' | 'digital' | 'blu-ray'; date: string; precision: 'day'; source: string }[];
  gaps: string[];
} = {
  observedOn: '2026-10-09', productionSeed: false,
  titles: [
    { key: 'bleach-manga', title: 'BLEACH', medium: 'manga', credits: [creator], canon: unknown, source: sources.franchise },
    { key: 'bleach-tv', title: 'BLEACH', medium: 'tv', episodeCount: 366, credits: [], canon: unknown, source: sources.tv },
    { key: 'bleach-tybw', title: 'BLEACH: Thousand-Year Blood War', medium: 'tv', credits: [], canon: unknown, source: sources.tv },
    { key: 'burn-the-witch', title: 'BURN THE WITCH', medium: 'manga', credits: [creator], canon: unknown, source: sources.franchise },
    { key: 'zombiepowder', title: 'ZOMBIEPOWDER.', medium: 'manga', credits: [creator], canon: unknown, source: sources.franchise },
    { key: 'memories-of-nobody', title: 'BLEACH: Memories of Nobody', medium: 'film', releaseYear: 2006, credits: [], canon: unknown, source: sources.films },
    { key: 'diamonddust-rebellion', title: 'BLEACH: The DiamondDust Rebellion', medium: 'film', releaseYear: 2007, credits: [], canon: unknown, source: sources.films },
    { key: 'fade-to-black', title: 'BLEACH: Fade to Black', medium: 'film', releaseYear: 2008, credits: [], canon: unknown, source: sources.films },
    { key: 'hell-verse', title: 'BLEACH: Hell Verse', medium: 'film', releaseYear: 2010, credits: [], canon: unknown, source: sources.films },
    { key: 'cfyow', title: "BLEACH: Can't Fear Your Own World", medium: 'novel', credits: [
      { person: 'Tite Kubo', role: 'original-story', source: sources.cfyow },
      { person: 'Ryohgo Narita', role: 'writer', source: sources.cfyow },
    ], canon: unknown, source: sources.cfyow },
    { key: 'we-do-knot', title: 'BLEACH WE DO knot ALWAYS LOVE YOU', medium: 'novel', credits: [
      { person: 'Makoto Matsubara', role: 'writer', source: sources.wedding },
      { person: 'Tite Kubo', role: 'original-story', source: sources.wedding },
      { person: 'Tite Kubo', role: 'illustrator', source: sources.wedding },
    ], canon: unknown, source: sources.wedding },
    ...[
      ['honey-dish', 'BLEACH THE HONEY DISH RHAPSODY', 'Makoto Matsubara'],
      ['letters-other-side', 'BLEACH letters from the other side', 'Makoto Matsubara'],
      ['spirits-forever', 'BLEACH Spirits Are Forever With You', 'Ryohgo Narita'],
      ['death-save', 'BLEACH The Death Save The Strawberry', 'Makoto Matsubara'],
    ].map(([key, title, person]): ReferenceTitle => ({ key, title, medium: 'novel', credits: [
      { person, role: 'writer', source: sources.novels },
      { person: 'Tite Kubo', role: 'original-story', source: sources.novels },
    ], canon: unknown, source: sources.novels })),
  ],
  relations: [
    { from: 'burn-the-witch', to: 'bleach-manga', type: 'shared-universe', source: sources.universe },
    { from: 'zombiepowder', to: 'bleach-manga', type: 'same-creator', source: sources.franchise },
    { from: 'bleach-tv', to: 'bleach-manga', type: 'adaptation-of', source: sources.tv },
    { from: 'bleach-tybw', to: 'bleach-manga', type: 'adaptation-of', source: sources.tv },
  ],
  narrativePositions: [{ titleKey: 'cfyow', afterArc: 'bleach-arc-5', source: sources.cfyow }],
  arcs: ['Substitute Soul Reaper', 'Soul Society', 'Arrancar', 'Lost Substitute Soul Reaper', 'Thousand-Year Blood War']
    .map((title, index) => ({ key: `bleach-arc-${index + 1}`, title, source: sources.arcs, episodeMembership: 'pending' as const })),
  releaseGroups: [1, 2, 3, 4].map(ordinal => ({ key: `tybw-cour-${ordinal}`, titleKey: 'bleach-tybw', scheme: 'official-jp-cour', ordinal, source: sources.cours })),
  releases: [
    { titleKey: 'we-do-knot', territory: 'JP', medium: 'print', date: '2016-12-27', precision: 'day', source: sources.wedding },
    { titleKey: 'we-do-knot', territory: 'JP', medium: 'digital', date: '2017-01-27', precision: 'day', source: sources.wedding },
    ...['memories-of-nobody', 'diamonddust-rebellion'].map(titleKey => ({ titleKey, territory: 'JP', medium: 'blu-ray' as const, date: '2022-12-14', precision: 'day' as const, source: sources.films })),
    ...['fade-to-black', 'hell-verse'].map(titleKey => ({ titleKey, territory: 'JP', medium: 'blu-ray' as const, date: '2023-01-25', precision: 'day' as const, source: sources.films })),
  ],
  gaps: [
    'Full 366-episode records and arc memberships, including anime-original arcs and mixed episodes.',
    'Manga chapters/volumes, all novels/volumes, specials, games, live-action and Burn the Witch adaptations.',
    'Verified MAL/AniList/IMDb identifiers and provider-specific season numbering schemes.',
    'Original premiere days, regional availability, editions, dubbing and episode-specific production credits.',
    'Direct canon statements with continuity, scope and author/publisher attribution.',
  ],
};

/** Credits are searchable independently; they never create universe or canon edges. */
export function relatedReferenceTitles(key: string, relation: EditorialRelation) {
  return bleachReferenceCase.relations.filter(edge => edge.type === relation && (edge.from === key || edge.to === key));
}
