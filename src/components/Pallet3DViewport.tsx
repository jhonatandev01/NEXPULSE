import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Camera, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import {
  buildPalletizingCell,
  createBoxGroup,
  createPalletCellMaterials,
  slotToWorldPosition,
  solveArmIK,
  updateSafetyBeacons,
  type PalletCellMaterials,
  type RobotRig,
} from '../three/palletCellBuilder';
import { createCellTextures, type CellTextures } from '../three/proceduralTextures';
import type { SimulationState } from '../simulation/palletEngine';

export type CameraPreset = 'geral' | 'topo' | 'garra' | 'esteira';

interface Pallet3DViewportProps {
  state: SimulationState;
  selectedSlotIndex: number | null;
  onSelectSlot: (index: number | null) => void;
  layerFilter: number | null; // null = todas as camadas
  onChangeLayerFilter: (layer: number | null) => void;
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  geral: { label: 'Geral', pos: [2.85, 2.35, 3.05], target: [0.25, 0.55, -0.1] },
  topo: { label: 'Topo', pos: [1.05, 3.3, 0.05], target: [1.05, 0.45, 0] },
  garra: { label: 'Garra', pos: [0.95, 1.85, 1.85], target: [0.35, 0.85, -0.15] },
  esteira: { label: 'Esteira', pos: [-2.45, 1.55, 1.65], target: [-1.15, 0.6, -0.35] },
};

