import * as THREE from 'three';
import type { CellTextures } from './proceduralTextures';
import type { MachineStatus, MosaicPattern } from '../simulation/palletEngine';

export interface RobotRig {
  root: THREE.Group;
  turretYaw: THREE.Group;
  shoulderPitch: THREE.Group;
  elbowPitch: THREE.Group;
  wristPitch: THREE.Group;
  gripperHead: THREE.Group;
  carriedBox: THREE.Group;
  beaconLights: THREE.MeshStandardMaterial[];
  conveyorRollers: THREE.Mesh[];
  infeedBoxes: THREE.Group[];
  sensorLedMat: THREE.MeshStandardMaterial;
  lowerArmLen: number;
  foreArmLen: number;
  shoulderHeight: number;
}

export interface PalletCellMaterials {
  steelDark: THREE.MeshStandardMaterial;
  steelBrushed: THREE.MeshPhysicalMaterial;
  robotYellow: THREE.MeshPhysicalMaterial;
  rubberBlack: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  cardboard: THREE.MeshStandardMaterial;
  cardboardInterlocked: THREE.MeshStandardMaterial;
  cardboardSelected: THREE.MeshStandardMaterial;
  tape: THREE.MeshStandardMaterial;
  label: THREE.MeshStandardMaterial;
  targetWire: THREE.LineBasicMaterial;
  targetFill: THREE.MeshBasicMaterial;
  hazardYellow: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export function createPalletCellMaterials(textures: CellTextures): PalletCellMaterials {
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.78,
  });

  const steelBrushed = new THREE.MeshPhysicalMaterial({
    color: 0x94a3b8,
    roughness: 0.25,
    metalness: 0.9,
    clearcoat: 0.2,
  });

  const robotYellow = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b,
    roughness: 0.28,
    metalness: 0.15,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
  });

  const rubberBlack = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.85,
    metalness: 0.05,
  });

  const wood = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.woodAlbedo,
    bumpMap: textures.woodBump,
    bumpScale: 0.012,
    roughness: 0.82,
    metalness: 0.02,
  });

  const cardboard = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.cardboardAlbedo,
    bumpMap: textures.cardboardBump,
    bumpScale: 0.008,
    roughness: 0.85,
    metalness: 0.02,
  });

  const cardboardInterlocked = new THREE.MeshStandardMaterial({
    color: 0xe6d3b8,
    map: textures.cardboardAlbedo,
    bumpMap: textures.cardboardBump,
    bumpScale: 0.008,
    roughness: 0.85,
    metalness: 0.02,
  });

  const cardboardSelected = new THREE.MeshStandardMaterial({
    color: 0x60a5fa,
    emissive: 0x1d4ed8,
    emissiveIntensity: 0.45,
    roughness: 0.55,
    metalness: 0.1,
  });

  const tape = new THREE.MeshStandardMaterial({
    color: 0xf5e8c8,
    roughness: 0.35,
    metalness: 0.05,
  });

  const label = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.shippingLabel,
    roughness: 0.5,
    metalness: 0.02,
  });

  const targetWire = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
  });

  const targetFill = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });

  const hazardYellow = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.5,
    metalness: 0.1,
  });

  const all = [
    steelDark,
    steelBrushed,
    robotYellow,
    rubberBlack,
    wood,
    cardboard,
    cardboardInterlocked,
    cardboardSelected,
    tape,
    label,
    targetWire,
    targetFill,
    hazardYellow,
  ];

  return {
    steelDark,
    steelBrushed,
    robotYellow,
    rubberBlack,
    wood,
    cardboard,
    cardboardInterlocked,
    cardboardSelected,
    tape,
    label,
    targetWire,
    targetFill,
    hazardYellow,
    dispose: () => {
      all.forEach((m) => m.dispose());
    },
  };
}

/**
 * Creates a composite 3-part corrugated box mesh group (body + top packing tape + side shipping label)
 */
