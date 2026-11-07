async function translate(text, targetLang, sourceLang = 'en') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  return data[0]?.map(chunk => chunk[0]).filter(Boolean).join('') || '';
}

async function run() {
  for (const lang of ['pt', 'es', 'fr', 'de']) {
    console.log(lang, '->', await translate("Frieren: Beyond Journey's End", lang));
  }
}

run().catch(console.error);