const _mouse = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _camGoalPos = new THREE.Vector3(...CAMERA_PRESETS.geral.pos);
const _camGoalTarget = new THREE.Vector3(...CAMERA_PRESETS.geral.target);

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const Pallet3DViewport: React.FC<Pallet3DViewportProps> = ({
  state,
  selectedSlotIndex,
  onSelectSlot,
  layerFilter,
  onChangeLayerFilter,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const selectedRef = useRef(selectedSlotIndex);
  const layerFilterRef = useRef(layerFilter);
  const onSelectRef = useRef(onSelectSlot);

  const [activePreset, setActivePreset] = useState<CameraPreset>('geral');
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const presetTriggerRef = useRef<{ active: boolean; pos: THREE.Vector3; target: THREE.Vector3 }>({
    active: false,
    pos: _camGoalPos.clone(),
    target: _camGoalTarget.clone(),
  });

  stateRef.current = state;
  selectedRef.current = selectedSlotIndex;
  layerFilterRef.current = layerFilter;
  onSelectRef.current = onSelectSlot;

  const handleSelectPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    const cfg = CAMERA_PRESETS[preset];
    presetTriggerRef.current.pos.set(...cfg.pos);
    presetTriggerRef.current.target.set(...cfg.target);
    presetTriggerRef.current.active = true;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let disposed = false;
    let frameId = 0;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(280, container.clientHeight);
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute('data-testid', 'pallet-3d-canvas');
    container.appendChild(renderer.domElement);

    // Scene & Fog matching dark obsidian industrial floor
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.055);

    // Studio IBL Environment Map
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    // Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 40);
    camera.position.set(...CAMERA_PRESETS.geral.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.geral.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.4;
    controls.maxDistance = 8.0;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.update();

    const cancelCameraPreset = () => {
      presetTriggerRef.current.active = false;
    };
    controls.addEventListener('start', cancelCameraPreset);

    // 3-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.1);
    keyLight.position.set(3.5, 5.2, 3.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 14;
      keyLight.shadow.camera.left = -3.5;
      keyLight.shadow.camera.right = 3.5;
      keyLight.shadow.camera.top = 3.5;
      keyLight.shadow.camera.bottom = -3.5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-3.5, 3.0, -3.5);
    scene.add(rimLight);

    // Textures, Materials & Cell Rig
    const maxAniso = isSoftwareGl ? 1 : renderer.capabilities.getMaxAnisotropy();
    const textures: CellTextures = createCellTextures(maxAniso);
    const mats: PalletCellMaterials = createPalletCellMaterials(textures);
    const rig: RobotRig = buildPalletizingCell(scene, mats, textures, !isSoftwareGl);

    // Dynamic containers for placed boxes + next-slot ghost
    const placedBoxesGroup = new THREE.Group();
    scene.add(placedBoxesGroup);

    const ghostGroup = new THREE.Group();
    const ghostBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const ghostFillMesh = new THREE.Mesh(ghostBoxGeo, mats.targetFill);
    const ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(ghostBoxGeo), mats.targetWire);
    ghostGroup.add(ghostFillMesh);
    ghostGroup.add(ghostEdges);
    scene.add(ghostGroup);

    const interactables: THREE.Object3D[] = [];
    let boxPool: THREE.Group[] = [];
    let lastPatternKey = '';

    const rebuildBoxPool = (patternId: string, stateSnap: SimulationState) => {
      boxPool.forEach((b) => placedBoxesGroup.remove(b));
      boxPool = [];
      interactables.length = 0;

      stateSnap.slots.forEach((slot) => {
        const pos = slotToWorldPosition(slot.xMm, slot.yMm, slot.zMm, stateSnap.activePattern);
        const bodyMat = slot.rotated ? mats.cardboardInterlocked : mats.cardboard;
        const box = createBoxGroup(
          pos.boxW,
          pos.boxH,
          pos.boxD,
          bodyMat,
          mats.tape,
          mats.label,
          !isSoftwareGl,
        );
        box.position.set(pos.x, pos.y, pos.z);
        if (slot.rotated) {
          box.rotation.y = Math.PI / 2;
        }
        box.visible = false;
        box.userData.slotIndex = slot.index;
        box.userData.defaultBodyMat = bodyMat;
        // Tag child body mesh for raycasting
        const bodyMesh = box.children[0];
        if (bodyMesh) {
          bodyMesh.userData.slotIndex = slot.index;
          interactables.push(bodyMesh);
        }
        placedBoxesGroup.add(box);
        boxPool.push(box);
      });
      lastPatternKey = `${patternId}-${stateSnap.slots.length}`;
    };

    rebuildBoxPool(stateRef.current.activePattern.id, stateRef.current);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycast click-to-inspect
    const handlePointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_mouse, camera);
      const hits = _raycaster.intersectObjects(interactables, false);
      const visibleHit = hits.find((h) => h.object.parent?.visible);
      if (visibleHit) {
        const idx = visibleHit.object.userData.slotIndex;
        if (typeof idx === 'number') {
          onSelectRef.current(idx);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // WebGL Context Loss safety
    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // ResizeObserver for crisp fit
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(300, Math.floor(entry.contentRect.width));
        const h = Math.max(260, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // Kinematic animation state
    let curYaw = 0.6;
    let curShoulder = 0.35;
    let curElbow = -0.3;
    let curWrist = 0.05;
    let lastTime = performance.now();
    let conveyorOffset = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const syncState = sync && gl.getSyncParameter ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (syncState === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync && gl.deleteSync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min(0.08, Math.max(0.008, (now - lastTime) / 1000));
      lastTime = now;

      const curState = stateRef.current;
      const patKey = `${curState.activePattern.id}-${curState.slots.length}`;
      if (patKey !== lastPatternKey) {
        rebuildBoxPool(curState.activePattern.id, curState);
      }

      // Sync box visibility, layer filter, and selected highlight
      const filterLayer = layerFilterRef.current;
      const selIdx = selectedRef.current;

      for (let i = 0; i < curState.slots.length; i++) {
        const slot = curState.slots[i];
        const boxGroup = boxPool[i];
        if (!boxGroup) continue;

        const layerMatch = filterLayer === null || slot.layer <= filterLayer;
        boxGroup.visible = slot.filled && layerMatch;

        const bodyMesh = boxGroup.children[0] as THREE.Mesh | undefined;
        if (bodyMesh) {
          bodyMesh.material =
            selIdx === slot.index
              ? mats.cardboardSelected
              : (boxGroup.userData.defaultBodyMat as THREE.Material);
        }
      }

      // Sync next target wireframe
      const nextSlot = curState.slots.find((s) => !s.filled);
      if (nextSlot && curState.status !== 'PALETE_COMPLETO') {
        const wp = slotToWorldPosition(nextSlot.xMm, nextSlot.yMm, nextSlot.zMm, curState.activePattern);
        ghostGroup.visible = filterLayer === null || nextSlot.layer <= filterLayer;
        ghostGroup.position.set(wp.x, wp.y + wp.boxH / 2, wp.z);
        ghostGroup.scale.set(wp.boxW, wp.boxH, wp.boxD);
        mats.targetWire.color.setHex(curState.status === 'FALHA' ? 0xef4444 : 0x38bdf8);
        mats.targetFill.color.setHex(curState.status === 'FALHA' ? 0xef4444 : 0x38bdf8);
      } else {
        ghostGroup.visible = false;
      }

      // Update safety beacons & sensor LED
      updateSafetyBeacons(rig, curState.status);

      // Animate conveyor rollers & infeed boxes while OPERANDO
      if (curState.status === 'OPERANDO') {
        conveyorOffset = (conveyorOffset + dt * 0.45) % 0.5;
        rig.conveyorRollers.forEach((roller) => {
          roller.rotation.x += dt * 4.5;
        });
        rig.infeedBoxes.forEach((box, idx) => {
          box.position.z = -0.65 + idx * 0.5 + conveyorOffset * 0.6;
        });
      }

      // Solve Robotic Arm Kinematics based on robotPhase
      let targetX = 0.0;
      let targetY = 1.15;
      let targetZ = -0.15;
      let showCarried = false;

      if (curState.status === 'PALETE_COMPLETO' || curState.status === 'PAUSADO') {
        targetX = -0.1;
        targetY = 1.35;
        targetZ = 0.25;
      } else if (curState.robotPhase === 'PEGANDO_CAIXA') {
        targetX = -1.25;
        targetY = 0.84;
        targetZ = -0.15;
        showCarried = false;
      } else if (curState.robotPhase === 'MOVENDO') {
        targetX = 0.15;
        targetY = 1.48;
        targetZ = -0.05;
        showCarried = true;
      } else if (curState.robotPhase === 'POSICIONANDO' && nextSlot) {
        const wp = slotToWorldPosition(nextSlot.xMm, nextSlot.yMm, nextSlot.zMm, curState.activePattern);
        targetX = wp.x;
        targetY = wp.y + wp.boxH + 0.06;
        targetZ = wp.z;
        showCarried = true;
      } else if (curState.robotPhase === 'RETORNANDO') {
        targetX = 0.1;
        targetY = 1.42;
        targetZ = -0.25;
        showCarried = false;
      } else if (nextSlot) {
        const wp = slotToWorldPosition(nextSlot.xMm, nextSlot.yMm, nextSlot.zMm, curState.activePattern);
        targetX = wp.x;
        targetY = wp.y + wp.boxH + 0.22;
        targetZ = wp.z;
      }

      rig.carriedBox.visible = showCarried && curState.status !== 'PALETE_COMPLETO';

      const ik = solveArmIK(rig, targetX, targetY, targetZ);
      const dampLambda = curState.status === 'FALHA' ? 0 : 7.5;
      if (dampLambda > 0) {
        curYaw = THREE.MathUtils.damp(curYaw, ik.yaw, dampLambda, dt);
        curShoulder = THREE.MathUtils.damp(curShoulder, ik.shoulder, dampLambda, dt);
        curElbow = THREE.MathUtils.damp(curElbow, ik.elbow, dampLambda, dt);
        curWrist = THREE.MathUtils.damp(curWrist, ik.wrist, dampLambda, dt);
      }

      rig.turretYaw.rotation.y = curYaw;
      rig.shoulderPitch.rotation.x = curShoulder;
      rig.elbowPitch.rotation.x = curElbow;
      rig.wristPitch.rotation.x = curWrist;

      // Smooth camera preset transition (cancels on user drag)
      if (presetTriggerRef.current.active) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, presetTriggerRef.current.pos.x, 7, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, presetTriggerRef.current.pos.y, 7, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, presetTriggerRef.current.pos.z, 7, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, presetTriggerRef.current.target.x, 7, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, presetTriggerRef.current.target.y, 7, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, presetTriggerRef.current.target.z, 7, dt);

        if (camera.position.distanceTo(presetTriggerRef.current.pos) < 0.02) {
          presetTriggerRef.current.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      renderer.render(scene, camera);
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', cancelCameraPreset);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry?.dispose();
        }
      });
      ghostBoxGeo.dispose();
      mats.dispose();
      textures.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[465px] bg-[#090D16] overflow-hidden select-none">
      {/* Isolated WebGL Mount Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {contextLost && (
        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-30">
          <p className="text-base font-semibold text-white">
            Contexto gráfico 3D suspenso
          </p>
          <p className="text-sm text-slate-300 mt-1">
            Alterne para o Mapa 2D acima enquanto o contexto WebGL é restaurado.
          </p>
        </div>
      )}

      {/* Minimalist Bottom Camera & Layer Dock */}
      <div className="absolute bottom-3 inset-x-3 z-20 flex flex-col items-center pointer-events-none">
        {hudCollapsed ? (
          <button
            type="button"
            onClick={() => setHudCollapsed(false)}
            style={{ backgroundColor: 'rgba(11, 16, 28, 0.94)' }}
            className="pointer-events-auto px-3.5 py-1.5 text-[11px] font-semibold text-slate-200 border border-slate-700/80 rounded-xl hover:text-white flex items-center gap-1.5 cursor-pointer shadow-lg"
          >
            <ChevronUp className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
            Controles 3D
          </button>
        ) : (
          <div
            style={{ backgroundColor: 'rgba(11, 16, 28, 0.94)' }}
            className="pointer-events-auto max-w-full border border-slate-700/80 rounded-2xl px-2.5 py-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.75)]"
          >
            <div className="flex items-center gap-1 pr-2 sm:border-r sm:border-slate-800">
              <Camera className="w-3.5 h-3.5 text-sky-400 mr-0.5 shrink-0" aria-hidden="true" />
              {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectPreset(key)}
                  aria-pressed={activePreset === key}
                  className={`btn-glass-hover px-2 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                    activePreset === key
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  {CAMERA_PRESETS[key].label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-amber-400 mr-0.5 shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onChangeLayerFilter(null)}
                aria-pressed={layerFilter === null}
                className={`btn-glass-hover px-2 py-1 text-[11px] font-mono font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                  layerFilter === null
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                Todas
              </button>
              {Array.from({ length: state.activePattern.layers }, (_, i) => i + 1).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onChangeLayerFilter(l)}
                  aria-pressed={layerFilter === l}
                  className={`btn-glass-hover px-2 py-1 text-[11px] font-mono font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                    layerFilter === l
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  C{l}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setHudCollapsed(true)}
              aria-label="Minimizar controles 3D"
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/70 cursor-pointer"
            >
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
