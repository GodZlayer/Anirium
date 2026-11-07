import urllib.request
import urllib.parse
import json

def translate_mymemory(text, target_lang='pt', source_lang='en'):
    pair = f"{source_lang}|{target_lang}"
    url = f"https://api.mymemory.translated.net/get?q={urllib.parse.quote(text)}&langpair={urllib.parse.quote(pair)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        return res.get('responseData', {}).get('translatedText', '')

sample = "Beyond Journey's End"
for lang in ['pt', 'es', 'fr', 'de']:
    print(lang, '->', translate_mymemory(sample, lang))
