import https from 'node:https';

const query = `
query {
  Page(page: 1, perPage: 25) {
    media(status: RELEASING, sort: TRENDING_DESC, type: ANIME, isAdult: false) {
      id
      idMal
      title { romaji english }
      siteUrl
      externalLinks {
        id
        site
        url
        type
      }
    }
  }
}
`;

const req = https.request('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    if (res.statusCode === 200) {
      const parsed = JSON.parse(data);
      const media = parsed.data?.Page?.media || [];
      console.log('Found media count:', media.length);
      for (const m of media.slice(0, 10)) {
        const stream = (m.externalLinks || []).filter(l => ['Crunchyroll', 'Netflix', 'Hulu', 'Prime Video', 'Disney Plus', 'HIDIVE', 'Bilibili TV', 'YouTube'].includes(l.site));
        const official = (m.externalLinks || []).find(l => l.site === 'Official Site' || l.type === 'INFO');
        console.log('-', m.title.romaji, 'MAL:', m.idMal);
        console.log('   Streams:', stream.map(s => s.site + ' -> ' + s.url));
        console.log('   Official:', official?.url);
      }
    } else {
      console.log('Body:', data);
    }
  });
});

req.write(JSON.stringify({ query }));
req.end();
