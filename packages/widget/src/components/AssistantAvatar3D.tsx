import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeAvatarPose, type AvatarVisualState } from './avatarKinematics.ts';

export interface AssistantAvatar3DProps {
  title: string;
  open: boolean;
  thinking?: boolean;
  celebrateTick?: number;
  accentColor?: string;
  primaryColor?: string;
  onClick: () => void;
}

function detectSoftwareWebGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
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

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
    grad.addColorStop(0.55, 'rgba(249, 115, 22, 0.22)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function AssistantAvatar3D({
  title,
  open,
  thinking = false,
  celebrateTick = 0,
  accentColor = '#f97316',
  primaryColor = '#0f172a',
  onClick,
}: AssistantAvatar3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [visualState, setVisualState] = useState<AvatarVisualState>('idle');
  const [clickCount, setClickCount] = useState(0);

  // Mutable animation state stored in refs so React re-renders never tear down WebGL
  const hoveredRef = useRef(false);
  const thinkingRef = useRef(thinking);
  const clickStartMsRef = useRef<number | null>(null);
  const celebrateStartMsRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const visualStateRef = useRef<AvatarVisualState>('idle');

  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);

  useEffect(() => {
    if (celebrateTick > 0) {
      celebrateStartMsRef.current = performance.now();
    }
  }, [celebrateTick]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const width = Math.max(container.clientWidth || 120, 88);
    const height = Math.max(container.clientHeight || 124, 88);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.pointerEvents = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 30);
    camera.position.set(0, 0.25, 3.85);
    camera.lookAt(0, 0.08, 0);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // 3-Point Warm Studio Lighting matching Khazna Paper + Ember Orange
    const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x1e293b, 1.18);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.25);
    keyLight.position.set(2.4, 3.6, 3.2);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xfb923c, 1.9, 12);
    rimLight.position.set(-2.2, 1.4, -1.8);
    scene.add(rimLight);

    // Track disposable resources
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];

    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      materials.push(m);
      return m;
    };

    const accentThreeColor = new THREE.Color(accentColor);
    const primaryThreeColor = new THREE.Color(primaryColor);

    const matCeramic = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfaf7f2,
        roughness: 0.26,
        metalness: 0.1,
      })
    );
    const matSlateMetal = trackMat(
      new THREE.MeshStandardMaterial({
        color: primaryThreeColor.clone().lerp(new THREE.Color(0x1e293b), 0.38),
        roughness: 0.24,
        metalness: 0.82,
      })
    );
    const matCobaltTrim = trackMat(
      new THREE.MeshStandardMaterial({
        color: accentThreeColor,
        roughness: 0.28,
        metalness: 0.62,
      })
    );
    const matVisorGlass = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x0f172a,
        roughness: 0.08,
        metalness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
      })
    );
    const matCyanGlow = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfdba74,
        emissive: accentThreeColor,
        emissiveIntensity: 1.25,
        roughness: 0.18,
        metalness: 0.1,
      })
    );
    const matEyeGlow = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffedd5,
        emissive: new THREE.Color(0xfb923c),
        emissiveIntensity: 1.65,
        roughness: 0.15,
        metalness: 0.05,
      })
    );

    const avatarRoot = new THREE.Group();
    scene.add(avatarRoot);

    // 1. Contact shadow disc (grounded beneath pedestal)
    const shadowTex = createContactShadowTexture();
    textures.push(shadowTex);
    const shadowPlane = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1.7, 1.7)),
      trackMat(
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.72,
        })
      )
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.96;
    avatarRoot.add(shadowPlane);

    // 2. Holographic pedestal ring + emitter torus
    const pedestalGroup = new THREE.Group();
    pedestalGroup.position.y = -0.84;
    avatarRoot.add(pedestalGroup);

    const outerPedestalRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.56, 0.045, 18, 48)),
      matSlateMetal
    );
    outerPedestalRing.rotation.x = Math.PI / 2;
    pedestalGroup.add(outerPedestalRing);

    const energyEmitterRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.42, 0.022, 16, 48)),
      matCyanGlow
    );
    energyEmitterRing.rotation.x = Math.PI / 2;
    energyEmitterRing.position.y = 0.015;
    pedestalGroup.add(energyEmitterRing);

    // 3. Articulated hovering character body group
    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = -0.05;
    avatarRoot.add(bodyGroup);

    // Lower thruster skirt (LatheGeometry)
    const thrusterProfile = [
      new THREE.Vector2(0.01, -0.58),
      new THREE.Vector2(0.24, -0.54),
      new THREE.Vector2(0.32, -0.42),
      new THREE.Vector2(0.26, -0.34),
      new THREE.Vector2(0.01, -0.34),
    ];
    const thrusterMesh = new THREE.Mesh(
      trackGeo(new THREE.LatheGeometry(thrusterProfile, 32)),
      matSlateMetal
    );
    bodyGroup.add(thrusterMesh);

    const thrusterGlow = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.16, 0.08, 0.06, 24)),
      matCyanGlow
    );
    thrusterGlow.position.y = -0.57;
    bodyGroup.add(thrusterGlow);

    // Torso chassis (sculpted LatheGeometry)
    const torsoProfile = [
      new THREE.Vector2(0.01, -0.36),
      new THREE.Vector2(0.28, -0.34),
      new THREE.Vector2(0.41, -0.14),
      new THREE.Vector2(0.43, 0.08),
      new THREE.Vector2(0.33, 0.24),
      new THREE.Vector2(0.21, 0.28),
      new THREE.Vector2(0.01, 0.28),
    ];
    const torsoMesh = new THREE.Mesh(
      trackGeo(new THREE.LatheGeometry(torsoProfile, 36)),
      matCeramic
    );
    bodyGroup.add(torsoMesh);

    // Chest emblem plate + AI core crystal
    const chestPlate = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.19, 0.21, 0.06, 28)),
      matCobaltTrim
    );
    chestPlate.rotation.x = Math.PI / 2;
    chestPlate.position.set(0, -0.01, 0.39);
    bodyGroup.add(chestPlate);

    const coreCrystal = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.1, 0)),
      matCyanGlow
    );
    coreCrystal.position.set(0, -0.01, 0.43);
    coreCrystal.scale.set(1, 1.15, 0.55);
    bodyGroup.add(coreCrystal);

    // Neck collar
    const neckCollar = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 24)),
      matSlateMetal
    );
    neckCollar.position.y = 0.31;
    bodyGroup.add(neckCollar);

    // Articulated Left & Right Arms (pivoted at shoulder!)
    const armGeo = trackGeo(new THREE.CapsuleGeometry(0.085, 0.28, 8, 16));
    const shoulderGeo = trackGeo(new THREE.SphereGeometry(0.105, 18, 18));
    const cuffGeo = trackGeo(new THREE.TorusGeometry(0.088, 0.018, 12, 24));

    const createArm = (side: -1 | 1) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.49, 0.16, 0.02);

      const shoulder = new THREE.Mesh(shoulderGeo, matSlateMetal);
      pivot.add(shoulder);

      const forearm = new THREE.Mesh(armGeo, matCeramic);
      forearm.position.set(side * 0.05, -0.22, 0.03);
      forearm.rotation.z = side * 0.14;
      pivot.add(forearm);

      const wristCuff = new THREE.Mesh(cuffGeo, matCyanGlow);
      wristCuff.rotation.x = Math.PI / 2;
      wristCuff.position.set(side * 0.08, -0.34, 0.03);
      pivot.add(wristCuff);

      bodyGroup.add(pivot);
      return pivot;
    };

    const leftArmPivot = createArm(-1);
    const rightArmPivot = createArm(1);

    // 4. Articulated Head Group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.56, 0);
    bodyGroup.add(headGroup);

    const headShell = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.41, 32, 24)),
      matCeramic
    );
    headShell.scale.set(1.16, 0.92, 1.02);
    headGroup.add(headShell);

    // Dark glossy visor faceplate
    const visorMesh = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.35, 32, 24, 0, Math.PI * 2, 0.28, Math.PI * 0.65)),
      matVisorGlass
    );
    visorMesh.scale.set(1.12, 0.72, 0.78);
    visorMesh.position.set(0, 0.01, 0.17);
    headGroup.add(visorMesh);

    // Expressive glowing eyes
    const eyeGeo = trackGeo(new THREE.CapsuleGeometry(0.044, 0.068, 8, 16));
    const leftEye = new THREE.Mesh(eyeGeo, matEyeGlow);
    leftEye.position.set(-0.145, 0.025, 0.425);
    leftEye.rotation.z = 0.06;
    headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, matEyeGlow);
    rightEye.position.set(0.145, 0.025, 0.425);
    rightEye.rotation.z = -0.06;
    headGroup.add(rightEye);

    // Side comms ear pods
    const earPodGeo = trackGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 24));
    const earRingGeo = trackGeo(new THREE.TorusGeometry(0.115, 0.018, 12, 24));

    ([-1, 1] as const).forEach((side) => {
      const pod = new THREE.Mesh(earPodGeo, matCobaltTrim);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(side * 0.48, 0.02, 0);
      headGroup.add(pod);

      const trim = new THREE.Mesh(earRingGeo, matCyanGlow);
      trim.rotation.y = Math.PI / 2;
      trim.position.set(side * 0.525, 0.02, 0);
      headGroup.add(trim);
    });

    // Top antenna + tip orb
    const antennaStem = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.018, 0.024, 0.18, 12)),
      matSlateMetal
    );
    antennaStem.position.set(0, 0.43, -0.02);
    headGroup.add(antennaStem);

    const antennaOrb = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.055, 16, 16)),
      matCyanGlow
    );
    antennaOrb.position.set(0, 0.54, -0.02);
    headGroup.add(antennaOrb);

    // Orbiting Neural Halo Ring
    const haloGroup = new THREE.Group();
    haloGroup.position.set(0, 1.02, 0);
    bodyGroup.add(haloGroup);

    const haloRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.36, 0.018, 14, 48)),
      matCyanGlow
    );
    haloRing.rotation.x = Math.PI / 2;
    haloGroup.add(haloRing);

    const haloNodeGeo = trackGeo(new THREE.SphereGeometry(0.036, 12, 12));
    for (let i = 0; i < 3; i += 1) {
      const angle = (i * Math.PI * 2) / 3;
      const node = new THREE.Mesh(haloNodeGeo, matCobaltTrim);
      node.position.set(Math.cos(angle) * 0.36, 0, Math.sin(angle) * 0.36);
      haloGroup.add(node);
    }

    // Handle container resize cleanly
    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(container.clientWidth || 120, 80);
      const h = Math.max(container.clientHeight || 124, 80);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
    });
    resizeObserver.observe(container);

    // Animation loop with smooth damping & Software-WebGL fenceSync pacing
    let frameId = 0;
    let disposed = false;
    const startMs = performance.now();
    let lastFrameMs = startMs;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min(Math.max((now - lastFrameMs) / 1000, 0.001), 0.08);
      lastFrameMs = now;
      const elapsed = (now - startMs) / 1000;

      const clickAgeSec =
        clickStartMsRef.current !== null ? (now - clickStartMsRef.current) / 1000 : null;
      const celebrateAgeSec =
        celebrateStartMsRef.current !== null ? (now - celebrateStartMsRef.current) / 1000 : null;

      const targetPose = computeAvatarPose({
        elapsed,
        clickAgeSec,
        celebrateAgeSec,
        hovered: hoveredRef.current,
        thinking: thinkingRef.current,
        pointerX: pointerRef.current.x,
        pointerY: pointerRef.current.y,
      });

      if (visualStateRef.current !== targetPose.state) {
        visualStateRef.current = targetPose.state;
        setVisualState(targetPose.state);
      }

      const lambda = isSoftwareGl ? 18 : 11;
      bodyGroup.position.y = THREE.MathUtils.damp(bodyGroup.position.y, targetPose.bodyY - 0.05, lambda, dt);
      bodyGroup.rotation.y = THREE.MathUtils.damp(bodyGroup.rotation.y, targetPose.bodyRotY, lambda, dt);
      bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, targetPose.bodyRotX, lambda, dt);
      bodyGroup.scale.y = THREE.MathUtils.damp(bodyGroup.scale.y, targetPose.bodyScaleY, lambda, dt);

      headGroup.rotation.x = THREE.MathUtils.damp(headGroup.rotation.x, targetPose.headRotX, lambda, dt);
      headGroup.rotation.y = THREE.MathUtils.damp(headGroup.rotation.y, targetPose.headRotY, lambda, dt);
      headGroup.rotation.z = THREE.MathUtils.damp(headGroup.rotation.z, targetPose.headRotZ, lambda, dt);

      leftArmPivot.rotation.z = THREE.MathUtils.damp(leftArmPivot.rotation.z, targetPose.leftArmRotZ, lambda, dt);
      leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, targetPose.leftArmRotX, lambda, dt);
      rightArmPivot.rotation.z = THREE.MathUtils.damp(rightArmPivot.rotation.z, targetPose.rightArmRotZ, lambda + 4, dt);
      rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, targetPose.rightArmRotX, lambda, dt);

      haloGroup.rotation.y = targetPose.haloRotY;
      haloGroup.rotation.z = THREE.MathUtils.damp(haloGroup.rotation.z, targetPose.haloRotZ, lambda, dt);
      haloGroup.position.y = THREE.MathUtils.damp(haloGroup.position.y, targetPose.haloY, lambda, dt);

      pedestalGroup.scale.setScalar(
        THREE.MathUtils.damp(pedestalGroup.scale.x, targetPose.pedestalScale, lambda, dt)
      );
      leftEye.scale.y = THREE.MathUtils.damp(leftEye.scale.y, targetPose.eyeScaleY, 24, dt);
      rightEye.scale.y = THREE.MathUtils.damp(rightEye.scale.y, targetPose.eyeScaleY, 24, dt);

      matCyanGlow.emissiveIntensity = THREE.MathUtils.damp(
        matCyanGlow.emissiveIntensity,
        targetPose.glowIntensity,
        10,
        dt
      );
      matEyeGlow.emissiveIntensity = THREE.MathUtils.damp(
        matEyeGlow.emissiveIntensity,
        targetPose.glowIntensity + 0.35,
        10,
        dt
      );
      coreCrystal.rotation.y = elapsed * 1.8;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      envTarget.dispose();
      renderer.dispose();
    };
  }, [accentColor, primaryColor]);

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    pointerRef.current.x = Math.max(-1, Math.min(1, nx));
    pointerRef.current.y = Math.max(-1, Math.min(1, ny));
  };

  const handleAvatarClick = () => {
    clickStartMsRef.current = performance.now();
    visualStateRef.current = 'clicked';
    setClickCount((c) => c + 1);
    setVisualState('clicked');
    onClick();
  };

  const statusText = thinking
    ? 'Thinking…'
    : open
      ? 'AI Guide'
      : 'Ask AI';

  return (
    <button
      type="button"
      data-testid="assistant-launcher"
      data-avatar-state={visualState}
      data-click-count={clickCount}
      aria-label={open ? `${title} avatar — click to wave` : `Open ${title}`}
      title={open ? 'Click avatar to wave' : `Click to open ${title}`}
      className={`aia-avatar-btn ${open ? 'aia-avatar-open' : ''}`}
      onPointerEnter={() => {
        hoveredRef.current = true;
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
        pointerRef.current = { x: 0, y: 0 };
      }}
      onPointerMove={handlePointerMove}
      onClick={handleAvatarClick}
    >
      <div
        ref={mountRef}
        data-testid="assistant-avatar-canvas-host"
        className="aia-avatar-stage"
        aria-hidden="true"
      />
      <span className="aia-avatar-label">{statusText}</span>
    </button>
  );
}
