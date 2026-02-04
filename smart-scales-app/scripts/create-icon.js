const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const svgPath = path.join(__dirname, '..', 'assets', 'icon.svg');
const iconsetPath = path.join(__dirname, '..', 'assets', 'AppIcon.iconset');
const icnsPath = path.join(__dirname, '..', 'assets', 'AppIcon.icns');

// Icon sizes needed for macOS iconset
const sizes = [
  { size: 16, name: 'icon_16x16.png' },
  { size: 32, name: 'icon_16x16@2x.png' },
  { size: 32, name: 'icon_32x32.png' },
  { size: 64, name: 'icon_32x32@2x.png' },
  { size: 128, name: 'icon_128x128.png' },
  { size: 256, name: 'icon_128x128@2x.png' },
  { size: 256, name: 'icon_256x256.png' },
  { size: 512, name: 'icon_256x256@2x.png' },
  { size: 512, name: 'icon_512x512.png' },
  { size: 1024, name: 'icon_512x512@2x.png' },
];

async function createIconset() {
  // Create iconset directory
  if (!fs.existsSync(iconsetPath)) {
    fs.mkdirSync(iconsetPath, { recursive: true });
  }

  // Read SVG
  const svgBuffer = fs.readFileSync(svgPath);

  // Generate each size
  for (const { size, name } of sizes) {
    console.log(`Creating ${name} (${size}x${size})...`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsetPath, name));
  }

  console.log('Converting iconset to icns...');
  execSync(`iconutil -c icns "${iconsetPath}" -o "${icnsPath}"`);

  console.log(`Icon created: ${icnsPath}`);
}

createIconset().catch(console.error);
