/*
  SocialAmp — Water Reflection (concept)
  One full-screen WebGL fragment shader (Three.js) composites:
    water plate -> sun glow + sun path -> title wheel -> card reflection -> card
  Everything is positioned in the plate's own pixel space (2560 x 1440) and mapped to the
  screen like background-size: cover, so the scene always matches the original artwork.
*/

import * as THREE from 'three';

const PLATE = 'assets/water-plate.jpg';     // clean water plate, no sun
const GLOW  = 'assets/sun-glow.png';        // sun glow layer (alpha, normalized)
const STREAK = 'assets/water-streaks.png';  // bright streaks of the plate (drives the sun path)
// films, in play order: Black Phone, Violent Night, Nope, Monkey Man (starts on Violent Night, like the comp)
const FILMS = ['assets/films/black-phone.jpg', 'assets/films/violent-night.jpg', 'assets/films/nope.jpg', 'assets/films/monkey-man.jpg'];
const START = 1, HOLD = 6, FLOOD = 1.0, USER_FLOOD = 1.0, IDLE = 8;   // seconds
const TITLES = ['BLACK PHONE', 'VIOLENT NIGHT', 'NOPE', 'MONKEY MAN'];
const TRACK = -0.062;   // letter spacing in em (tighter, per your reference)
const PW = 2560, PH = 1440;
const HORIZON = 593;                       // plate px
const CARD_RECT = [708, 482, 1852, 1054]; // x0, top, x1, waterline (plate px) — 2:1, same as your comp
const SUN_REST = [1711, 731];              // glow layer centre in your original (plate px)
const SUN_MIN = [1050, 640], SUN_MAX = [2250, 770];   // how far the light may travel

