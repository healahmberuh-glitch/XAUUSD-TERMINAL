// PixelBlast.js — Vanilla JS port of React Bits PixelBlast
// WebGL pixel dithering effect with ripples and liquid distortion
// Source: github.com/DavidHDev/react-bits

(function(global) {
  'use strict';

  const SHAPE_MAP = { square: 0, circle: 1, triangle: 2, diamond: 3 };
  const MAX_CLICKS = 10;

  const VERTEX_SRC = `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `;

  const FRAGMENT_SRC = `
    precision highp float;

    uniform vec3  uColor;
    uniform vec2  uResolution;
    uniform float uTime;
    uniform float uPixelSize;
    uniform float uScale;
    uniform float uDensity;
    uniform float uPixelJitter;
    uniform int   uEnableRipples;
    uniform float uRippleSpeed;
    uniform float uRippleThickness;
    uniform float uRippleIntensity;
    uniform float uEdgeFade;

    uniform int   uShapeType;
    const int SHAPE_SQUARE   = 0;
    const int SHAPE_CIRCLE   = 1;
    const int SHAPE_TRIANGLE = 2;
    const int SHAPE_DIAMOND  = 3;

    const int   MAX_CLICKS = 10;
    uniform vec2  uClickPos  [MAX_CLICKS];
    uniform float uClickTimes[MAX_CLICKS];

    out vec4 fragColor;

    float Bayer2(vec2 a) {
      a = floor(a);
      return fract(a.x / 2. + a.y * a.y * .75);
    }
    #define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
    #define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

    #define FBM_OCTAVES     5
    #define FBM_LACUNARITY  1.25
    #define FBM_GAIN        1.0

    float hash11(float n){ return fract(sin(n)*43758.5453); }

    float vnoise(vec3 p){
      vec3 ip = floor(p);
      vec3 fp = fract(p);
      float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), vec3(1.0,57.0,113.0)));
      float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
      float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
      float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
      float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
      float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
      float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
      float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));
      vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);
      float x00 = mix(n000, n100, w.x);
      float x10 = mix(n010, n110, w.x);
      float x01 = mix(n001, n101, w.x);
      float x11 = mix(n011, n111, w.x);
      float y0  = mix(x00, x10, w.y);
      float y1  = mix(x01, x11, w.y);
      return mix(y0, y1, w.z) * 2.0 - 1.0;
    }

    float fbm2(vec2 uv, float t){
      vec3 p = vec3(uv * uScale, t);
      float amp = 1.0;
      float freq = 1.0;
      float sum = 1.0;
      for (int i = 0; i < FBM_OCTAVES; ++i){
        sum  += amp * vnoise(p * freq);
        freq *= FBM_LACUNARITY;
        amp  *= FBM_GAIN;
      }
      return sum * 0.5 + 0.5;
    }

    float maskCircle(vec2 p, float cov){
      float r = sqrt(cov) * .25;
      float d = length(p - 0.5) - r;
      float aa = 0.5 * fwidth(d);
      return cov * (1.0 - smoothstep(-aa, aa, d * 2.0));
    }

    float maskTriangle(vec2 p, vec2 id, float cov){
      bool flip = mod(id.x + id.y, 2.0) > 0.5;
      if (flip) p.x = 1.0 - p.x;
      float r = sqrt(cov);
      float d  = p.y - r*(1.0 - p.x);
      float aa = fwidth(d);
      return cov * clamp(0.5 - d/aa, 0.0, 1.0);
    }

    float maskDiamond(vec2 p, float cov){
      float r = sqrt(cov) * 0.564;
      return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);
    }

    void main(){
      float pixelSize = uPixelSize;
      vec2 fragCoord = gl_FragCoord.xy - uResolution * .5;
      float aspectRatio = uResolution.x / uResolution.y;

      vec2 pixelId = floor(fragCoord / pixelSize);
      vec2 pixelUV = fract(fragCoord / pixelSize);

      float cellPixelSize = 8.0 * pixelSize;
      vec2 cellId = floor(fragCoord / cellPixelSize);
      vec2 cellCoord = cellId * cellPixelSize;
      vec2 uv = cellCoord / uResolution * vec2(aspectRatio, 1.0);

      float base = fbm2(uv, uTime * 0.05);
      base = base * 0.5 - 0.65;

      float feed = base + (uDensity - 0.5) * 0.3;

      float speed     = uRippleSpeed;
      float thickness = uRippleThickness;
      const float dampT     = 1.0;
      const float dampR     = 10.0;

      if (uEnableRipples == 1) {
        for (int i = 0; i < MAX_CLICKS; ++i){
          vec2 pos = uClickPos[i];
          if (pos.x < 0.0) continue;
          float cellPixelSize = 8.0 * pixelSize;
          vec2 cuv = (((pos - uResolution * .5 - cellPixelSize * .5) / (uResolution))) * vec2(aspectRatio, 1.0);
          float t = max(uTime - uClickTimes[i], 0.0);
          float r = distance(uv, cuv);
          float waveR = speed * t;
          float ring  = exp(-pow((r - waveR) / thickness, 2.0));
          float atten = exp(-dampT * t) * exp(-dampR * r);
          feed = max(feed, ring * atten * uRippleIntensity);
        }
      }

      float bayer = Bayer8(fragCoord / uPixelSize) - 0.5;
      float bw = step(0.5, feed + bayer);

      float h = fract(sin(dot(floor(fragCoord / uPixelSize), vec2(127.1, 311.7))) * 43758.5453);
      float jitterScale = 1.0 + (h - 0.5) * uPixelJitter;
      float coverage = bw * jitterScale;
      float M;
      if      (uShapeType == SHAPE_CIRCLE)   M = maskCircle (pixelUV, coverage);
      else if (uShapeType == SHAPE_TRIANGLE) M = maskTriangle(pixelUV, pixelId, coverage);
      else if (uShapeType == SHAPE_DIAMOND)  M = maskDiamond(pixelUV, coverage);
      else                                   M = coverage;

      if (uEdgeFade > 0.0) {
        vec2 norm = gl_FragCoord.xy / uResolution;
        float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));
        float fade = smoothstep(0.0, uEdgeFade, edge);
        M *= fade;
      }

      vec3 color = uColor;
      vec3 srgbColor = mix(
        color * 12.92,
        1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
        step(0.0031308, color)
      );

      fragColor = vec4(srgbColor, M);
    }
  `;

  class PixelBlast {
    constructor(container, options = {}) {
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) throw new Error('PixelBlast: container not found');

      this.options = {
        variant: options.variant || 'circle',
        pixelSize: options.pixelSize || 1,
        color: options.color || '#B497CF',
        patternScale: options.patternScale ?? 1.25,
        patternDensity: options.patternDensity ?? 0.45,
        pixelSizeJitter: options.pixelSizeJitter ?? 0.5,
        enableRipples: options.enableRipples !== false,
        rippleSpeed: options.rippleSpeed ?? 0.4,
        rippleThickness: options.rippleThickness ?? 0.12,
        rippleIntensityScale: options.rippleIntensityScale ?? 1.5,
        speed: options.speed ?? 1.75,
        edgeFade: options.edgeFade ?? 0,
        transparent: options.transparent !== false,
        autoPauseOffscreen: options.autoPauseOffscreen !== false
      };

      this.visible = true;
      this.raf = null;
      this.clock = null;
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.material = null;
      this.uniforms = null;
      this.clickIx = 0;
      this.timeOffset = 0;

      this._init();
    }

    _init() {
      const canvas = document.createElement('canvas');
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: this.options.transparent,
        powerPreference: 'high-performance'
      });
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.container.appendChild(this.renderer.domElement);

      if (this.options.transparent) this.renderer.setClearAlpha(0);
      else this.renderer.setClearColor(0x000000, 1);

      const color = new THREE.Color(this.options.color);
      this.uniforms = {
        uResolution: { value: new THREE.Vector2(0, 0) },
        uTime: { value: 0 },
        uColor: { value: color },
        uClickPos: { value: Array.from({ length: MAX_CLICKS }, () => new THREE.Vector2(-1, -1)) },
        uClickTimes: { value: new Float32Array(MAX_CLICKS) },
        uShapeType: { value: SHAPE_MAP[this.options.variant] ?? 0 },
        uPixelSize: { value: this.options.pixelSize * this.renderer.getPixelRatio() },
        uScale: { value: this.options.patternScale },
        uDensity: { value: this.options.patternDensity },
        uPixelJitter: { value: this.options.pixelSizeJitter },
        uEnableRipples: { value: this.options.enableRipples ? 1 : 0 },
        uRippleSpeed: { value: this.options.rippleSpeed },
        uRippleThickness: { value: this.options.rippleThickness },
        uRippleIntensity: { value: this.options.rippleIntensityScale },
        uEdgeFade: { value: this.options.edgeFade }
      };

      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      this.material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SRC,
        fragmentShader: FRAGMENT_SRC,
        uniforms: this.uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        glslVersion: THREE.GLSL3
      });

      const quadGeom = new THREE.PlaneGeometry(2, 2);
      const quad = new THREE.Mesh(quadGeom, this.material);
      this.scene.add(quad);
      this.quad = quad;

      this.clock = new THREE.Clock();

      this._setSize();
      this.ro = new ResizeObserver(() => this._setSize());
      this.ro.observe(this.container);

      this.timeOffset = Math.random() * 1000;

      this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown.bind(this), { passive: true });

      if (this.options.autoPauseOffscreen) {
        document.addEventListener('visibilitychange', () => {
          this.visible = !document.hidden;
        });
      }

      this._animate();
    }

    _setSize() {
      const w = this.container.clientWidth || 1;
      const h = this.container.clientHeight || 1;
      this.renderer.setSize(w, h, false);
      this.uniforms.uResolution.value.set(this.renderer.domElement.width, this.renderer.domElement.height);
      this.uniforms.uPixelSize.value = this.options.pixelSize * this.renderer.getPixelRatio();
    }

    _onPointerDown(e) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const scaleX = this.renderer.domElement.width / rect.width;
      const scaleY = this.renderer.domElement.height / rect.height;
      const fx = (e.clientX - rect.left) * scaleX;
      const fy = (rect.height - (e.clientY - rect.top)) * scaleY;

      const ix = this.clickIx;
      this.uniforms.uClickPos.value[ix].set(fx, fy);
      this.uniforms.uClickTimes.value[ix] = this.uniforms.uTime.value;
      this.clickIx = (ix + 1) % MAX_CLICKS;
    }

    _animate() {
      this.raf = requestAnimationFrame(() => this._animate());

      if (this.options.autoPauseOffscreen && !this.visible) return;

      this.uniforms.uTime.value = this.timeOffset + this.clock.getElapsedTime() * this.options.speed;
      this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.ro) this.ro.disconnect();
      this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
      this.quad.geometry.dispose();
      this.material.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement.parentElement === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
    }
  }

  global.PixelBlast = PixelBlast;
})(window);
