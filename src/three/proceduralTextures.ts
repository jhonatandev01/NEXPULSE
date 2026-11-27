import * as THREE from 'three';

export interface CellTextures {
  cardboardAlbedo: THREE.CanvasTexture;
  cardboardBump: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  floorAlbedo: THREE.CanvasTexture;
  shippingLabel: THREE.CanvasTexture;
  dispose: () => void;
}

function createCardboardAlbedo(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#cfa06b';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle corrugated kraft fiber variations
  for (let y = 0; y < 256; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? 'rgba(90, 55, 22, 0.06)' : 'rgba(255, 232, 198, 0.05)';
    ctx.fillRect(0, y, 256, 2);
  }
  for (let i = 0; i < 650; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(70, 42, 18, 0.08)' : 'rgba(245, 220, 185, 0.08)';
    ctx.fillRect(x, y, 3, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCardboardBump(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? '#989898' : '#6c6c6c';
    ctx.fillRect(0, y, 128, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createWoodAlbedo(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#b4834e';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 3) {
    const wave = Math.sin(y * 0.14) * 14;
    ctx.strokeStyle = y % 6 === 0 ? 'rgba(82, 48, 19, 0.22)' : 'rgba(232, 195, 145, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(85, y + wave * 0.4, 170, y - wave * 0.4, 256, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createWoodBump(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? '#a0a0a0' : '#666666';
    ctx.fillRect(0, y, 128, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createFloorAlbedo(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Dark industrial epoxy base
  ctx.fillStyle = '#141c2b';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle tile grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Subtle floor aggregate speckle
  for (let i = 0; i < 900; i++) {
    const x = (i * 97) % 512;
    const y = (i * 53) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createShippingLabel(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 128, 64);

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.strokeRect(3, 3, 122, 58);

  // Header bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(8, 8, 52, 9);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(66, 8, 52, 9);

  // Barcode stripes
  let bx = 10;
  for (let i = 0; i < 26; i++) {
    const bw = i % 3 === 0 ? 3 : 1.5;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(bx, 24, bw, 28);
    bx += bw + (i % 2 === 0 ? 2 : 3);
    if (bx > 116) break;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCellTextures(maxAnisotropy: number): CellTextures {
  const cardboardAlbedo = createCardboardAlbedo(maxAnisotropy);
  const cardboardBump = createCardboardBump();
  const woodAlbedo = createWoodAlbedo(maxAnisotropy);
  const woodBump = createWoodBump();
  const floorAlbedo = createFloorAlbedo(maxAnisotropy);
  const shippingLabel = createShippingLabel(maxAnisotropy);

  return {
    cardboardAlbedo,
    cardboardBump,
    woodAlbedo,
    woodBump,
    floorAlbedo,
    shippingLabel,
    dispose: () => {
      cardboardAlbedo.dispose();
      cardboardBump.dispose();
      woodAlbedo.dispose();
      woodBump.dispose();
      floorAlbedo.dispose();
      shippingLabel.dispose();
    },
  };
}
