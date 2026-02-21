const sharp = require('sharp');
const path = require('path');

const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0F0F12"/>
      <stop offset="100%" style="stop-color:#08080A"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FB7185"/>
      <stop offset="50%" style="stop-color:#E11D48"/>
      <stop offset="100%" style="stop-color:#BE123C"/>
    </linearGradient>
    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#bgGrad)"/>
  <rect x="2" y="2" width="508" height="508" rx="113" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <path
    d="M 320 130 C 380 130, 380 195, 320 195 L 192 195 C 132 195, 132 260, 192 260 L 320 260 C 380 260, 380 325, 320 325 L 192 325 C 132 325, 132 390, 192 390"
    stroke="url(#accentGrad)"
    stroke-width="44"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
    filter="url(#softGlow)"
  />
  <circle cx="192" cy="390" r="22" fill="url(#accentGrad)" filter="url(#softGlow)"/>
  <circle cx="186" cy="384" r="7" fill="rgba(255,255,255,0.5)"/>
</svg>`;

const svgContentLight = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#faf8f4"/>
      <stop offset="100%" style="stop-color:#f5f1eb"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#C48B5C"/>
      <stop offset="50%" style="stop-color:#B87333"/>
      <stop offset="100%" style="stop-color:#9A5F28"/>
    </linearGradient>
    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#bgGrad)"/>
  <rect x="2" y="2" width="508" height="508" rx="113" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
  <path
    d="M 320 130 C 380 130, 380 195, 320 195 L 192 195 C 132 195, 132 260, 192 260 L 320 260 C 380 260, 380 325, 320 325 L 192 325 C 132 325, 132 390, 192 390"
    stroke="url(#accentGrad)"
    stroke-width="44"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
    filter="url(#softGlow)"
  />
  <circle cx="192" cy="390" r="22" fill="url(#accentGrad)" filter="url(#softGlow)"/>
  <circle cx="186" cy="384" r="7" fill="rgba(255,255,255,0.7)"/>
</svg>`;

const publicDir = path.join(__dirname, 'public');

async function generateIcons() {
  // Dark theme icons
  const svgBuffer = Buffer.from(svgContent);

  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  console.log('✓ Generated icon-512.png');

  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  console.log('✓ Generated icon-192.png');

  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ Generated apple-touch-icon.png');

  // Light theme icons
  const svgBufferLight = Buffer.from(svgContentLight);

  await sharp(svgBufferLight).resize(512, 512).png().toFile(path.join(publicDir, 'icon-light-512.png'));
  console.log('✓ Generated icon-light-512.png');

  await sharp(svgBufferLight).resize(192, 192).png().toFile(path.join(publicDir, 'icon-light-192.png'));
  console.log('✓ Generated icon-light-192.png');

  await sharp(svgBufferLight).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon-light.png'));
  console.log('✓ Generated apple-touch-icon-light.png');

  console.log('\nAll icons generated!');
}

generateIcons().catch(console.error);