export function createBoxGroup(
  w: number,
  h: number,
  d: number,
  bodyMat: THREE.Material,
  tapeMat: THREE.Material,
  labelMat: THREE.Material,
  castShadow: boolean,
): THREE.Group {
  const group = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(w, h, d);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = h / 2;
  body.castShadow = castShadow;
  body.receiveShadow = true;
  group.add(body);

  // Top packing tape strip
  const tapeGeo = new THREE.BoxGeometry(w * 0.18, 0.006, d * 0.98);
  const tape = new THREE.Mesh(tapeGeo, tapeMat);
  tape.position.y = h + 0.003;
  group.add(tape);

  // Front shipping barcode label
  const lblGeo = new THREE.PlaneGeometry(Math.min(w * 0.45, 0.16), Math.min(h * 0.42, 0.09));
  const lbl = new THREE.Mesh(lblGeo, labelMat);
  lbl.position.set(0, h * 0.54, d / 2 + 0.002);
  group.add(lbl);

  return group;
}

/**
 * Builds the factory floor, safety perimeter stanchions with beacons,
 * infeed roller conveyor, outfeed PBR pallet station, and 6-axis robotic arm.
 */
export function buildPalletizingCell(
  scene: THREE.Scene,
  mats: PalletCellMaterials,
  textures: CellTextures,
  castShadow: boolean,
): RobotRig {
  // 1. Industrial Epoxy Floor + Safety Zone Perimeter
  const floorGeo = new THREE.PlaneGeometry(18, 18);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.floorAlbedo,
    roughness: 0.72,
    metalness: 0.12,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Subtle radial contact grounding disc under the cell
  const contactGeo = new THREE.CircleGeometry(3.4, 48);
  const contactMat = new THREE.MeshBasicMaterial({
    color: 0x020617,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const contactDisc = new THREE.Mesh(contactGeo, contactMat);
  contactDisc.rotation.x = -Math.PI / 2;
  contactDisc.position.y = 0.005;
  scene.add(contactDisc);

  // Safety perimeter curb strips (4 sides around cell)
  const zoneW = 4.6;
  const zoneD = 3.8;
  const stripThickness = 0.05;
  const stripMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.45,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const borderConfigs: [number, number, number, number][] = [
    [0, -zoneD / 2, zoneW, stripThickness],
    [0, zoneD / 2, zoneW, stripThickness],
    [-zoneW / 2, 0, stripThickness, zoneD],
    [zoneW / 2, 0, stripThickness, zoneD],
  ];
  borderConfigs.forEach(([x, z, w, d]) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), stripMat);
    strip.position.set(x, 0.008, z);
    scene.add(strip);
  });

  // 4 Corner Safety Stanchions + Status Beacon Caps
  const beaconLights: THREE.MeshStandardMaterial[] = [];
  const stanchionCoords: [number, number][] = [
    [-zoneW / 2, -zoneD / 2],
    [zoneW / 2, -zoneD / 2],
    [-zoneW / 2, zoneD / 2],
    [zoneW / 2, zoneD / 2],
  ];
  stanchionCoords.forEach(([sx, sz]) => {
    const postGroup = new THREE.Group();
    postGroup.position.set(sx, 0, sz);

    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.16), mats.steelDark);
    basePlate.position.y = 0.0125;
    postGroup.add(basePlate);

    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.065, 1.35, 0.065), mats.hazardYellow);
    pillar.position.y = 0.025 + 1.35 / 2;
    pillar.castShadow = castShadow;
    postGroup.add(pillar);

    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    beaconLights.push(beaconMat);

    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.11, 16), beaconMat);
    beacon.position.y = 1.43;
    postGroup.add(beacon);

    scene.add(postGroup);
  });

  // 2. Outfeed Pallet Transfer Frame & PBR Wooden Pallet at X = +1.05, Z = 0
  const palletCenterX = 1.05;
  const palletCenterZ = 0;
  const palletStation = new THREE.Group();
  palletStation.position.set(palletCenterX, 0, palletCenterZ);

  // Heavy steel transfer frame legs & rails
  const frameH = 0.22;
  const frameW = 1.18;
  const frameD = 1.36;
  const legPositions: [number, number][] = [
    [-frameW / 2 + 0.06, -frameD / 2 + 0.06],
    [frameW / 2 - 0.06, -frameD / 2 + 0.06],
    [-frameW / 2 + 0.06, frameD / 2 - 0.06],
    [frameW / 2 - 0.06, frameD / 2 - 0.06],
  ];
  legPositions.forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, frameH, 0.07), mats.steelDark);
    leg.position.set(lx, frameH / 2, lz);
    leg.castShadow = castShadow;
    palletStation.add(leg);
  });

  [-frameW / 2 + 0.04, frameW / 2 - 0.04].forEach((rx) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, frameD), mats.steelDark);
    rail.position.set(rx, frameH, 0);
    rail.castShadow = castShadow;
    palletStation.add(rail);
  });

  // Outfeed rollers
  for (let i = -3; i <= 3; i++) {
    const roller = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, frameW - 0.12, 12),
      mats.steelBrushed,
    );
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, frameH + 0.02, i * 0.18);
    palletStation.add(roller);
  }

  // PBR Wooden Pallet (1.0m × 1.2m × 0.145m) sitting flush on rollers (y = frameH + 0.045)
  const palletBaseY = frameH + 0.045;
  const palletGroup = new THREE.Group();
  palletGroup.position.y = palletBaseY;

  // 3 Longitudinal Stringers
  [-0.43, 0, 0.43].forEach((sx) => {
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.095, 1.2), mats.wood);
    stringer.position.set(sx, 0.0475, 0);
    stringer.castShadow = castShadow;
    stringer.receiveShadow = true;
    palletGroup.add(stringer);
  });

  // 5 Top Deck Planks
  for (let i = 0; i < 5; i++) {
    const pz = -0.5 + i * 0.25;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.024, 0.17), mats.wood);
    plank.position.set(0, 0.095 + 0.012, pz);
    plank.castShadow = castShadow;
    plank.receiveShadow = true;
    palletGroup.add(plank);
  }

  palletStation.add(palletGroup);
  scene.add(palletStation);

  // 3. Infeed Roller Conveyor at X = -1.25, running along Z from -1.6 to +0.2
  const convX = -1.25;
  const convZCenter = -0.65;
  const convLen = 2.0;
  const convW = 0.56;
  const convHeight = 0.52;

  const conveyorGroup = new THREE.Group();
  conveyorGroup.position.set(convX, 0, convZCenter);

  // 4 Support Legs
  [
    [-convW / 2 + 0.04, -convLen / 2 + 0.15],
    [convW / 2 - 0.04, -convLen / 2 + 0.15],
    [-convW / 2 + 0.04, convLen / 2 - 0.15],
    [convW / 2 - 0.04, convLen / 2 - 0.15],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, convHeight, 0.055), mats.steelDark);
    leg.position.set(lx, convHeight / 2, lz);
    leg.castShadow = castShadow;
    conveyorGroup.add(leg);
  });

  // Twin side guide rails
  [-convW / 2, convW / 2].forEach((rx) => {
    const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, convLen), mats.steelDark);
    sideRail.position.set(rx, convHeight, 0);
    sideRail.castShadow = castShadow;
    conveyorGroup.add(sideRail);
  });

  // Spinning metallic rollers
  const conveyorRollers: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const rz = -convLen / 2 + 0.12 + i * 0.16;
    const roller = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, convW - 0.05, 12),
      mats.steelBrushed,
    );
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, convHeight + 0.015, rz);
    conveyorGroup.add(roller);
    conveyorRollers.push(roller);
  }

  // Optical Sensor S2 bracket at pick end
  const sensorBracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), mats.steelDark);
  sensorBracket.position.set(convW / 2 + 0.03, convHeight + 0.08, convLen / 2 - 0.25);
  conveyorGroup.add(sensorBracket);

  const sensorLedMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 1.6,
  });
  const sensorLed = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), sensorLedMat);
  sensorLed.position.set(convW / 2 + 0.03, convHeight + 0.17, convLen / 2 - 0.25);
  conveyorGroup.add(sensorLed);

  // Incoming boxes waiting on conveyor
  const infeedBoxes: THREE.Group[] = [];
  [-0.55, -0.05, 0.45].forEach((bz) => {
    const box = createBoxGroup(0.32, 0.24, 0.28, mats.cardboard, mats.tape, mats.label, castShadow);
    box.position.set(0, convHeight + 0.038, bz);
    conveyorGroup.add(box);
    infeedBoxes.push(box);
  });

  scene.add(conveyorGroup);

  // 4. 6-Axis Industrial Palletizing Robot Arm at (0, 0, -0.35)
  const robotRoot = new THREE.Group();
  robotRoot.position.set(-0.18, 0, -0.35);
  scene.add(robotRoot);

  // Base Plinth
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.26, 20), mats.steelDark);
  plinth.position.y = 0.13;
  plinth.castShadow = castShadow;
  plinth.receiveShadow = true;
  robotRoot.add(plinth);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 20), mats.steelBrushed);
  collar.position.y = 0.33;
  robotRoot.add(collar);

  // Turret Yaw Pivot (J1)
  const turretYaw = new THREE.Group();
  turretYaw.position.y = 0.4;
  robotRoot.add(turretYaw);

  const turretHousing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.42), mats.robotYellow);
  turretHousing.position.y = 0.16;
  turretHousing.castShadow = castShadow;
  turretYaw.add(turretHousing);

  // Counterbalance drum at rear
  const counterDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.34, 16), mats.steelDark);
  counterDrum.rotation.z = Math.PI / 2;
  counterDrum.position.set(0, 0.2, -0.22);
  turretYaw.add(counterDrum);

  const shoulderHeight = 0.72; // relative to robotRoot (0.4 + 0.32)
  const shoulderPitch = new THREE.Group();
  shoulderPitch.position.set(0, 0.32, 0.06);
  turretYaw.add(shoulderPitch);

  const shoulderJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 18), mats.steelDark);
  shoulderJoint.rotation.z = Math.PI / 2;
  shoulderPitch.add(shoulderJoint);

  // Twin Lower Arm Beams (Length = 1.05m along +Y in local frame)
  const lowerArmLen = 1.05;
  [-0.14, 0.14].forEach((ax) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, lowerArmLen, 0.18), mats.robotYellow);
    beam.position.set(ax, lowerArmLen / 2, 0);
    beam.castShadow = castShadow;
    shoulderPitch.add(beam);
  });

  // Elbow Joint (J3)
  const elbowPitch = new THREE.Group();
  elbowPitch.position.set(0, lowerArmLen, 0);
  shoulderPitch.add(elbowPitch);

  const elbowJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.44, 18), mats.steelDark);
  elbowJoint.rotation.z = Math.PI / 2;
  elbowPitch.add(elbowJoint);

  // Forearm Boom (Length = 1.15m along +Z forward in local frame)
  const foreArmLen = 1.15;
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, foreArmLen), mats.robotYellow);
  forearm.position.set(0, 0, foreArmLen / 2);
  forearm.castShadow = castShadow;
  elbowPitch.add(forearm);

  const servoRear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.3), mats.steelDark);
  servoRear.position.set(0, 0.02, -0.14);
  elbowPitch.add(servoRear);

  // Wrist & Vacuum Gripper Assembly (J4)
  const wristPitch = new THREE.Group();
  wristPitch.position.set(0, 0, foreArmLen);
  elbowPitch.add(wristPitch);

  const wristHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 16), mats.steelDark);
  wristPitch.add(wristHousing);

  const gripperHead = new THREE.Group();
  gripperHead.position.y = -0.12;
  wristPitch.add(gripperHead);

  const manifold = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.28), mats.steelBrushed);
  manifold.castShadow = castShadow;
  gripperHead.add(manifold);

  // 4 Rubber Suction Cups
  [
    [-0.1, -0.09],
    [0.1, -0.09],
    [-0.1, 0.09],
    [0.1, 0.09],
  ].forEach(([cx, cz]) => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.055, 14), mats.rubberBlack);
    cup.position.set(cx, -0.045, cz);
    gripperHead.add(cup);
  });

  // Carried Box attached under suction cups (toggled visible during transport)
  const carriedBox = createBoxGroup(0.32, 0.22, 0.28, mats.cardboard, mats.tape, mats.label, castShadow);
  carriedBox.position.y = -0.295;
  carriedBox.visible = false;
  gripperHead.add(carriedBox);

  return {
    root: robotRoot,
    turretYaw,
    shoulderPitch,
    elbowPitch,
    wristPitch,
    gripperHead,
    carriedBox,
    beaconLights,
    conveyorRollers,
    infeedBoxes,
    sensorLedMat,
    lowerArmLen,
    foreArmLen,
    shoulderHeight,
  };
}

