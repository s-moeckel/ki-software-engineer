import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bayPosition, libraryBays, libraryRoomEnd, LibraryPosition } from './library-data';

/** Room architecture only. All displayed books belong to the collection in LibraryRenderer. */
export function addLibraryRoom(scene: THREE.Scene, layout: readonly LibraryPosition[], anisotropy: number) {
  const obstacles: THREE.Object3D[] = [];
  const collisions: THREE.Box3[] = [];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const sourceGeometry: THREE.BufferGeometry[] = [];
  const end = libraryRoomEnd(layout.length);
  const wood = new THREE.MeshStandardMaterial({ color: 0x211d23, roughness: 0.48, metalness: 0.18 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x171c28, roughness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x927659, roughness: 0.36, metalness: 0.65 });
  const warm = new THREE.MeshBasicMaterial({ color: 0xffd9a2 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x81eaff });
  const glass = new THREE.MeshBasicMaterial({
    color: 0x66dcef,
    transparent: true,
    opacity: 0.13,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const box = (
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    rotation = 0,
    solid = true
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.rotation.y = rotation;
    mesh.updateMatrixWorld(true);
    sourceGeometry.push(mesh.geometry);
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const batch = batches.get(material) ?? [];
    batch.push(geometry);
    batches.set(material, batch);
    if (solid) obstacles.push(mesh);
    return mesh;
  };
  const floor = floorTexture(anisotropy);
  floor.repeat.set(3, (end + 5) / 3);
  box(
    [9, 0.08, end + 5],
    [0, -0.04, (end - 5) / 2],
    new THREE.MeshStandardMaterial({ map: floor, roughness: 0.38, metalness: 0.15 })
  );
  box([9, 0.1, end + 5], [0, 4.25, (end - 5) / 2], wall);
  box([9, 4.3, 0.12], [0, 2.1, end], wall);
  for (const x of [-4.5, 4.5]) box([0.12, 4.3, end + 5], [x, 2.1, (end - 5) / 2], wall);

  scene.add(new THREE.HemisphereLight(0xb6d7ee, 0x665042, 1.35));
  const key = new THREE.DirectionalLight(0xffdfba, 2.5);
  key.position.set(-3, 5, -4);
  scene.add(key);
  for (const [x, y, z, color, intensity] of [
    [0, 2.2, 1.2, 0x55dfff, 9],
    [0, 0.5, 0.6, 0x39bbff, 4],
    [-3, 3.4, 2.5, 0xffc58c, 12],
    [3, 3.4, 2.5, 0xffc58c, 12]
  ]) {
    const light = new THREE.PointLight(color, intensity, 8, 2);
    light.position.set(x, y, z);
    scene.add(light);
  }

  // Tall bays form a curved reading room behind the central exhibition.
  const bays = libraryBays(layout.length);
  for (const bay of bays) {
    const place = (x: number, y: number, z: number) => bayPosition(bay, x, y, z);
    const back = box([1.64, 4.15, 0.09], place(0, 2.08, 0.18), wood, bay.angle);
    collisions.push(new THREE.Box3().setFromObject(back).expandByScalar(0.12));
    for (const x of [-0.81, 0.81]) box([0.075, 4.15, 0.43], place(x, 2.08, 0), wood, bay.angle);
    for (let level = 0; level <= 7; level++) {
      const y = 0.18 + level * 0.54;
      box([1.65, 0.065, 0.46], place(0, y, -0.02), wood, bay.angle);
      box([1.58, 0.012, 0.012], place(0, y - 0.035, -0.25), level === 7 ? warm : brass, bay.angle);
    }
  }

  // Warm ceiling halo and a cyan glass cabinet, as in the reference image.
  for (const [radius, y, material] of [
    [3.6, 4.13, warm],
    [3.72, 4.16, brass]
  ] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 8, 96), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, y, 1.8);
    scene.add(ring);
  }
  box([1.95, 0.28, 1.42], [0, 0.22, 1.5], wood);
  box([1.8, 0.035, 1.3], [0, 0.065, 1.5], warm);
  box([0.98, 0.025, 0.76], [0, 0.37, 1.5], cyan);
  collisions.push(new THREE.Box3(new THREE.Vector3(-0.98, 0, 0.78), new THREE.Vector3(0.98, 2.8, 2.22)));
  for (const y of [0.83, 1.65, 2.65]) {
    box([1.7, 0.025, 0.96], [0, y, 1.5], glass, 0, false);
    for (const z of [1.02, 1.98]) box([1.7, 0.008, 0.008], [0, y, z], cyan, 0, false);
    for (const x of [-0.85, 0.85]) box([0.008, 0.008, 0.96], [x, y, 1.5], cyan, 0, false);
  }
  for (const x of [-0.84, 0.84]) box([0.012, 1.82, 0.94], [x, 1.74, 1.5], glass, 0, false);
  box([1.68, 1.82, 0.012], [0, 1.74, 1.97], glass, 0, false);

  const motes = new Float32Array(180 * 3);
  for (let index = 0; index < 180; index++) {
    motes[index * 3] = Math.sin(index * 127.1) * 0.78;
    motes[index * 3 + 1] = 0.5 + ((index % 43) / 43) * 2.6;
    motes[index * 3 + 2] = 1.5 + Math.cos(index * 311.7) * 0.42;
  }
  const particles = new THREE.BufferGeometry();
  particles.setAttribute('position', new THREE.BufferAttribute(motes, 3));
  scene.add(
    new THREE.Points(
      particles,
      new THREE.PointsMaterial({
        color: 0xb5f5ff,
        size: 0.009,
        transparent: true,
        opacity: 0.65,
        depthWrite: false
      })
    )
  );
  // Hundreds of shelf boards share a handful of draw calls, including on software WebGL.
  for (const [material, geometries] of batches) {
    scene.add(new THREE.Mesh(mergeGeometries(geometries), material));
    geometries.forEach(geometry => geometry.dispose());
  }
  return { end, obstacles, collisions, dispose: () => sourceGeometry.forEach(geometry => geometry.dispose()) };
}

function floorTexture(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#211c20';
  context.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 12; row++) {
    for (let column = -1; column < 3; column++) {
      const x = column * 256 + (row % 2) * 128;
      const y = row * 43;
      context.fillStyle = ['#493b35', '#55433a', '#403737', '#604b40'][(row + column + 4) % 4];
      context.fillRect(x + 1, y + 1, 254, 41);
      for (let grain = 0; grain < 9; grain++) {
        context.strokeStyle = grain % 2 ? '#ffffff08' : '#100c111c';
        context.beginPath();
        context.moveTo(x, y + grain * 5);
        context.bezierCurveTo(x + 70, y + grain * 5 - 3, x + 180, y + grain * 5 + 3, x + 256, y + grain * 5);
        context.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(4, anisotropy);
  return texture;
}