const frag = `
precision highp float;
uniform sampler2D tPlate, tA, tB, tGlow, tStreak;
uniform float uMix, uSoft, uRipT, uTilt;
uniform sampler2D tSim; uniform vec2 uSimTexel;   // water surface simulation
uniform float uK, uKt, uTy; uniform vec2 uC;   // responsive: card scale about uC, title scale anchored above the card
uniform sampler2D tTitles;
uniform vec2 uSun; uniform float uSunScale, uSunGain;
uniform vec2 uRes; uniform float uTime, uScale; uniform vec2 uOff;
uniform vec4 uCard; uniform float uHorizon;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int k=0;k<4;k++){ v+=a*vn(p); p=p*2.07+vec2(3.1,1.7); a*=.5; } return v; }

vec4 plate(vec2 p){ return texture2D(tPlate, vec2(p.x/${PW}., 1. - p.y/${PH}.)); }
vec3 filmAt(sampler2D t, vec2 c){ return texture2D(t, vec2(c.x, 1. - c.y)).rgb; }
// liquid dissolve: the films melt into each other through soft organic patches,
// both refracting gently as if seen through moving water; no hard edge
vec3 film(vec2 c){
  if (uMix >= 1.) return filmAt(tB, c);
  if (uSoft > .5) return mix(filmAt(tA, c), filmAt(tB, c), uMix);
  float n = fbm(c * vec2(2.6, 1.6) + vec2(uTime*.05, -uTime*.08));
  float m = smoothstep(n - .38, n + .38, uMix*1.76 - .38);
  float mid = sin(3.14159 * uMix);
  vec2 ref = vec2(fbm(c*vec2(3.,5.) + uTime*.35) - .5, fbm(c*vec2(4.,3.) - uTime*.3 + 7.) - .5) * .045 * mid;
  vec3 a = filmAt(tA, c + ref * (.6 + m));
  vec3 b = filmAt(tB, c - ref * (1.6 - m));
  vec3 col = mix(a, b, m);
  col += vec3(.04, .07, .10) * mid;                         // a little light passing through the water
  return col;
}
// glow layer: 1712x1430 asset, placed at uSun, scaled 1.07 like the original
float glowA(vec2 p){
  vec2 q = (p - uSun) / (1.07*uSunScale) + vec2(856., 715.);
  vec2 uv = q / vec2(1712., 1430.);
  if (any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.)))) return 0.;
  return texture2D(tGlow, vec2(uv.x, 1. - uv.y)).r;              // 0..1, 1 = asset peak
}
vec2 cardSpace(vec2 p, float cx){
  float s = sin(uTilt), c = cos(uTilt), f = 2000.;
  float sx = p.x - cx;
  float xp = sx * f / (c * f - sx * s);           // position across the turned card
  float sc = f / (f + xp * s);                     // nearer side larger, far side smaller
  return vec2(cx + xp, uHorizon + (p.y - uHorizon) / sc);
}
vec3 screen(vec3 b, vec3 f){ return 1. - (1. - b) * (1. - clamp(f, 0., 1.)); }

// water surface: points on a ground plane seen in perspective, swells stretched sideways
float swell(vec2 p){
  float d = max(p.y - uHorizon, .5);
  float z = 900. / d;                         // distance into the scene
  vec2 g = vec2((p.x - ${PW/2}.) / d * .9, z);
  g.y += uTime * 1.1;                         // swells roll toward the viewer
  return fbm(g * vec2(.55, 2.4)) ;
}

void main(){
  vec2 s = gl_FragCoord.xy;
  vec2 p = vec2((s.x - uOff.x) / uScale, (uRes.y - s.y - uOff.y) / uScale);   // plate px, y down
  float below = step(uHorizon + 1., p.y);
  float depth = clamp((p.y - uHorizon) / (${PH}. - uHorizon), 0., 1.);

  float bob = sin(uTime*1.3)*4. + sin(uTime*.7+1.)*2.;
  float x0 = uCard.x, top = uCard.y + bob, x1 = uCard.z, wl = uCard.w + bob;
  float cw = x1 - x0, ch = wl - top;

  // gradient of the swell field -> displacement (grows toward the viewer, zero at the horizon)
  float e = 1.5;
  float h0 = swell(p);
  vec2 gr = vec2(swell(p + vec2(e*6.,0.)) - h0, swell(p + vec2(0.,e)) - h0);
  float amp = below * pow(depth, 1.15);
  vec2 disp = vec2(gr.x * 34., gr.y * 70.) * amp;
  // ring that spreads from the card's base when the film changes
  float age = uTime - uRipT;
  vec2 rd = (p - vec2((x0 + x1)*.5, wl)) * vec2(1., 3.2);
  float rr0 = length(rd);
  float renv = exp(-pow((rr0 - age*640.)/150., 2.)) * exp(-age*.85) * step(0., age) * below;
  disp += (rd/(rr0 + 1e-3)) * sin(rr0*.05 - age*7.) * renv * 6.;
  // live water surface (height-field simulation) disturbed by the cursor, laid on the sea in perspective
  float simD = max(p.y - uHorizon, 1.);
  vec2 suv = vec2(((p.x - ${PW/2}.) / simD + 2.2) / 4.4, (900. / simD - 1.) / 4.);
  float simIn = below * step(0., suv.x) * step(suv.x, 1.) * step(0., suv.y) * step(suv.y, 1.);
  vec2 sg = vec2(0.);
  if (simIn > 0.){
    vec2 tx = uSimTexel;
    sg = vec2(texture2D(tSim, suv + vec2(tx.x, 0.)).r - texture2D(tSim, suv - vec2(tx.x, 0.)).r,
              texture2D(tSim, suv + vec2(0., tx.y)).r - texture2D(tSim, suv - vec2(0., tx.y)).r);
    float near = clamp(simD / 600., .1, 1.4);                         // bigger bends close to the viewer
    sg *= near * (1. - smoothstep(.8, 1., suv.y)) * smoothstep(0., .04, suv.x) * smoothstep(1., .96, suv.x);
    disp += vec2(sg.x, -sg.y * .6) * 420.;
  }
  vec3 col = plate(p + disp).rgb;
  col += vec3(.16, .24, .32) * clamp(-sg.y * 20. - sg.x * 7., -.2, .6) * .35;   // light and shade on the moving surface

  // ---- the sun: your glow layer, blended the way the original was (fitted to it) ----
  float An = glowA(p) * uSunGain;                  // normalized glow
  float A = An * .651;                             // asset alpha (peak 166/255)
  float tw = clamp((p.y - uHorizon + 8.) / 20., 0., 1.);   // sky -> water
  vec3 K = mix(vec3(.751, 1.198, .458), vec3(.693, .895, 0.), tw);
  col = screen(col, A * K);
  float core = .52 * pow(An, 2.19) * mix(1., .668, tw);
  col = screen(col, vec3(core));
  // sun path on the water: follows the sun, broken up by the plate's own streaks and the swell
  vec2 sunPeak = uSun + vec2(41., -177.) * uSunScale;
  float lat = exp(-pow((p.x - sunPeak.x) / (1033. * (.25 + depth)), 2.));
  float hp = texture2D(tStreak, vec2((p.x + disp.x)/${PW}., 1. - (p.y + disp.y)/${PH}.)).r * .25;
  float lift = clamp(1. - (uHorizon - sunPeak.y - 40.) / 260., .35, 1.);   // higher sun = fainter path
  float path = below * lat * exp(-depth * 6.357) * (hp * 1.383 + .132) * uSunGain * lift;
  path *= .7 + .6 * h0;                            // shimmer with the swell
  col = clamp(col + path * vec3(.85, .95, 1.), 0., 1.);

  // ---- title wheel (sky layer: drawn under the card, never reflected) ----
  vec2 qt = vec2(${PW/2}., 482.) + (p - vec2(${PW/2}., uTy)) / uKt;
  if (qt.y < 720. && qt.y > 0. && qt.x > 0. && qt.x < ${PW}.){ vec4 tt = texture2D(tTitles, vec2(qt.x/${PW}., 1. - qt.y/720.)); col = col * (1. - tt.a) + tt.rgb; }   // premultiplied: no dark fringe

  // the glints shimmer gently with the swell
  float lum = dot(col, vec3(.3,.5,.2));
  col += below * smoothstep(.5, .9, lum) * (h0 - .5) * .45;                  // glints shimmer
  // light catching the crests: thin bright streaks that roll toward the viewer
  float crest = smoothstep(.58, .78, h0) * (1. - smoothstep(.62, .98, h0 + .1));
  float band = below * smoothstep(0., .08, depth) * (1. - smoothstep(.55, 1., depth));
  col += vec3(.16, .30, .55) * crest * band * .9;
  col -= vec3(.03, .05, .06) * smoothstep(.5, .25, h0) * band;                // troughs a touch deeper

  // titles (sky only)

  vec2 pc = uC + (p - uC) / uK;                     // responsive card scale
  vec2 cp = cardSpace(pc, (x0 + x1) * .5);           // the card (and its reflection) turn together
  // ---- reflection of the card, below its waterline ----
  if (cp.y > wl){
    float dy = cp.y - wl;
    vec2 rp = cp + disp * 2.4 + vec2(sin(cp.y*.045 - uTime*2.4)*4.*smoothstep(0.,60.,cp.y-wl), 0.);                                  // reflections bend more than the surface
    float ry = wl - (rp.y - wl) * 1.04;
    vec2 cuv = vec2((rp.x - x0) / cw, (ry - top) / ch);
    float blur = (1.5 + dy * .028) / ch;
    vec3 r = vec3(0.); float w = 0.;
    for (int k=-5; k<=5; k++){ float fk = float(k), wk = exp(-fk*fk*.12);
      vec2 q = cuv + vec2(fk*blur*.35, fk*blur);
      r += film(clamp(q, vec2(.002), vec2(.998))) * wk; w += wk; }
    r /= w;
    float inX = smoothstep(-.004, .012, cuv.x) * smoothstep(1.004, .988, cuv.x);
    float inY = step(0., cuv.y);
    float fade = pow(1. - smoothstep(0., 360., dy), 1.35);   // starts at the waterline, fades out toward the bottom
    float rwash = smoothstep(.62, 1., cuv.y);                        // same haze, mirrored: card and reflection meet in one band
    float a = inX * inY * fade * mix(.85, .67, rwash);
    r = screen(r, vec3(.25, .35, .4) * lat * uSunGain * (1. - rwash));   // sun side catches light (not at the seam)
    r = mix(r, mix(col, vec3(.10, .34, 1.), .25), rwash * .6);   // same haze as the card's bottom
    vec3 tinted = mix(col, r, mix(.62, 1., rwash)) * mix(vec3(.6, .76, 1.1), vec3(1.), rwash) + vec3(0., .03, .10) * (1. - rwash);   // at the waterline it matches the card exactly
    col = mix(col, tinted, a);
  }

  // ---- the card itself ----
  vec2 cuv = vec2((cp.x - x0) / cw, (cp.y - top) / ch);
  if (cuv.x >= 0. && cuv.x <= 1. && cuv.y >= 0. && cuv.y <= 1.){
    vec2 rr = vec2(min(cuv.x, 1. - cuv.x) * cw, cuv.y * ch);  // px to side edge / top edge
    float corner = 1. - smoothstep(10., 11.5, length(max(vec2(11.) - rr, 0.)));   // top corners only
    vec3 c = film(cuv);
    vec3 water = col;                                          // what's behind the card at this point
    float sub = cuv.y + (h0 - .5) * .07 + sin(cuv.x*19. + uTime*1.7) * .006;   // waterline moves with the swell
    float wash = smoothstep(.62, 1., sub);
    vec3 haze = mix(col, vec3(.10, .34, 1.), .25);                  // the deep blue of the water behind it
    c = mix(c, haze, wash * .6);                                      // lower card softens into the water's blue
    float alpha = corner * .9 * (1. - smoothstep(.88, 1.02, sub) * .3);   // ~10% see-through; stays present to the waterline
    c *= 1. + uTilt * 1.4 * (cuv.x - .5);            // the side turning toward you catches a bit more light
    col = mix(water, c, alpha);
    // the sun's glow spills over the card where they overlap
    col = screen(col, vec3(.7, .95, 1.) * pow(An, 2.) * .3 * alpha);
    // rim light on the edge that faces the sun, and a soft sheen that tracks it
    float side = clamp((sunPeak.x - (x0 + x1) * .5) / 900., -1., 1.);
    float edgeR = 1. - smoothstep(0., 3.5, (1. - cuv.x) * cw), edgeL = 1. - smoothstep(0., 3.5, cuv.x * cw);
    float rim = (max(side, 0.) * edgeR + max(-side, 0.) * edgeL) * (1. - smoothstep(.25, .8, cuv.y));
    col += vec3(.75, .95, 1.) * rim * .6 * alpha * uSunGain;
    float sx = (sunPeak.x - x0) / cw;
    float sheen = exp(-pow((cuv.x - sx + (cuv.y - .2) * .35) * 3.2, 2.)) * (1. - smoothstep(.1, .75, cuv.y));
    col = screen(col, vec3(.55, .8, 1.) * sheen * .12 * alpha * uSunGain);
  }

  col += (hash(s + fract(uTime)) - .5) / 255.;               // dither: no banding in the gradients
  gl_FragColor = vec4(col, 1.);
}`;

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias:false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;      // textures sampled raw = exact plate colors
const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const load = src => new Promise(r => new THREE.TextureLoader().load(src, t => { t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; r(t); }));