/**
 * Analytical 2-link planar inverse kinematics solver for the 6-axis palletizing arm.
 * Computes exact joint angles so the vacuum gripper reaches (worldX, worldY, worldZ).
 */
export function solveArmIK(
  rig: RobotRig,
  worldX: number,
  worldY: number,
  worldZ: number,
): { yaw: number; shoulder: number; elbow: number; wrist: number } {
  const dx = worldX - rig.root.position.x;
  const dz = worldZ - rig.root.position.z;
  const yaw = Math.atan2(dx, dz);

  // Horizontal reach & vertical delta from shoulder pivot (wrist sits ~0.18m above box top)
  const horiz = Math.max(0.35, Math.hypot(dx, dz));
  const wristTargetY = worldY + 0.18;
  const dy = wristTargetY - rig.shoulderHeight;

  const L1 = rig.lowerArmLen;
  const L2 = rig.foreArmLen;
  const maxReach = (L1 + L2) * 0.96;
  const dist = Math.min(maxReach, Math.max(0.35, Math.hypot(horiz, dy)));

  const targetElev = Math.atan2(dy, horiz);
  const cosAlpha = THREE.MathUtils.clamp(
    (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist),
    -0.98,
    0.98,
  );
  const alpha = Math.acos(cosAlpha);

  // shoulderPitch = 0 points lower arm straight UP (+Y); positive tilts forward (+Z)
  const shoulderElev = targetElev + alpha;
  const shoulder = Math.PI / 2 - shoulderElev;

  // Vector from shoulder to elbow: (horiz1, dy1) = (L1 * sin(shoulder), L1 * cos(shoulder))
  // Vector from elbow to wrist: (horiz - horiz1, dy - dy1)
  const horiz1 = L1 * Math.sin(shoulder);
  const dy1 = L1 * Math.cos(shoulder);
  const forearmElev = Math.atan2(dy - dy1, horiz - horiz1);
  const exactElbow = -shoulder - forearmElev;
  // Keep gripper head strictly vertical
  const wrist = -(shoulder + exactElbow);

  return { yaw, shoulder, elbow: exactElbow, wrist };
}

