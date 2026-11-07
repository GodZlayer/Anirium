import json

with open('top20_universes.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for item in data[:20]:
    r = item['rank']
    title = item['main_title'].encode('ascii', 'ignore').decode('ascii')
    tot = item['total_works']
    an = item['animes']
    mg = item['mangas']
    nv = item['novels']
    samples = " | ".join([s.encode('ascii', 'ignore').decode('ascii') for s in item['samples'][:3]])
    print(f"[{r:02d}] {title}")
    print(f"     Total: {tot} obras (Animes: {an} | Mangas: {mg} | Novels: {nv})")
    print(f"     Exemplos: {samples}\n")
