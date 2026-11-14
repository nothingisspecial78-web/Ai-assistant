import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface GuideAvatarTargetPoint {
  x: number; // screen px
  y: number; // screen px
  width: number;
  height: number;
}

export class GuideAvatarController {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private avatarRoot: THREE.Group;
  private bodyGroup: THREE.Group;
  private headGroup: THREE.Group;
  private leftArmPivot: THREE.Group;
  private rightArmPivot: THREE.Group;
  private leftEye: THREE.Mesh;
  private rightEye: THREE.Mesh;
  private haloGroup: THREE.Group;
  private pedestalGroup: THREE.Group;
  private matCyanGlow: THREE.MeshStandardMaterial;

  private currentScreenPos = { x: 100, y: 100 };
  private targetScreenPos = { x: 100, y: 100 };
  private pointingTarget: { x: number; y: number } | null = null;
  private isSensitive = false;
  private isSpeaking = false;
  private isCelebrating = false;
  private celebrateStartMs = 0;
  private animationFrameId = 0;
  private disposed = false;
  private prefersReducedMotion = false;

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    if (typeof window !== 'undefined') {
      this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    const width = window.innerWidth || 800;
    const height = window.innerHeight || 600;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(width, height, false);
    } catch (e) {
      console.warn('[GuideAvatar] Failed to create WebGLRenderer:', e);
    }

