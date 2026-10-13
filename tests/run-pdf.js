// Builds a sample PDF with the text writer and checks its structure:  node tests/run-pdf.js [outfile]
const path = require('path'), fs = require('fs');
const PDF = require(path.join(__dirname, '..', 'src', 'pdf.js'));
const out = process.argv[2] || path.join(__dirname, 'sample.pdf');
const rows = [];
const names = ['Sale price of a loaf', 'Flour, yeast and salt per loaf', 'Loaves sold in a week', 'Rent for the stall, including the deposit that is paid back at the end of the season', 'Takings', 'Costs', 'Left over'];
for (let i = 0; i < 46; i++) {
  const result = i % 7 >= 4;
  rows.push({ symbol: result ? 'xyz'[i % 3] : String.fromCharCode(97 + (i % 26)), label: names[i % 7] + (i > 6 ? ' ' + (i + 1) : ''), ghost: false,
    prefix: i % 3 ? '$' : '', value: (i % 7 === 5 ? '−' : '') + (1234.5 * (i + 1)).toLocaleString('en-US', { maximumFractionDigits: 2 }), suffix: i % 5 === 0 ? 'kg' : '', result, negative: i % 7 === 5 });
}
rows.push({ symbol: 'w', label: 'a × b ÷ c', ghost: true, prefix: '', value: '?', suffix: '', result: true, negative: false });
const doc = { title: 'Market stall – café & bakery takings for the summer season', note: 'Exported 11 October 2026', rows, formulas: ['x = a × c', 'y = −(b × c + d)', 'z = x + y', 'w = sqrt(π × r^2) ≤ sum(all above)'], showSymbols: true };
if (!PDF.isPlain(doc)) throw new Error('sample should be plain');
if (PDF.isPlain(Object.assign({}, doc, { title: '日本語' }))) throw new Error('CJK must not count as plain');
const lay = PDF.layout(doc, { paper: 'letter' }, PDF.afmWidth);
const bytes = PDF.writeText(lay);
fs.writeFileSync(out, bytes);
console.log('pages', lay.pages.length, 'bytes', bytes.length, '->', out);
// a minimal image PDF with a 1x1 JPEG, to check the image path writes a valid file
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');
fs.writeFileSync(out.replace(/\.pdf$/, '-image.pdf'), PDF.writeImages([{ bytes: new Uint8Array(jpeg), width: 1, height: 1 }], 612, 792));
