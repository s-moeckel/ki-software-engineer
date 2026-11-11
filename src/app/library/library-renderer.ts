import * as THREE from 'three';
import { Book } from '../books/book';
import {
  BOOK_DEPTH,
  BOOK_HEIGHT,
  LibraryPosition,
  SHELF_COLUMN_DISTANCE,
  SHELF_LEVELS,
  SHELF_ROW_DISTANCE
} from './library-data';

export interface LibraryRendererOptions {
  reducedMotion: boolean;
  lowQuality: boolean;
  onSelect: (isbn: string | undefined) => void;
  onInspectChange: (inspecting: boolean) => void;
  onFailure: () => void;
}

interface BookObject {
  book: Book;
  group: THREE.Group;
  home: THREE.Vector3;
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]>;
  materials: THREE.MeshStandardMaterial[];
}

interface BookAnimation {
  object: THREE.Group;
  target: THREE.Vector3;
  from: THREE.Vector3;
  started: number;
  done?: () => void;
}

export class LibraryRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(65, 1, 0.05, 80);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly books: BookObject[] = [];
  private readonly collisions: THREE.Box3[] = [];
  private readonly disposables: Array<() => void> = [];
  private readonly renderer: THREE.WebGLRenderer;
  private readonly options: LibraryRendererOptions;
  private selected?: BookObject;
  private held?: BookObject;
  private dragging = false;
  private mouseForward = false;
  private pointerTravel = 0;
  private lastPointer = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private animation?: BookAnimation;
  private disposed = false;
  private lastFrame = 0;
  private readonly move = new THREE.Vector3();
  private roomEnd = 8;
  private searchMatches?: ReadonlySet<string>;
  private readonly mutedMaterial = new THREE.MeshStandardMaterial({ color: 0x484b4d, roughness: 1 });
  private readonly roomObjects: THREE.Object3D[] = [];

  constructor(host: HTMLElement, layout: readonly LibraryPosition[], options: LibraryRendererOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ antialias: !options.lowQuality, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.lowQuality ? 1 : 1.5));
    this.renderer.setClearColor(0x100b08);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', '3D-Bibliothek');
    // This canvas is created outside Angular's template and has no scoped style attribute.
    Object.assign(this.canvas.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    host.replaceChildren(this.canvas);
    this.scene.fog = new THREE.Fog(0x302b23, 14, 40);
    this.renderer.setClearColor(0x302b23);
    this.camera.rotation.order = 'YXZ';
    this.reset();
    this.addRoom(layout);
    layout.forEach(item => this.addBook(item));
    this.listen();
    this.resize();
    this.renderer.setAnimationLoop(time => this.frame(time));
  }

  setLowQuality(enabled: boolean): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, enabled ? 1 : 1.5));
  }

  setSearchMatches(isbns: ReadonlySet<string>): void {
    this.searchMatches = new Set(isbns);
    this.books.forEach(item => this.updateAppearance(item));
  }

  select(isbn: string): boolean {
    if (this.held && this.held.book.isbn !== isbn) return false;
    const target = this.books.find(item => item.book.isbn === isbn);
    if (!target) return false;
    this.setSelected(target);
    return true;
  }

  reset(): void {
    this.returnBook();
    this.stopMovement();
    this.camera.position.set(0, 1.65, -3.6);
    this.camera.rotation.set(-0.08, Math.PI, 0);
    this.camera.fov = 65;
    this.camera.updateProjectionMatrix();
  }

  requestPointerLock(): void {
    this.canvas.requestPointerLock?.();
  }

  inspect(point?: THREE.Vector3): boolean {
    if (!this.selected || this.held || !this.canReach(this.selected, point)) return false;
    this.finishAnimation();
    this.stopMovement();
    this.held = this.selected;
    this.held.group.quaternion.copy(this.camera.quaternion);
    this.held.group.rotateY(Math.PI / 2);
    this.updateAppearance(this.held);
    this.options.onInspectChange(true);
    this.options.onSelect(this.held.book.isbn);
    const target = this.camera.position
      .clone()
      .add(new THREE.Vector3(0, 0, -0.65).applyQuaternion(this.camera.quaternion));
    this.animate(this.held.group, target);
    return true;
  }

  returnBook(): void {
    if (!this.held) return;
    const held = this.held;
    this.held = undefined;
    this.options.onInspectChange(false);
    this.updateAppearance(held);
    this.animate(held.group, held.home, () => {
      held.group.rotation.set(0, 0, 0);
      this.updateAppearance(held);
    });
  }

  rotate(horizontal: number, vertical: number): void {
    if (!this.held) return;
    this.held.group.rotation.y += horizontal;
    this.held.group.rotation.x = Math.max(-0.8, Math.min(0.8, this.held.group.rotation.x + vertical));
  }

  zoom(amount: number): void {
    this.camera.fov = Math.max(40, Math.min(80, this.camera.fov + amount));
    this.camera.updateProjectionMatrix();
  }

  escape(): void {
    this.stopMovement();
    if (this.held) this.returnBook();
    else if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.animation = undefined;
    this.held = undefined;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.disposables.splice(0).forEach(cleanup => cleanup());
    // Muted meshes temporarily hide their original materials, which still own cover textures.
    this.books.forEach(book => {
      book.body.material = book.materials;
    });
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(material => {
          const texture = (material as THREE.MeshStandardMaterial).map;
          texture?.dispose();
          material.dispose();
        });
      }
    });
    this.renderer.dispose();
    this.mutedMaterial.dispose();
    this.renderer.forceContextLoss();
  }

  private addRoom(layout: readonly LibraryPosition[]): void {
    const shelves = Math.max(1, Math.ceil(layout.length / 80));
    this.roomEnd = Math.max(7, Math.ceil(shelves / 2) * SHELF_ROW_DISTANCE + 1);
    const depth = this.roomEnd + 5;
    const center = (this.roomEnd - 5) / 2;
    const wood = new THREE.MeshStandardMaterial({ color: 0x38291f, roughness: 0.65 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x84623b, roughness: 0.5, metalness: 0.35 });
    const plaster = new THREE.MeshStandardMaterial({ color: 0x726b57, roughness: 1 });
    const box = (size: [number, number, number], position: [number, number, number], material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      this.scene.add(mesh);
      this.roomObjects.push(mesh);
      return mesh;
    };
    const floorTexture = this.floorTexture();
    floorTexture.repeat.set(4, depth / 3);
    box([9, 0.08, depth], [0, -0.04, center], new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.7 }));
    box([9, 0.08, depth], [0, 3.4, center], plaster);
    for (const x of [-4.5, 4.5]) {
      box([0.15, 3.4, depth], [x, 1.7, center], plaster);
      box([0.2, 0.22, depth], [x, 0.11, center], wood);
      box([0.25, 0.16, depth], [x, 3.22, center], trim);
    }
    box([9, 3.4, 0.15], [0, 1.7, this.roomEnd], plaster);
    box([9, 0.24, 0.2], [0, 0.12, this.roomEnd - 0.1], wood);
    // A woven runner leads into the room without obstructing the shelves.
    box([1.6, 0.012, depth - 1], [0, 0.008, center], new THREE.MeshStandardMaterial({ color: 0x344944, roughness: 1 }));
    for (const x of [-0.73, 0.73]) box([0.025, 0.014, depth - 1], [x, 0.01, center], trim);
    this.scene.add(new THREE.HemisphereLight(0xffecd3, 0x554b38, 2.4));
    const daylight = new THREE.DirectionalLight(0xffebcb, 2.2);
    daylight.position.set(-3, 5, -4);
    this.scene.add(daylight);
    const glow = new THREE.MeshStandardMaterial({ color: 0xffdf9f, emissive: 0xffbc60, emissiveIntensity: 2 });
    for (let z = -1.5; z < this.roomEnd; z += SHELF_ROW_DISTANCE) {
      box([1.1, 0.05, 0.4], [0, 3.28, z], trim);
      box([0.95, 0.025, 0.28], [0, 3.24, z], glow);
      const lamp = new THREE.PointLight(0xffd6a0, 12, 6, 2);
      lamp.position.set(0, 2.9, z);
      this.scene.add(lamp);
      for (const x of [-4.39, 4.39]) {
        box([0.06, 0.8, 0.34], [x, 2.05, z], trim);
        box([0.07, 0.55, 0.23], [x, 2.05, z], glow);
      }
    }
    for (let shelf = 0; shelf < shelves; shelf++) {
      const row = Math.floor(shelf / 2);
      const column = shelf % 2;
      const x = (column - 0.5) * SHELF_COLUMN_DISTANCE;
      const z = row * SHELF_ROW_DISTANCE;
      box([1.65, 1.9, 0.09], [x, 1.05, z + 0.14], wood);
      for (const side of [-0.79, 0.79]) box([0.09, 1.9, 0.48], [x + side, 1.05, z - 0.05], wood);
      box([1.8, 0.12, 0.55], [x, 2.02, z - 0.05], wood);
      box([1.8, 0.12, 0.55], [x, 0.16, z - 0.05], wood);
      box([1.72, 0.025, 0.025], [x, 1.95, z - 0.33], trim);
      this.collisions.push(
        new THREE.Box3(new THREE.Vector3(x - 0.9, 0, z - 0.32), new THREE.Vector3(x + 0.9, 2.1, z + 0.22))
      );
      SHELF_LEVELS.forEach(level => {
        box([1.6, 0.045, 0.48], [x, level - 0.0225, z - 0.05], wood);
        box([1.5, 0.012, 0.025], [x, level - 0.055, z - 0.27], glow);
      });
    }
  }

  private floorTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#584331';
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++) {
      for (let column = -1; column < 3; column++) {
        const x = column * 256 + (row % 2) * 128;
        ctx.fillStyle = ['#806348', '#73563d', '#8a6b4d', '#765a42'][(row + column + 4) % 4];
        ctx.fillRect(x + 1, row * 64 + 1, 254, 62);
        for (let grain = 0; grain < 12; grain++) {
          ctx.strokeStyle = grain % 2 ? '#ffffff08' : '#20150a12';
          ctx.beginPath();
          ctx.moveTo(x + 2, row * 64 + grain * 5 + 2);
          ctx.bezierCurveTo(
            x + 70,
            row * 64 + grain * 5,
            x + 180,
            row * 64 + grain * 5 + 6,
            x + 254,
            row * 64 + grain * 5 + 2
          );
          ctx.stroke();
        }
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private addBook(item: LibraryPosition): void {
    const group = new THREE.Group();
    const spine = new THREE.MeshStandardMaterial({ map: this.spineTexture(item.book), roughness: 0.7 });
    const pages = new THREE.MeshStandardMaterial({ color: 0xe8d9b7, roughness: 1 });
    const cover = new THREE.MeshStandardMaterial({ color: 0x8a6041, roughness: 0.75 });
    const materials = [cover, cover, pages, pages, pages, spine];
    const body = new THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]>(
      new THREE.BoxGeometry(item.thickness, BOOK_HEIGHT, BOOK_DEPTH),
      materials
    );
    group.add(body);
    const home = new THREE.Vector3(...item.position);
    group.position.copy(home);
    this.scene.add(group);
    this.books.push({ book: item.book, group, home, body, materials });
    const coverUrl = item.book.cover?.trim();
    if (coverUrl) {
      new THREE.TextureLoader().load(
        coverUrl,
        texture => {
          if (this.disposed) return texture.dispose();
          texture.colorSpace = THREE.SRGBColorSpace;
          cover.map = texture;
          cover.color.set(0xffffff);
          cover.needsUpdate = true;
        },
        undefined,
        () => {
          if (this.disposed) return;
          cover.map = this.fallbackCover(item.book);
          cover.needsUpdate = true;
        }
      );
    } else {
      cover.map = this.fallbackCover(item.book);
      cover.needsUpdate = true;
    }
  }

  private fallbackCover(book: Book): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 192;
    const context = canvas.getContext('2d')!;
    context.fillStyle = `#${this.colorFor(book.isbn).toString(16).padStart(6, '0')}`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fff7e6';
    context.font = 'bold 14px sans-serif';
    context.fillText(book.title.slice(0, 18), 8, 40, 112);
    return new THREE.CanvasTexture(canvas);
  }

  private spineTexture(book: Book): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = `#${this.colorFor(book.isbn).toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 32, 256);
    ctx.fillStyle = '#dbc69c';
    ctx.fillRect(3, 12, 26, 2);
    ctx.fillRect(3, 240, 26, 2);
    ctx.translate(20, 228);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '14px Georgia';
    ctx.fillText(book.title, 0, 0, 200);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private listen(): void {
    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      this.canvas.addEventListener(type, handler as EventListener);
      this.disposables.push(() => this.canvas.removeEventListener(type, handler as EventListener));
    };
    listen('pointerdown', event => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      this.mouseForward = event.button === 2 && !this.held;
      this.dragging = true;
      this.pointerTravel = 0;
      this.lastPointer.set(event.clientX, event.clientY);
      if (document.pointerLockElement !== this.canvas) this.canvas.setPointerCapture(event.pointerId);
    });
    listen('pointerup', event => {
      if (event.button === 2) this.mouseForward = false;
      if (event.button === 0 && this.pointerTravel < 5) this.pick(event.clientX, event.clientY);
      this.dragging = event.buttons !== 0;
      if (!event.buttons && this.canvas.hasPointerCapture(event.pointerId))
        this.canvas.releasePointerCapture(event.pointerId);
    });
    listen('pointercancel', () => this.stopMovement());
    listen('lostpointercapture', () => this.stopMovement());
    listen('contextmenu', event => event.preventDefault());
    const wheel = (event: WheelEvent) => {
      if (!this.held || !event.deltaY) return;
      event.preventDefault();
      this.zoom(Math.sign(event.deltaY) * 5);
    };
    this.canvas.addEventListener('wheel', wheel, { passive: false });
    this.disposables.push(() => this.canvas.removeEventListener('wheel', wheel));
    listen('pointermove', event => {
      this.pointerTravel += Math.abs(event.movementX) + Math.abs(event.movementY);
      if (this.held) {
        if (this.dragging || document.pointerLockElement === this.canvas) {
          const locked = document.pointerLockElement === this.canvas;
          this.rotate(
            (locked ? event.movementX : event.clientX - this.lastPointer.x) * 0.01,
            (locked ? event.movementY : event.clientY - this.lastPointer.y) * 0.01
          );
          this.lastPointer.set(event.clientX, event.clientY);
        }
        return;
      }
      if (document.pointerLockElement === this.canvas) {
        this.camera.rotation.y -= event.movementX * 0.002;
        this.camera.rotation.x = Math.max(-1.4, Math.min(1.4, this.camera.rotation.x - event.movementY * 0.002));
      } else if (this.dragging) {
        this.camera.rotation.y -= (event.clientX - this.lastPointer.x) * 0.004;
        this.camera.rotation.x = Math.max(
          -1.4,
          Math.min(1.4, this.camera.rotation.x - (event.clientY - this.lastPointer.y) * 0.004)
        );
        this.lastPointer.set(event.clientX, event.clientY);
      }
    });
    const key = (event: KeyboardEvent) => {
      if (event.type === 'keyup') {
        this.keys.delete(event.key.toLowerCase());
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, [contenteditable], [role="dialog"]')
      )
        return;
      if (event.type === 'keydown') this.keys.add(event.key.toLowerCase());
      if (event.type === 'keydown' && event.key.toLowerCase() === 'e') this.inspect();
      if (event.type === 'keydown' && event.key === 'Escape') this.escape();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    this.disposables.push(
      () => window.removeEventListener('keydown', key),
      () => window.removeEventListener('keyup', key)
    );
    const resize = () => this.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(this.canvas.parentElement!);
    this.disposables.push(() => observer.disconnect());
    const blur = () => this.stopMovement();
    window.addEventListener('blur', blur);
    this.disposables.push(() => window.removeEventListener('blur', blur));
    const lockChange = () => {
      if (document.pointerLockElement !== this.canvas) this.stopMovement();
    };
    const visibilityChange = () => {
      if (document.hidden) this.stopMovement();
    };
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('visibilitychange', visibilityChange);
    this.disposables.push(
      () => document.removeEventListener('pointerlockchange', lockChange),
      () => document.removeEventListener('visibilitychange', visibilityChange)
    );
    const lost = (event: Event) => {
      event.preventDefault();
      this.stopMovement();
      this.dispose();
      this.options.onFailure();
    };
    this.canvas.addEventListener('webglcontextlost', lost);
    this.disposables.push(() => this.canvas.removeEventListener('webglcontextlost', lost));
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (document.pointerLockElement === this.canvas) this.pointer.set(0, 0);
    else this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.held) {
      this.held.group.updateWorldMatrix(true, true);
      if (!this.raycaster.intersectObject(this.held.group, true).length) this.returnBook();
      return;
    }
    const hit = this.raycaster.intersectObjects(
      this.books.map(item => item.group),
      true
    )[0];
    const obstruction = this.raycaster.intersectObjects(this.roomObjects, false)[0];
    const found =
      hit && (!obstruction || obstruction.distance > hit.distance)
        ? this.books.find(item => item.group === hit.object || item.group.children.includes(hit.object))
        : undefined;
    this.setSelected(found);
    if (found) this.inspect(hit.point);
  }

  private setSelected(book: BookObject | undefined): void {
    const previous = this.selected;
    this.selected = book;
    if (previous) this.updateAppearance(previous);
    if (book) this.updateAppearance(book);
    this.options.onSelect(book?.book.isbn);
  }

  private updateAppearance(book: BookObject): void {
    const muted = this.searchMatches && !this.searchMatches.has(book.book.isbn) && book !== this.held;
    book.body.material = muted ? this.mutedMaterial : book.materials;
    const selected = book === this.selected;
    const match =
      this.searchMatches && this.searchMatches.size < this.books.length && this.searchMatches.has(book.book.isbn);
    book.materials.forEach(material => {
      material.emissive.set(selected || match ? 0x5b321b : 0x000000);
      material.emissiveIntensity = selected ? 0.7 : match ? 0.3 : 0;
    });
  }

  private canReach(book: BookObject, point?: THREE.Vector3): boolean {
    const bounds = new THREE.Box3().setFromObject(book.group);
    if (bounds.distanceToPoint(this.camera.position) > 2) return false;
    if (point) return this.hasFreeSight(book, point);
    // HTML/keyboard selection has no picked point. Check the exposed spine as well
    // as the centre: shelf boards can obscure the centre at close range.
    const center = bounds.getCenter(new THREE.Vector3());
    const front = this.camera.position.z < center.z ? bounds.min.z + 0.0001 : bounds.max.z - 0.0001;
    return [
      center,
      ...[0.1, 0.5, 0.9].map(
        height => new THREE.Vector3(center.x, bounds.min.y + (bounds.max.y - bounds.min.y) * height, front)
      )
    ].some(target => this.hasFreeSight(book, target));
  }

  private hasFreeSight(book: BookObject, point: THREE.Vector3): boolean {
    this.raycaster.set(this.camera.position, point.clone().sub(this.camera.position).normalize());
    const hit = this.raycaster.intersectObjects(
      this.books.map(item => item.group),
      true
    )[0];
    const obstruction = this.raycaster.intersectObjects(this.roomObjects, false)[0];
    return (
      !!hit &&
      (!obstruction || obstruction.distance > hit.distance) &&
      (hit.object === book.group || book.group.children.includes(hit.object))
    );
  }

  private animate(object: THREE.Group, target: THREE.Vector3, done?: () => void): void {
    this.finishAnimation();
    if (this.options.reducedMotion) {
      object.position.copy(target);
      done?.();
      return;
    }
    this.animation = { object, target, from: object.position.clone(), started: performance.now(), done };
  }

  private finishAnimation(): void {
    const animation = this.animation;
    this.animation = undefined;
    if (!animation) return;
    animation.object.position.copy(animation.target);
    animation.done?.();
  }

  private frame(time: number): void {
    const delta = Math.min(0.05, (time - this.lastFrame) / 1000 || 0);
    this.lastFrame = time;
    if (!this.held) this.moveCamera(delta);
    if (this.animation) {
      const progress = Math.min(1, (time - this.animation.started) / 260);
      this.animation.object.position.lerpVectors(this.animation.from, this.animation.target, progress);
      if (progress === 1) {
        this.finishAnimation();
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  private moveCamera(delta: number): void {
    this.move.set(0, 0, 0);
    if (this.keys.has('w') || this.mouseForward) this.move.z -= 1;
    if (this.keys.has('s')) this.move.z += 1;
    if (this.keys.has('a')) this.move.x -= 1;
    if (this.keys.has('d')) this.move.x += 1;
    if (!this.move.lengthSq()) return;
    this.move.normalize().multiplyScalar(delta * (this.keys.has('shift') ? 3.2 : 1.6));
    this.move.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camera.rotation.y);
    const next = this.camera.position.clone().add(this.move);
    next.y = 1.65;
    if (
      Math.abs(next.x) > 4.15 ||
      next.z < -4.5 ||
      next.z > this.roomEnd - 0.4 ||
      this.collisions.some(box => box.clone().expandByScalar(0.25).containsPoint(next))
    )
      return;
    this.camera.position.copy(next);
  }

  private stopMovement(): void {
    this.mouseForward = false;
    this.dragging = false;
    this.keys.clear();
  }

  private resize(): void {
    const width = this.canvas.parentElement?.clientWidth || 1;
    const height = this.canvas.parentElement?.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private colorFor(value: string): number {
    let hash = 0;
    for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return new THREE.Color().setHSL((Math.abs(hash) % 360) / 360, 0.45, 0.34).getHex();
  }
}
