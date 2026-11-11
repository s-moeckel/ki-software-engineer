import * as THREE from 'three';

const ENTERPRISE_INSCRIPTION = 'NC-1701 D';

/** A small, asset-free Galaxy-class ship, viewed from a chase camera. Forward is -Z. */
export class EnterpriseShip extends THREE.Group {
  private readonly hull = new THREE.MeshStandardMaterial({ color: 0xb6c5d4, metalness: 0.55, roughness: 0.4 });
  private readonly trim = new THREE.MeshStandardMaterial({ color: 0x516479, metalness: 0.65, roughness: 0.35 });
  private readonly warp = new THREE.MeshBasicMaterial({ color: 0x52cfff });
  private readonly bussard = new THREE.MeshBasicMaterial({ color: 0xff543b });
  private readonly deflector = new THREE.MeshBasicMaterial({ color: 0x79baff });
  private readonly inscriptionTextures: THREE.CanvasTexture[] = [];
  private readonly inscriptionMaterials: THREE.MeshBasicMaterial[] = [];

  constructor() {
    super();
    this.name = 'USS Enterprise NCC-1701-D';
    const sphere = new THREE.SphereGeometry(1, 32, 16);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const part = (
      name: string,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: [number, number, number],
      scale: [number, number, number]
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      this.add(mesh);
      return mesh;
    };

    part('Oval saucer rim', sphere, this.trim, [0, 0.24, -0.8], [1.6, 0.13, 1.15]);
    part('Saucer section', sphere, this.hull, [0, 0.3, -0.8], [1.55, 0.18, 1.1]);
    part('Bridge', sphere, this.hull, [0, 0.49, -0.65], [0.27, 0.1, 0.32]);
    part('Neck', sphere, this.hull, [0, 0.04, 0.25], [0.32, 0.3, 0.8]);
    part('Engineering hull', sphere, this.hull, [0, -0.18, 0.85], [0.48, 0.3, 1.3]);
    part('Navigational deflector', sphere, this.deflector, [0, -0.2, -0.3], [0.26, 0.16, 0.06]);
    for (const side of [-1, 1]) {
      const pylon = part('Swept nacelle pylon', box, this.hull, [side * 0.75, -0.02, 1.15], [1.2, 0.1, 0.3]);
      pylon.rotation.z = side * 0.24;
      pylon.rotation.y = -side * 0.3;
      part('Warp nacelle', sphere, this.hull, [side * 1.35, 0.14, 1.3], [0.22, 0.19, 1.25]);
      part('Blue warp grille', sphere, this.warp, [side * 1.35, 0.32, 1.35], [0.13, 0.05, 1.02]);
      part('Red Bussard collector', sphere, this.bussard, [side * 1.35, 0.14, 0.12], [0.18, 0.15, 0.18]);
      part('Impulse engine', box, this.bussard, [side * 0.48, 0.3, 0.22], [0.28, 0.06, 0.06]);
    }
    this.addInscriptions();
    this.scale.setScalar(0.58);
    this.visible = false;
  }

  private addInscriptions(): void {
    const createTexture = (): THREE.CanvasTexture => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to create the Enterprise inscription texture.');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = 'bold 42px Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#d9f3ff';
      context.shadowColor = '#2b83b5';
      context.shadowBlur = 5;
      context.fillText(ENTERPRISE_INSCRIPTION, canvas.width / 2, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.inscriptionTextures.push(texture);
      return texture;
    };
    const add = (
      name: string,
      position: [number, number, number],
      rotation: [number, number, number],
      scale: [number, number, number]
    ): void => {
      const material = new THREE.MeshBasicMaterial({
        map: createTexture(),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      const inscription = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.125), material);
      inscription.name = name;
      inscription.position.set(...position);
      inscription.rotation.set(...rotation);
      inscription.scale.set(...scale);
      inscription.userData['text'] = ENTERPRISE_INSCRIPTION;
      this.add(inscription);
      this.inscriptionMaterials.push(material);
    };

    // The three signs are part of the ship group, so every flight transform
    // keeps them attached to the corresponding hull surfaces.
    add('Enterprise inscription NC-1701 D (top front)', [0, 0.505, -1.12], [-Math.PI / 2, 0, 0], [0.7, 1, 1]);
    add('Enterprise inscription NC-1701 D (port side)', [-1.56, 0.34, -0.82], [0, -Math.PI / 2, 0], [0.7, 1, 1]);
    add('Enterprise inscription NC-1701 D (starboard side)', [1.56, 0.34, -0.82], [0, Math.PI / 2, 0], [0.7, 1, 1]);
  }

  dispose(): void {
    this.inscriptionTextures.forEach(texture => texture.dispose());
    this.inscriptionMaterials.forEach(material => material.dispose());
  }

  animate(progress: number, aspect: number): void {
    this.visible = progress > 0 && progress < 1;
    const envelope = Math.sin(Math.PI * progress);
    const viewportScale = Math.min(1, aspect / 0.9);
    this.scale.setScalar(0.58 * viewportScale);
    this.position.set((-0.55 + Math.sin(progress * Math.PI * 2) * 0.22) * viewportScale, 0.05 + envelope * 0.12, -5);
    if (aspect < 0.9) {
      // The mobile details sheet covers the centre; fly beside the topic controls above it.
      this.scale.setScalar((0.18 * aspect) / 0.55);
      this.position.set(5 * Math.tan(THREE.MathUtils.degToRad(25)) * aspect * 0.62, 1.22, -5);
    }
    this.rotation.set(
      0.2 + envelope * 0.08,
      Math.sin(progress * Math.PI * 2) * 0.12,
      -Math.sin(progress * Math.PI * 2) * 0.18
    );
    // Ease into and out of view without changing the existing camera-flight duration.
    const opacity = Math.min(1, progress * 8, (1 - progress) * 8);
    for (const material of [
      this.hull,
      this.trim,
      this.warp,
      this.bussard,
      this.deflector,
      ...this.inscriptionMaterials
    ]) {
      material.transparent = true;
      material.opacity = opacity;
    }
  }
}
