// ── PDF fotosini ajratish: hh 500x500 FlateDecode -> sifatli JPEG ──
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const jpeg = require('jpeg-js');
const rp = require('../src/services/resumeParser');

// hh PDF'idagi kabi: /Subtype /Image, FlateDecode, DeviceRGB, 8 bit
function fakePdf(w, h) {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 3;
    raw[p] = (x * 255 / w) | 0; raw[p + 1] = (y * 255 / h) | 0; raw[p + 2] = ((x + y) % 2) ? 200 : 40;   // mayda shaxmat — detal
  }
  const comp = zlib.deflateSync(raw);
  const head = Buffer.from(`%PDF-1.4\n5 0 obj\n<< /Length ${comp.length} /Filter /FlateDecode /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 >>\nstream\n`, 'latin1');
  return Buffer.concat([head, comp, Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1')]);
}

test('hh fotosi (500x500) asl o\'lchamda JPEG bo\'lib ajratiladi', () => {
  const url = rp.extractPhoto(fakePdf(500, 500));
  assert.match(url, /^data:image\/jpeg;base64,/);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  const img = jpeg.decode(buf);
  assert.equal(img.width, 500);
  assert.equal(img.height, 500);
  assert.ok(buf.length < 400 * 1024, 'hajmi ' + buf.length);
});

test('katta rasm o\'rtachalab kichraytiriladi (600px gacha)', () => {
  const url = rp.extractPhoto(fakePdf(1200, 1500));
  const img = jpeg.decode(Buffer.from(url.split(',')[1], 'base64'));
  assert.equal(img.height, 600);
  assert.equal(img.width, 480);
});

test('downscale — o\'rtacha (box), tashlab yuborish emas', () => {
  // 4x1 kulrang: 0, 100, 200, 255 -> 2x1: (0+100)/2, (200+255)/2
  const d = rp.downscale(Buffer.from([0, 100, 200, 255]), 4, 1, 1, 2);
  assert.equal(d.w, 2);
  assert.deepEqual([...d.raw], [50, 228]);
});

test('kichik ikonka (72x72) foto deb olinmaydi', () => {
  assert.equal(rp.extractPhoto(fakePdf(72, 72)), '');
});
