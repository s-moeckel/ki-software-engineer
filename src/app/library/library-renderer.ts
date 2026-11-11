import * as THREE from 'three';
import { Book } from '../books/book';
import { BOOK_HEIGHT, LibraryPosition, SHELF_LEVELS } from './library-data';

export interface LibraryRendererOptions {
  reducedMotion: boolean;
  lowQuality: boolean;
  onSelect: (isbn: string | undefined) => void;
  onFailure: () => void;
}

interface BookObject {
  book: Book;
  group: THREE.Group;
  home: THREE.Vector3;
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
  private lastPointer = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private animation?: BookAnimation;
  private disposed = false;
  private lastFrame = 0;
  private readonly move = new THREE.Vector3();

  constructor(host: HTMLElement, layout: readonly LibraryPosition[], options: LibraryRendererOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ antialias: !options.lowQuality, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.lowQuality ? 1 : 1.5));
    this.renderer.setClearColor(0x100b08);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', '3D-Bibliothek');
    host.replaceChildren(this.canvas);
    this.scene.fog = new THREE.Fog(0x100b08, 15, 55);
    this.camera.position.set(0, 1.65, -2.2);
    this.camera.rotation.order = 'YXZ';
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
    this.books.forEach(item => item.group.scale.setScalar(isbns.has(item.book.isbn) ? 1.08 : 1));
  }

  select(isbn: string): void {
    const target = this.books.find(item => item.book.isbn === isbn);
    if (target) this.setSelected(target);
  }

  reset(): void {
    this.camera.position.set(0, 1.65, -2.2);
    this.camera.rotation.set(0, 0, 0);
  }

  requestPointerLock(): void {
    this.canvas.requestPointerLock?.();
  }

  inspect(): boolean {
    if (!this.selected || this.held || !this.canReach(this.selected)) return false;
    this.held = this.selected;
    this.options.onSelect(this.held.book.isbn);
    const target = this.camera.position.clone().add(new THREE.Vector3(0, 0, -0.65).applyQuaternion(this.camera.quaternion));
    this.animate(this.held.group, target);
    return true;
  }

  returnBook(): void {
    if (!this.held) return;
    const held = this.held;
    this.held = undefined;
    this.animate(held.group, held.home, () => {
      held.group.rotation.set(0, 0, 0);
      this.setSelected(held);
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
    if (this.held) this.returnBook();
    else if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.disposables.splice(0).forEach(cleanup => cleanup());
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
    this.renderer.forceContextLoss();
  }

  private addRoom(layout: readonly LibraryPosition[]): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2112, roughness: 0.82 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x5b321b, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const ceiling = new THREE.HemisphereLight(0xffd7a0, 0x160b07, 2.1);
    this.scene.add(ceiling);
    const light = new THREE.PointLight(0xffb35c, 35, 14, 2);
    light.position.set(0, 3.5, 1);
    this.scene.add(light);
    const shelves = Math.max(1, Math.ceil(layout.length / 80));
    for (let shelf = 0; shelf < shelves; shelf++) {
      const row = Math.floor(shelf / 2);
      const column = shelf % 2;
      const x = column * 2.7 - 1.35;
      const z = row * 3.2;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.9, 0.12), wood);
      back.position.set(x, 1.05, z + 0.11);
      this.scene.add(back);
      this.collisions.push(new THREE.Box3().setFromObject(back));
      SHELF_LEVELS.forEach(level => {
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.5), wood);
        board.position.set(x, level - 0.03, z);
        this.scene.add(board);
      });
    }
  }

  private addBook(item: LibraryPosition): void {
    const group = new THREE.Group();
    const spine = new THREE.MeshStandardMaterial({ color: this.colorFor(item.book.isbn), roughness: 0.7 });
    const pages = new THREE.MeshStandardMaterial({ color: 0xe8d9b7, roughness: 1 });
    const cover = new THREE.MeshStandardMaterial({ color: 0x8a6041, roughness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(item.thickness, BOOK_HEIGHT, BOOK_DEPTH), [spine, pages, cover]);
    group.add(body);
    const home = new THREE.Vector3(...item.position);
    group.position.copy(home);
    this.scene.add(group);
    this.books.push({ book: item.book, group, home });
    const coverUrl = item.book.cover?.trim();
    if (coverUrl) {
      new THREE.TextureLoader().load(coverUrl, texture => {
        if (this.disposed) return texture.dispose();
        texture.colorSpace = THREE.SRGBColorSpace;
        cover.map = texture;
        cover.color.set(0xffffff);
        cover.needsUpdate = true;
      }, undefined, () => {
        cover.map = this.fallbackCover(item.book);
        cover.needsUpdate = true;
      });
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
    context.fillStyle = this.colorFor(book.isbn);
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fff7e6';
    context.font = 'bold 14px sans-serif';
    context.fillText(book.title.slice(0, 18), 8, 40, 112);
    return new THREE.CanvasTexture(canvas);
  }

  private listen(): void {
    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      this.canvas.addEventListener(type, handler as EventListener);
      this.disposables.push(() => this.canvas.removeEventListener(type, handler as EventListener));
    };
    listen('pointerdown', event => {
      this.dragging = true;
      this.lastPointer.set(event.clientX, event.clientY);
    });
    listen('pointerup', event => {
      this.dragging = false;
      if (Math.abs(event.clientX - this.lastPointer.x) + Math.abs(event.clientY - this.lastPointer.y) < 5) this.pick(event.clientX, event.clientY);
    });
    listen('pointermove', event => {
      if (document.pointerLockElement === this.canvas) {
        this.camera.rotation.y -= event.movementX * 0.002;
        this.camera.rotation.x = Math.max(-1.4, Math.min(1.4, this.camera.rotation.x - event.movementY * 0.002));
      } else if (this.dragging) {
        this.camera.rotation.y -= (event.clientX - this.lastPointer.x) * 0.004;
        this.camera.rotation.x = Math.max(-1.4, Math.min(1.4, this.camera.rotation.x - (event.clientY - this.lastPointer.y) * 0.004));
        this.lastPointer.set(event.clientX, event.clientY);
      }
    });
    const key = (event: KeyboardEvent) => {
      if (event.type === 'keydown') this.keys.add(event.key.toLowerCase());
      else this.keys.delete(event.key.toLowerCase());
      if (event.type === 'keydown' && event.key.toLowerCase() === 'e') this.inspect();
      if (event.type === 'keydown' && event.key === 'Escape') this.escape();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    this.disposables.push(() => window.removeEventListener('keydown', key), () => window.removeEventListener('keyup', key));
    const resize = () => this.resize();
    window.addEventListener('resize', resize);
    this.disposables.push(() => window.removeEventListener('resize', resize));
    const lost = (event: Event) => {
      event.preventDefault();
      this.options.onFailure();
    };
    this.canvas.addEventListener('webglcontextlost', lost);
    this.disposables.push(() => this.canvas.removeEventListener('webglcontextlost', lost));
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.books.map(item => item.group), true)[0];
    const found = hit && this.books.find(item => item.group === hit.object || item.group.children.includes(hit.object));
    this.setSelected(found);
  }

  private setSelected(book: BookObject | undefined): void {
    if (this.selected) this.setHighlight(this.selected, false);
    this.selected = book;
    if (book) this.setHighlight(book, true);
    this.options.onSelect(book?.book.isbn);
  }

  private setHighlight(book: BookObject, active: boolean): void {
    book.group.traverse(object => {
      const mesh = object as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      materials.forEach(material => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.emissive.set(active ? 0x5b321b : 0x000000);
          material.emissiveIntensity = active ? 0.7 : 0;
        }
      });
    });
  }

  private canReach(book: BookObject): boolean {
    const distance = new THREE.Box3().setFromObject(book.group).distanceToPoint(this.camera.position);
    if (distance > 2) return false;
    this.raycaster.set(this.camera.position, book.group.position.clone().sub(this.camera.position).normalize());
    const hit = this.raycaster.intersectObjects(this.books.map(item => item.group), true)[0];
    return !!hit && (hit.object === book.group || book.group.children.includes(hit.object));
  }

  private animate(object: THREE.Group, target: THREE.Vector3, done?: () => void): void {
    if (this.options.reducedMotion) {
      object.position.copy(target);
      done?.();
      return;
    }
    this.animation = { object, target, from: object.position.clone(), started: performance.now(), done };
  }

  private frame(time: number): void {
    const delta = Math.min(0.05, (time - this.lastFrame) / 1000 || 0);
    this.lastFrame = time;
    if (!this.held) this.moveCamera(delta);
    if (this.animation) {
      const progress = Math.min(1, (time - this.animation.started) / 260);
      this.animation.object.position.lerpVectors(this.animation.from, this.animation.target, progress);
      if (progress === 1) {
        const done = this.animation.done;
        this.animation = undefined;
        done?.();
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  private moveCamera(delta: number): void {
    this.move.set(0, 0, 0);
    if (this.keys.has('w')) this.move.z -= 1;
    if (this.keys.has('s')) this.move.z += 1;
    if (this.keys.has('a')) this.move.x -= 1;
    if (this.keys.has('d')) this.move.x += 1;
    if (!this.move.lengthSq()) return;
    this.move.normalize().multiplyScalar(delta * (this.keys.has('shift') ? 3.2 : 1.6));
    this.move.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camera.rotation.y);
    const next = this.camera.position.clone().add(this.move);
    next.y = 1.65;
    if (Math.abs(next.x) > 14 || next.z < -3 || next.z > 18 || this.collisions.some(box => box.clone().expandByScalar(0.25).containsPoint(next))) return;
    this.camera.position.copy(next);
  }

  private resize(): void {
    const width = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 1;
    const height = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 1;
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

