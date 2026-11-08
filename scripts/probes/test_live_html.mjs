import http from 'http';

http.get('http://127.0.0.1:8080/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    const m = data.match(/client-explore-count[^>]*>([^<]+)</);
    console.log('Explore count rendered:', m ? m[1] : 'not found');
    const calTitle = data.match(/id="calendar-header-title"[^>]*>([\s\S]*?)<\/h2>/);
    console.log('Calendar title rendered:', calTitle ? calTitle[1].trim() : 'not found');
    const calCount = data.match(/id="calendar-header-count"[^>]*>([\s\S]*?)<\/p>/);
    console.log('Calendar count rendered:', calCount ? calCount[1].trim() : 'not found');
    const mojibake = data.match(/(ðŸ|âœ|âš|Â€|lanÃ§)/g);
    console.log('Total mojibake patterns in live HTML:', mojibake ? mojibake.length : 0);
  });
}).on('error', err => console.error(err));
