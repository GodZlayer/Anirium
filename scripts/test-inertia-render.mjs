import http from 'node:http';

http.get('http://anirium_web/view/work/21', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const idx = body.indexOf('data-page="');
    if (idx !== -1) {
      const rest = body.slice(idx + 'data-page="'.length);
      const endQuote = rest.indexOf('"');
      const raw = rest.slice(0, endQuote);
      const decoded = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      console.log('STATUS: 200 OK');
      console.log('Component:', decoded.component);
      console.log('URL:', decoded.url);
      console.log('Props:', JSON.stringify(decoded.props, null, 2));
    } else {
      console.log('Not found');
    }
  });
});
