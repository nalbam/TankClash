import * as THREE from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@shared/constants";

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  windParticles: THREE.Points;
}

/** Dark navy battlefield: gradient sky, parallax hill silhouettes, wind motes. */
export function createScene(container: HTMLElement): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();

  // Gradient sky.
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const ctx = skyCanvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#070b1d");
  grad.addColorStop(0.55, "#101b3d");
  grad.addColorStop(1, "#23355f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_WIDTH * 4, WORLD_HEIGHT * 4),
    new THREE.MeshBasicMaterial({ map: skyTexture, depthWrite: false }),
  );
  sky.position.set(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, -80);
  scene.add(sky);

  // Stars.
  const starGeo = new THREE.BufferGeometry();
  const starCount = 220;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() * 4 - 1.5) * WORLD_WIDTH;
    starPos[i * 3 + 1] = WORLD_HEIGHT * (0.4 + Math.random() * 1.6);
    starPos[i * 3 + 2] = -75;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xaabbdd, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.7 }),
    ),
  );

  // Parallax hill silhouettes (two depths).
  scene.add(makeHills(0x0d1730, -50, 0.55, 1));
  scene.add(makeHills(0x111f42, -30, 0.4, 2));

  // Wind motes — drift speed set per-frame from server wind.
  const moteGeo = new THREE.BufferGeometry();
  const moteCount = 120;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = Math.random() * WORLD_WIDTH;
    motePos[i * 3 + 1] = Math.random() * WORLD_HEIGHT;
    motePos[i * 3 + 2] = -2 - Math.random() * 6;
  }
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const windParticles = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({ color: 0x88e8dc, size: 0.35, transparent: true, opacity: 0.45 }),
  );
  scene.add(windParticles);

  // Lighting.
  scene.add(new THREE.AmbientLight(0x8899bb, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
  sun.position.set(60, 120, 80);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x2dd4bf, 0.35);
  rim.position.set(-40, 30, 60);
  scene.add(rim);

  return { renderer, scene, windParticles };
}

function makeHills(color: number, z: number, heightScale: number, seedish: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-WORLD_WIDTH, -10);
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const x = -WORLD_WIDTH + (i / segments) * WORLD_WIDTH * 3;
    const y =
      WORLD_HEIGHT *
      heightScale *
      (0.35 + 0.3 * Math.sin(i * 1.7 + seedish * 5) + 0.2 * Math.sin(i * 0.61 + seedish * 11));
    shape.lineTo(x, Math.max(4, y));
  }
  shape.lineTo(WORLD_WIDTH * 2, -10);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color }));
  mesh.position.z = z;
  return mesh;
}

/** Per-frame drift of wind motes; wraps around the arena horizontally. */
export function updateWindParticles(points: THREE.Points, wind: number, dt: number): void {
  const pos = points.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) + (wind * 1.6 + 2 * Math.sin(i)) * dt;
    let y = pos.getY(i) + Math.sin(performance.now() * 0.001 + i) * dt * 1.2;
    if (x < 0) x += WORLD_WIDTH;
    if (x > WORLD_WIDTH) x -= WORLD_WIDTH;
    if (y < 0) y += WORLD_HEIGHT;
    if (y > WORLD_HEIGHT) y -= WORLD_HEIGHT;
    pos.setXY(i, x, y);
  }
  pos.needsUpdate = true;
}