const uniforms = {
  tSim:{value:null}, uSimTexel:{value:new THREE.Vector2(1/384, 1/384)},
  uTilt:{value:0}, uK:{value:1}, uKt:{value:1}, uTy:{value:482}, uC:{value:new THREE.Vector2(1280, 640)}, tTitles:{value:null}, tPlate:{value:null}, tA:{value:null}, tB:{value:null}, tGlow:{value:null}, tStreak:{value:null},
  uMix:{value:1}, uSoft:{value:0}, uRipT:{value:-100},
  uSun:{value:new THREE.Vector2(...SUN_REST)}, uSunScale:{value:1}, uSunGain:{value:1},
  uRes:{value:new THREE.Vector2()}, uTime:{value:0}, uScale:{value:1}, uOff:{value:new THREE.Vector2()},
  uCard:{value:new THREE.Vector4(...CARD_RECT)}, uHorizon:{value:HORIZON}
};
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.ShaderMaterial({ uniforms, vertexShader:'void main(){ gl_Position = vec4(position.xy,0.,1.); }', fragmentShader:frag })));

let view = { sc:1, ox:0, oy:0, k:1, kt:1, ty:482 };
const C = [1280, 640];
function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, w < 820 ? 1.5 : 2));   // lighter on small screens
  renderer.setSize(w, h, false);
  const sc = Math.max(w/PW, h/PH);                            // cover, like a background-size: cover
  const ox = (w - PW*sc)/2, oy = (h - PH*sc)/2;
  // what part of the plate is visible, and how much the card + titles must shrink to fit it
  const visW = w / sc, visH = h / sc;
  const k  = Math.min(1, .88 * visW / 1144, visH / 1250);
  const ty = C[1] + (482 - C[1]) * k;                                     // card top on the plate after scaling
  const kt = Math.min(k, .9 * visW / 1700);                               // titles are the widest element
  view = { sc, ox, oy, k, kt, ty };
  uniforms.uK.value = k; uniforms.uKt.value = kt; uniforms.uTy.value = ty;
  const dpr = renderer.getPixelRatio();
  uniforms.uRes.value.set(w*dpr, h*dpr); uniforms.uScale.value = sc*dpr; uniforms.uOff.value.set(ox*dpr, oy*dpr);
}

