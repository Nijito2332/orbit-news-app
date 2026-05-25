import * as THREE from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }      from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass }        from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';
import { getSunDirection, latLngTo3D } from './SunPosition.js';

// ── ISO 3166-1 alpha-2 → numeric (world-atlas uses numeric IDs) ────────────
const CC_NUM = {
  AF:4,AL:8,DZ:12,AR:32,AM:51,AU:36,AT:40,AZ:31,BH:48,BD:50,BY:112,BE:56,
  BZ:84,BO:68,BA:70,BR:76,BN:96,BG:100,CA:124,CF:140,TD:148,CL:152,CN:156,
  CO:170,CD:180,CR:188,HR:191,CU:192,CZ:203,DK:208,DO:214,EC:218,EG:818,
  EE:233,ET:231,FI:246,FR:250,GE:268,DE:276,GH:288,GR:300,GT:320,HN:340,
  HU:348,IS:352,IN:356,ID:360,IR:364,IQ:368,IE:372,IL:376,IT:380,JP:392,
  JO:400,KZ:398,KE:404,KP:408,KR:410,KW:414,LV:428,LB:422,LY:434,LT:440,
  MY:458,MX:484,MD:498,MA:504,MZ:508,MM:104,NL:528,NZ:554,NG:566,NO:578,
  OM:512,PK:586,PA:591,PY:600,PE:604,PH:608,PL:616,PT:620,QA:634,RO:642,
  RU:643,SA:682,SN:686,RS:688,ZA:710,SS:728,ES:724,LK:144,SD:729,SE:752,
  CH:756,SY:760,TZ:834,TH:764,TN:788,TR:792,UA:804,AE:784,GB:826,US:840,
  UY:858,UZ:860,VE:862,VN:704,YE:887,ZM:894,ZW:716,UG:800,MG:450,NA:516,
  SV:222,NP:524,LU:442,SK:703,SI:705,HR:191,MK:807,AL:8,
};

// World borders cache
let _worldTopo = null;
let _topoLoading = false;