/**
 * Converts a pallet slot coordinate (mm) into world 3D coordinates centered on the outfeed PBR pallet.
 */
export function slotToWorldPosition(
  xMm: number,
  yMm: number,
  zMm: number,
  pattern: MosaicPattern,
): { x: number; y: number; z: number; boxW: number; boxH: number; boxD: number } {
  const palletCenterX = 1.05;
  const palletCenterZ = 0;
  const palletTopY = 0.22 + 0.045 + 0.095 + 0.024; // 0.384m

  const palletW = 0.96;
  const palletD = 1.14;
  const cellW = palletW / pattern.cols;
  const cellD = palletD / pattern.rows;

  const boxW = cellW * 0.92;
  const boxD = cellD * 0.92;
  const boxH = Math.min(0.24, 0.96 / Math.max(1, pattern.layers));

  // Normalize xMm (0..1000) and yMm (0..1200) to centered meters
  const normX = (xMm - 500) / 1000;
  const normZ = (yMm - 600) / 1200;

  const x = palletCenterX + normX * palletW;
  const z = palletCenterZ + normZ * palletD;
  const layerIndex = Math.round(zMm / Math.max(1, pattern.boxDimensionsMm.height));
  const y = palletTopY + layerIndex * boxH;

  return { x, y, z, boxW, boxH, boxD };
}

export function updateSafetyBeacons(rig: RobotRig, status: MachineStatus): void {
  const colorHex =
    status === 'FALHA'
      ? 0xef4444
      : status === 'PAUSADO'
        ? 0xf59e0b
        : status === 'PALETE_COMPLETO'
          ? 0x3b82f6
          : 0x10b981;

  rig.beaconLights.forEach((mat) => {
    mat.color.setHex(colorHex);
    mat.emissive.setHex(colorHex);
  });

  rig.sensorLedMat.color.setHex(status === 'FALHA' ? 0xef4444 : 0x22c55e);
  rig.sensorLedMat.emissive.setHex(status === 'FALHA' ? 0xef4444 : 0x22c55e);
}