let fixedTime = null;   // set to a number to freeze the water (handy for screenshots)
// ---- the light follows the cursor: heavy, eased, kept inside a range ----
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const TILT_MAX = 5 * Math.PI / 180;            // about 5 degrees at the screen edge
const tilt = { v:0, t:0 };
const sun = { x:SUN_REST[0], y:SUN_REST[1], tx:SUN_REST[0], ty:SUN_REST[1], gain:1, tgain:1 };
function aim(cx, cy){
  tilt.t = Math.max(-1, Math.min(1, (cx / innerWidth) * 2 - 1)) * TILT_MAX;   // cursor right -> right side swings away
  const px = (cx - view.ox) / view.sc, py = (cy - view.oy) / view.sc;      // screen -> plate px
  sun.tx = clamp(px - 41, SUN_MIN[0], SUN_MAX[0]);
  sun.ty = clamp(py + 177, SUN_MIN[1], SUN_MAX[1]);
  const d = Math.hypot(px - (sun.x + 41), py - (sun.y - 177));
  sun.tgain = 1 + .22 * Math.exp(-(d*d) / (2*260*260));                       // swells when you're near it
}
function rest(){ tilt.t = 0; sun.tx = SUN_REST[0]; sun.ty = SUN_REST[1]; sun.tgain = 1; }
addEventListener('pointermove', e => aim(e.clientX, e.clientY));
addEventListener('pointerdown', e => aim(e.clientX, e.clientY));
document.documentElement.addEventListener('pointerleave', rest);
addEventListener('blur', rest);

const reduceTilt = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- water surface simulation: the cursor pushes into the water, waves spread, interfere and settle ----
const SIM = 384;
const simRT = [0, 1].map(() => new THREE.WebGLRenderTarget(SIM, SIM, { type:THREE.HalfFloatType, format:THREE.RGBAFormat,
  minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, depthBuffer:false, stencilBuffer:false }));