// ─── Texture sources — highest quality available ──────────────────────────────
// Chain: 4K unpkg → 4K jsDelivr → 2K three.js fallback
// All served with Access-Control-Allow-Origin: * (CORS-safe)
// Self-hosted textures on Vercel CDN (same domain = no CORS, edge cached)
// Day:     NASA Blue Marble 2048×1024 (three.js, photorealistic)
// Night:   Solar System Scope 8192×4096 (8K city lights — massive upgrade)
// Specular: 2048×1024 ocean mask
const TEX = {
  day:      '/textures/earth_atmos_2048.jpg?v=5',
  night:    '/textures/earth_lights_2048.png?v=5',
  specular: '/textures/earth_specular_2048.jpg?v=5',
};
// Fallback: three.js CDN (always available)
const BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/';
const TEX_FALLBACK = {
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

// ── Earth Shader — correct pipeline: day + night additive city lights ─────────
const EARTH_FRAG = /* glsl */`
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uSpecular;
  uniform vec3      uSunDir;

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vWorldPos;

  void main() {
    vec3  N   = normalize(vNormal);
    vec3  V   = normalize(cameraPosition - vWorldPos);
    vec3  L   = normalize(uSunDir);
    float NdL = dot(N, L);
    float NdV = max(dot(N, V), 0.0);
    float smQ = texture2D(uSpecular, vUv).r;

    float dayFac  = smoothstep(-0.05, 0.20, NdL);
    float nightFac = 1.0 - dayFac;

    // ── 1. DAY TEXTURE — continent colours, readable terrain ─────────────
    vec3 dc  = texture2D(uDay, vUv).rgb;
    float lumD = dot(dc, vec3(0.299, 0.587, 0.114));
    dc = mix(vec3(lumD), dc, 1.28);
    dc = pow(clamp(dc, 0.0, 1.0), vec3(0.88)) * 1.06;
    dc = mix(dc, dc * vec3(0.60, 0.82, 1.18), smQ * 0.40);

    // ── 2. NIGHT BASE — dark terrain (oceans/continents visible as shape) ─
    // nightBase is just dark enough to see continent shape, not flat black
    vec3 nightBase = vec3(0.002, 0.005, 0.018);

    // ── 3. CITY LIGHTS — multi-scale organic sampling ────────────────────
    // 3 scales: tight core + medium cluster + wide metro halo
    // Large offsets needed — texture is 2048px, city halos must span ~20px
    vec2 px2  = vec2( 2.0 / 2048.0,  2.0 / 1024.0);  // 2 texels  — core
    vec2 px10 = vec2(12.0 / 2048.0, 12.0 / 1024.0);  // 12 texels — cluster
    vec2 px22 = vec2(22.0 / 2048.0, 22.0 / 1024.0);  // 22 texels — metro halo

    // Scale 1: sharp core — 5-tap tight
    vec3 tSharp = texture2D(uNight, vUv).rgb * 0.50 +
      (texture2D(uNight, vUv+vec2( px2.x,0.)).rgb + texture2D(uNight, vUv+vec2(-px2.x,0.)).rgb +
       texture2D(uNight, vUv+vec2(0., px2.y)).rgb  + texture2D(uNight, vUv+vec2(0.,-px2.y)).rgb) * 0.125;

    // Scale 2: city clusters — 9-tap medium
    vec3 tMed = texture2D(uNight, vUv).rgb * 0.28 +
      (texture2D(uNight, vUv+vec2( px10.x,0.)).rgb + texture2D(uNight, vUv+vec2(-px10.x,0.)).rgb +
       texture2D(uNight, vUv+vec2(0., px10.y)).rgb  + texture2D(uNight, vUv+vec2(0.,-px10.y)).rgb) * 0.10 +
      (texture2D(uNight, vUv+vec2( px10.x, px10.y)).rgb + texture2D(uNight, vUv+vec2(-px10.x, px10.y)).rgb +
       texture2D(uNight, vUv+vec2( px10.x,-px10.y)).rgb + texture2D(uNight, vUv+vec2(-px10.x,-px10.y)).rgb) * 0.055;

    // Scale 3: metro halo — 9-tap wide
    vec3 tWide = texture2D(uNight, vUv).rgb * 0.18 +
      (texture2D(uNight, vUv+vec2( px22.x,0.)).rgb + texture2D(uNight, vUv+vec2(-px22.x,0.)).rgb +
       texture2D(uNight, vUv+vec2(0., px22.y)).rgb  + texture2D(uNight, vUv+vec2(0.,-px22.y)).rgb) * 0.10 +
      (texture2D(uNight, vUv+vec2( px22.x, px22.y)).rgb + texture2D(uNight, vUv+vec2(-px22.x, px22.y)).rgb +
       texture2D(uNight, vUv+vec2( px22.x,-px22.y)).rgb + texture2D(uNight, vUv+vec2(-px22.x,-px22.y)).rgb) * 0.07;

    float clSharp = dot(tSharp, vec3(0.299,0.587,0.114));
    float clMed   = dot(tMed,   vec3(0.299,0.587,0.114));
    float clWide  = dot(tWide,  vec3(0.299,0.587,0.114));

    // Low thresholds: dim cities (AU, NZ, ZA) have texture values as low as 0.04
    float maskSharp = smoothstep(0.04, 0.24, clSharp);
    float maskMed   = smoothstep(0.02, 0.14, clMed);
    float maskWide  = smoothstep(0.01, 0.08, clWide);

    // Coarse hash noise — breaks grid at city-block scale, not sub-pixel
    float hashVal  = fract(sin(dot(floor(vUv * vec2(128.0, 64.0)), vec2(127.1, 311.7))) * 43758.5453);
    float noiseMod = 0.72 + 0.28 * hashVal;

    // Warm amber city tones
    vec3 cityCore   = vec3(2.0,  1.20, 0.20) * pow(clSharp + 0.01, 0.30) * 4.5 * maskSharp;
    vec3 citySpread = vec3(1.6,  1.00, 0.25) * pow(clMed   + 0.01, 0.42) * 2.2 * maskMed;
    vec3 cityHalo   = vec3(1.1,  0.78, 0.28) * pow(clWide  + 0.01, 0.55) * 0.9 * maskWide;

    vec3 cityColor = (cityCore * 0.50 + citySpread * 0.32 + cityHalo * 0.18) * noiseMod;

    // Night = deep dark ocean + additive city glow
    vec3 nc = nightBase + cityColor;

    // ── 4. BLEND DAY + NIGHT ─────────────────────────────────────────────
    vec3 col = mix(nc, dc, dayFac);

    // City boost in night zone
    col += cityColor * nightFac * 0.65;

    // ── 5. OCEAN SPECULAR (day) + moonlight glint (night) ────────────────
    vec3  H   = normalize(L + V);
    float NdH = max(dot(N, H), 0.0);
    float s1  = pow(NdH, 520.0);
    float s2  = pow(NdH, 72.0);
    col += vec3(0.70, 0.88, 1.0) * (s1*1.8 + s2*0.12) * smQ * dayFac;
    // Subtle moonlight on night ocean
    col += vec3(0.06, 0.08, 0.14) * pow(NdH, 32.0) * smQ * nightFac * 0.05;

    // ── 6. ATMOSPHERE — thin limb, not a pegatina ─────────────────────────
    float rim = pow(1.0 - NdV, 3.0);
    float rdF = smoothstep(-0.12, 0.70, NdL);
    vec3  atmo = mix(vec3(0.005, 0.010, 0.060), vec3(0.18, 0.50, 1.0), rdF);
    col += atmo * rim * 0.38;  // reduced — thin halo, not thick blue shell

    // ── 7. TERMINATOR — tight orange band ────────────────────────────────
    float term = exp(-pow(NdL * 10.0, 2.0));
    col += vec3(0.42, 0.18, 0.02) * term * rim * 0.24 * max(NdL, 0.0);

    // ── 8. LIMB DARKENING ────────────────────────────────────────────────
    col *= 0.78 + 0.22 * pow(NdV, 0.35);

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

// ── Cinematic volumetric atmosphere ──────────────────────────────────────────
const ATMO_FRAG = /* glsl */`
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3  N   = normalize(vNormal);
    vec3  V   = normalize(cameraPosition - vWorldPos);
    vec3  L   = normalize(uSunDir);
    float NdV = max(dot(N, V), 0.0);
    float NdL = dot(N, L);

    // Sharper rim (2.2) = tighter halo, visible limb glow
    float rim = pow(1.0 - NdV, 2.2);
    float dF  = smoothstep(-0.12, 0.70, NdL);

    // Rayleigh: deep indigo night → vivid ice blue day limb
    vec3 ac = mix(vec3(0.02, 0.05, 0.28), vec3(0.22, 0.58, 1.0), dF);

    float dayRim   = rim * smoothstep(-0.05, 0.55, NdL);
    // Night limb: subtle but clearly blue glow (moonlight / earthshine)
    float nightRim = rim * smoothstep(0.15, -0.15, NdL);

    float alpha = clamp(
      ac.b * 0.32 * rim   // base Rayleigh
      + dayRim  * 0.30    // day-side ice blue
      + nightRim * 0.16,  // night-side indigo glow
      0.0, 0.68
    );

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

// ── ORBIT Signature Hotspot — orbital energy node ─────────────────────────
const HOTSPOT_FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uIntensity;   // 0-1: drives glow size, ring speed, halo

  varying vec2 vUv;

  void main() {
    vec2  uv  = vUv - 0.5;
    float d   = length(uv);
    float ang = atan(uv.y, uv.x);

    if (d > 0.5) discard;

    // 1. WHITE-HOT CORE — fully opaque, visible on any background
    float core = exp(-d * 52.0) * 1.8;

    // 2. INNER VOLUMETRIC GLOW — breathes with activity
    float breathe  = 0.7 + 0.3 * sin(uTime * 1.8 + uIntensity * 3.14);
    float innerGlow = exp(-d * 14.0) * 0.28 * breathe;

    // 3. ORBITAL RING 1 — fast rotating segmented (6 arcs)
    float r1   = 0.22 + uIntensity * 0.04;
    float rw1  = 0.055;
    float raw1 = exp(-pow((d - r1) / rw1, 2.0) * 8.0);
    float seg1 = pow(max(0.0, sin(ang * 6.0 + uTime * 3.2)), 2.5);
    float ring1 = raw1 * (0.35 + 0.65 * seg1);

    // 4. ORBITAL RING 2 — counter-rotating, 4 arcs, intensity-driven
    float r2   = 0.35 + uIntensity * 0.04;
    float rw2  = 0.045;
    float raw2 = exp(-pow((d - r2) / rw2, 2.0) * 8.0);
    float seg2 = pow(max(0.0, sin(ang * 4.0 - uTime * 2.0)), 2.0);
    float ring2 = raw2 * (0.25 + 0.75 * seg2) * (0.4 + 0.6 * uIntensity);

    // 5. PULSE WAVES — two staggered expanding rings
    float speed = 0.45 + uIntensity * 0.25;
    float t1 = mod(uTime * speed, 1.0);
    float t2 = mod(uTime * speed + 0.5, 1.0);
    float pw = 18.0;
    float pulse1 = exp(-pow((d - t1 * 0.46) * pw, 2.0)) * pow(1.0 - t1, 2.0) * 0.85;
    float pulse2 = exp(-pow((d - t2 * 0.46) * pw, 2.0)) * pow(1.0 - t2, 2.0) * 0.45;

    // 6. OUTER ENERGY HALO — scales with importance
    float halo = exp(-d * 5.5) * 0.06 * breathe * uIntensity;

    // Composite alpha
    float total = core + innerGlow + ring1 + ring2 + pulse1 + pulse2 + halo;
    float a = clamp(total * uOpacity, 0.0, 1.0);

    // Color: white-hot core → brand color → dim outer
    vec3 col = uColor;
    col = mix(col, vec3(1.0), core * 0.65);
    col += uColor * (ring1 + ring2) * 0.35;

    gl_FragColor = vec4(col, a);
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
    const dpr = window.devicePixelRatio || 1;

    this.renderer = new THREE.WebGLRenderer({
      canvas:          this.canvas,
      antialias:       dpr < 2,
      alpha:           true,
      powerPreference: 'high-performance',
      precision:       'highp',
    });

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(innerWidth, innerHeight);
    this.canvas.style.width   = '100vw';
    this.canvas.style.height  = '100vh';
    this.canvas.style.display = 'block';

    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    else this.renderer.outputEncoding = 3001;

    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;  // lower = deeper shadows, richer blacks

    // ── Bloom: only for hotspots + city lights (not the planet surface) ──
    this._composer = new EffectComposer(this.renderer);
    this._composer.addPass(new RenderPass(this.scene, this.camera));

    const isMobile = window.innerWidth < 768;
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      isMobile ? 0.22 : 0.36,  // controlled bloom
      0.48,                     // medium radius
      0.68,                     // threshold — only bright city cores bloom
    );
    this._composer.addPass(bloom);
    this._bloomPass = bloom;

    // SMAA — smooth edges (anti-aliasing in post)
    if (!isMobile) {
      this._composer.addPass(new SMAAPass(innerWidth * dpr, innerHeight * dpr));
    }

    // Cinematic vignette + subtle film grain
    const vignettePass = new ShaderPass({
      uniforms: {
        tDiffuse:  { value: null },
        uTime:     { value: 0 },
        uVignette: { value: 0.52 },
        uGrain:    { value: isMobile ? 0.012 : 0.018 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uVignette;
        uniform float uGrain;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main() {
          vec4 col = texture2D(tDiffuse, vUv);

          // Vignette — subtle edge darkening for depth/cinematic feel
          vec2 uv2 = vUv * 2.0 - 1.0;
          float vig = 1.0 - dot(uv2, uv2) * uVignette;
          col.rgb *= clamp(vig, 0.0, 1.0);

          // Film grain — organic, barely visible
          float grain = (hash(vUv + mod(uTime * 0.1, 1.0)) - 0.5) * uGrain;
          col.rgb += grain;

          gl_FragColor = col;
        }
      `,
    });
    this._composer.addPass(vignettePass);
    this._vignettePass = vignettePass;

    // Output pass handles final sRGB conversion
    this._composer.addPass(new OutputPass());
  }

  _setupControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping   = true;
    this.controls.dampingFactor   = 0.028;   // lower = silkier inertia
    this.controls.enablePan       = false;
    this.controls.minDistance     = 1.3;
    this.controls.maxDistance     = 8.2;
    this.controls.rotateSpeed     = 0.30;    // gentler rotation
    this.controls.zoomSpeed       = 0.35;    // much less aggressive zoom
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = 0.22;    // slow cinematic rotation

    // Smooth pinch zoom momentum
    this._zoomVel = 0;
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const dist  = this.camera.position.length();
      // Contextual speed: slow near surface, faster in space
      const speed = dist < 2.2 ? 0.006 : dist > 5 ? 0.018 : 0.011;
      this._zoomVel += e.deltaY * speed * 0.001;
      this._zoomVel  = Math.max(-0.06, Math.min(0.06, this._zoomVel));
    }, { passive: false });
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

    // Try high-quality textures first, fall back to three.js 2048px versions
    const loadWithFallback = async (url, fallback) => {
      try {
        const t = await loader.loadAsync(url);
        report();
        return t;
      } catch(_) {
        const t = await loader.loadAsync(fallback);
        report();
        return t;
      }
    };

    const [dayT, nightT, specT] = await Promise.all([
      loadWithFallback(TEX.day,      TEX_FALLBACK.day),
      loadWithFallback(TEX.night,    TEX_FALLBACK.night),
      loadWithFallback(TEX.specular, TEX_FALLBACK.specular),
    ]);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    [dayT, nightT, specT].forEach(t => {
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      else t.encoding = 3001;
      t.anisotropy      = maxAniso;          // max anisotropic filtering
      t.minFilter       = THREE.LinearMipmapLinearFilter; // trilinear — sharpest at distance
      t.magFilter       = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate     = true;
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

    this._earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 192), this._earthMat);
    this.scene.add(this._earth);

    // Lighting for any non-shader meshes
    this.scene.add(new THREE.AmbientLight(0x224466, 0.06)); // very low — deep shadows
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
    this.scene.add(new THREE.AmbientLight(0x224466, 0.06));
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
    // 1.12 — visible halo ring, atmosphere wraps planet edge
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 64), this._atmoMat));
  }

  // ── Hotspots ────────────────────────────────────────────────────────────────
  addHotspot(data, color) {
    const pos = latLngTo3D(data.lat, data.lng, 1.010);
    const intensity = Math.min(data.intensity || 0.5, 1.0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:     { value: new THREE.Color(color) },
        uTime:      { value: 0 },
        uOpacity:   { value: 0.92 },
        uIntensity: { value: intensity },
      },
      vertexShader:   HOTSPOT_VERT,
      fragmentShader: HOTSPOT_FRAG,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      side:           THREE.DoubleSide,
    });

    const isMobile   = window.innerWidth < 768;
    const count      = data._allNews?.length || 1;
    const countScale = Math.min(Math.log(count + 1) / Math.log(60), 1);
    // Smaller, more elegant orbital nodes
    const visSize = isMobile
      ? 0.055 + countScale * 0.035
      : 0.038 + countScale * 0.032;

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

    data._baseIntensity = intensity; // store for smooth hover restoration
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
      const v = category === 'all'
        || h.data.category === category
        || (Array.isArray(h.data._allNews) && h.data._allNews.some(n => n.category === category));
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

  zoomIn()  { this._zoomVel -= 0.04; }
  zoomOut() { this._zoomVel += 0.04; }
  toggleAutoRotate(on) { this.controls.autoRotate = on; }

  // ── Cinematic entry from space (Chronos spawn) ─────────────────────────────
  flyFromSpace(lat, lng, dist = 4.2, dur = 3200) {
    this.controls.autoRotate = false;
    // Start far out, descend to spawn position
    const target = latLngTo3D(lat, lng, dist);
    const far    = target.clone().normalize().multiplyScalar(12);
    this.camera.position.copy(far);
    this.camera.lookAt(0, 0, 0);

    const t0 = performance.now();
    const easeOutQuart = p => 1 - Math.pow(1 - p, 4);

    const go = now => {
      const p = Math.min((now - t0) / dur, 1);
      const e = easeOutQuart(p);
      this.camera.position.lerpVectors(far, target, e);
      this.camera.lookAt(0, 0, 0);
      if (p < 1) {
        requestAnimationFrame(go);
      } else {
        this.controls.autoRotate = true;
        this.controls.update();
      }
    };
    requestAnimationFrame(go);
  }

  // ── Pulse hotspots of given categories (Chronos highlight) ────────────────
  // ── Country outline system ─────────────────────────────────────────────────
  async showCountryOutline(code, color = '#00D4FF') {
    this.hideCountryOutline();

    // Load world-atlas topojson on first call
    if (!_worldTopo && !_topoLoading) {
      _topoLoading = true;
      try {
        const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        _worldTopo = await r.json();
      } catch(_) { _topoLoading = false; return; }
    }
    if (!_worldTopo) return;

    const numId  = CC_NUM[code.toUpperCase()];
    if (!numId) return;

    const geoms = _worldTopo.objects?.countries?.geometries || [];
    const geom  = geoms.find(g => g.id === numId || +g.id === numId);
    if (!geom) return;

    const points = this._decodeTopoGeom(_worldTopo, geom);
    if (!points.length) return;

    // Create glowing outline lines (3 layers for bloom glow effect)
    const layers = [
      { color: color, opacity: 0.9 },
      { color: color, opacity: 0.4 },
      { color: '#ffffff', opacity: 0.15 },
    ];

    this._outlineGroup = new THREE.Group();

    for (const strip of points) {
      if (strip.length < 2) continue;
      for (const { color: c, opacity: op } of layers) {
        const geo = new THREE.BufferGeometry().setFromPoints(strip);
        const mat = new THREE.LineBasicMaterial({
          color:       new THREE.Color(c),
          transparent: true,
          opacity:     op,
          blending:    THREE.AdditiveBlending,
          depthWrite:  false,
        });
        this._outlineGroup.add(new THREE.Line(geo, mat));
      }
    }

    this.scene.add(this._outlineGroup);

    // Animate opacity in
    this._outlineGroup.userData.t = 0;
  }

  hideCountryOutline() {
    if (this._outlineGroup) {
      this.scene.remove(this._outlineGroup);
      this._outlineGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      this._outlineGroup = null;
    }
  }

  _decodeTopoGeom(topo, geom) {
    const sc = topo.transform?.scale     || [1, 1];
    const tr = topo.transform?.translate || [0, 0];
    const R  = 1.004; // slightly above surface

    const decodeArc = (idx) => {
      const flip = idx < 0;
      const arc  = topo.arcs[flip ? ~idx : idx];
      let x = 0, y = 0;
      const pts = arc.map(([dx, dy]) => {
        x += dx; y += dy;
        const lon = x * sc[0] + tr[0];
        const lat = y * sc[1] + tr[1];
        const phi   = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        return new THREE.Vector3(
          -R * Math.sin(phi) * Math.cos(theta),
           R * Math.cos(phi),
           R * Math.sin(phi) * Math.sin(theta)
        );
      });
      return flip ? pts.reverse() : pts;
    };

    const result = [];
    const polys  = geom.type === 'MultiPolygon' ? geom.arcs : [geom.arcs];
    for (const poly of polys) {
      for (const ring of poly) {
        const strip = ring.flatMap(decodeArc);
        if (strip.length > 1) {
          strip.push(strip[0].clone()); // close the ring
          result.push(strip);
        }
      }
    }
    return result;
  }

  pulseCategories(cats, dur = 2500) {
    this.hotspots.forEach(h => {
      const match = cats.includes(h.data.category)
        || (h.data._allNews && h.data._allNews.some(n => cats.includes(n.category)));
      if (match && h.material?.uniforms?.uOpacity) {
        const orig = h.material.uniforms.uOpacity.value;
        h.material.uniforms.uOpacity.value = 1.0;
        setTimeout(() => {
          if (h.material?.uniforms?.uOpacity) h.material.uniforms.uOpacity.value = orig;
        }, dur);
      }
    });
  }

  // ── Events ──────────────────────────────────────────────────────────────────
  _setupEvents() {
    const onResize = () => {
      const w   = innerWidth;
      const h   = innerHeight;
      const dpr = window.devicePixelRatio || 1;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h);
      if (this._composer) this._composer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    // iOS Safari: address bar show/hide fires visualViewport resize
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
    }
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

    // Primary: raycast against the globe sphere for exact surface point
    const globeHits = this._earth
      ? this.raycaster.intersectObject(this._earth)
      : [];

    if (globeHits.length) {
      const surfPoint = globeHits[0].point.clone().normalize();

      // Adaptive threshold: tighter when zoomed in (precision), wider when out (reachability)
      const camDist   = this.camera.position.length();
      const threshold = Math.max(0.07, Math.min(0.20, camDist * 0.028));

      let best = null, bestAngle = Infinity;
      this.hotspots.forEach(h => {
        if (!h.mesh.visible) return;
        const hNorm = h.mesh.position.clone().normalize();
        const angle = Math.acos(Math.min(Math.max(surfPoint.dot(hNorm), -1), 1));
        if (angle < threshold && angle < bestAngle) {
          bestAngle = angle;
          best = h;
        }
      });
      if (best) return best;
    }

    // Fallback: hit-mesh plane intersection (for when cursor is off-globe)
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

    if (Math.round(this._time * 10) % 100 === 0) this._sunDir = getSunDirection();
    if (this._vignettePass) this._vignettePass.uniforms.uTime.value = this._time;

    if (this._earthMat?.uniforms?.uSunDir) this._earthMat.uniforms.uSunDir.value.copy(this._sunDir);
    if (this._atmoMat)   this._atmoMat.uniforms.uSunDir.value.copy(this._sunDir);
    if (this._sunLight)  this._sunLight.position.copy(this._sunDir).multiplyScalar(8);

    this.hotspots.forEach(h => {
      h.material.uniforms.uTime.value = this._time;
      const uni = h.material.uniforms;
      if (!uni.uIntensity) return;

      const base = h.data._baseIntensity ?? (h.data.intensity || 0.5);

      if (h === this._hovered) {
        // Ramp up: intensity → 1.0, opacity → 1.0
        uni.uIntensity.value = Math.min(uni.uIntensity.value + 0.05, 1.0);
        uni.uOpacity.value   = Math.min(uni.uOpacity.value   + 0.04, 1.0);
      } else if (this._hovered !== null) {
        // Dim non-hovered hotspots
        uni.uIntensity.value = Math.max(uni.uIntensity.value - 0.03, base * 0.4);
        uni.uOpacity.value   = Math.max(uni.uOpacity.value   - 0.03, 0.28);
      } else {
        // No hover — return to base
        uni.uIntensity.value = base + (uni.uIntensity.value - base) * 0.92;
        uni.uOpacity.value   = 0.92 + (uni.uOpacity.value - 0.92) * 0.92;
      }
    });

    // Animate country outline opacity in
    if (this._outlineGroup) {
      const g = this._outlineGroup;
      g.userData.t = Math.min((g.userData.t || 0) + 0.06, 1.0);
      const pulse  = 0.8 + 0.2 * Math.sin(this._time * 2.5);
      g.children.forEach((line, i) => {
        const baseOp = [0.9, 0.4, 0.15][i % 3];
        line.material.opacity = baseOp * g.userData.t * pulse;
      });
    }

    // Apply momentum zoom with decay
    if (Math.abs(this._zoomVel) > 0.00005) {
      const d    = this.camera.position.length();
      const newD = Math.max(this.controls.minDistance,
                   Math.min(this.controls.maxDistance, d + this._zoomVel * d));
      this.camera.position.setLength(THREE.MathUtils.lerp(d, newD, 0.14));
      this._zoomVel *= 0.88;   // momentum decay
    }

    this.controls.update();
    // Use bloom composer instead of direct renderer
    if (this._composer) {
      this._composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
