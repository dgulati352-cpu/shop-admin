const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../shop/assets/icon.svg');
const out192 = path.join(__dirname, '../shop/assets/icon-192.png');
const out512 = path.join(__dirname, '../shop/assets/icon-512.png');
const appleIcon = path.join(__dirname, '../shop/assets/apple-touch-icon.png');

const svgBuffer = fs.readFileSync(svgPath);

async function generate() {
  await sharp(svgBuffer).resize(192, 192).png().toFile(out192);
  await sharp(svgBuffer).resize(512, 512).png().toFile(out512);
  await sharp(svgBuffer).resize(180, 180).png().toFile(appleIcon);
  console.log('Icons generated successfully.');
}

generate().catch(console.error);
