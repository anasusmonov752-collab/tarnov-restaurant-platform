// Run: node generate-icons.js
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.15; // border radius equivalent via clip

  // Background
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, 0, size, size);

  // Gold gradient circle
  const grad = ctx.createRadialGradient(size*0.5, size*0.35, 0, size*0.5, size*0.5, size*0.55);
  grad.addColorStop(0, 'rgba(229,169,58,0.18)');
  grad.addColorStop(1, 'rgba(200,146,42,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // "T" letter
  const fontSize = size * 0.52;
  ctx.font = `800 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Gold gradient text
  const textGrad = ctx.createLinearGradient(size*0.2, size*0.3, size*0.8, size*0.7);
  textGrad.addColorStop(0, '#E5A93A');
  textGrad.addColorStop(0.5, '#C8922A');
  textGrad.addColorStop(1, '#A07520');
  ctx.fillStyle = textGrad;
  ctx.fillText('T', size * 0.5, size * 0.52);

  // Small star decorations
  ctx.fillStyle = 'rgba(200,146,42,0.5)';
  ctx.font = `${size * 0.1}px Arial`;
  ctx.fillText('✦', size * 0.5, size * 0.88);

  return canvas.toBuffer('image/png');
}

try {
  const outDir = path.join(__dirname, 'public', 'images');
  fs.writeFileSync(path.join(outDir, 'icon-192.png'), generateIcon(192));
  fs.writeFileSync(path.join(outDir, 'icon-512.png'), generateIcon(512));
  console.log('✅ Icons generated: icon-192.png, icon-512.png');
} catch (e) {
  console.log('canvas package not available, using logo as fallback');
}
