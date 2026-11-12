import * as THREE from 'three';

/** Classic Enterprise proportions, built without external assets. Forward is -Z. */
export class EnterpriseShip extends THREE.Group {
  static readonly inscriptionText = 'NC-1701 D';

  private readonly hull = new THREE.MeshStandardMaterial({ color: 0xe2e0d7, metalness: 0.25, roughness: 0.55 });
  private readonly trim = new THREE.MeshStandardMaterial({ color: 0x666b6b, metalness: 0.5, roughness: 0.4 });
  private readonly warp = new THREE.MeshStandardMaterial({ color: 0x912c22, roughness: 0.45 });
  private readonly bussard = new THREE.MeshStandardMaterial({
    color: 0xf24413,
    emissive: 0xc72b08,
    emissiveIntensity: 0.7,
    metalness: 0.2,
    roughness: 0.25
  });
  private readonly deflector = new THREE.MeshStandardMaterial({ color: 0xb96832, metalness: 0.65, roughness: 0.35 });
  private readonly panelMaterial: THREE.MeshStandardMaterial;
  private readonly panelTexture: THREE.CanvasTexture;
  private readonly inscriptionMaterial: THREE.MeshBasicMaterial;
  private readonly inscriptionTexture: THREE.CanvasTexture;
  private readonly inscriptionGeometry = new THREE.PlaneGeometry(0.72, 0.16);
  private readonly forward = new THREE.Vector3(0, 0, -1);

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

