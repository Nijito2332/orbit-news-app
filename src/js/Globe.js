import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getSunDirection, latLngTo3D } from './SunPosition.js';

// ─── Texture sources ──────────────────────────────────────────────────────────
// NASA Blue Marble from Three.js repo — no clouds versions
const BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/';
const TEX = {
  day:      BASE + 'earth_atmos_2048.jpg',
  night:    BASE + 'earth_lights_2048.png',
  specular: BASE + 'earth_specular_2048.jpg',
};

// ─── GLSL Shaders ─────────────────────────────────────────────────────────────

const EARTH_VERT = /* glsl */`
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vWorldPos;
  void main() {
    vUv      = uv;
    vNormal  = normalize(mat3(modelMatrix) * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Cinematic Google-Earth-style shader — no clouds
const EARTH_FRAG = /* glsl */`
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uSpecular;
  uniform vec3      uSunDir;

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vWorldPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunDir);

    float NdL = dot(N, L);
    // Crisp terminator — more realistic from orbit
    float dayFac = smoothstep(-0.04, 0.18, NdL);

    // ── Day texture: colour-grade for cinema ──
    vec3 dc = texture2D(uDay, vUv).rgb;
    float lum = dot(dc, vec3(0.299, 0.587, 0.114));
    dc = mix(vec3(lum), dc, 1.22);   // +22% saturation
    dc = pow(dc, vec3(0.88));         // Gamma lift
    dc *= 1.08;                        // Exposure

    // ── Night: warm city-lights (orange, not cold-white) ──
    vec3 nc = texture2D(uNight, vUv).rgb;
    nc = nc * vec3(1.45, 1.05, 0.45); // Warm orange tint
    nc = pow(max(nc, vec3(0.0)), vec3(0.52));
    nc *= 3.0;                          // Strong glow

    vec3 col = mix(nc, dc, dayFac);

    // ── Ocean specular (two-lobe: glint + sheen) ──
    float sm = texture2D(uSpecular, vUv).r;
    vec3  H  = normalize(L + V);
    float NdH = max(dot(N, H), 0.0);
    float s1 = pow(NdH, 350.0);   // Sun glint — very focused
    float s2 = pow(NdH,  55.0);   // Broad ocean sheen
    vec3 specCol = mix(vec3(0.65, 0.82, 1.0), vec3(1.0, 0.97, 0.93), s1 / (s1 + 0.06));
    col += specCol * (s1 * 2.2 + s2 * 0.22) * sm * dayFac;

    // ── Atmospheric limb (Fresnel) ──
    float rim  = 1.0 - max(dot(N, V), 0.0);
    rim = pow(rim, 2.1);
    float rdF = smoothstep(-0.25, 0.55, NdL);
    vec3  rc  = mix(vec3(0.02, 0.04, 0.18), vec3(0.35, 0.65, 1.0), rdF);
    // Sunrise / sunset limb glow
    float sunLimb = pow(max(1.0 - abs(NdL), 0.0), 4.5) * rdF;
    rc = mix(rc, vec3(0.92, 0.48, 0.12), sunLimb * 0.4);
    col += rc * rim * 0.55;

    // ── Limb darkening ──
    float ld = pow(max(dot(N, V), 0.0), 0.35);
    col *= 0.82 + 0.18 * ld;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const ATMO_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal   = normalize(mat3(modelMatrix) * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Rayleigh-scattering atmosphere with sunset glow
const ATMO_FRAG = /* glsl */`
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunDir);

    float rim = 1.0 - max(dot(N, V), 0.0);
    rim = pow(rim, 1.25);

    float NdL = dot(N, L);
    float dF  = smoothstep(-0.2, 0.6, NdL);

    // Rayleigh blue atmosphere
    vec3 ac = mix(vec3(0.01, 0.02, 0.10) * 0.35, vec3(0.28, 0.58, 1.0), dF);

    // Sunset / sunrise orange glow
    float sG = pow(max(1.0 - abs(NdL), 0.0), 5.5) * dF;
    ac = mix(ac, vec3(1.0, 0.42, 0.08), sG * 0.55);

    float dayRim = rim * smoothstep(-0.1, 0.4, NdL);
    float alpha  = clamp(ac.b * 0.4 * rim + dayRim * 0.38, 0.0, 0.88);

    gl_FragColor = vec4(ac, alpha);
  }
`;

const HOTSPOT_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HOTSPOT_FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2  vUv;

  void main() {
    vec2  ctr = vec2(0.5);
    float d   = distance(vUv, ctr);
    if (d > 0.5) discard;

    // Bright solid core (star-like centre)
    float core  = exp(-d * 22.0) * 1.6;

    // Outer ambient glow
    float glow  = exp(-d * 7.0) * 0.35;

    // Single clean expanding ring
    float pulse = mod(uTime * 0.5, 1.0);
    float ring  = exp(-pow((d - pulse * 0.46) * 26.0, 2.0)) * (1.0 - pulse) * 1.1;

    float a = (core + glow + ring) * uOpacity;
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  }
`;

// ─── GLOBE CLASS ──────────────────────────────────────────────────────────────
export class Globe {
  constructor(canvas) {
    this.canvas   = canvas;
    this._time    = 0;
    this.hotspots = [];
    this.callbacks = {
      onReady:            null,
      onHotspotClick:     null,
      onHotspotHover:     null,
      onHotspotLeave:     null,
      onBackgroundClick:  null,
      onLoadProgress:     null,
    };

    this.raycaster = new THREE.Raycaster();
    this.mouse     = new THREE.Vector2(-99, -99);
    this._hovered  = null;
    this._sunDir   = getSunDirection();

    this._init();
  }

  _init() {
    this._setupScene();
    this._setupCamera();
    this._setupRenderer();
    this._setupControls();
    this._createStars();
    this._loadEarth().then(() => {
      this._createAtmosphere();
      this._setupEvents();
      this._animate();
      if (this.callbacks.onReady) this.callbacks.onReady();
    }).catch(err => {
      console.warn('[Globe] Texture load failed, using fallback', err);
      this._createFallbackEarth();
      this._createAtmosphere();
      this._setupEvents();
      this._animate();
      if (this.callbacks.onReady) this.callbacks.onReady();
    });
  }

  _setupScene() {
    this.scene = new THREE.Scene();
  }

  _setupCamera() {
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(0, 0.3, 7);
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2.5));
    this.renderer.setSize(innerWidth, innerHeight);
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    else this.renderer.outputEncoding = 3001;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
  }

  _setupControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.055;
    this.controls.enablePan      = false;
    this.controls.minDistance    = 1.3;
    this.controls.maxDistance    = 7.5;
    this.controls.rotateSpeed    = 0.42;
    this.controls.zoomSpeed      = 0.85;
    this.controls.autoRotate     = true;
    this.controls.autoRotateSpeed = 0.25;
  }

  _createStars() {
    const count = 18000;
    const pos   = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 48 + Math.random() * 28;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));
    this._stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.055, sizeAttenuation: true, transparent: true, opacity: 0.8,
    }));
    this.scene.add(this._stars);
  }

  async _loadEarth() {
    const loader = new THREE.TextureLoader();
    let   loaded = 0;
    const report = () => {
      loaded++;
      if (this.callbacks.onLoadProgress) this.callbacks.onLoadProgress(loaded / 3);
    };

    const [dayT, nightT, specT] = await Promise.all([
      loader.loadAsync(TEX.day).then(t   => { report(); return t; }),
      loader.loadAsync(TEX.night).then(t  => { report(); return t; }),
      loader.loadAsync(TEX.specular).then(t => { report(); return t; }),
    ]);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    [dayT, nightT, specT].forEach(t => {
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      else t.encoding = 3001;
      t.anisotropy = maxAniso;
    });

    this._sunDir = getSunDirection();
    this._earthMat = new THREE.ShaderMaterial({
      uniforms: {
        uDay:     { value: dayT },
        uNight:   { value: nightT },
        uSpecular:{ value: specT },
        uSunDir:  { value: this._sunDir },
      },
      vertexShader:   EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    });

    this._earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), this._earthMat);
    this.scene.add(this._earth);

    // Lighting for any non-shader meshes
    this.scene.add(new THREE.AmbientLight(0x224466, 0.3));
    this._sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.scene.add(this._sunLight);
  }

  _createFallbackEarth() {
    this._earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhongMaterial({ color: 0x1A4A7A, specular: 0x223355, shininess: 30 }),
    );
    this.scene.add(this._earth);
    this._earthMat = { uniforms: { uSunDir: { value: this._sunDir } } };
    this.scene.add(new THREE.AmbientLight(0x224466, 0.4));
    this._sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.scene.add(this._sunLight);
  }

  _createAtmosphere() {
    this._atmoMat = new THREE.ShaderMaterial({
      uniforms:       { uSunDir: { value: this._sunDir } },
      vertexShader:   ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      side:           THREE.BackSide,
      depthWrite:     false,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.09, 48, 48), this._atmoMat));
  }

  // ── Hotspots ────────────────────────────────────────────────────────────────
  addHotspot(data, color) {
    const pos = latLngTo3D(data.lat, data.lng, 1.010);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color(color) },
        uTime:    { value: 0 },
        uOpacity: { value: 0.88 },
      },
      vertexShader:   HOTSPOT_VERT,
      fragmentShader: HOTSPOT_FRAG,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      side:           THREE.DoubleSide,
    });

    const isMobile = window.innerWidth < 768;
    // Now ONE hotspot per country — slightly larger, more distinctive
    const visSize = isMobile
      ? 0.060 + (data.intensity || 0.5) * 0.030   // Mobile: bigger, easier to tap
      : 0.042 + (data.intensity || 0.5) * 0.022;  // Desktop: clearly visible dot

    const visMesh = new THREE.Mesh(new THREE.PlaneGeometry(visSize, visSize), mat);
    visMesh.position.copy(pos);
    visMesh.lookAt(pos.clone().normalize().multiplyScalar(2));
    this.scene.add(visMesh);

    // Hitbox: 1.8x on mobile (not 3.5x — prevents adjacent countries triggering wrong one)
    // Countries like Spain/France are only ~8° apart; 3.5x caused cross-country selection
    const hitSize = isMobile ? visSize * 1.8 : visSize * 2.2;
    const hitMat  = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const hitMesh = new THREE.Mesh(new THREE.PlaneGeometry(hitSize, hitSize), hitMat);
    hitMesh.position.copy(pos);
    hitMesh.lookAt(pos.clone().normalize().multiplyScalar(2));
    this.scene.add(hitMesh);

    const entry = { data, mesh: visMesh, hitMesh, material: mat, hitMaterial: hitMat };
    this.hotspots.push(entry);
    return entry;
  }

  removeAllHotspots() {
    this.hotspots.forEach(h => {
      this.scene.remove(h.mesh);
      this.scene.remove(h.hitMesh);
      h.mesh.geometry.dispose();
      h.material.dispose();
      if (h.hitMesh) { h.hitMesh.geometry.dispose(); h.hitMaterial?.dispose(); }
    });
    this.hotspots = [];
  }

  filterByCategory(category) {
    this.hotspots.forEach(h => {
      const v = category === 'all' || h.data.category === category;
      h.mesh.visible    = v;
      if (h.hitMesh) h.hitMesh.visible = v;
    });
  }

  // ── Camera controls ──────────────────────────────────────────────────────────

  /**
   * Cinematic close-up zoom to a lat/lng point.
   * Camera flies very close to the surface (dist ≈ 1.42) at a 3D oblique angle,
   * creating a Google-Earth-style terrain perspective.
   */
  flyToClose(lat, lng, dur = 1600) {
    this.controls.autoRotate = false;
    this._isZoomedIn = true;

    // Surface normal at the target point
    const surfacePoint = latLngTo3D(lat, lng, 1.0);
    const normal       = surfacePoint.clone().normalize();

    // Tangent vector (east direction) for sideways offset — creates 3D viewing angle
    const east = new THREE.Vector3(
      -Math.sin(lng * Math.PI / 180),
      0,
      -Math.cos(lng * Math.PI / 180),
    ).normalize();

    // Camera target position: close to surface + slight eastward offset for oblique view
    const cameraTarget = surfacePoint.clone()
      .multiplyScalar(1.44)           // 0.44 above surface
      .addScaledVector(east, 0.10)    // Slight east offset for 3D tilt
      .addScaledVector(new THREE.Vector3(0, 1, 0), 0.04); // Tiny up-lift

    // The "look-at" point: slightly toward the surface, not globe center
    const lookAt = surfacePoint.clone().multiplyScalar(0.98);

    const startPos  = this.camera.position.clone();
    const startLook = new THREE.Vector3(0, 0, 0); // was looking at center
    const t0        = performance.now();

    // Easing: fast start, smooth landing (ease-in-out-cubic)
    const ease = p => p < 0.5
      ? 4 * p * p * p
      : 1 - Math.pow(-2 * p + 2, 3) / 2;

    const go = now => {
      const p = Math.min((now - t0) / dur, 1);
      const e = ease(p);

      this.camera.position.lerpVectors(startPos, cameraTarget, e);

      // Smoothly transition look-at from (0,0,0) to the surface point
      const currentLook = startLook.clone().lerp(lookAt, e);
      this.camera.lookAt(currentLook);

      if (p < 1) requestAnimationFrame(go);
      else {
        // Re-enable controls at the new close position
        this.controls.target.copy(lookAt);
        this.controls.update();
      }
    };
    requestAnimationFrame(go);
  }

  /**
   * Medium-distance orbit flyTo (for sidebar category changes etc).
   */
  flyTo(lat, lng, dist = 2.6, dur = 1200) {
    this.controls.autoRotate = false;
    this._isZoomedIn = false;
    const tgt = latLngTo3D(lat, lng, dist);
    const s = this.camera.position.clone();
    const t0 = performance.now();
    const go = now => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      this.camera.position.lerpVectors(s, tgt, e);
      this.camera.lookAt(0, 0, 0);
      if (p < 1) requestAnimationFrame(go);
    };
    requestAnimationFrame(go);
  }

  resetView(dur = 1100) {
    this._isZoomedIn = false;
    const tgt = new THREE.Vector3(0, 0.3, 3.8);
    const s   = this.camera.position.clone();
    const sl  = this.controls.target.clone();
    const t0  = performance.now();
    const go  = now => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      this.camera.position.lerpVectors(s, tgt, e);
      // Smoothly restore look-at to globe center
      const lk = sl.clone().lerp(new THREE.Vector3(0, 0, 0), e);
      this.camera.lookAt(lk);
      this.controls.target.copy(lk);
      if (p < 1) requestAnimationFrame(go);
      else {
        this.controls.target.set(0, 0, 0);
        this.controls.autoRotate = true;
      }
    };
    requestAnimationFrame(go);
  }

  zoomIn()  { this.camera.position.multiplyScalar(0.85); }
  zoomOut() { this.camera.position.multiplyScalar(1.18); }
  toggleAutoRotate(on) { this.controls.autoRotate = on; }

  // ── Events ──────────────────────────────────────────────────────────────────
  _setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.canvas.addEventListener('click',     e => this._onClick(e));
    this.canvas.addEventListener('mousemove', e => this._onMove(e));
    this.canvas.addEventListener('touchend',  e => this._onTouch(e));
  }

  _toNDC(x, y) {
    this.mouse.x = (x / innerWidth)  * 2 - 1;
    this.mouse.y = -(y / innerHeight) * 2 + 1;
  }

  _hitHotspots() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Check invisible hitMesh (large) first for easier selection, then visible mesh
    const hitMeshes = this.hotspots.filter(h => h.mesh.visible).map(h => h.hitMesh || h.mesh);
    const hits = this.raycaster.intersectObjects(hitMeshes);
    if (!hits.length) return null;
    const hitObj = hits[0].object;
    return this.hotspots.find(h => h.hitMesh === hitObj || h.mesh === hitObj) || null;
  }

  _onClick(e) {
    this._toNDC(e.clientX, e.clientY);
    const hit = this._hitHotspots();
    if (hit) {
      if (this.callbacks.onHotspotClick) this.callbacks.onHotspotClick(hit.data);
      // Mobile: gentle pan (close zoom is disorienting on small screens)
      // Desktop: cinematic close-up 3D tilt
      if (window.innerWidth < 768) {
        this.flyTo(hit.data.lat, hit.data.lng, 2.0, 900);
      } else {
        this.flyToClose(hit.data.lat, hit.data.lng);
      }
      this._highlightHotspot(hit);
    } else {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      if (this.raycaster.intersectObject(this._earth).length && this.callbacks.onBackgroundClick)
        this.callbacks.onBackgroundClick();
    }
  }

  _highlightHotspot(sel) {
    this.hotspots.forEach(h => {
      if (h.mesh.visible) h.material.uniforms.uOpacity.value = h === sel ? 1.0 : 0.28;
    });
    this._selectedHotspot = sel;
  }

  clearHighlight() {
    this.hotspots.forEach(h => { h.material.uniforms.uOpacity.value = 0.88; });
    this._selectedHotspot = null;
  }

  _onMove(e) {
    this._toNDC(e.clientX, e.clientY);
    const hit = this._hitHotspots();
    if (hit !== this._hovered) {
      if (this._hovered && this.callbacks.onHotspotLeave)  this.callbacks.onHotspotLeave();
      if (hit           && this.callbacks.onHotspotHover)  this.callbacks.onHotspotHover(hit.data, e.clientX, e.clientY);
      this._hovered = hit;
    }
    this.canvas.style.cursor = hit ? 'pointer' : 'grab';
  }

  _onTouch(e) {
    const t = e.changedTouches[0];
    // Pause auto-rotate before computing hit so globe is static during detection
    const wasRotating = this.controls.autoRotate;
    this.controls.autoRotate = false;
    this._toNDC(t.clientX, t.clientY);
    const hit = this._hitHotspots();
    if (hit && this.callbacks.onHotspotClick) {
      this.callbacks.onHotspotClick(hit.data);
      this.flyTo(hit.data.lat, hit.data.lng, 2.0, 900);
      this._highlightHotspot(hit);
    } else if (wasRotating) {
      // Restore rotation only if no hotspot was hit
      this.controls.autoRotate = wasRotating;
    }
  }

  // ── Animation loop ───────────────────────────────────────────────────────────
  _animate() {
    requestAnimationFrame(() => this._animate());
    this._time += 0.016;

    // Update sun every ~10s
    if (Math.round(this._time * 10) % 100 === 0) this._sunDir = getSunDirection();

    if (this._earthMat?.uniforms?.uSunDir) this._earthMat.uniforms.uSunDir.value.copy(this._sunDir);
    if (this._atmoMat)   this._atmoMat.uniforms.uSunDir.value.copy(this._sunDir);
    if (this._sunLight)  this._sunLight.position.copy(this._sunDir).multiplyScalar(8);

    this.hotspots.forEach(h => { h.material.uniforms.uTime.value = this._time; });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
