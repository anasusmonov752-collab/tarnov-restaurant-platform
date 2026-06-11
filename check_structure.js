const fs = require('fs');
const html = fs.readFileSync('tarnov_page.html', 'utf8');
const idx = html.indexOf('\\"title\\":{\\"uz\\":\\"Kuksi');
const bigChunk = html.substring(Math.max(0, idx-200000), idx+400000);
// Unescape \"  -> "
const data = bigChunk.split('\\"').join('"');
// Find price after Kuksi title
const ki = data.indexOf('"uz":"Kuksi"');
console.log('After Kuksi title:');
console.log(data.substring(ki, ki+1200));
