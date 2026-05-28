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

    // ── 2. NIGHT BASE — ocean vs land from specular mask ─────────────────
    // smQ ≈ 1.0 for water, ≈ 0.0 for land. At night: ocean = deep navy,
    // land = dark charcoal. This gives continents their shape without city lights.
    vec3 nightOcean = vec3(0.010, 0.022, 0.072);  // deep navy — NASA Black Marble ocean
    vec3 nightLand  = vec3(0.004, 0.007, 0.018);  // dark charcoal — continent silhouette
    vec3 nightBase  = mix(nightLand, nightOcean, smQ);

    // ── 3. CITY LIGHTS — photorealistic multi-scale density field ────────────
    // Strategy: read NASA texture as a population density field across 3 scales.
    // Scale A (4px)  — city cores:   bright isolated dots → pinpoint hotspots
    // Scale B (16px) — urban extent: district merging → city proper
    // Scale C (48px) — civilization: connecting metro regions → belts like EU/NE-US
    // NO hash noise (it creates the square grid artifact) — NASA texture has its own variation.

    vec2 px  = vec2(1.0 / 2048.0, 1.0 / 1024.0);   // 1 texel in UV space

    // ─ A: city core (5 taps, 4px radius)
    vec3 tA = texture2D(uNight, vUv).rgb * 0.44 +
      (texture2D(uNight, vUv + vec2( 4.*px.x, 0.)).rgb +
       texture2D(uNight, vUv + vec2(-4.*px.x, 0.)).rgb +
       texture2D(uNight, vUv + vec2(0.,  4.*px.y)).rgb +
       texture2D(uNight, vUv + vec2(0., -4.*px.y)).rgb) * 0.14;

    // ─ B: urban cluster (9 taps, 16px axis + 11px diagonal)
    vec3 tB = texture2D(uNight, vUv).rgb * 0.26 +
      (texture2D(uNight, vUv + vec2( 16.*px.x, 0.)).rgb +
       texture2D(uNight, vUv + vec2(-16.*px.x, 0.)).rgb +
       texture2D(uNight, vUv + vec2(0.,  16.*px.y)).rgb +
       texture2D(uNight, vUv + vec2(0., -16.*px.y)).rgb) * 0.095 +
      (texture2D(uNight, vUv + vec2( 11.*px.x,  11.*px.y)).rgb +
       texture2D(uNight, vUv + vec2(-11.*px.x,  11.*px.y)).rgb +
       texture2D(uNight, vUv + vec2( 11.*px.x, -11.*px.y)).rgb +
       texture2D(uNight, vUv + vec2(-11.*px.x, -11.*px.y)).rgb) * 0.0575;

    // ─ C: civilization belt (9 taps, 48px axis + 34px diagonal)
    // This radius (~8 degrees) is what merges London-Paris-Amsterdam into one glow belt.
    vec3 tC = texture2D(uNight, vUv).rgb * 0.18 +
      (texture2D(uNight, vUv + vec2( 48.*px.x, 0.)).rgb +
       texture2D(uNight, vUv + vec2(-48.*px.x, 0.)).rgb +
       texture2D(uNight, vUv + vec2(0.,  48.*px.y)).rgb +
       texture2D(uNight, vUv + vec2(0., -48.*px.y)).rgb) * 0.11 +
      (texture2D(uNight, vUv + vec2( 34.*px.x,  34.*px.y)).rgb +
       texture2D(uNight, vUv + vec2(-34.*px.x,  34.*px.y)).rgb +
       texture2D(uNight, vUv + vec2( 34.*px.x, -34.*px.y)).rgb +
       texture2D(uNight, vUv + vec2(-34.*px.x, -34.*px.y)).rgb) * 0.075;

    float lumA = dot(tA, vec3(0.299, 0.587, 0.114));
    float lumB = dot(tB, vec3(0.299, 0.587, 0.114));
    float lumC = dot(tC, vec3(0.299, 0.587, 0.114));

    // Hard minimum threshold — anything below this is pure black ocean/land.
    // This eliminates the isolated floating pixels in the middle of nowhere.
    float mA = smoothstep(0.055, 0.14, lumA);   // city cores: only clear signals
    float mB = smoothstep(0.030, 0.10, lumB);   // clusters: lower (merged areas dimmer)
    float mC = smoothstep(0.016, 0.07, lumC);   // belt: very low (sparse but connected)

    // Hierarchy power curves — RESTRAINED. Peak HDR values must stay under ~2.5
    // so ACES tonemapping can preserve detail instead of clipping to white.
    // The brightest megacities (Tokyo, NYC, London) hit ~2.0; suburbs ~0.3.
    float cityA = pow(lumA * mA, 0.58) * 1.85;  // bright cores — selective
    float cityB = pow(lumB * mB, 0.70) * 0.90;  // city districts — softer
    float cityC = pow(lumC * mC, 0.82) * 0.32;  // civilization haze — very subtle

    // ISS color palette: warm-white at megacity cores → amber → russet at belt edge.
    vec3 colA = vec3(1.55, 1.05, 0.42) * cityA;
    vec3 colB = vec3(1.20, 0.74, 0.17) * cityB;
    vec3 colC = vec3(0.80, 0.50, 0.10) * cityC;

    vec3 cityColor = colA + colB + colC;

    // Night base: virtually black — deep space realism. Oceans are invisible.
    vec3 nc = vec3(0.001, 0.002, 0.010) + cityColor;

    // ── 4. BLEND DAY + NIGHT ─────────────────────────────────────────────
    vec3 col = mix(nc, dc, dayFac);

    // Minimal secondary city pass — just enough to keep lights visible at terminator.
    col += cityColor * nightFac * 0.12;

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
    col += atmo * rim * 0.08;  // barely there — ISS atmosphere is a thin blue thread

    // ── 7. TERMINATOR — thin golden line at day/night boundary ───────────
    float term = exp(-pow(NdL * 10.0, 2.0));
    col += vec3(0.36, 0.14, 0.02) * term * rim * 0.08 * max(NdL, 0.0);

    // ── 8. LIMB DARKENING ────────────────────────────────────────────────
    col *= 0.80 + 0.20 * pow(NdV, 0.35);

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

    // Rayleigh: barely visible thin line — ISS atmosphere is a delicate blue thread.
    vec3 ac = mix(vec3(0.01, 0.03, 0.18), vec3(0.12, 0.36, 0.78), dF);

    float dayRim   = rim * smoothstep(-0.05, 0.55, NdL);
    float nightRim = rim * smoothstep(0.15, -0.15, NdL);

    // Very tight ring: only visible right at the limb edge, no thick shell.
    float alpha = clamp(
      ac.b * 0.05 * rim
      + dayRim  * 0.06
      + nightRim * 0.015,
      0.0, 0.10           // hard cap — nearly invisible except at exact limb
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

// ── ORBIT Premium Hotspot — targeting reticle beacon ────────────────────────
const HOTSPOT_FRAG = /* glsl */`
  precision highp float;
  uniform vec3  uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uIntensity;
  varying vec2 vUv;

  #define PI  3.14159265359
  #define TAU 6.28318530718

  void main() {
    vec2  uv  = vUv - 0.5;
    float d   = length(uv);
    float ang = atan(uv.y, uv.x);
    if (d > 0.5) discard;

    float breathe = 0.75 + 0.25 * sin(uTime * 1.4 + uIntensity * PI);

    // 1. WHITE-HOT CORE
    float core = exp(-d * 68.0) * 3.8;

    // 2. 4-POINT STAR BURST — cross extending from center
    float star = (exp(-abs(uv.x) * 80.0) + exp(-abs(uv.y) * 80.0))
                 * exp(-d * 20.0) * 0.50;

    // 3. INNER VOLUMETRIC GLOW
    float innerGlow = exp(-d * 15.0) * 0.32 * breathe;

    // 4. MICRO INNER RING — precision targeting circle
    float r0   = 0.13;
    float ring0 = exp(-pow((d - r0) / 0.018, 2.0) * 10.0) * 0.70 * breathe;

    // 5. PRIMARY RING — main indicator with angular shimmer
    float r1      = 0.26 + uIntensity * 0.04;
    float shimmer = 0.78 + 0.22 * sin(uTime * 1.8 + ang * 3.0 + uIntensity * TAU);
    float ring1   = exp(-pow((d - r1) / 0.030, 2.0) * 10.0) * shimmer;

    // 6. TICK MARKS — 4 cardinal points just outside primary ring
    float tickR   = r1 * 1.32;
    float tickD   = exp(-pow((d - tickR) / 0.030, 2.0) * 12.0);
    float tickA   = mod(ang + PI * 0.25, PI * 0.5) - PI * 0.25;
    float ticks   = tickD * exp(-pow(tickA / 0.038, 2.0)) * 0.60;

    // 7. DASHED OUTER RING — 6 segments rotating slowly
    float r2      = 0.42 + uIntensity * 0.025;
    float ring2B  = exp(-pow((d - r2) / 0.016, 2.0) * 14.0) * uIntensity * 0.72;
    float dashA   = mod(ang + uTime * 0.32, TAU / 6.0);
    float dash    = smoothstep(0.0, 0.18, dashA) * (1.0 - smoothstep(0.52, 0.70, dashA));
    float ring2   = ring2B * dash;

    // 8. PULSE WAVES — two expanding rings
    float speed  = 0.36 + uIntensity * 0.26;
    float t1     = mod(uTime * speed,        1.0);
    float t2     = mod(uTime * speed + 0.5,  1.0);
    float pulse1 = exp(-pow((d - t1 * 0.46) * 22.0, 2.0)) * pow(1.0 - t1, 2.6) * 1.2;
    float pulse2 = exp(-pow((d - t2 * 0.46) * 22.0, 2.0)) * pow(1.0 - t2, 2.6) * 0.6;

    // 9. ATMOSPHERIC HALO
    float halo = exp(-d * 4.5) * 0.11 * breathe * (0.4 + 0.6 * uIntensity);

    float total = core + star + innerGlow + ring0 + ring1 + ticks + ring2 + pulse1 + pulse2 + halo;
    float a = clamp(total * uOpacity, 0.0, 1.0);

    // Color grading: white-hot core → brand cyan → tinted structure
    vec3 col = uColor;
    col = mix(col, vec3(1.0),           core  * 0.82);
    col = mix(col, vec3(1.0, 1.0, 0.9), star  * 0.42);
    col += uColor * (ring0 * 0.22 + ring1 * 0.28 + ring2 * 0.22);
    col  = mix(col, vec3(1.0), ticks * 0.58);
    col += vec3(1.0) * pulse1 * 0.17;

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
    this.renderer.toneMappingExposure = 0.72;  // darker exposure — preserves highlight detail

    // ── Bloom: surgical — only the absolute brightest cores should bloom ──
    this._composer = new EffectComposer(this.renderer);
    this._composer.addPass(new RenderPass(this.scene, this.camera));

    const isMobile = window.innerWidth < 768;
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      isMobile ? 0.16 : 0.22,  // restrained — only megacity cores and hotspot centers
      0.22,                     // tight radius — precise glow, no smear
      0.90,                     // high threshold — catches only true bright peaks
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
    // 1.035 — razor-thin atmosphere, physically accurate scale
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 64), this._atmoMat));
  }

  // ── Hotspots ────────────────────────────────────────────────────────────────
  addHotspot(data, color) {
    const pos = latLngTo3D(data.lat, data.lng, 1.010);
    const intensity = Math.min(data.intensity || 0.5, 1.0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:     { value: new THREE.Color(color) },
        uTime:      { value: 0 },
        uOpacity:   { value: 0.70 },
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
    const visSize = isMobile
      ? 0.064 + countScale * 0.036
      : 0.048 + countScale * 0.032;

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
      // Same smooth flyTo for all screens — close enough to see detail, far enough to navigate away easily
      const dist = window.innerWidth < 768 ? 2.0 : 1.85;
      this.flyTo(hit.data.lat, hit.data.lng, dist, 1000);
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
    this.hotspots.forEach(h => { h.material.uniforms.uOpacity.value = 0.70; });
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
      this.flyTo(hit.data.lat, hit.data.lng, 1.85, 1000);
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
        uni.uOpacity.value   = 0.70 + (uni.uOpacity.value - 0.70) * 0.92;
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
