// Generates valid PNG icons without any dependencies
const fs = require('fs');

function createSimplePNG(size) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);   // width
  ihdrData.writeUInt32BE(size, 4);   // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type RGB
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk - simple solid color rows (dark purple #6366f1)
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0); // filter byte
    for (let x = 0; x < size; x++) {
      // Draw a simple microphone shape
      const cx = size / 2, cy = size / 2;
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      // Background: dark blue
      let R = 30, G = 30, B = 80;
      // Circle border
      if (r < size * 0.45 && r > size * 0.35) { R = 99; G = 102; B = 241; }
      // Inner fill
      if (r < size * 0.35) { R = 99; G = 102; B = 241; }
      raw.push(R, G, B);
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(raw));
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuffer, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = makeCRCTable();
  for (const byte of buf) crc = (table[(crc ^ byte) & 0xFF] ^ (crc >>> 8));
  return (crc ^ 0xFFFFFFFF);
}

function makeCRCTable() {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
}

[16, 48, 128].forEach(size => {
  const png = createSimplePNG(size);
  fs.writeFileSync(`icon${size}.png`, png);
  console.log(`Created icon${size}.png`);
});
console.log('All icons created successfully!');