    const saucer = new THREE.LatheGeometry(
      [
        [0, 0.17],
        [0.35, 0.17],
        [1.12, 0.21],
        [1.4, 0.27],
        [1.4, 0.37],
        [1.27, 0.41],
        [0.38, 0.41],
        [0, 0.48]
      ].map(([radius, height]) => new THREE.Vector2(radius, height)),
      80
    );
    part('Circular saucer section', saucer, this.hull, [0, 0, -1.05], [1, 1, 1]);
    part('Bridge superstructure', sphere, this.hull, [0, 0.44, -1.05], [0.35, 0.13, 0.35]);
    part('Bridge dome', sphere, this.hull, [0, 0.56, -1.05], [0.14, 0.08, 0.14]);
    const neck = part('Narrow connecting neck', box, this.hull, [0, -0.03, 0.05], [0.16, 0.76, 0.48]);
    neck.rotation.x = -0.35;
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 40);
    const engineering = part('Cylindrical engineering hull', cylinder, this.hull, [0, -0.49, 0.65], [0.32, 1.65, 0.32]);
    engineering.rotation.x = Math.PI / 2;
    part('Engineering stern', sphere, this.hull, [0, -0.49, 1.48], [0.31, 0.31, 0.3]);
    const dish = part('Copper navigational deflector', sphere, this.deflector, [0, -0.49, -0.22], [0.28, 0.28, 0.065]);
    for (const radius of [0.12, 0.2, 0.27]) {
      part(
        'Deflector concentric ring',
        new THREE.TorusGeometry(radius, 0.009, 6, 48),
        this.deflector,
        [0, -0.49, dish.position.z - 0.06],
        [1, 1, 1]
      );
    }
    part('Deflector centre', sphere, this.deflector, [0, -0.49, -0.31], [0.045, 0.045, 0.065]);
    for (const side of [-1, 1]) {
      const start = new THREE.Vector3(side * 0.2, -0.35, 0.95);
      const end = new THREE.Vector3(side * 1.1, 0.9, 1.15);
      const pylon = part('Raised nacelle pylon', box, this.hull, start.clone().add(end).multiplyScalar(0.5).toArray(), [
        0.12,
        start.distanceTo(end),
        0.28
      ]);
      pylon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
      const nacelle = part('Cylindrical warp nacelle', cylinder, this.hull, [side * 1.1, 0.9, 1.05], [0.2, 2.35, 0.2]);
      nacelle.rotation.x = Math.PI / 2;
      const collar = part('Dark collector collar', cylinder, this.trim, [side * 1.1, 0.9, -0.1], [0.207, 0.09, 0.207]);
      collar.rotation.x = Math.PI / 2;
      part('Red Bussard collector', sphere, this.bussard, [side * 1.1, 0.9, -0.17], [0.185, 0.185, 0.16]);
      part('Nacelle end cap', sphere, this.trim, [side * 1.1, 0.9, 2.23], [0.19, 0.19, 0.07]);
      part('Nacelle dorsal grille', box, this.trim, [side * 1.1, 1.095, 1.35], [0.065, 0.025, 1.35]);
      part('Red nacelle pennant', box, this.warp, [side * 1.298, 0.9, 1], [0.008, 0.045, 1.2]);
      part('Impulse engine', box, this.bussard, [side * 0.27, 0.32, 0.26], [0.2, 0.055, 0.06]);
      for (let index = 0; index < 9; index++) {
        part('Engineering window', box, this.trim, [side * 0.31, -0.4, 0.05 + index * 0.15], [0.015, 0.035, 0.055]);
      }
    }
    this.panelTexture = this.createSaucerTexture();
    this.panelMaterial = new THREE.MeshStandardMaterial({ map: this.panelTexture, roughness: 0.6, metalness: 0.2 });
    const panels = part(
      'Saucer radial panels',
      new THREE.CircleGeometry(1.27, 80),
      this.panelMaterial,
      [0, 0.412, -1.05],
      [1, 1, 1]
    );
    panels.rotation.x = -Math.PI / 2;
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 192;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Enterprise inscription canvas is unavailable');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '700 112px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#242829';
    context.fillText(EnterpriseShip.inscriptionText, canvas.width / 2, canvas.height / 2);
    this.inscriptionTexture = new THREE.CanvasTexture(canvas);
    this.inscriptionTexture.colorSpace = THREE.SRGBColorSpace;
    this.inscriptionMaterial = new THREE.MeshBasicMaterial({
      map: this.inscriptionTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.addInscription('Enterprise inscription top front', [0, 0.416, -1.78], new THREE.Euler(-Math.PI / 2, 0, 0));
    this.addInscription('Enterprise inscription port side', [-1.305, 0.96, 0.9], new THREE.Euler(0, -Math.PI / 2, 0));
    this.addInscription(
      'Enterprise inscription starboard side',
      [1.305, 0.96, 0.9],
      new THREE.Euler(0, Math.PI / 2, 0)
    );
    this.scale.setScalar(0.58);
    this.visible = false;
  }

  private createSaucerTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Enterprise panel canvas is unavailable');
    context.fillStyle = '#deddd5';
    context.fillRect(0, 0, 1024, 1024);
    context.strokeStyle = '#b1b3ae';
    context.lineWidth = 1.5;
    for (const radius of [150, 230, 310, 390, 470, 508]) {
      context.beginPath();
      context.arc(512, 512, radius, 0, Math.PI * 2);
      context.stroke();
    }
    for (let index = 0; index < 40; index++) {
      const angle = (index / 40) * Math.PI * 2;
      context.beginPath();
      context.moveTo(512 + Math.cos(angle) * 150, 512 + Math.sin(angle) * 150);
      context.lineTo(512 + Math.cos(angle) * 512, 512 + Math.sin(angle) * 512);
      context.stroke();
    }
    context.fillStyle = '#242829';
    context.font = '28px Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText('U.S.S. ENTERPRISE', 512, 330);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private addInscription(name: string, position: [number, number, number], rotation: THREE.Euler): void {
    const inscription = new THREE.Mesh(this.inscriptionGeometry, this.inscriptionMaterial);
    inscription.name = name;
    inscription.userData['text'] = EnterpriseShip.inscriptionText;
    inscription.position.set(...position);
    inscription.rotation.copy(rotation);
    this.add(inscription);
  }

  animate(progress: number, aspect: number, flightDirection: THREE.Vector3): void {
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
    this.quaternion.setFromUnitVectors(this.forward, flightDirection);
    // Banking around the ship's own forward axis keeps its nose on the flight path.
    this.rotateZ(-Math.sin(progress * Math.PI * 2) * 0.18);
    // Ease into and out of view without changing the existing camera-flight duration.
    const opacity = Math.min(1, progress * 8, (1 - progress) * 8);
    for (const material of [
      this.hull,
      this.trim,
      this.warp,
      this.bussard,
      this.deflector,
      this.panelMaterial,
      this.inscriptionMaterial
    ]) {
      material.transparent = true;
      material.opacity = opacity;
    }
  }

  override dispose(): void {
    this.inscriptionGeometry.dispose();
    this.inscriptionMaterial?.dispose();
    this.inscriptionTexture?.dispose();
    this.panelTexture.dispose();
  }
}