const simMat = new THREE.ShaderMaterial({
  uniforms:{ tPrev:{value:null}, texel:{value:new THREE.Vector2(1/SIM, 1/SIM)}, uDrop:{value:Array.from({length:16}, () => new THREE.Vector4())}, uN:{value:0} },
  vertexShader:'varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader:`precision highp float; varying vec2 vUv; uniform sampler2D tPrev; uniform vec2 texel; uniform vec4 uDrop[16]; uniform int uN;
    void main(){
      vec4 c = texture2D(tPrev, vUv);
      float n = (texture2D(tPrev, vUv + vec2(texel.x, 0.)).r + texture2D(tPrev, vUv - vec2(texel.x, 0.)).r +
                 texture2D(tPrev, vUv + vec2(0., texel.y)).r + texture2D(tPrev, vUv - vec2(0., texel.y)).r) * .5 - c.g;
      n *= .9;                                                         // dies out within ~125px, so it stays right around the cursor
      for (int i = 0; i < 16; i++){ if (i >= uN) break;
        vec2 d = (vUv - uDrop[i].xy) / texel;
        n -= uDrop[i].w * exp(-dot(d, d) / (uDrop[i].z * uDrop[i].z)); }
      gl_FragColor = vec4(n, c.r, 0., 1.);
    }`
});
const simScene = new THREE.Scene(); simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat));
let simCur = 0, simAcc = 0, pending = [];
[0, 1].forEach(i => { renderer.setRenderTarget(simRT[i]); renderer.setClearColor(0x000000, 0); renderer.clear(); });
renderer.setRenderTarget(null);
function simStep(dt){
  simAcc = Math.min(simAcc + dt, 3 / 60);
  while (simAcc >= 1 / 60){
    simAcc -= 1 / 60;
    const batch = pending.splice(0, 16);
    batch.forEach((d, i) => simMat.uniforms.uDrop.value[i].set(d[0], d[1], d[2], d[3]));
    simMat.uniforms.uN.value = batch.length;
    simMat.uniforms.tPrev.value = simRT[simCur].texture;
    renderer.setRenderTarget(simRT[1 - simCur]); renderer.render(simScene, cam);
    simCur = 1 - simCur;
  }
  renderer.setRenderTarget(null);
  uniforms.tSim.value = simRT[simCur].texture;
}
const toSim = (X, Y) => { const d = Math.max(Y - HORIZON, 1); return [((X - PW / 2) / d + 2.2) / 4.4, (900 / d - 1) / 4]; };
let lastMove = { x:0, y:0, t:0 }, lastSim = null, lastDrip = 0;
function rippleAt(cx, cy, force){
  const X = (cx - view.ox) / view.sc, Y = (cy - view.oy) / view.sc;   // screen -> plate px
  const now = performance.now() / 1000;
  const speed = Math.hypot(cx - lastMove.x, cy - lastMove.y) / Math.max(now - lastMove.t, .008);   // css px/s
  lastMove = { x:cx, y:cy, t:now };
  if (Y < HORIZON + 6){ lastSim = null; return; }                     // only the water moves
  const [u, v] = toSim(X, Y);
  if (u < 0 || u > 1 || v < 0 || v > 1){ lastSim = null; return; }
  const s = force ? .9 : clamp(speed / 1400, .08, .7) * (reduceTilt ? .5 : 1);
  // push along the path since the last event, so a moving cursor leaves a continuous wake
  const from = lastSim || [u, v], steps = Math.min(10, Math.max(1, Math.ceil(Math.hypot(u - from[0], v - from[1]) / .006)));
  for (let i = 1; i <= steps; i++){ const f = i / steps; pending.push([from[0] + (u - from[0]) * f, from[1] + (v - from[1]) * f, force ? 1.6 : 1.2, s / steps * 1.8]); }
  if (pending.length > 64) pending.splice(0, pending.length - 64);
  lastSim = [u, v];
  if (force || (speed > 60 && now - lastDrip > .11)){ lastDrip = now; sound.drip(force ? 1 : clamp(speed / 900, .2, 1)); }
}

// ---- water sounds: synthesized with Web Audio (off until the visitor turns it on) ----
const sound = (() => {
  let ac = null, master = null, on = false, noiseBuf = null;
  function init(){
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    // noise for the little splashes
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++){ const w = Math.random() * 2 - 1; b = (b + .02 * w) / 1.02; d[i] = b * 3.5; }   // soft brown noise
  }
  function drip(s){
    if (!on || !ac) return;
    const t = ac.currentTime;
    // a bubble "bloop": a short sine whose pitch rises as it closes
    const f = 420 + Math.random() * 520;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.5 + Math.random() * .6), t + .07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.09 * s, t + .006); g.gain.exponentialRampToValueAtTime(.0005, t + .16);
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    const out = pan ? (pan.pan.value = lastMove.x / innerWidth * 1.4 - .7, o.connect(g).connect(pan), pan) : o.connect(g);
    out.connect(master); o.start(t); o.stop(t + .18);
    // a little splash on faster movement
    if (s > .45){
      const n = ac.createBufferSource(); n.buffer = noiseBuf; n.playbackRate.value = 3;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 1400; bp.Q.value = 1.2;
      const ng = ac.createGain(); ng.gain.setValueAtTime(.05 * s, t); ng.gain.exponentialRampToValueAtTime(.0005, t + .12);
      n.connect(bp).connect(ng).connect(master); n.start(t, Math.random()); n.stop(t + .13);
    }
  }
  function toggle(){
    if (!ac) init();
    on = !on;
    if (ac.state === 'suspended') ac.resume().catch(()=>{});
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(on ? .9 : 0, ac.currentTime, .25);
    return on;
  }
  return { drip, toggle, get on(){ return on; } };
})();

// ---- custom cursor: dot + trailing ring, "SOUND ON" prompt when the cursor rests ----
const fine = matchMedia('(pointer: fine)').matches;
const fontL = document.createElement('link'); fontL.rel = 'stylesheet';
fontL.href = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,500&display=swap'; document.head.appendChild(fontL);
const cssC = document.createElement('style');
cssC.textContent = `
  ${fine ? 'html,body,canvas{cursor:none!important}' : ''}
  #cur{position:fixed;inset:0;pointer-events:none;z-index:10}
  #curLabel{position:fixed;left:0;top:0;pointer-events:none;z-index:11;color:#fff;
    font:500 13px/1 Archivo,sans-serif;font-stretch:125%;font-variation-settings:"wdth" 125;letter-spacing:-.02em;white-space:nowrap;
    clip-path:inset(0 100% 0 0);opacity:0;transition:clip-path .55s cubic-bezier(.2,.8,.2,1),opacity .35s}
  #curLabel.show{clip-path:inset(0 0 0 0);opacity:1}
  #soundBtn{position:fixed;inset:auto 0 0 auto;width:1px;height:1px;opacity:0}`;
document.head.appendChild(cssC);
const curCan = document.createElement('canvas'); curCan.id = 'cur'; document.body.appendChild(curCan);
const curCtx = curCan.getContext('2d');
const label = document.createElement('div'); label.id = 'curLabel'; label.textContent = 'SOUND ON'; document.body.appendChild(label);
const soundBtn = document.createElement('button'); soundBtn.id = 'soundBtn'; soundBtn.setAttribute('aria-label', 'Turn sound on'); document.body.appendChild(soundBtn);
function setSound(){ const on = sound.toggle(); label.textContent = on ? 'SOUND OFF' : 'SOUND ON'; soundBtn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on'); idleSince = performance.now(); }
soundBtn.addEventListener('click', e => { e.stopPropagation(); setSound(); });

const pc_ = { x:innerWidth * .76, y:innerHeight * .74, rx:innerWidth * .76, ry:innerHeight * .74, seen:!fine, hover:0 };
let idleSince = performance.now(), trail = [];
function sizeCur(){ const d = Math.min(devicePixelRatio, 2); curCan.width = innerWidth * d; curCan.height = innerHeight * d; curCtx.setTransform(d, 0, 0, d, 0, 0); }
sizeCur(); addEventListener('resize', sizeCur);
addEventListener('pointermove', e => {
  if (fine || e.pointerType !== 'mouse'){ pc_.x = e.clientX; pc_.y = e.clientY; pc_.seen = true; idleSince = performance.now(); }
  rippleAt(e.clientX, e.clientY, false);
});
addEventListener('pointerdown', e => rippleAt(e.clientX, e.clientY, true));
document.documentElement.addEventListener('pointerleave', () => { if (fine) pc_.seen = false; });
addEventListener('click', e => { if (!titleAt(e.clientX, e.clientY)) setSound(); });

function drawCursor(dt){
  const W = innerWidth, H = innerHeight;
  curCtx.clearRect(0, 0, W, H);
  if (!pc_.seen) { label.classList.remove('show'); return; }
  const k = 1 - Math.exp(-dt * 9);                                  // the ring trails the dot
  pc_.rx += (pc_.x - pc_.rx) * k; pc_.ry += (pc_.y - pc_.ry) * k;
  const lag = Math.hypot(pc_.x - pc_.rx, pc_.y - pc_.ry);
  pc_.hover += ((wheel.hover >= 0 ? 1 : 0) - pc_.hover) * Math.min(1, dt * 10);
  trail.push({ x:pc_.rx, y:pc_.ry }); if (trail.length > 14) trail.shift();
  const R = 22 + pc_.hover * 8;
  // resting: the ring draws itself around the dot, then breathes
  const idle = (performance.now() - idleSince) / 1000;
  const resting = idle > .45 && lag < 2;
  const sweep = resting ? Math.min(1, (idle - .45) / .8) : 0;
  const ease = 1 - Math.pow(1 - sweep, 3);
  const breathe = resting && sweep >= 1 ? Math.sin((idle - 1.25) * 2.2) * 1.5 : 0;
  curCtx.lineWidth = 1.2;
  curCtx.strokeStyle = `rgba(255,255,255,${resting ? .35 : .7})`;
  curCtx.beginPath(); curCtx.arc(pc_.rx, pc_.ry, R + breathe, 0, 7); curCtx.stroke();
  if (resting){
    curCtx.strokeStyle = 'rgba(255,255,255,.95)'; curCtx.lineWidth = 1.6;
    curCtx.beginPath(); curCtx.arc(pc_.rx, pc_.ry, R + breathe, -Math.PI / 2, -Math.PI / 2 + ease * Math.PI * 2); curCtx.stroke();
  }
  curCtx.fillStyle = '#fff'; curCtx.beginPath(); curCtx.arc(pc_.x, pc_.y, 2, 0, 7); curCtx.fill();
  // the prompt appears to the right of the ring while resting, and clears as soon as the cursor moves
  const showLabel = resting && wheel.hover < 0;
  label.classList.toggle('show', showLabel);
  label.style.transform = `translate(${pc_.rx + R + 18}px, ${pc_.ry - 6}px)`;
}

const clock = new THREE.Clock(); let last = 0;
function loop(){
  const now = clock.getElapsedTime(), dt = Math.min(now - last, .05); last = now;
  const k = 1 - Math.exp(-dt * 1.6), kg = 1 - Math.exp(-dt * 3);
  sun.x += (sun.tx - sun.x) * k; sun.y += (sun.ty - sun.y) * k; sun.gain += (sun.tgain - sun.gain) * kg;
  tilt.v += (tilt.t - tilt.v) * (1 - Math.exp(-dt * 2.4)); uniforms.uTilt.value = reduceTilt ? 0 : tilt.v;
  uniforms.uSun.value.set(sun.x, sun.y); uniforms.uSunGain.value = sun.gain;
  uniforms.uTime.value = fixedTime ?? now;
  if (typeof tick === 'function' && uniforms.tB.value){ tick(now); stepWheel(dt); simStep(dt); drawCursor(dt); }
  renderer.render(scene, cam);
  requestAnimationFrame(loop);
}

const [plateT, glowT, streakT, ...filmT] = await Promise.all([load(PLATE), load(GLOW), load(STREAK), ...FILMS.map(load)]);
filmT.forEach(t => { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); renderer.initTexture(t); });
uniforms.tPlate.value = plateT; uniforms.tGlow.value = glowT; uniforms.tStreak.value = streakT;
uniforms.tA.value = uniforms.tB.value = filmT[START];

// ---- title wheel: drawn in plate pixels from your screenshot; snaps one title per gesture ----
await document.fonts.load('900 expanded 182px Archivo').catch(()=>{});
const tCan = document.createElement('canvas'); tCan.width = PW; tCan.height = 720;
const tCtx = tCan.getContext('2d');
const titleTex = new THREE.CanvasTexture(tCan); titleTex.colorSpace = THREE.NoColorSpace; titleTex.premultiplyAlpha = true; titleTex.generateMipmaps = false; titleTex.minFilter = THREE.LinearFilter;
uniforms.tTitles.value = titleTex;
const ROW = [ // offset -> baseline (plate px), size, opacity; matches the comp (prev above, current, next below)
  { o:-2, base:166, size: 86, a:0    },
  { o:-1, base:264, size:119, a:.17  },
  { o: 0, base:408, size:182, a:.97  },
  { o: 1, base:504, size:119, a:.17  },
  { o: 2, base:590, size: 86, a:0    } ];
function rowAt(o){
  o = Math.max(-2, Math.min(2, o));
  const i = Math.min(3, Math.floor(o + 2)), A = ROW[i], B = ROW[i+1], f = (o - A.o);
  const L = (x,y) => x + (y - x) * f;
  return { base:L(A.base,B.base), size:L(A.size,B.size), a:L(A.a,B.a) };
}
const wrapO = o => o - N * Math.round(o / N);
const wheel = { pos:START, vel:0, target:START, hover:-1, hov:TITLES.map(()=>0), rects:[] };
let lastKey = '';
function drawTitles(){
  const key = wheel.pos.toFixed(4) + wheel.hov.map(h=>h.toFixed(2)).join();
  if (key === lastKey) return; lastKey = key;
  tCtx.clearRect(0, 0, PW, 720); tCtx.textAlign = 'center'; tCtx.textBaseline = 'alphabetic';
  wheel.rects = [];
  TITLES.forEach((t, i) => {
    const o = wrapO(i - wheel.pos), r = rowAt(o);
    const fadeEdge = Math.max(0, Math.min(1, (N/2 - Math.abs(o)) / .35));      // the title wrapping around fades out
    const a = Math.min(1, r.a + wheel.hov[i] * .18) * fadeEdge;
    if (a <= .002) return;
    tCtx.font = `900 expanded ${r.size}px Archivo`;
    const ls = TRACK * r.size;
    if ('letterSpacing' in tCtx) tCtx.letterSpacing = ls.toFixed(2) + 'px';
    const w = tCtx.measureText(t).width;
    // a hint of wheel blur while it's rolling
    const white = Math.max(0, 1 - Math.abs(o));                                  // current title goes white
    const cr = 225 + 7*white, cg = 250 + 2*white, cb = 255;
    tCtx.fillStyle = `rgba(${cr|0},${cg|0},${cb},${a.toFixed(3)})`;
    tCtx.fillText(t, PW/2 + ('letterSpacing' in tCtx ? ls/2 : 0), r.base);   // re-centre (spacing trails the last letter)
    wheel.rects.push({ i, o, x0:PW/2 - w/2, x1:PW/2 + w/2, y0:r.base - r.size*.74, y1:r.base + r.size*.04 });
  });
  titleTex.needsUpdate = true;
}
function stepWheel(dt){
  const k = 75, c = 2 * Math.sqrt(k) * .66;                                      // a touch of overshoot, then it locks
  const acc = k * (wheel.target - wheel.pos) - c * wheel.vel;
  wheel.vel += acc * dt; wheel.pos += wheel.vel * dt;
  if (Math.abs(wheel.target - wheel.pos) < .0005 && Math.abs(wheel.vel) < .002){ wheel.pos = wheel.target; wheel.vel = 0; }
  wheel.hov = wheel.hov.map((h, i) => h + ((i === wheel.hover ? 1 : 0) - h) * Math.min(1, dt * 10));
  drawTitles();
}
function titleAt(cx, cy){
  const X = (cx - view.ox) / view.sc, Y = (cy - view.oy) / view.sc;      // plate px
  const px = 1280 + (X - 1280) / view.kt, py = 482 + (Y - view.ty) / view.kt;   // title space
  const qx = C[0] + (X - C[0]) / view.k, qy = C[1] + (Y - C[1]) / view.k;       // card space
  const onCard = qy > CARD_RECT[1] && qx > CARD_RECT[0] && qx < CARD_RECT[2];
  const hit = wheel.rects.find(r => r.i !== cur && Math.abs(r.o) < 1.5 && px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1 && !onCard);
  return hit || null;
}
addEventListener('pointermove', e => { const h = titleAt(e.clientX, e.clientY); wheel.hover = h ? h.i : -1; if (!fine) document.body.style.cursor = h ? 'pointer' : ''; });
addEventListener('click', e => { const h = titleAt(e.clientX, e.clientY); if (h) userStep(Math.sign(h.o)); });

// ---- film rotation: plays on its own; scroll / swipe / arrow keys step through it ----
const N = FILMS.length, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
uniforms.uSoft.value = reduce ? 1 : 0;
let cur = START, flood = null, nextAt = HOLD, pausedUntil = 0, mixHold = null;
function show(i, dir = 1, dur = FLOOD){
  i = ((i % N) + N) % N; if (i === cur && !flood) return;
  let d = i - cur; d -= N * Math.round(d / N); if (d === 0) d = dir;   // shortest way round the loop
  wheel.target = Math.round(wheel.target) + d;                       // wheel always lands on the film being shown
  const t = clock.getElapsedTime();
  uniforms.tA.value = flood ? (uniforms.uMix.value > .5 ? uniforms.tB.value : uniforms.tA.value) : filmT[cur];  // mid-change: start from whichever film dominates
  uniforms.tB.value = filmT[i]; cur = i;
  flood = { start:t, dur: reduce ? .6 : dur };
  document.getElementById('now').textContent = 'Now showing: ' + TITLES[i];
  uniforms.uMix.value = 0; mixHold = null;
  uniforms.uRipT.value = (fixedTime ?? t);
  nextAt = t + HOLD + flood.dur;
}
// the menu and the image move as one: a new step is accepted only once the current blend is mostly done
function canStep(){ return !flood || (clock.getElapsedTime() - flood.start) / flood.dur > .65; }
function userStep(dir){
  pausedUntil = clock.getElapsedTime() + IDLE;
  if (!canStep()) return false;
  show(cur + dir, dir, USER_FLOOD); return true;
}
// one gesture = one title: a gesture ends when the wheel/trackpad goes quiet for 220ms (absorbs momentum)
let lastWheel = 0, wheelAcc = 0, fresh = true;
addEventListener('wheel', e => { e.preventDefault(); const now = performance.now();
  if (now - lastWheel > 220){ fresh = true; wheelAcc = 0; }
  lastWheel = now; wheelAcc += e.deltaY;
  if (fresh && Math.abs(wheelAcc) > 30){ fresh = false; userStep(Math.sign(wheelAcc)); }
}, { passive:false });
let ty0 = null;
addEventListener('touchstart', e => { ty0 = e.touches[0].clientY; }, { passive:true });
addEventListener('touchmove', e => { if (ty0 === null) return; const d = ty0 - e.touches[0].clientY; if (Math.abs(d) > 45){ userStep(Math.sign(d)); ty0 = null; } }, { passive:true });
addEventListener('keydown', e => { if (e.repeat) return; if (['ArrowDown','PageDown',' '].includes(e.key)){ e.preventDefault(); userStep(1); } if (['ArrowUp','PageUp'].includes(e.key)){ e.preventDefault(); userStep(-1); } });
function tick(t){
  if (flood){ const m = Math.min(1, (t - flood.start) / flood.dur); uniforms.uMix.value = reduce ? m : 1 - Math.pow(1 - m, 3);   // fast start, soft landing: lands with the wheel
    if (m >= 1){ flood = null; uniforms.tA.value = uniforms.tB.value; uniforms.uMix.value = 1; } }
  else uniforms.uMix.value = mixHold ?? 1;
  if (!flood && t >= nextAt && t >= pausedUntil) show(cur + 1, 1);
}
addEventListener('resize', resize); resize(); loop();