    // Warm Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x1e293b, 1.2);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    keyLight.position.set(3, 4, 4);
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xfb923c, 1.8, 15);
    rimLight.position.set(-3, 2, -2);
    this.scene.add(rimLight);

    // Build the 3D Character
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      this.materials.push(m);
      return m;
    };

    const matCeramic = trackMat(new THREE.MeshStandardMaterial({ color: 0xfaf7f2, roughness: 0.26, metalness: 0.1 }));
    const matSlateMetal = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.24, metalness: 0.82 }));
    const matCobaltTrim = trackMat(new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.28, metalness: 0.62 }));
    const matVisorGlass = trackMat(new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.2, clearcoat: 1.0 }));
    this.matCyanGlow = trackMat(new THREE.MeshStandardMaterial({ color: 0xfdba74, emissive: new THREE.Color(0xf97316), emissiveIntensity: 1.25 }));
    const matEyeGlow = trackMat(new THREE.MeshStandardMaterial({ color: 0xffedd5, emissive: new THREE.Color(0xfb923c), emissiveIntensity: 1.65 }));

    this.avatarRoot = new THREE.Group();
    this.avatarRoot.scale.setScalar(0.72);
    this.scene.add(this.avatarRoot);

    // Pedestal group
    this.pedestalGroup = new THREE.Group();
    this.pedestalGroup.position.y = -0.84;
    this.avatarRoot.add(this.pedestalGroup);

    const outerPedestalRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.56, 0.045, 18, 48)), matSlateMetal);
    outerPedestalRing.rotation.x = Math.PI / 2;
    this.pedestalGroup.add(outerPedestalRing);

    const energyEmitterRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.42, 0.022, 16, 48)), this.matCyanGlow);
    energyEmitterRing.rotation.x = Math.PI / 2;
    energyEmitterRing.position.y = 0.015;
    this.pedestalGroup.add(energyEmitterRing);

    // Character body group
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = -0.05;
    this.avatarRoot.add(this.bodyGroup);

    // Thruster skirt
    const thrusterProfile = [
      new THREE.Vector2(0.01, -0.58),
      new THREE.Vector2(0.24, -0.54),
      new THREE.Vector2(0.32, -0.42),
      new THREE.Vector2(0.26, -0.34),
      new THREE.Vector2(0.01, -0.34),
    ];
    const thrusterMesh = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(thrusterProfile, 32)), matSlateMetal);
    this.bodyGroup.add(thrusterMesh);

    // Torso
    const torsoProfile = [
      new THREE.Vector2(0.01, -0.36),
      new THREE.Vector2(0.28, -0.34),
      new THREE.Vector2(0.41, -0.14),
      new THREE.Vector2(0.43, 0.08),
      new THREE.Vector2(0.33, 0.24),
      new THREE.Vector2(0.21, 0.28),
      new THREE.Vector2(0.01, 0.28),
    ];
    const torsoMesh = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(torsoProfile, 36)), matCeramic);
    this.bodyGroup.add(torsoMesh);

    // Chest crystal
    const chestPlate = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.19, 0.21, 0.06, 28)), matCobaltTrim);
    chestPlate.rotation.x = Math.PI / 2;
    chestPlate.position.set(0, -0.01, 0.39);
    this.bodyGroup.add(chestPlate);

    const coreCrystal = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.1, 0)), this.matCyanGlow);
    coreCrystal.position.set(0, -0.01, 0.43);
    coreCrystal.scale.set(1, 1.15, 0.55);
    this.bodyGroup.add(coreCrystal);

    // Arm Pivots
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

      const wristCuff = new THREE.Mesh(cuffGeo, this.matCyanGlow);
      wristCuff.rotation.x = Math.PI / 2;
      wristCuff.position.set(side * 0.08, -0.34, 0.03);
      pivot.add(wristCuff);

      this.bodyGroup.add(pivot);
      return pivot;
    };

    this.leftArmPivot = createArm(-1);
    this.rightArmPivot = createArm(1);

    // Head Group
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.56, 0);
    this.bodyGroup.add(this.headGroup);

    const headShell = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.41, 32, 24)), matCeramic);
    headShell.scale.set(1.16, 0.92, 1.02);
    this.headGroup.add(headShell);

    const visorMesh = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.35, 32, 24, 0, Math.PI * 2, 0.28, Math.PI * 0.65)), matVisorGlass);
    visorMesh.scale.set(1.12, 0.72, 0.78);
    visorMesh.position.set(0, 0.01, 0.17);
    this.headGroup.add(visorMesh);

    // Eyes
    const eyeGeo = trackGeo(new THREE.CapsuleGeometry(0.044, 0.068, 8, 16));
    this.leftEye = new THREE.Mesh(eyeGeo, matEyeGlow);
    this.leftEye.position.set(-0.145, 0.025, 0.425);
    this.headGroup.add(this.leftEye);

    this.rightEye = new THREE.Mesh(eyeGeo, matEyeGlow);
    this.rightEye.position.set(0.145, 0.025, 0.425);
    this.headGroup.add(this.rightEye);

    // Halo
    this.haloGroup = new THREE.Group();
    this.haloGroup.position.set(0, 1.02, 0);
    this.bodyGroup.add(this.haloGroup);

    const haloRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.36, 0.018, 14, 48)), this.matCyanGlow);
    haloRing.rotation.x = Math.PI / 2;
    this.haloGroup.add(haloRing);

    // Default positioning: docked bottom right
    this.targetScreenPos = {
      x: window.innerWidth - 120,
      y: window.innerHeight - 150,
    };
    this.currentScreenPos = { ...this.targetScreenPos };

    this.startLoop();
  }

  /**
   * Converts 2D screen pixels to 3D world space at camera plane z=0
   */
  private screenToWorld(screenX: number, screenY: number): THREE.Vector3 {
    const width = window.innerWidth || 800;
    const height = window.innerHeight || 600;

    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = -(screenY / height) * 2 + 1;

    const v = new THREE.Vector3(ndcX, ndcY, 0.5);
    v.unproject(this.camera);
    v.sub(this.camera.position).normalize();

    const distance = -this.camera.position.z / v.z;
    const pos = this.camera.position.clone().add(v.multiplyScalar(distance));
    return pos;
  }

  /**
   * Directs the avatar to move beside a target element
   */
  moveToTarget(target: GuideAvatarTargetPoint | null): void {
    if (!target) {
      // Dock at bottom right
      this.targetScreenPos = {
        x: window.innerWidth - 130,
        y: window.innerHeight - 170,
      };
      this.pointingTarget = null;
      return;
    }

    const { x, y, width, height } = target;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const isMobile = screenW < 768;

    this.pointingTarget = { x: x + width / 2, y: y + height / 2 };

    if (isMobile) {
      // On mobile, dock comfortably near bottom edge
      this.targetScreenPos = {
        x: screenW - 85,
        y: screenH - 135,
      };
      return;
    }

    // Desktop: Choose the side with maximum free horizontal space
    const spaceRight = screenW - (x + width);
    const spaceLeft = x;

    let landingX = 0;
    let landingY = y + height / 2;

    if (spaceRight >= 180) {
      landingX = x + width + 90;
    } else if (spaceLeft >= 180) {
      landingX = x - 90;
    } else {
      landingX = Math.max(90, Math.min(x + width / 2, screenW - 90));
      landingY = y >= 200 ? y - 110 : y + height + 110;
    }

    // Viewport clamping
    landingX = Math.max(70, Math.min(landingX, screenW - 80));
    landingY = Math.max(80, Math.min(landingY, screenH - 120));

    this.targetScreenPos = { x: landingX, y: landingY };

    if (this.prefersReducedMotion) {
      this.currentScreenPos = { ...this.targetScreenPos };
    }
  }

  setSensitive(sensitive: boolean): void {
    this.isSensitive = sensitive;
  }

  setSpeaking(speaking: boolean): void {
    this.isSpeaking = speaking;
  }

  celebrate(): void {
    this.isCelebrating = true;
    this.celebrateStartMs = performance.now();
  }

  handleResize(): void {
    if (!this.renderer || this.disposed) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private startLoop(): void {
    const loop = (now: number) => {
      if (this.disposed) return;
      this.animationFrameId = requestAnimationFrame(loop);
      this.renderFrame(now);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private renderFrame(now: number): void {
    if (!this.renderer || this.disposed) return;

    const dt = 0.016;
    const t = now * 0.001;

    // 1. Smooth travel interpolation towards target position
    const lerpSpeed = this.prefersReducedMotion ? 1.0 : 0.08;
    this.currentScreenPos.x += (this.targetScreenPos.x - this.currentScreenPos.x) * lerpSpeed;
    this.currentScreenPos.y += (this.targetScreenPos.y - this.currentScreenPos.y) * lerpSpeed;

    const worldPos = this.screenToWorld(this.currentScreenPos.x, this.currentScreenPos.y);
    this.avatarRoot.position.copy(worldPos);

    // Natural idle hover bobbing
    const bob = this.prefersReducedMotion ? 0 : Math.sin(t * 2.2) * 0.06;
    this.bodyGroup.position.y = -0.05 + bob;

    // 2. Head gaze tracking towards target
    if (this.pointingTarget && !this.isSensitive) {
      const targetWorld = this.screenToWorld(this.pointingTarget.x, this.pointingTarget.y);
      const dx = targetWorld.x - worldPos.x;
      const dy = targetWorld.y - worldPos.y;

      const angleY = Math.max(-0.6, Math.min(Math.atan2(dx, 4), 0.6));
      const angleX = Math.max(-0.4, Math.min(-Math.atan2(dy, 4), 0.4));

      this.headGroup.rotation.y = THREE.MathUtils.lerp(this.headGroup.rotation.y, angleY, 0.1);
      this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, angleX, 0.1);

      // Arm pointing
      if (dx >= 0) {
        // Target is to the right -> point right arm
        this.rightArmPivot.rotation.z = THREE.MathUtils.lerp(this.rightArmPivot.rotation.z, -0.95, 0.12);
        this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, -0.65, 0.12);
        this.leftArmPivot.rotation.z = THREE.MathUtils.lerp(this.leftArmPivot.rotation.z, -0.18, 0.12);
      } else {
        // Target is to the left -> point left arm
        this.leftArmPivot.rotation.z = THREE.MathUtils.lerp(this.leftArmPivot.rotation.z, 0.95, 0.12);
        this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, -0.65, 0.12);
        this.rightArmPivot.rotation.z = THREE.MathUtils.lerp(this.rightArmPivot.rotation.z, 0.18, 0.12);
      }
    } else if (!this.isSensitive) {
      // Relaxed idle posture
      this.headGroup.rotation.y = THREE.MathUtils.lerp(this.headGroup.rotation.y, Math.sin(t * 0.9) * 0.14, 0.08);
      this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, Math.sin(t * 1.3) * 0.05, 0.08);
      this.leftArmPivot.rotation.z = THREE.MathUtils.lerp(this.leftArmPivot.rotation.z, -0.18, 0.08);
      this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, 0, 0.08);
      this.rightArmPivot.rotation.z = THREE.MathUtils.lerp(this.rightArmPivot.rotation.z, 0.18, 0.08);
      this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, 0, 0.08);
    }

    // 3. Privacy Gesture: Closes eyes, turns head away, arms cover eyes
    if (this.isSensitive) {
      // Eyes completely closed
      this.leftEye.scale.y = 0.04;
      this.rightEye.scale.y = 0.04;

      // Head turns away
      this.headGroup.rotation.y = THREE.MathUtils.lerp(this.headGroup.rotation.y, -0.42, 0.2);
      this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, -0.18, 0.2);

      // Arms cover eyes
      this.leftArmPivot.rotation.z = THREE.MathUtils.lerp(this.leftArmPivot.rotation.z, 0.72, 0.2);
      this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, -1.2, 0.2);
      this.rightArmPivot.rotation.z = THREE.MathUtils.lerp(this.rightArmPivot.rotation.z, -0.72, 0.2);
      this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, -1.2, 0.2);
    } else {
      // Normal natural blinking every 3.4 seconds
      const blinkPhase = t % 3.4;
      const isBlink = blinkPhase > 3.25 && blinkPhase < 3.38;
      const targetEyeScale = isBlink ? 0.12 : 1.0;
      this.leftEye.scale.y = THREE.MathUtils.lerp(this.leftEye.scale.y, targetEyeScale, 0.3);
      this.rightEye.scale.y = THREE.MathUtils.lerp(this.rightEye.scale.y, targetEyeScale, 0.3);
    }

    // 4. Lip-sync / Speaking modulation
    if (this.isSpeaking) {
      const talkPulse = Math.sin(t * 14) * 0.35 + 1.25;
      this.matCyanGlow.emissiveIntensity = talkPulse;
      this.headGroup.position.y = 0.56 + Math.sin(t * 12) * 0.015;
    } else {
      this.matCyanGlow.emissiveIntensity = 1.15;
      this.headGroup.position.y = 0.56;
    }

    // 5. Halo spin & celebrate jump
    if (this.isCelebrating) {
      const ageSec = (now - this.celebrateStartMs) / 1000;
      if (ageSec < 1.5) {
        this.haloGroup.rotation.y += dt * 8;
        this.bodyGroup.position.y += Math.sin(ageSec * Math.PI) * 0.35;
      } else {
        this.isCelebrating = false;
      }
    } else {
      this.haloGroup.rotation.y += dt * 1.5;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }

  destroy(): void {
    this.dispose();
  }
}
