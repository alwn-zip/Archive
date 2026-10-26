const VS = `precision highp float;attribute vec3 aPosition;varying vec2 vUv;
void main(){vUv=aPosition.xy;vec4 p=vec4(aPosition,1.);p.xy=p.xy*2.-1.;gl_Position=p;}`;
const NOISE = `float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
vec2 curl(vec2 p){float e=.01;float a=vn(p+vec2(0.,e))-vn(p-vec2(0.,e));float b=vn(p+vec2(e,0.))-vn(p-vec2(e,0.));return vec2(a,-b)/(2.*e)*.2;}`;
// 하나의 힘장: DROP(radial+curl) / FLOW(directional) / BLEED(global curl) 모두 같은 이류 패스
const FS_ADV = `precision highp float;varying vec2 vUv;uniform sampler2D uDye;uniform vec4 uF[16];uniform vec4 uP[16];uniform float uAsp,uDiff;uniform vec2 uTex,uFlow;
${NOISE}
vec2 field(vec2 uv){vec2 disp=vec2(0.);
for(int i=0;i<16;i++){float s=uP[i].z;if(s>0.){float k=uP[i].y;vec2 d=(uv-uF[i].xy)*vec2(uAsp,1.);float r=uP[i].x;float g=exp(-dot(d,d)/(r*r));
if(k<.5){disp+=uF[i].zw*g*s;}
else if(k<1.5){vec2 dir=d/(length(d)+1e-3);dir.x/=uAsp;disp+=(dir*uF[i].z+curl(uv*5.+uP[i].w)*uF[i].w)*g*s;}
else{disp+=curl(uv*3.+uP[i].w)*uF[i].z*s;}}}
return disp;}
void main(){vec2 d=field(vUv);vec2 q=vUv-d-uFlow*(.88+.24*vn(vUv*3.+3.7));vec4 c=texture2D(uDye,q);
float m=clamp(length(d)*uDiff,0.,.4);
vec4 b=(texture2D(uDye,q+vec2(uTex.x,0.))+texture2D(uDye,q-vec2(uTex.x,0.))+texture2D(uDye,q+vec2(0.,uTex.y))+texture2D(uDye,q-vec2(0.,uTex.y)))*.25;
gl_FragColor=mix(c,b,m);}`;
// DYE: 노이즈로 가장자리를 침식하며 premultiplied 상태로 염료 레이어에 합침
const FS_STAMP = `precision highp float;varying vec2 vUv;uniform sampler2D uDye,uItem;uniform vec2 uC,uSz;uniform float uSeed;
${NOISE}
void main(){vec4 dye=texture2D(uDye,vUv);vec2 q=(vUv-uC)/uSz+.5;
if(q.x<0.||q.x>1.||q.y<0.||q.y>1.){gl_FragColor=dye;return;}
vec4 it=texture2D(uItem,vec2(q.x,1.-q.y));
float e=min(min(q.x,1.-q.x),min(q.y,1.-q.y));float n=vn(q*9.+uSeed);
float m=smoothstep(0.,.14,e+(n-.5)*.16);float a=it.a*m*.8;
gl_FragColor=vec4(it.rgb*a,a)+dye*(1.-a);}`;
// 합성: 패브릭(절차 생성) + 염료 + 미확정 재료. 패브릭은 염료와 섞이지 않음
const FS_COMP = `precision highp float;varying vec2 vUv;uniform sampler2D uDye,uItem;uniform vec2 uC,uSz;uniform float uShow,uAsp;
${NOISE}
void main(){vec2 p=vUv*vec2(uAsp*900.,900.);float g=vn(p*.9)*.5+vn(p*.25)*.5;float wv=.5+.5*sin(p.x*1.4)*sin(p.y*1.4);
vec3 f=vec3(.961,.949,.914)+(g-.5)*.035+(wv-.5)*.025;
vec4 d=texture2D(uDye,vUv);vec3 col=f*(1.-d.a)+d.rgb*(.95+.05*wv);
if(uShow>.5){vec2 q=(vUv-uC)/uSz+.5;
if(q.x>=0.&&q.x<=1.&&q.y>=0.&&q.y<=1.){vec4 it=texture2D(uItem,vec2(q.x,1.-q.y));col=mix(col,it.rgb,it.a*.6);
float e=min(min(q.x,1.-q.x),min(q.y,1.-q.y));if(e<.004&&mod(floor(q.x*60.+q.y*60.),2.)<1.)col=mix(col,vec3(.27),.6);}}
gl_FragColor=vec4(col,1.);}`;

// DROP spread: separate pass AFTER the advect pass. Uses the same radius as the DROP distortion.
const SPREAD_REACH = "0.018",
  SPREAD_K = "0.12";
const SPREAD_ON = new URLSearchParams(location.search).get("spread") !== "0";
const FS_SPREAD = `precision highp float;varying vec2 vUv;uniform sampler2D uDye;uniform vec4 uF[16];uniform vec4 uP[16];uniform float uAsp;
${NOISE}
void main(){vec4 c=texture2D(uDye,vUv);vec2 v=vec2(0.);float w=0.;float sd=0.;
for(int i=0;i<16;i++){float s=uP[i].z;if(s>0.){vec2 d=(vUv-uF[i].xy)*vec2(uAsp,1.);float r=uP[i].x;float g=exp(-dot(d,d)/(r*r));float ring=4.*g*(1.-g);
vec2 u=-d/(length(d)+.03)+curl(vUv*6.+uP[i].w)*3.;u/=(length(u)+1e-3);u.x/=uAsp;v+=u*ring*s;w+=ring*s;sd=uP[i].w;}}
if(w<.004){gl_FragColor=c;return;}
vec4 acc=vec4(0.);
for(int j=0;j<4;j++){float nz=vn(vUv*9.+float(j)*5.3+sd);vec2 off=v*${SPREAD_REACH}*((float(j)+.5)/4.)*(.3+1.4*nz);acc+=texture2D(uDye,vUv+off);}
acc*=.25;
gl_FragColor=mix(c,acc,clamp(w*${SPREAD_K},0.,.2));}`;

// ---- FLOW: drag sets ONE global direction/speed; dye layer flows with per-position variation. Tune here; no UI. ----
const FLOW_GAIN = 0.6, // global velocity target = drag delta per frame * gain
  FLOW_FOLLOW = 0.35, // how fast global velocity follows the drag (smoothing/average)
  FLOW_DECAY = 0.92, // per-frame decay after the drag stops (higher = longer glide)
  FLOW_MAX = 0.06, // max global speed (uv per frame)
  FLOW_STRETCH = 1.3, // backtrace length multiplier (higher = longer streaks)
  FLOW_VAR_MIN = 0.35, // slowest local speed factor (noise) -> shear/stretch between regions
  FLOW_VAR_MAX = 1.6, // fastest local speed factor
  FLOW_WOBBLE = 3, // edge only: noise offset of the backtrace
  FLOW_RAGGED = 0.7, // edge only: flow-aligned streak variation of stretch length
  FLOW_DIFF = 2.5; // edge only: weak smoothing, scaled by speed
const FS_FLOW = `precision highp float;varying vec2 vUv;uniform sampler2D uDye,uSet;uniform vec2 uG,uTex;uniform float uAsp,uSeed;
${NOISE}
void main(){float sp=length(uG);
vec2 t=vec2(.025/uAsp,.025);
float pal=max(max(texture2D(uDye,vUv).a,texture2D(uDye,vUv+vec2(t.x,0.)).a),max(max(texture2D(uDye,vUv-vec2(t.x,0.)).a,texture2D(uDye,vUv+vec2(0.,t.y)).a),texture2D(uDye,vUv-vec2(0.,t.y)).a));
float pres=smoothstep(.01,.25,pal);
if(pres<.001||sp<1e-5){gl_FragColor=texture2D(uDye,vUv);return;}
vec2 dir=uG/sp,perp=vec2(-dir.y,dir.x);vec2 p=vUv*vec2(uAsp,1.);
float lo=vn(p*3.+uSeed);float st=vn(vec2(dot(p,dir)*4.,dot(p,perp)*18.)+uSeed*.7);
float mult=mix(${FLOW_VAR_MIN.toFixed(2)},${FLOW_VAR_MAX.toFixed(2)},lo*.6+st*.4);
vec2 v=uG*mult*pres;
float aSelf=texture2D(uDye,vUv).a;
// settled (beaded) dye resists further flow. Smooth transition; the threshold is noise-modulated so the border of the settled part is irregular, never a hard frame.
float sv=texture2D(uSet,vUv).r;
float setl=smoothstep(.2,.8,sv+(vn(p*14.+uSeed)-.5)*.35)*smoothstep(.12,.45,aSelf);
float mob=1.-.93*setl;
float a0=texture2D(uDye,clamp(vUv-v*${FLOW_STRETCH.toFixed(2)},0.,1.)).a;
float edge=1.-smoothstep(.3,.9,a0);
float rag=vn(vec2(dot(p,dir)*5.,dot(p,perp)*26.)+uSeed);
vec2 nz=curl(p*8.+2.3+uSeed)*sp*${FLOW_WOBBLE.toFixed(2)}*edge;
// total backtrace displacement (q = vUv - D): drag stretch + ragged stretch + noise wobble
vec2 D=v*${FLOW_STRETCH.toFixed(2)}*(1.+edge*${FLOW_RAGGED.toFixed(2)}*(rag-.5)*2.)+nz;
// canvas border: limit the REAL displacement per axis by the room left toward the wall (|D| <= c*room, c<1: gathered, never pushed out). Room and c vary irregularly along each wall.
vec2 wc=vec2(.55*(.45+1.1*vn(vec2(vUv.y*9.,3.1)+uSeed)),.55*(.45+1.1*vn(vec2(vUv.x*9.*uAsp,7.7)+uSeed)));
vec2 gap=vec2(.035*(.3+1.4*vn(vec2(vUv.y*11.,5.5)+uSeed)),.035*(.3+1.4*vn(vec2(vUv.x*11.*uAsp,9.9)+uSeed)));
vec2 dist=vec2(D.x>0.?1.-vUv.x:vUv.x,D.y>0.?1.-vUv.y:vUv.y);
D=sign(D)*min(abs(D),wc*max(dist-gap,0.));
D*=mob;
vec2 q=vUv-D;
// plain bilinear fetch = convex combination of premultiplied rgba: no overshoot, no hue change, alpha never above its neighbours. No density gain anywhere.
vec4 c=texture2D(uDye,q);
if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)c=vec4(0.);   // only sources that really lie outside the canvas
vec2 da=dir*uTex*2.,dp=perp*uTex*(2.+5.*rag);
vec4 bl=(texture2D(uDye,q+da)+texture2D(uDye,q-da)+texture2D(uDye,q+dp)+texture2D(uDye,q-dp))*.25;
gl_FragColor=mix(c,bl,clamp(sp*${FLOW_DIFF.toFixed(2)}*10.*edge,0.,.05)*mob);}`;
// where dye is driven against a wall, "settle" accumulates (R, 0..1). It only records WHERE dye was pressed; it never changes color or alpha.
const FS_SETTLE = `precision highp float;varying vec2 vUv;uniform sampler2D uSet,uDye;uniform vec2 uG;uniform float uAsp,uSeed;
${NOISE}
void main(){float s=texture2D(uSet,vUv).r;float sp=length(uG);vec2 dir=sp>1e-5?uG/sp:vec2(0.);
float a=texture2D(uDye,vUv).a;
float dwx=(dir.x>0.?1.-vUv.x:vUv.x)*uAsp,dwy=dir.y>0.?1.-vUv.y:vUv.y;
float bx=.14*(.4+1.2*vn(vec2(vUv.y*9.,3.1)+uSeed)),by=.14*(.4+1.2*vn(vec2(vUv.x*9.*uAsp,7.7)+uSeed));
float toward=max(abs(dir.x)*(1.-smoothstep(0.,bx,dwx)),abs(dir.y)*(1.-smoothstep(0.,by,dwy)));
float inc=toward*smoothstep(.3,.7,a)*min(1.,sp*50.)*.07;
gl_FragColor=vec4(min(1.,s+inc),0.,0.,1.);}`;
function mkSet() {
  const mk = () =>
    createFramebuffer({
      width: Math.max(2, SW >> 1),
      height: Math.max(2, SH >> 1),
      density: 1,
      format: UNSIGNED_BYTE,
      textureFiltering: LINEAR,
      depth: false,
      antialias: false,
    });
  setA = mk();
  setB = mk();
  clearSettle();
}
function clearSettle() {
  [setA, setB].forEach((f) => {
    f.begin();
    clear();
    f.end();
  });
}

// ---- BLEED: omnidirectional, time-varying dispersion + ring gather (separate pass; no global direction) ----
const BLEED_REACH = 0.008, // per-frame reach (uv) at full strength; raise for wider spread
  BLEED_MIX = 0.15, // how much of the multi-direction gather is mixed in (capped at .35)
  BLEED_SPEED = 0.015, // how fast the direction field evolves (higher = more churning)
  BLEED_FRAMES = 75; // duration in frames
const FS_BLEED = `precision highp float;varying vec2 vUv;uniform sampler2D uDye;uniform float uAsp,uStr,uPh,uSeed;
${NOISE}
vec2 dirN(vec2 p,float ph){float a=6.2831*(vn(p*4.+ph)+.5*vn(p*9.-ph*1.3+7.1));return vec2(cos(a),sin(a));}
void main(){vec2 p=vUv*vec2(uAsp,1.);vec2 ix=vec2(1./uAsp,1.);
float R=${BLEED_REACH.toFixed(3)}*uStr;
// 1) turbulent displacement: direction varies in space AND time, so there is no net drift direction
vec2 d=dirN(p,uPh+uSeed)*ix*R*(.25+.9*vn(p*7.+uPh*.7+uSeed));
vec4 c=texture2D(uDye,vUv+d);
// 2) ring gather in all directions with noisy angle/radius, alpha-weighted so colors interpenetrate
vec4 acc=vec4(0.);float ws=0.;
for(int k=0;k<6;k++){float fk=float(k);float a=fk*1.0472+6.2831*vn(p*3.+fk*4.7+uSeed);float r=R*(.3+1.2*vn(p*11.+fk*3.1+uPh*.4));
vec4 sm=texture2D(uDye,vUv+vec2(cos(a),sin(a))*ix*r);float w=.5+sm.a;acc+=sm*w;ws+=w;}
gl_FragColor=mix(c,acc/ws,clamp(uStr*${BLEED_MIX.toFixed(2)},0.,.35));}`;

const FS_COPY = `precision highp float;varying vec2 vUv;uniform sampler2D uDye;void main(){gl_FragColor=texture2D(uDye,vUv);}`;
addEventListener("error", (e) => {
  const d = document.getElementById("diag");
  d.textContent = "ERROR: " + e.message + " (line " + (e.lineno || "?") + ")";
});
let setA,
  setB,
  shSettle,
  cnv,
  dyeA,
  dyeB,
  shFlow,
  shBleed,
  shAdv,
  shStamp,
  shComp,
  shSpread,
  SW,
  SH,
  asp,
  fbName = "?",
  isMobile,
  item = null,
  stampReq = null,
  dirty = true,
  forces = [],
  busyFrames = 0,
  lastDiag = 0,
  exts = {};
const $ = (s) => document.querySelector(s),
  diag = $("#diag"),
  toast = $("#toast");
function say(s) {
  /* Interaction toast messages intentionally disabled. */
}

function setup() {
  isMobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    navigator.maxTouchPoints > 1;
  cnv = createCanvas(innerWidth, innerHeight, WEBGL);
  pixelDensity(Math.min(devicePixelRatio || 1, 2));
  noStroke();
  const gl = drawingContext;
  [
    "EXT_color_buffer_float",
    "EXT_color_buffer_half_float",
    "OES_texture_float_linear",
  ].forEach((n) => (exts[n] = !!gl.getExtension(n)));
  const long = isMobile ? 768 : 1280;
  asp = width / height;
  if (asp >= 1) {
    SW = long;
    SH = Math.round(long / asp);
  } else {
    SH = long;
    SW = Math.round(long * asp);
  }
  const mk = (fmt) =>
    createFramebuffer({
      width: SW,
      height: SH,
      density: 1,
      format: fmt,
      textureFiltering: LINEAR,
      depth: false,
      antialias: false,
    });
  try {
    dyeA = mk(HALF_FLOAT);
    dyeB = mk(HALF_FLOAT);
  } catch (e) {
    dyeA = mk(UNSIGNED_BYTE);
    dyeB = mk(UNSIGNED_BYTE);
  }
  fbName =
    dyeA.format === HALF_FLOAT
      ? "HALF_FLOAT"
      : dyeA.format === FLOAT
        ? "FLOAT"
        : "UNSIGNED_BYTE(폴백)";
  [dyeA, dyeB].forEach((f) => {
    f.begin();
    clear();
    f.end();
  });
  shAdv = createShader(VS, FS_ADV);
  shStamp = createShader(VS, FS_STAMP);
  shComp = createShader(VS, FS_COMP);
  shSpread = createShader(VS, FS_SPREAD);
  shFlow = createShader(VS, FS_FLOW);
  shBleed = createShader(VS, FS_BLEED);
  shCopy = createShader(VS, FS_COPY);
  shSettle = createShader(VS, FS_SETTLE);
  tmp8 = createFramebuffer({
    width: SW,
    height: SH,
    density: 1,
    format: UNSIGNED_BYTE,
    textureFiltering: LINEAR,
    depth: false,
    antialias: false,
  });
  mkSet();
  bind();
  archInit();
}
const flowV = [0, 0];
let flowG = [0, 0],
  flowAcc = [0, 0],
  flowSeed = 0;
const flowing = () =>
  Math.hypot(flowG[0], flowG[1]) > 8e-4 || flowAcc[0] !== 0 || flowAcc[1] !== 0;
let bleedAge = 1e9,
  bleedSeed = 0;
const bleeding = () => bleedAge < BLEED_FRAMES;
function run(fb, sh, u) {
  fb.begin();
  blendMode(REPLACE);
  shader(sh);
  for (const k in u) sh.setUniform(k, u[k]);
  rect(0, 0, fb.width, fb.height);
  fb.end();
}
const swap = () => {
  const t = dyeA;
  dyeA = dyeB;
  dyeB = t;
};
const swapS = () => {
  const t = setA;
  setA = setB;
  setB = t;
};
const itemU = () =>
  item
    ? {
        uItem: item.tex,
        uC: [item.x / width, 1 - item.y / height],
        uSz: [item.w / width, item.h / height],
      }
    : {};

let selKey = "";
function syncSel() {
  const e = document.getElementById("sel");
  const k = item ? [item.x, item.y, item.w, item.h].join() : "";
  if (k === selKey) return;
  selKey = k;
  if (!item) {
    e.style.display = "none";
    return;
  }
  const r = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
  e.style.display = "block";
  e.style.left = r.left + item.x - item.w / 2 + "px";
  e.style.top = r.top + item.y - item.h / 2 + "px";
  e.style.width = item.w + "px";
  e.style.height = item.h + "px";
}
function draw() {
  syncSel();
  const t0 = performance.now();
  if (!dirty && !forces.length && !stampReq && !flowing() && !bleeding()) {
    busyFrames = 0;
    report();
    return;
  } // 유휴 시 모든 패스 중단
  busyFrames++;
  if (stampReq || forces.length || flowing() || bleeding()) markDirty(); // working copy changed (archive: unsaved)
  if (stampReq) {
    const it = stampReq;
    run(dyeB, shStamp, {
      uDye: dyeA,
      uItem: it.tex,
      uC: [it.x / width, 1 - it.y / height],
      uSz: [it.w / width, it.h / height],
      uSeed: Math.random() * 50,
    });
    swap();
    stampReq = null;
    item = null;
  }
  if (forces.length) {
    const F = new Array(64).fill(0),
      P = new Array(64).fill(0),
      use = forces.slice(-16);
    use.forEach((f, i) => {
      const s = Math.pow(1 - f.age / f.max, 1.5);
      F.splice(i * 4, 4, f.x, f.y, f.a, f.b);
      P.splice(
        i * 4,
        4,
        f.r0 + (f.r1 - f.r0) * (f.age / f.max),
        f.kind,
        s,
        f.seed,
      );
    });
    run(dyeB, shAdv, {
      uDye: dyeA,
      uF: F,
      uP: P,
      uAsp: asp,
      uDiff: 40,
      uTex: [1 / SW, 1 / SH],
      uFlow: flowV,
    });
    swap();
    if (SPREAD_ON) {
      const P2 = new Array(64).fill(0);
      let any = false;
      use.forEach((f, i) => {
        const sw = f.kind === 1 ? Math.max(0, 1 - f.age / f.max / 0.55) : 0;
        if (sw > 0) any = true;
        P2.splice(
          i * 4,
          4,
          f.r0 + (f.r1 - f.r0) * (f.age / f.max),
          f.kind,
          sw,
          f.seed,
        );
      });
      if (any) {
        run(dyeB, shSpread, { uDye: dyeA, uF: F, uP: P2, uAsp: asp });
        swap();
      }
    }
    forces.forEach((f) => f.age++);
    forces = forces.filter((f) => f.age < f.max);
  }
  if (flowing()) {
    const ax = flowAcc[0],
      ay = flowAcc[1];
    flowAcc = [0, 0];
    if (ax || ay)
      flowG = [
        flowG[0] + (ax * FLOW_GAIN - flowG[0]) * FLOW_FOLLOW,
        flowG[1] + (ay * FLOW_GAIN - flowG[1]) * FLOW_FOLLOW,
      ]; // drag: follow average drag velocity
    else flowG = [flowG[0] * FLOW_DECAY, flowG[1] * FLOW_DECAY]; // released: inertia, decaying
    const m = Math.hypot(flowG[0], flowG[1]);
    if (m > FLOW_MAX)
      flowG = [(flowG[0] * FLOW_MAX) / m, (flowG[1] * FLOW_MAX) / m];
    if (m < 8e-4)
      flowG = [0, 0]; // stop: no residual velocity
    else {
      run(setB, shSettle, {
        uSet: setA,
        uDye: dyeA,
        uG: flowG,
        uAsp: asp,
        uSeed: flowSeed,
      });
      swapS();
      run(dyeB, shFlow, {
        uDye: dyeA,
        uSet: setA,
        uG: flowG,
        uAsp: asp,
        uTex: [1 / SW, 1 / SH],
        uSeed: flowSeed,
      });
      swap();
    }
  }
  if (bleeding()) {
    const t = bleedAge / BLEED_FRAMES,
      str = Math.pow(1 - t, 1.2) * Math.min(1, bleedAge / 6);
    run(dyeB, shBleed, {
      uDye: dyeA,
      uAsp: asp,
      uStr: str,
      uPh: bleedSeed + bleedAge * BLEED_SPEED,
      uSeed: bleedSeed,
    });
    swap();
    bleedAge++;
  }
  dirty = false;
  shader(shComp);
  blendMode(REPLACE);
  shComp.setUniform("uDye", dyeA);
  shComp.setUniform("uAsp", asp);
  shComp.setUniform("uShow", item ? 1 : 0);
  if (item) {
    const u = itemU();
    for (const k in u) shComp.setUniform(k, u[k]);
  } else {
    shComp.setUniform("uItem", dyeA);
    shComp.setUniform("uC", [0, 0]);
    shComp.setUniform("uSz", [1, 1]);
  }
  rect(0, 0, width, height);
  report(performance.now() - t0);
}
let lastMs = 0;
function report(ms) {
  if (ms) lastMs = ms;
  const n = performance.now();
  if (n - lastDiag < 300) return;
  lastDiag = n;
  const gl = drawingContext;
  diag.textContent = `p5 ${p5.prototype.VERSION || "1.9.4"} · ${webglVersion}\nfloat target: ${fbName}\nEXT_color_buffer_float: ${exts.EXT_color_buffer_float}  half: ${exts.EXT_color_buffer_half_float}\nfloat linear: ${exts.OES_texture_float_linear}  maxTex: ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}\nsim ${SW}×${SH} · canvas ${width}×${height} ×${pixelDensity()}\n${busyFrames ? "ACTIVE  fps " + frameRate().toFixed(0) + "  cpu " + lastMs.toFixed(1) + "ms" : "IDLE (passes stopped)"}`;
}
function windowResized() {
  resizeCanvas(innerWidth, innerHeight);
  dirty = true;
}

// ---------- 재료 ----------
function setItem(tex, w0, h0) {
  if (item) {
    say("먼저 현재 재료를 길게 눌러 확정하세요");
    return;
  }
  const s = Math.min(1, (width * 0.4) / w0, (height * 0.45) / h0);
  item = { tex, w: w0 * s, h: h0 * s, x: width / 2, y: height / 2 };
  dirty = true;
  say("드래그로 위치 조정 · 길게 눌러 DYE");
}
function addImageFile(f) {
  if (!f) return;
  if (item) {
    say("먼저 현재 재료를 확정하세요");
    return;
  }
  const r = new FileReader();
  r.onerror = () => say("파일을 읽지 못했어요");
  r.onload = () => {
    const im = new Image();
    im.onerror = () => say("이 이미지 형식은 불러올 수 없어요");
    im.onload = () => {
      const m = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight)),
        w = Math.max(1, Math.round(im.naturalWidth * m)),
        h = Math.max(1, Math.round(im.naturalHeight * m));
      const g = createGraphics(w, h);
      g.pixelDensity(1);
      g.clear();
      g.drawingContext.drawImage(im, 0, 0, w, h);
      setItem(g, w, h);
    };
    im.src = r.result;
  };
  r.readAsDataURL(f);
}

$("#file").onchange = (e) => {
  addImageFile(e.target.files[0]);
  e.target.value = "";
};
addEventListener("paste", (e) => {
  if (document.body.classList.contains("intro-on")) return;
  const it = [...(e.clipboardData?.items || [])].find((i) =>
    i.type.startsWith("image/"),
  );
  if (it) {
    e.preventDefault();
    addImageFile(it.getAsFile());
  }
});
$("#bTxt").onclick = () => {
  if (item) {
    say("먼저 현재 재료를 확정하세요");
    return;
  }
  $("#modal").style.display = "flex";
  $("#ti").focus();
};
$("#mc").onclick = () => ($("#modal").style.display = "none");
$("#ma").onclick = async () => {
  const s = $("#ti").value.trim();
  if (!s) return;
  const L = s.split("\n"),
    fs = 54;
  // Prefer the bundled Chosun Myeongjo font, but never block text placement if it cannot load.
  let canvasFont = "Georgia";
  try {
    await document.fonts.load('54px "ChosunNm"');
    if (document.fonts.check('54px "ChosunNm"')) canvasFont = "ChosunNm";
  } catch (e) {
    canvasFont = "Georgia";
  }
  const g = createGraphics(10, 10);
  g.pixelDensity(1);
  g.textSize(fs);
  g.textFont(canvasFont);
  const w = Math.ceil(Math.max(...L.map((l) => g.textWidth(l)))) + 40,
    h = Math.ceil(L.length * fs * 1.35) + 30;
  g.resizeCanvas(w, h);
  g.clear();
  g.textSize(fs);
  g.textFont(canvasFont);
  g.fill("#44463f");
  g.noStroke();
  L.forEach((l, i) => g.text(l, 20, fs + i * fs * 1.35));
  $("#modal").style.display = "none";
  $("#ti").value = "";
  setItem(g, w, h);
};

// ---------- 힘 주입 (Matter.js 없이 단순 힘 — 테스트 3) ----------
const uvOf = (p) => [p.x / width, 1 - p.y / height];
function drop(p) {
  const [x, y] = uvOf(p);
  forces.push({
    kind: 1,
    x,
    y,
    a: 0.0014,
    b: 0.0011,
    r0: 0.05,
    r1: 0.12,
    age: 0,
    max: 70,
    seed: Math.random() * 40,
  });
  say("DROP");
}
function bleed() {
  bleedAge = 0;
  bleedSeed = Math.random() * 40;
  say("BLEED");
}
function flowSeg(p, q) {
  const a = uvOf(p),
    b = uvOf(q);
  if (!flowing()) flowSeed = Math.random() * 40;
  flowAcc[0] += b[0] - a[0];
  flowAcc[1] += b[1] - a[1];
}

// ---------- 입력 ----------
let el;
let down = null,
  moved = false,
  lp = null,
  hold = 0,
  fired = false,
  onItem = false,
  clicks = [],
  ct = 0;
// ---- two-finger pinch -> archive. Touch pointers are tracked by pointerId; the second finger cancels every single-finger gesture. ----
const ptrs = new Map();
let pinch = null,
  pinchLock = false;
function startPinch() {
  clearTimeout(hold);
  clearTimeout(ct);
  clicks = []; // no leftover DYE hold or pending DROP / BLEED timer
  down = null;
  lp = null;
  rz = null;
  moved = false;
  fired = false;
  onItem = false;
  flowAcc = [0, 0];
  flowG = [0, 0]; // single-finger gesture and FLOW input stop here
  const v = [...ptrs.values()];
  pinchLock = true;
  pinch = { d0: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y), done: false };
}
function pinchMove() {
  if (!pinch || pinch.done || ptrs.size < 2) return;
  const v = [...ptrs.values()],
    d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
  if (mode !== "edit" || AR.entering || Date.now() < lockUntil || item) return; // a placed material (image/text) is being handled: the pinch never opens the archive
  if (pinch.d0 - d > Math.max(40, pinch.d0 * 0.25)) {
    pinch.done = true;
    collapse();
  }
} // fingers moved together -> same save-and-collapse as the wheel
function ptrUp(e) {
  if (e.pointerType === "touch") {
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0) {
      pinchLock = false;
      pinch = null;
    }
  }
}
addEventListener("blur", () => {
  ptrs.clear();
  pinchLock = false;
  pinch = null;
});
document.addEventListener("gesturestart", (e) => e.preventDefault()); // iOS Safari page-zoom gesture
const pt = (e) => {
  const r = el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
const hit = (p) =>
  item &&
  Math.abs(p.x - item.x) <= item.w / 2 &&
  Math.abs(p.y - item.y) <= item.h / 2;
// corner handles: nearest corner within the hit radius (larger on touch). Takes priority over hit().
let rz = null;
const MIN_SIDE = 28;
function hitHandle(p) {
  if (!item) return null;
  const HR = isMobile ? 24 : 14;
  let best = null,
    bd = 1e9;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const cx = item.x + (sx * item.w) / 2,
        cy = item.y + (sy * item.h) / 2;
      const dx = p.x - cx,
        dy = p.y - cy;
      if (Math.abs(dx) <= HR && Math.abs(dy) <= HR) {
        const d = Math.hypot(dx, dy);
        if (d < bd) {
          bd = d;
          best = { sx, sy, ox: dx, oy: dy };
        }
      }
    }
  if (!best) return null;
  // anchor = opposite corner (fixed while resizing); ox/oy = grab offset so the corner does not jump
  return {
    sx: best.sx,
    sy: best.sy,
    ox: best.ox,
    oy: best.oy,
    ax: item.x - (best.sx * item.w) / 2,
    ay: item.y - (best.sy * item.h) / 2,
    ar: item.w / item.h,
  };
}
function resizeTo(p) {
  const r = rz;
  if (!r || !item) return;
  const dx = (p.x - r.ox - r.ax) * r.sx,
    dy = (p.y - r.oy - r.ay) * r.sy;
  let w = Math.max(dx, dy * r.ar); // keep aspect ratio: follow the larger projection
  w = Math.max(w, MIN_SIDE, MIN_SIDE * r.ar); // minimum size
  w = Math.min(w, width * 1.5, height * 1.5 * r.ar); // maximum size
  const h = w / r.ar;
  item.w = w;
  item.h = h;
  item.x = r.ax + (r.sx * w) / 2;
  item.y = r.ay + (r.sy * h) / 2;
  dirty = true;
}
function bind() {
  el = cnv.elt;
  el.addEventListener("pointerdown", (e) => {
    if ($("#modal").style.display === "flex") return;
    const p = pt(e);
    if (e.pointerType === "touch") {
      ptrs.set(e.pointerId, p);
      el.setPointerCapture?.(e.pointerId);
      if (ptrs.size >= 2) {
        startPinch();
        return;
      }
      if (pinchLock) return;
    }
    down = p;
    lp = p;
    moved = false;
    fired = false;
    rz = hitHandle(p);
    onItem = !rz && hit(p); // handle first: resizing never starts a DYE hold
    if (onItem)
      hold = setTimeout(() => {
        if (!moved) {
          stampReq = item;
          fired = true;
          dirty = true;
          say("DYE · 천에 흡수됨");
        }
      }, 650);
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" && ptrs.has(e.pointerId)) {
      ptrs.set(e.pointerId, pt(e));
      if (pinch) {
        pinchMove();
        return;
      }
    }
    if (!down) {
      const h = hitHandle(pt(e));
      el.style.cursor = h
        ? h.sx * h.sy > 0
          ? "nwse-resize"
          : "nesw-resize"
        : "";
      return;
    }
    const p = pt(e);
    if (rz) {
      moved = true;
      clearTimeout(hold);
      resizeTo(p);
      lp = p;
      return;
    }
    if (Math.hypot(p.x - down.x, p.y - down.y) > 6) {
      moved = true;
      clearTimeout(hold);
    }
    if (moved) {
      if (onItem && item) {
        item.x = p.x;
        item.y = p.y;
        dirty = true;
      } else if (!item && lp) {
        flowSeg(lp, p);
      }
    }
    lp = p;
  });
  const up = (e) => {
    ptrUp(e);
    clearTimeout(hold);
    if (!down) return;
    const p = pt(e);
    if (!moved && !fired && !item) {
      const n = Date.now();
      clicks.push({ p, t: n });
      clicks = clicks.filter((c) => n - c.t < 700);
      clearTimeout(ct);
      if (clicks.length >= 3 && n - clicks[0].t < 520) {
        clicks = [];
        bleed();
      } else
        ct = setTimeout(() => {
          if (clicks.length === 2) drop(clicks[1].p);
          clicks = [];
        }, 280);
    }
    down = null;
    lp = null;
    rz = null;
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", (e) => {
    ptrUp(e);
    clearTimeout(hold);
    down = null;
    lp = null;
    rz = null;
  });
}

// ===================== ARCHIVE (cloth stack) =====================
// mode 'edit' = existing work screen (unchanged). mode 'archive' = DOM overlay of translucent cloths; input is separated by the overlay.
let archLoaded = false,
  cloths = [],
  cur = null,
  mode = "edit",
  AR = { sel: null, p: 0, auto: 0, entering: false },
  db = null,
  tmp8 = null,
  shCopy = null,
  lastT = 0,
  wheelAcc = 0,
  wheelT = 0,
  lockUntil = 0;
const idb = () =>
  db
    ? Promise.resolve(db)
    : new Promise((res, rej) => {
        const r = indexedDB.open("absorb-archive", 1);
        r.onupgradeneeded = () =>
          r.result.createObjectStore("cloths", { keyPath: "id" });
        r.onsuccess = () => res((db = r.result));
        r.onerror = () => rej(r.error);
      });
const dbAll = () =>
  idb().then(
    (d) =>
      new Promise((res, rej) => {
        const q = d.transaction("cloths").objectStore("cloths").getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      }),
  );
const dbPut = (o) =>
  idb().then(
    (d) =>
      new Promise((res, rej) => {
        const t = d.transaction("cloths", "readwrite");
        t.objectStore("cloths").put(o);
        t.oncomplete = res;
        t.onerror = () => rej(t.error);
      }),
  );
function markDirty() {
  if (cur && !cur.dirty) {
    cur.dirty = true;
    refreshUI();
  }
}
function refreshUI() {
  cloths.forEach((c) => {
    if (c.el)
      c.el.firstChild &&
        (c.el.firstChild.style.display = c.dirty ? "block" : "none");
  });
}
const mkLay = () => ({
  x: 0.18 + Math.random() * 0.64,
  y: 0.2 + Math.random() * 0.6,
  s: 0.25 + Math.random() * 0.13,
  r: 0,
  a: 0.46 + Math.random() * 0.15,
  shape: Math.floor(Math.random() * 4),
});
function mkCloth(o = {}) {
  const raw = o.lay || mkLay(),
    lay = { ...raw };
  lay.s = Math.min(Math.max(Number(lay.s) || 0.31, 0.22), 0.38);
  lay.a = Math.min(Math.max(Number(lay.a) || 0.48, 0.42), 0.64);
  const c = {
    id:
      o.id ||
      "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    bytes: o.bytes || null,
    w: o.w || 0,
    h: o.h || 0,
    lay,
    thumb: o.thumb || "",
    dirty: false,
    el: null,
  };
  cloths.push(c);
  return c;
}
let clothDrag = null;
function ensureTrashZone() {
  let z = $("#trash-zone");
  if (!z) {
    z = document.createElement("div");
    z.id = "trash-zone";
    z.setAttribute("aria-label", "Drag a saved cloth here to dissolve it");
    z.style.backgroundImage =
      'url("data:image/webp;base64,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")';
    $("#arch").appendChild(z);
  }
  let h = $("#arch-help");
  if (!h) {
    h = document.createElement("div");
    h.id = "arch-help";
    h.innerHTML =
      '<div class="ah-line"><span class="ah-device">COMPUTER</span><span class="ah-action">WHEEL DOWN → SAVE</span></div><div class="ah-line"><span class="ah-device"></span><span class="ah-action">CLICK + WHEEL UP → EDIT</span></div><div class="ah-line" style="margin-top:3px"><span class="ah-device">MOBILE</span><span class="ah-action">PINCH → SAVE</span></div><div class="ah-line"><span class="ah-device"></span><span class="ah-action">CLICK + RELEASE → EDIT</span></div>';
    $("#arch").appendChild(h);
  }
  return z;
}
function clearDragStyle(e) {
  e.style.position = "";
  e.style.left = "";
  e.style.top = "";
  e.style.width = "";
  e.style.height = "";
  e.style.transform = "";
  e.style.opacity = "";
  e.style.zIndex = "";
  e.style.boxShadow = "";
  e.style.transition = "";
}
function trashContains(x, y) {
  const z = $("#trash-zone");
  if (!z) return false;
  const r = z.getBoundingClientRect();
  const u = (x - r.left) / r.width,
    v = (y - r.top) / r.height;
  if (u < 0 || u > 1 || v < 0 || v > 0.78) return false;
  // right edge of the erase silhouette, sampled down its organic curve (normalized x at each y)
  const edge = [
    [0, 0.8],
    [0.08, 0.83],
    [0.17, 0.85],
    [0.27, 0.81],
    [0.4, 0.73],
    [0.56, 0.62],
    [0.7, 0.43],
    [0.745, 0.24],
    [0.765, 0.1],
    [0.775, 0],
  ];
  let maxX = 0;
  if (v <= edge[0][0]) maxX = edge[0][1];
  else {
    let found = false;
    for (let i = 0; i < edge.length - 1; i++) {
      const [y0, x0] = edge[i],
        [y1, x1] = edge[i + 1];
      if (v >= y0 && v <= y1) {
        const t = (v - y0) / (y1 - y0 || 1);
        maxX = x0 + (x1 - x0) * t;
        found = true;
        break;
      }
    }
    if (!found) maxX = 0;
  }
  // A small tolerance corresponds to the soft pigment feather at the boundary.
  return u <= maxX + 0.025;
}
function beginClothDrag(ev, c) {
  if (
    mode !== "archive" ||
    AR.entering ||
    AR.auto !== 0 ||
    AR.p > 0.05 ||
    c._deleting
  )
    return;
  if (ev.pointerType === "mouse" && ev.button !== 0) return;
  const r = c.el.getBoundingClientRect();
  clothDrag = {
    c,
    pointerId: ev.pointerId,
    startX: ev.clientX,
    startY: ev.clientY,
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    moved: false,
  };
  try {
    c.el.setPointerCapture(ev.pointerId);
  } catch (_) {}
}
function moveClothDrag(ev, c) {
  const d = clothDrag;
  if (!d || d.c !== c || d.pointerId !== ev.pointerId) return;
  const dx = ev.clientX - d.startX,
    dy = ev.clientY - d.startY;
  if (!d.moved && Math.hypot(dx, dy) < 7) return;
  if (!d.moved) {
    d.moved = true;
    const e = c.el;
    e.style.position = "absolute";
    e.style.left = d.left + "px";
    e.style.top = d.top + "px";
    e.style.width = d.width + "px";
    e.style.height = d.height + "px";
    e.style.transform = "none";
    e.style.opacity = ".9";
    e.style.zIndex = "20000";
    e.style.boxShadow = "0 24px 55px rgba(52,50,40,.2)";
    e.style.transition = "none";
    e.classList.add("dragging");
  }
  c.el.style.left = d.left + dx + "px";
  c.el.style.top = d.top + dy + "px";
  const over = trashContains(ev.clientX, ev.clientY);
  $("#arch").classList.toggle("trash-hover", over);
  ev.preventDefault();
}
function endClothDrag(ev, c, cancel = false) {
  const d = clothDrag;
  if (!d || d.c !== c || d.pointerId !== ev.pointerId) return;
  clothDrag = null;
  $("#arch").classList.remove("trash-hover");
  if (!d.moved) {
    return;
  }
  c._skipClick = true;
  setTimeout(() => {
    c._skipClick = false;
  }, 220);
  c.el.classList.remove("dragging");
  const over = !cancel && trashContains(ev.clientX, ev.clientY);
  if (over) {
    dissolveCloth(c);
    return;
  }
  const dx = cancel ? 0 : ev.clientX - d.startX,
    dy = cancel ? 0 : ev.clientY - d.startY;
  const ar = $("#arch").getBoundingClientRect();
  c.lay.x = Math.min(
    1,
    Math.max(0, (d.left + dx + d.width / 2 - ar.left) / innerWidth),
  );
  c.lay.y = Math.min(
    1,
    Math.max(0, (d.top + dy + d.height / 2 - ar.top) / innerHeight),
  );
  clearDragStyle(c.el);
  layout();
  // Persist the new card position if this textile already has a saved bitmap.
  if (c.bytes) {
    const bytes = c.bytes;
    dbPut({
      id: c.id,
      w: c.w,
      h: c.h,
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
      lay: c.lay,
      savedAt: Date.now(),
    }).catch(() => {});
  }
}
function dissolveCloth(c) {
  if (!c || c._deleting) return;
  c._deleting = true;
  c.el.classList.add("dissolving");
  $("#arch").classList.add("trash-hover");
  document.querySelectorAll("#absorb-water-dissolve animate").forEach((a) => {
    try {
      a.beginElement();
    } catch (_) {}
  });
  setTimeout(async () => {
    let saved = true;
    try {
      const d = await idb();
      await new Promise((resolve, reject) => {
        const tx = d.transaction("cloths", "readwrite");
        tx.objectStore("cloths").delete(c.id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      saved = false;
    }
    const idx = cloths.indexOf(c);
    if (idx >= 0) cloths.splice(idx, 1);
    if (c.el) c.el.remove();
    if (AR.sel === c) {
      AR.sel = null;
      AR.p = 0;
      AR.auto = 0;
    }
    if (cur === c) {
      cur = null;
      item = null;
      stampReq = null;
      forces = [];
      flowG = [0, 0];
      flowAcc = [0, 0];
      bleedAge = 1e9;
      try {
        [dyeA, dyeB].forEach((f) => {
          f.begin();
          clear();
          f.end();
        });
        clearSettle();
      } catch (e) {}
    }
    $("#arch").classList.remove("trash-hover");
    layout();
    say(
      saved
        ? "天이 염료처럼 사라졌어요"
        : "화면에서는 삭제했지만 저장소 삭제에 실패했어요",
    );
  }, 1750);
}
function buildEl(c) {
  const e = document.createElement("div");
  e.className = "cloth";
  e.innerHTML = '<i style="display:none"></i>';
  e.style.clipPath = "none";
  e.onclick = (ev) => {
    ev.stopPropagation();
    if (c._skipClick || c._deleting) {
      c._skipClick = false;
      return;
    }
    if (mode !== "archive" || AR.entering) return;
    if (AR.sel === c && matchMedia("(pointer:coarse)").matches) {
      AR.auto = 1;
      startTick();
      return;
    }
    AR.sel = c;
    AR.p = 0;
    AR.auto = 0;
    layout();
  };
  e.addEventListener("pointerdown", (ev) => beginClothDrag(ev, c));
  e.addEventListener("pointermove", (ev) => moveClothDrag(ev, c));
  e.addEventListener("pointerup", (ev) => endClothDrag(ev, c));
  e.addEventListener("pointercancel", (ev) => endClothDrag(ev, c, true));
  c.el = e;
  $("#arch").appendChild(e);
  updateEl(c);
}
function updateEl(c) {
  const w =
    "repeating-linear-gradient(0deg,rgba(255,255,255,.12) 0 1px,transparent 1px 4px)";
  c.el.style.backgroundImage = c.thumb ? `url(${c.thumb}),${w}` : w;
}
function makeThumb(b, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d"),
    im = x.createImageData(w, h),
    d = im.data;
  for (let y = 0; y < h; y++) {
    const sr = (h - 1 - y) * w * 4,
      dr = y * w * 4;
    for (let i = 0; i < w * 4; i += 4) {
      const k = 1 - b[sr + i + 3] / 255;
      d[dr + i] = b[sr + i] + 245 * k;
      d[dr + i + 1] = b[sr + i + 1] + 242 * k;
      d[dr + i + 2] = b[sr + i + 2] + 233 * k;
      d[dr + i + 3] = 255;
    }
  }
  x.putImageData(im, 0, 0);
  const t = document.createElement("canvas");
  t.width = 420;
  t.height = Math.round((420 * h) / w);
  t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", 0.88);
}
// GPU -> CPU readback happens ONLY here (save / leaving edit). dye -> 8-bit premultiplied copy -> readPixels
function snapshot() {
  run(tmp8, shCopy, { uDye: dyeA });
  const gl = drawingContext,
    prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.FRAMEBUFFER, tmp8.framebuffer);
  const b = new Uint8Array(SW * SH * 4);
  gl.readPixels(0, 0, SW, SH, gl.RGBA, gl.UNSIGNED_BYTE, b);
  gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
  return b;
}
function restoreBytes(b, w, h) {
  const gl = drawingContext;
  let src = tmp8,
    tmp = null;
  if (w !== SW || h !== SH)
    tmp = src = createFramebuffer({
      width: w,
      height: h,
      density: 1,
      format: UNSIGNED_BYTE,
      textureFiltering: LINEAR,
      depth: false,
      antialias: false,
    }); // other resolution: stretched by LINEAR copy
  gl.bindTexture(gl.TEXTURE_2D, src.color.rawTexture());
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
  gl.bindTexture(gl.TEXTURE_2D, null);
  run(dyeB, shCopy, { uDye: src });
  swap();
  if (tmp) tmp.remove();
}
function stash() {
  if (cur && cur.dirty) {
    const b = snapshot();
    cur.bytes = b;
    cur.w = SW;
    cur.h = SH;
    cur.thumb = makeThumb(b, SW, SH);
    updateEl(cur);
  }
} // working copy kept in memory (never written to DB here)
function persist(c, quiet) {
  c.dirty = false;
  refreshUI();
  return dbPut({
    id: c.id,
    w: c.w,
    h: c.h,
    bytes: c.bytes.buffer.slice(0),
    lay: c.lay,
    savedAt: Date.now(),
  })
    .then(() => {
      if (!quiet) say("저장됨");
    })
    .catch(() => {
      c.dirty = true;
      refreshUI();
      if (!window._sf) {
        window._sf = 1;
        say("자동 저장하지 못했어요 (저장소 사용 불가)");
      }
    });
}
function saveCur(quiet) {
  if (mode !== "edit" || !cur) return;
  let b;
  try {
    b = snapshot();
  } catch (e) {
    if (!quiet) say("현재 상태를 읽지 못했어요");
    return;
  }
  cur.bytes = b;
  cur.w = SW;
  cur.h = SH;
  cur.thumb = makeThumb(b, SW, SH);
  updateEl(cur);
  persist(cur, quiet);
}
// autosave: every 5s while edited and idle (no drag / flow / bleed / drop / stamp in progress)
const autoSave = () => {
  if (
    mode === "edit" &&
    cur &&
    cur.dirty &&
    !down &&
    !forces.length &&
    !flowing() &&
    !bleeding() &&
    !stampReq
  )
    saveCur(true);
};
function showArchive() {
  mode = "archive";
  document.body.classList.add("arch");
  $("#arch").style.display = "block";
  lockUntil = Date.now() + 700;
  startTick();
}
function collapse() {
  if (item) {
    say("먼저 재료를 길게 눌러 확정하세요");
    return;
  }
  try {
    stash();
  } catch (e) {
    say("현재 상태를 읽지 못했어요");
    return;
  }
  if (cur.dirty && cur.bytes) persist(cur, true);
  flowG = [0, 0];
  flowAcc = [0, 0];
  forces = [];
  bleedAge = 1e9;
  AR.sel = cur;
  AR.p = 1;
  AR.auto = -1;
  showArchive();
  layout();
  refreshUI();
}
function enterEdit(c) {
  AR.auto = 0;
  AR.entering = true;
  try {
    if (c.bytes) restoreBytes(c.bytes, c.w, c.h);
    else {
      [dyeA, dyeB].forEach((f) => {
        f.begin();
        clear();
        f.end();
      });
    }
  } catch (e) {
    say("천을 불러오지 못했어요");
    AR.entering = false;
    AR.auto = -1;
    startTick();
    return;
  }
  cur = c;
  item = null;
  dirty = true;
  clearSettle();
  flowG = [0, 0];
  flowAcc = [0, 0];
  forces = [];
  bleedAge = 1e9;
  mode = "edit";
  lockUntil = Date.now() + 700;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      $("#arch").style.display = "none";
      document.body.classList.remove("arch");
      AR.sel = null;
      AR.p = 0;
      AR.entering = false;
      refreshUI();
    }),
  );
}
function newCloth() {
  if (mode === "edit") {
    if (item) {
      say("먼저 재료를 확정하세요");
      return;
    }
    try {
      stash();
    } catch (e) {
      say("현재 상태를 읽지 못했어요");
      return;
    }
    if (cur.dirty && cur.bytes) persist(cur, true);
  }
  const c = mkCloth();
  buildEl(c);
  if (mode === "edit") {
    showArchive();
    $("#arch").style.display = "none";
    document.body.classList.remove("arch");
    mode = "edit";
    enterEdit(c);
  } // instant: current cloth is kept in the stack
  else {
    AR.sel = c;
    AR.p = 0;
    AR.auto = 1;
    layout();
    startTick();
  }
}
const ease = (t) => t * t * (3 - 2 * t);
function layout() {
  const W = innerWidth,
    H = innerHeight;
  cloths.forEach((c, i) => {
    if (clothDrag && clothDrag.c === c && clothDrag.moved) return;
    const sel = AR.sel === c,
      e = sel ? ease(AR.p) : 0,
      L = c.lay;
    c.el.style.transform = `translate(${(L.x * W - W / 2) * (1 - e)}px,${(L.y * H - H / 2) * (1 - e)}px) scale(${L.s + (1 - L.s) * e})`;
    c.el.style.opacity = L.a + (0.82 - L.a) * e;
    c.el.style.zIndex = sel ? 1000 : i;
    c.el.classList.toggle("sel", sel);
  });
}
let ticking = false;
function startTick() {
  if (!ticking) {
    ticking = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }
}
function tick(t) {
  const dt = Math.min(50, t - lastT);
  lastT = t;
  if (AR.auto) {
    AR.p = Math.max(0, Math.min(1, AR.p + (AR.auto * dt) / 700));
    if (AR.p >= 1 && AR.auto > 0) enterEdit(AR.sel);
    else if (AR.p <= 0 && AR.auto < 0) AR.auto = 0;
  }
  layout();
  if (mode === "archive" || AR.entering) requestAnimationFrame(tick);
  else ticking = false;
}
function onWheel(e) {
  if (document.body.classList.contains("intro-on")) return;
  if ($("#modal").style.display === "flex") return;
  e.preventDefault();
  if (Date.now() < lockUntil || AR.entering) return;
  if (mode === "archive") {
    if (!AR.sel) {
      say("천을 클릭해 선택한 뒤 휠을 위로 굴려 펼치세요");
      return;
    }
    AR.auto = 0;
    AR.p = Math.max(0, Math.min(1, AR.p - e.deltaY / 700));
    layout();
    if (AR.p >= 1) enterEdit(AR.sel);
  } else {
    if (e.deltaY < 0) wheelAcc = 0;
    else wheelAcc += e.deltaY;
    clearTimeout(wheelT);
    wheelT = setTimeout(() => (wheelAcc = 0), 300);
    if (wheelAcc > 160) {
      wheelAcc = 0;
      collapse();
    }
  }
}
function archInit() {
  ensureTrashZone();
  $("#plus").onclick = newCloth;
  $("#arch").onclick = () => {
    if (mode === "archive" && !AR.entering && AR.p < 0.05) {
      AR.sel = null;
      layout();
    }
  };
  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("keydown", (e) => {
    if ($("#modal").style.display === "flex") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveCur();
    } else if (
      e.key === "Enter" &&
      mode === "archive" &&
      AR.sel &&
      !AR.entering
    ) {
      AR.auto = 1;
      startTick();
    }
  });
  setInterval(autoSave, 5000);
  addEventListener("visibilitychange", () => {
    if (document.hidden) autoSave();
  });
  addEventListener("pagehide", autoSave);
  cur = mkCloth();
  buildEl(cur);
  dbAll()
    .then((list) => {
      if (!list.length) return;
      list
        .sort((a, b) => a.savedAt - b.savedAt)
        .forEach((o) => {
          const bytes = new Uint8Array(o.bytes);
          const c = mkCloth({
            id: o.id,
            bytes,
            w: o.w,
            h: o.h,
            lay: o.lay,
            thumb: makeThumb(bytes, o.w, o.h),
          });
          buildEl(c);
        });
      if (
        !cur.dirty &&
        mode === "edit" &&
        !document.body.classList.contains("intro-on")
      ) {
        cur.el.remove();
        cloths.splice(cloths.indexOf(cur), 1);
        cur = null;
        AR.sel = null;
        showArchive();
        layout();
        say("천을 클릭해 선택하고, 휠을 위로 굴려 펼치세요");
      } else layout();
    })
    .catch(() => {})
    .then(() => {
      archLoaded = true;
    });
}

// interaction guide toggle
$("#helpBtn").onclick = (e) => {
  e.stopPropagation();
  const h = $("#help");
  h.style.display = h.style.display === "block" ? "none" : "block";
};
document.addEventListener("click", (e) => {
  const h = $("#help");
  if (h.style.display === "block" && !h.contains(e.target))
    h.style.display = "none";
});

// ---- intro ----
// FABRIC_SRC: embedded source photo of the pastel translucent fabric; also used to seed the initial dye layer.
const FABRIC_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAaEAAALuCAIAAACILD6xAAEAAElEQVR42uz9WY8kS9IliB0RNfOIvLfqW3uZafSwAbKJngG754GP/AP8+8QATc6gGyTQ/X1VdevuuUW4mYocPoiaudriHu6xR6RpXWRFRrrbqioqy5Fz5IcffgAAgCQAEYm/jj880Yjjx0nPOWP9yecccd767Pe7EpKzL84e+JmnqJ/SQ57Jse+6++rvVXX9i86Ljn/peS++L9jqwzz+nP3C5+bj0erFcvT6h+d2wR2sPatj711ELpqcs+dw7ymkR+7rnPdYnzTxsuNfPK+AZvaMxgdxzOIcO9bz2MTHsln3OPv4xftdCcmZWZ8d5x6nWH13T/2cH3jSY8e/9Kmenoezhzk+/Ie/yvq0taU7uiYfMG+PXersFdRm60wfpf7k/R7Fsc/rGTa9vnjl09oBAZrVSfAM/tF40nqbPXHql/LjTjie9/v6bCNdnaCX2s1ns3H1Nc+u/4Hj0n376PWrLp/zbM9+mP+LY1vUI9k4rt7+7PgnYoL4+cznOS5AvdjfvOceNrsAvTAOuMe8bWYG7s4vPNY+fKltfR7L+3psykv5y+dYt/pRyBPf76W/h/j6dT6Sjbv4ji+PVVdjT1U9EZOeiM3vtDh3uhePO89nTqiqXBTz3uM6m0u35cd6FsvjPE8+7t6R5om96ClitNdg0895FPLEz//Y54+ugWnecJzbdT7xEZ/tnWEv5f4zhTx4gbUnWv/+mI07PnzVfX4sv+nE3jzLHpwf2z7Uxi1jqPvNgHvM3Yti1UeflPe7u8cN0N6QH7c0EI/7KB7rOYisB9TH/IjLrfT60zj6HORp58kyhXJXMUGW2T1cXvO5R81hmV4kSRF9yr1Q6lh1ZmueYY29VB7wsYK1B9rK2qyfbzuO5e+eeh9erqhyBD7m8R/jffGYy7C62IBL/QjWz//uOibShVPEcTzveeznY/+6ZoPW4ROP5U+dn1cdJ7AfeYuXvfXTseqjmJj3XVfF8WLWQ0Kb1aV4v6LqY9Ulz3k+51ztU9eIjp73vMf1hsaxK5+5CMd+PpEXwxNgxU7nFu7cfp5iNOcsrXPu/8y1Mfv5/Cd76Zo8lmh4Ct/nnLHqw9eTcvYi7o17OvGI6iim3m+nOWC97BVc6Mc9ZC6dY9Pr0OfEq3+APz4ahcOfp/2Lpat1wgaRugxwRSAlxlxcC1di4jFgXzqJj1U/vTTOOzbfhGdZ9tkcvjObtO7HPXBhv7b9/B2MR9n0ViO1F7yep/BoHuvz38IQ0ZOB3UNt2Tl24Mz3sjrf7oHfbC71vB4IEHv82OSNT+L65a2CeB6OPR6/fmJenvkYl9fzWDvMsTVwIqg/MU8u+Py98mWXDJ2GhCtV0en1+2PNq9XfvhQ+4dh7OVp3lsUFn7Q/k+PX2Uket3EPhEHfaSvfkA16FB/+HNuxmhx5XGfkGJT0fmbu0Z/zseu51Naf//mX2iKP79kvOQ8f1197yHs5Nt8uxv3dI1Z9SE33NVu3p/YTT6c7l2/x/ErZ+Wdf4icu7Vh4rOs5x9KtTrwzVggfJex49JuqC+hn9iO/xT3+0s3s/Jlwjv+ONfzmo8Wqd9qIV163feux6p3v5USx5ZuOVS+dVxfPw5Xd5R71vcepjz39Ijpzlt4vJXfOe18WH14sVn0rebQXiVUfMTY8Ezu6xaqvZl7xBefhU8c3T008sYIcPCdWxTecjHsHAcIxLp1j/ByvxKs9beZe0Ba/7UEF7NH97oum7hPt2SdO0VzKhXIp79tpvoRzvnUMJlbjvE70JK9ewDLndWyM2MU7c1K1ETkfWnmPbe2iOefuq7DES3m+ljmy8psLe3qEl01or/0aOWftCe76wuRZXbyb6Ik7StPn44AoFzEil/5atRWdtVfh7H6Ytdj5EXZQ1XRv/+50VHca7XS2fSxfcbDBNl6rC/Z01/OIDs7mK9251PhtzLRXOzYb91Qz74E8q8eMyGuzKZuNe5Hn/MC+6c3GbePxZ+cDEbx4AsqTt2ErN2flG3j7m437hvbnR/eVHt2vPDNieut18/fqH31r97vZuJecVe8jVv0G18xbnEWbH7eNp/LLHpg3eXisulqqf0Qu3M2WPbONeyJ/fLNx27hszT+KBXm44OGqmXvc5fFYRzuej9v8lyefae/cxl2KZ7n3XJ+1TJ7+/KrrsXrA++lynn/2Y/i+Y9dzGnN7kVE4EQbWWlPx12M4RzO76G0eC42P6W88lo07yp2Np+qpeKzYUI4fYSRKvrNBdTzd+fP5ZXmzL8WNHjvOcn7e7+5OYOg2P24b23iNMel2v28sVn2Iiug2tvHuV/idGoAvlYB7B4m/5tne4nt6atvYxrYu3spz3mLVbWxjG28GA3RPDelnuKZvB6+/jW28p3XxYvpqj3fe58vHbbiebWzjznWxLZAtVt3GNh5j6g+WhI/qNgXuQwEfOJgutVjPoN3+rY1m+QTP4aU6n+juUvzaab3Ue2BZT3zsnH+a4bbuxDGdow36wB7VmcLWCcEtDAW7eF8zYN3ydEuc3Ql4/TnzZIXvT/Si4+hxDrjZpB347BbIylDGKoJNaThsOaPBAFD0yLz1g0EMxSxJs6sVXd4pIOVP8Bi/3viUinDq8MTsHrHbJTzb6aJ1cQFO8FGt8L3X+9KaXezHvfL2yW1s4+71E/bupJM1rJNKsyJsxzlrRB7fQ9zGQ/24e5u5x5KkebXjWzPi7+9+jzEPc/QUp585apvCI3uhab5xHzyfjduSo5sNeut5IpcSs/nTsfRu49XY6K3msI33tQfgLGeLAq/8uKnf5wBAv9uz28ZbsK3NPb7z1ELCm9/0Cu/33eQiRoNFAag8lBR49H7l5efDFqs+qx+3lbG38crXXu3NhZ/mMwM3GC9yrNy6gBgqEvHLae08jmTbS3/nseoMTLBpZ2x+5VuMZ10KMR0FgA6AExfQBQrfntL78eMi9gwVzhkl2aoNvh9f28PX6mnVxeUHZtd5rP57Ju3dpbgw3AWyufO8qrpavx7xaxc9wPGaT0sRnoDaLfnCZs959k/L51AQT87HCgtWKZcJUg5x54iW2zVNl7OZqaqoAoSKpCZ32O9777tdm77/cNWo9t3tzX5/vdsBHtg6Tp2/J/JrztH5Pf84y1l6OrlU4yjrv+JCbdPTPI/n43DP9LGeKlbdxjv2157uvM9AqzUrDtRw4LJoASdFIKqZnvf7n3/+/PXrjQj+8e/+dnd9RcsOXl1dOUw3j/l9+HHbI9js3ROda11H4vkzQSx+kKqSyGYERbXf59+/3PzTjz9++Xr7oW2uvvvwnZvREtnuGstOgYCgSjGYCvGXShVsSfB7P7fmra/zl3r3z3Y9s4j1bc31OvB5ppyGHI31UkoCGKgkyS73n758/u3r5z5Dm/Rlf/u1v/5u1wgku+HQ3uCYtAMptmzd5bb4BfPIur2V12wgasT126o2zLDir+T6I8fkAnfv+/62627M9HrHXfO523+6uXVVbZt931NA2WzZexibjXsDfusbraWeIzz0FMPl1J4RafUu951lCpgUV1eW0pfu9svtjdGp4jBZHUND+0tZ55Ur2sa7iVU3Y/cWY42Hx6qPtpmrujtFVdXgfd+bWWqbD99/xzZlMwX3nm/67rpRbRsXpOkdb+bkjcaqWz7uLV3PMxiLx5qjS6zM/a78Hs95pBU5HESgInSnQJLS0Budos3uw/fp1ulukIaSui73jV01LYwFK8JCB7dVWd/oaDBFRb044fISxXP6Ys7E610KZ7vz+OfYgjtVNU+v4TGHVYs2PfV+OCIl6wyaqs5+s8SmjRdZT6HlbfLs915+1iPPee3rUkwSREQIEQcgCgEckKQukh3Z3KmUHcQd7m5te/WhbW8+f7lp2u/+8V/tP328Sg0ohANRDDanA1DhzKU7rSv6eOmjYzhNPfI8lzMz/vRznv/414KUXqzHozi7I5mCEuazvngBjtLCHMPZXbrnkdzycds4d3tYAkpfg0O9fs3TheBFzFkJdcAgLuoUG1rvh4WvNBSwKmVmcUQpmzP3Rv24bbyD2PkpTNvqXrrc6s/54qt4X1IcVXePKxx/EECcEDGznLMMJk42m7bZuG28b8ftHBP2yn06AKCyWGS4wTLd3ehucHdRoZcwPOfcdd31KuH74Y9tvKWxxarbWDFPs/h0hlSY/Tz72Ou4DceAbnMUZQCquMDo2c0p9OLHKQ+wkrBxSLpq8TesxmbjtvE+vblVB20pnfNqo3UGaxKUZO+WHQ4amN2ixjJ2jPeW932/5BcYihibjdti1W/PBLzve7x3rPoaUnJeRZelQi0Ilh0SDnHKrFKcc+77XkQcSOXWKARDN4trBcvq69vY/LhtvE/z/RYsvgICqlOitGoLKEzNMwaAVferQrA1xr8zP+5SnNrsM/fuT3yeBqAT0mL1jZ+4i8ea7qdxVTXu7LGOf+ebvRMMdYyz7DS45PyTnvOER0s0GylJ1E0BaDCXgU6m3fVtzl9u9/ucISoqRtz2WUTgvGpaMxO6qvZ9b3TVUlulQOLy4n9y7vw/ff0n/nV85mMErapmthpBP7X/eGw9Hr/+o3xz64vuyOku5W08wZe3xapbTPomn+q5RwiaR2oUUo3iFINkBz3UaSahjIMRz0aoq3wthdQ794y3lfp4zmzGZuO28eb3jAm7rAAqRdK+QECEItnMzKKQStDI7GZ0qRopgt6OpJMiMutX3TiVHt3MxVPfbNw23vl44H6+CE/mvO0OgMg59+ZGJ8Qplr3L5u4UIVEi0SE7QXK1tqCA8zIpwi0OOGHmnud0m43bxgv4cY+iRL6a/ltVriDZWTZjNB+TzG7ZzSijF0fSSIAGGuZJHAWELym0OrvBY/okr9bvXvYyb7Hqa4+tNqzAwzfz2tLdW7tk+fMsUe0uTpi5mRvVNbnQ3d2rl+hEpOEOftzEwG1ji1W3sY2Xj1WXR47qZPb4AUTITcHA9YrhGKwGbJiPsKof5a5XQ7w3x33/IrHqtkVt41X4xU9wcAXUIQaSCFgcS8OCsnbiqAyrJwe/QkghBD625VPgeBXh6hZJPI4fdyku5s2VsVczBTgOT5vh5pbHeSw84LF+qcdKXRUDoIrH4Ds702bN+O/quTReyfKfxi6r5WMZsWMHJdB4XEgDik0JGKXP/b4npHX2DgEl536/3+ecG1VIIilJc5evm1YUXdeJSIIkiCISdu4ydE2cpCNb0hmc4B9c2qyRir1+R5gSCK5+q85Cjsc5ct6Eu/GS449e882d866X7IGzJXPnKrgfIvVYK+Fz4OO2fNY2nmJPOjaphn9ViDjEaaQ4vHe6QCQ5aebuLoSohF0EhSylBscBnjraMw6dYfp4hEtLS/RAJ/dJfGQq3rh2T/Pa6jKb7fuWDVm97GcMKMe269kHSv9D1SpgZTD8O3fPOeecw1GSlEiLT7oLQeA5EkbLUOCB1cYNpHJxrLqNl81Pbbb+zmd1NDwRCOACzzSz7HCHmSE1IuLGnLO7A6KqohrY4GLj5JE1Eo+937oX7eEZj9dM+vL+bdylegjb+MaduFlC585O2FUDh8L3y+husIHvl+Tg1FFEVZVV+ZWM1vu3tMEscWfbeGis+livf/NftvEoserKtgqIgC7Zc2+sd1m6hNcWje4i4gcDx7FN4hkm4cN9t2dxGhSwzY/b0gSbrX+BZ3VUTQIJIqSYj3k4RlhKEXoxZ6qNaiNIpI2qDngCCP757COPa+kec/4cSsnnrOVXN283G7eNN+/61YEqRSggD9o0XpgtE6kk6RBJIgxkRunSP2AvXnJ7u1+/x1tEAj+rjXugNvDBqa2wPHhAQ+KTbEQPCL1Xr2emQHqMNeycXfoYx9algM8T/Fln3vj56KdlLHkpzu5Oudvzr2ryAYGBUM3m+9zvcx/vqnd3QrShed/37t62rWrT5+yzVB3JpIuIWESgKgDERY7f5vmTtkaxzXCCF72FSSR+BtvjMj/+uIyNZ3qm1Txf99AvHSNeEgsWy+aJjMW2sWzjpcaADjE3UOhUd8eB5Zy4S/X+eZiQl9vYI66abzDXccwt2LAj23hfBk7QZ9/3fW85WJUGj+kQvQohktwlVGxQdQs8m2l4as7LxztU3ddxjgl+ScDwatT1+H7c0l3cFt42nifJQIDU0IF2d1KgyUACAphZzoEaSbF2Q3jQFv15WxTypp24WaKseU/39o376tvAwA0XtVKIoEpThu0bQ8IZuVP912ewccfyVo91alU9Fsg/qZ8or4+zoHnqE2xjG88XqAI55xEBR2oge0UE0Gjr8lAVnO72Dw9Vt732lfg6dak99rMtH7eNdzW6rsuWR86PnLMjaUrhx0XbqpaGVs7ITh7dmTq9Jp+UD+7btK1Pm497KS7mbXyzMWn5QSAEodGjkHN2cwHoAqdlUl20CbUtUobEuTqsZhAhKU4k0Wlm/ekozpeUxU/xfF79i3w0XpNHi1XP9MnPN21vd8O5SB/+TNzQncCx08d/dNz8iaPdyY/2SGfWaTAKSqmXppQA7c0UitR4tq7L7NhAHbRMuidV0USR2/3e3CkiKWlqISnMGik02zWN4iow+k3TJIiKaOjZxO0A4qHipXJyRZ352OvndgxpePotnO5RfUjR72F6vgkDsroQ+q2ti+EMQUyQpofwxWXXSQQ5sWGs3uwWqz654dvu96H7/DDvl+f1mNySBMjOnLNSATiddPGwGhJE5+6TBaCcLjwSUnBz8yZZHlaWbOm1M7bDs7Pzuuk5bGMbp9bSoM+gkXrrui5+rltQ45MDn1KBhjjM3QIbPF2Kz7RFvde9cLXz90Secc38PbLV22zcO/Gb3m2OWRxr9OJVHS0F9XnOue+tVTWw0MEhicBJM+ScnQQ0BB2GioOJHDDAGPqKTlMNP51deE9O3PgMHwutstm4bbxju+5rNi5FE2o0MOTecnZ3N+Whn0EFAjotCqzRdCoUJdyPpbqLjdti0vey1242bvOz3vr9qmXr+97MIvHs7uZOTcEuwmy5twhDQ4ymfA1MUhRZRhTJwQd54us/xmXw1mPYJb7itNjgsVj1EZ/DZuM2m/Imhq87XDhEqaQ0zS7nbiS8DM64kHQoZm369ZSSu637ceBFz3nDSI3PYQk5fNmHs+mrbuPNDiqgoJgxWJFUlaTD4vfQJEguauagikiSIkoo8MCGvOwm8S7bukcYxysByTaX8o49m2My38efBod170lW81WV7WLgXLzolh+Lv+/Yv572+86/ktM4rHvEXGfeeC2fOlQGVERy723bQvTrzc3t7S0pAu373kEzc2PbtAByzhHGmnnTJlWNlFzSZGZu5s6mafq+V9WUVESurq4WvV0kweLaXeZHH3vCSzrC0/P83jP/ToKTx13vq3q496Coq/Fu52i8Hpv5z6Gv+symcBvfyFBVUsxiTekgPCNucIAqFFBgEDoMVbGv4EOcNMCBCV7k6abZ1rj6UkZgy8dt402OlJI7+74fqUTcaeYzxfhSY3UJuvMivSrUIqPqYeDi96FiE38+nYF7H7WFpzbZy76Rez+xzcZ901vcW77fZNZ1Xc65AOjckd1KXKMHDWn3CHhVBlsmAoOLWw36lWE87sM8xmW/jYse3UPeyGbjXqlt2hbDMMLVWpF3iVybOwVplkErhHF5bG/QgArLwDgyHMUiuydyOMUTsQFvL/Thj0sODcTv0cZttmAb9QhSXzMjS89CUeESCEpbuBkt+6hILyKCpOIuEHfCxt6GejrFodIWq74XV27z4zZ/8E2OyMS5+4TogirqjjB7MuqriqpUY/TjloGkOwNP14o++ip9T6/jGebbMhN3Gk58bGz4uG28/ljVJxhgKqg2lFQnwo9aOlIxcI2sqXBpjZYY/skrM+dx5JE27rH447aY477PSoY/71VXXao6LpFfS/u99L0DfrmkGVge/36++hPNj3sfdlUA+LXlLy66/tNv5LF0Wmdb8QmFI5KAQ1yTAsh9L5JSap3S93l/mwWpaZKZmXVmBIz0bLZrr5DS7U3XdX0Ag7NnFY2CKenu4i5gIzBRNacQmmS3a5JbzvnzzdcPf/gbotQuBNEAxns0sdbzv77ZY7qo4+dXw7THinnP/9YDUcrHqqIVHnCpdZUwYOLKx1ioGVj45i6b/5sft43Xv6OzRgK708wAZe1fSemxFyigbnB3t0MJouBCREAl6QY3Rs1VBydOCJdI5JkXfjrF06vpbbm5M2aBHv688NluNm4brzzvoxE/hp3CoNIwa4ocf1DV0urgPlZaBSmlNALfxsLCrKmgUMu5d123evxHdNVnDE7fuJl70p62F6s5bLmJbZw5+2tYr5vknHPvAeFdDevc3cyz04N9qcL0+uIrs9LqaOOGKSqDK/gkM7aO3L9NM/fUOZ9Nl+stvftvds8gAaqokBz1oUPifpkhE0mevbfCkkkIBnqf0X0rGeSBZ2l07kp3hLPv+2d+0duW/3Rji1W38brnJ0eMrrojGuzr4HHuxIHZzcyy00U9OIGlVA+W+0EdvQbbUrhyW6z6bCZ+Kf7wuACUzcZt4/U7cqrahOmpuTADEFfloUtyLRPZZ/rQotKoNJgm4+pSRrGpqqPC/MyMPlGsemK1f4NRyzedj9tqT99y2C4iIil07umi6SiHpVPGQgMFoIZFDOPFgd+cKNGsiETAW2f98IxM5/fDtW7jfDvTHMM3HbMpx/itlnqRx2zZMRd9iRt6+NQZN+r6r/W1PRbNWe0IjDv/KtbpqXfCh99L7bYcuqCOqMkt00mnE0yrKfZVcdLSc2q+2+1E0s3Nzc3NPvBuZnQ/TBinqxbICMk+W2+uqgJ1ySml3W4HwMwC8huVWff4FsxMVTWJmeXMFodYdWxwhYTajcAv5vurn164kOPcqOPicZbOfn5ZJ+MYqe+xLqtj6+v46dZ1mU/Yn6Uc7YmFvGFHtvE2ohh3d0NpTKAcy90Y2Bc2ETjgMjp3FXQWdvjxpdVSNw/uGUbzOuf0Nhu2MfjFDSmWOeDdMBRFvdg+d8IH9xk5MzscqlBAIInQUlvTEoQKKf7y1m3pyT6EIPoVBomv3cZtNmUbr8PGhT60mTkpdKAKPkZd1JFXKWcb4xevRe9V7hfgv4g5eOs8JcdY3V/ERG74uG289mGZOZcO/BoTVxHGFQScmffZHImlfztqFSopXLkJx1yCEPLihmBmDh5uHd66ddti1W18W24cXXLOOWcPmQZxHzC9dbYehTCuUMINJaYiMBioN4CvBxC6xapbrLqNbWCwXJ6zH9jfqnaFyjT4YOOKTnQ0ozapjGO+0harPo8392h9O5c/hq2uuo1XYcqOz3UEDRxdZm7OYfFIIpRQc5lMaTehK5gEQhdOTuQiEC2/EWLgiaOA5SD6zKtlNXrdwtXp0S9+Cc2z6euc9thrfcnT+JfZAY/9vt495j3YT+xpzy7pNEr+Fe7P5+i2HKMDO+PgaXggBiBUnEXpZqpa6MIY0DBVaT59vSFT0iv3XCS4ypMMcVRq0zj0ts+3nWckUOiBG2FSqBDsQUml8Fq8v+zqTJk5mUEMpeVLJDUGep9vu/3u+gMo2TwlcXo2a5pGHrwETjD3jZP/zum9PM6dZzlmTFfpdscfzvHCTrjGZ+BP5wDMUdN2dS8cu1AwKN+ikGce0flVbjWHZzUc2wAVJKRy3MQLhRJs2KVlAABbYTCXELmftFUFlNYBp5ijp/ogNqwECVEmYRIqXAGT0uZAFwro4ccFmsQY2yEAKgXmNdpXRah4J29waQ2PYWhfnxd5H0+6eSUr/5yWg2287z2g4okrHQ6WWdiAp/vzILVFiECEXvpP3V2kKULRUznB2uOo/Q6RAw64/uVQvnhvc/KY3tWxcsdLrcrj573Y7DYvOKdf/aaxjWedD+4eldDR3g1gt9LZUGceOIilumj23HshxYTWBm5i5jgdx6ZffLjv+yW13Fu3ZXfuMcdSSW/apm+x6jZeQfQKKSRxIqUNwRmwuJAWDLM1sVBD0nAglXM3jvDgsUu05v4dfcCDlSuK0jIef1zwRfQrFaoSGUSpBe9H3/4biZxe2I976yWkh/ve35z3Kr6qczUqJY1O3KC8lcYPHGjdZEzGqRvNmM0dTKqsZIZHGzc6KVM/7lTOfqRTn3g673ijORLDvrb1co9YVV/Jyt8C1W/LzB2xcYUBibTMoHdTiHAaZspk2hi9sxwqNtAm5FbrNNOyzL0kVpkt9fDj6lr8u3F5juvPVw94okW7+XHb2Mbjrb2gSOKYXKv+tU6iDXJZyuBBchhFRFvVmpprteZQ/SAnaH6XTFzlA29k2Z9wGmb3VVO9r9q+tz6vjtq4Y7qoT/QO6s12FVB2jr7n+Vf4dDjyS/VGLwUWPTrh3RONcMeiTjpjQ4u2hIrXywG07ZWIkGKWowMf0JRg+UCVVKYHIpilNMnNb7p9l/uUEjR1vTVDS0Odj1PVnHNcVeWzlIUdmDlNqWmaERv49etXDJWQlFLY3N3VLnf9Oe/lzpLaLC82Zei8YH4+hGu2XmgH3Nn04Cd44moY9io/45nz5B4B8vnPZ9Oseb15um/XoXNhCU6jHHFkbxOAdAcdgFIEUOiBKm60F4c/14AjJ66kJkMfuYLfyvt6rOt8bZiSLVbdbN/bvt8R5lZolIqB89XPZ3p2N7oNkBNAQa+j1Al2n1XffoGezOO1+q9934cTN1YbvsGs8TvAlGz6qtt4LWvJPbTro1+rTJBZPfQwc6hmXvhIoNGvqlXkEuWLWc0harXuHqiRWjX1YOakxFChj9M2Oh4zFL6+ze32gcI9L2gTt578bbz40GAwDxtUJO5dRlrzZfIl/jSzznJ2D6mF8PfqymAtslU7icu9dtbXHN/t+z7nvGze3MbbGlus+kpj0m8QTxc0SmbmppVZmd5+IIJF6DSz3FsEpi5DbMvSyVX5cQfo74RyjtOnXXkrwTo32LjrqE+klNztrbyXR9QgP1+QaLNx29jGqTVWJ+MwrdzNmWNEDiBhTarqEJY+hLIUq3zcpMNh+FccKhvLJS1Q1XAqMZAPf5vVocfCBr/g3vDq8nFbnfG9D19NmNCFLiWUrBi3ZA5qU4c7kIVGOIbQ0mGlImsKAkmUpSIKqfHDGPS6vCTjFAAlCSgextUBUUXOZnTK4Szf4OR8871f1OZSHdV7m+2L+K0excc+8/NSdT4uP3bn/jNjW3usfel9UF3PNOcBB214bkmQRBIpbtzfdiQVqdE0tJRmAEqYubkRgKbo4srkx683VDRXrRPGjpAkIoJEtNqoqhAKSSmR7Kw3uMMdRqVn6y27qKbkFJckgkaQRBQSHEoGpqRfcvd93324uuq7br/v27Y9Rud5Jpxzdf4vy5RLPp6ZV3unDum9F+z563Rm9M/U1V39/Wna9+WOOEUUhWZuuYrqXAHD3PBx03c2odx5VOzlNuoZOfaKBsHv4E+tIEXq5+yAEQ6xAMYRXjJwAhAKYWgGiwgTZIANe3hwI/6DFWTEBXWfvRbOEkKVToc56ILtZb/NoaRvNu6UmcPZdLgb/93ZT1hJX6bhuBgY8mtBkxncmgRHjFtsQWChugy4m6pCZACNTKqls86tE9UekQOjSZxrLEps+bg3d/3Nt+aP3GmJjgWtlwbj2zhn/pEaObgls9uBDUkOTCVh4AYbpzXFSDiHqqqiIkAqrEoGjomXeUN+5OwgGix1FAAJIgJVcWA81/aW3+7Y/LiVbMKjgB6/kb3hHs9HREdg5kCjxBWULxAWKvrnPZJ59OwWpCDEpENekEQGRrg0ZxyZcZdEWCqEEgOu1yEQlaA1r/04d9dv1Y/bbNz7j1VP+3FvXSPu+fMjxZogelF1iFXpzmNxZXSNjn81s948LBpXrK2IUERFCJ28DRmP71VPqxIg3SInJwOHcKF4MuvdBlGwLVZ9hDhps3GvLla9Mx+3uXv3sXRUVB1a7l6Yjqj0qCWEKVQnZ05fhKu6KJcJIATVXVKaQuRECDppcQyIhyahEkLq4XQyBda5+6EzHwC3F/321ntqNpzas8Vo25hNPhJ0G7tT1xC5TkrgRSjhfmnUYZkCOjd9I0WIDiIc0b91oZakEvngqofbVjRxlABctDBzxgErVs7tjb/J9dtcytb0OnuPzve8zrHpx/hkTnzx3re/jHnvFyNfaq/vsbfNSGJP84UdxUO5qCpE3b3vre8yKapN7gsrUnSaBkOcmbXt1b7vzAkVd/SWM11V3R2iwfobdVpBKpx1IAWSFEBk01JKfZfHAm4qIWnx06BMqpqo6fA2+77/wx/+8PXzly9fvvzrf/EvU0pfbr9+d7V76ll6Do5syeO2/MClOLX7rablVx7Oh3hmu9gxQOKMiVIqnsL1Cf0uuY+38Rr84oE9SQfF6LUZCHWQUlw5Y+mopyRiBbPKsXoAFLdr4FWf0ZCMYa+qRnWB5u5O2NjMTxUHs1nXdfFJJOVGY/HWRnPCxr1L7uNL/bttPHqIWgwcD/pYPE5ZZGaAqGp2N7PsToGK0ot4DYFZd/1oyIZuLRAmQhEmhZtHYk1ooCaBH6oRXAp65Zz3+33TNGH5fHuFb2yonl72XLCqnuP3nVCx3MbmxxU3yoInrrSpHptL7j46cdnNfZQoXGk/KsC2AcRb+hxgmPImHZphY88WikAVKb7lbswleadK8qbbm1kJkLfxbvy4bWzjyVxmcauEBKu8XrFWB1pyGEv7lRndVmxlQIQ5aKsGvI0qgS5ZyqqKSFIBKVCBwHN4bSlJ0gMsTkEoVNWdfd9n+nXSnPMWqb49R+70lruUknm/C2/zQ59jvpEjLRLIs/R3Kieu0GEO/tQBg4IFv/kxycGZKzd8l0koylH1wbx3UFUphfRcRIJqaRvvxMatRqbbmt/GI+wljrF56/h+M3RQ6bxvNAzTCZ6Mud5gIFAqPenxi0PNQbTa5Oq6RNjTsHGqmw/3vmLVS/V4NpzdNqrhMxX6aqKIuIgLC6WvAnb8KKSoC4x9dg/zY3LgwixlU3GIAElEID5DCwggQFJVkVSsmcEtChZJdkEYB6cLlYnqqm20NrjQ3bvBjyvn2jb692HjLrVTT2HL7of8ep7rPFO/bvzXMV19jHJrDLhOU5i8YNp7qTlfpLAOdm34U1yiTwthl5KI0AUu3sOzwAPXC9CHgJSQ0khAilMIpQBNc9v1N9ny0ERPoTYpSMPgHjBd1aQJKQngTaNXbVMcMTJBnKAzQRoFnG4ZuW9SaptGnEOhAjr0/PfE9a7d394m0d2uyX1/e/vV/vDHpmlG/ruL5smd+Md7R0ir83DpIy/55s7kiVudt+evr0thbiee0qo8WP352hOv72Bzv5/bTLw3D5clKVbd5Ohb+XLG0yCO6KdCmJcBubbMolDQeSHjpQAqaxk8H5JrPME9B6cQ8Z/C47/w/RQyXnZZWgKjR3NFkAL0ls3sWwhK3l8+6purq77UK7xTR/192vSBEDP6FkAxOp1OI1hIQsJuSeX1SPynIPu+N/O68DqQlkvlWkrNjZ5mj5pQiBXD6dGdeihPJKX4TIl1Vl4g2fd93/fN1TW/mdXxbozd5se9vL37RraWYuaOuFo6qC6M6a6oCeScZwxuyxitrjM0J1t3Vt/FmheJUa0mPtT3/U23f8cvbhbevidvbsPHvXCs+kr8ygfv/By6DYhBVQsjZYgLCBppLpKgEB7UCYKMPKWEgegNBS/C6G0gRpxHnXyp72LCFxI2y91Rcn4QEcIiGq0eOAvfLwrNL1UMbKKsa9Zoig+nlCw6ur6BcsMWq77bV/jUW/S7jVXF5/m4tedcULjOhHTwGgYwmgwtDYUSWGTgzrTKqE0rM+DSxuEu3oH13L8MpwAwZNlLwYRQkaZtfexa3WLVLVbdxjcXq8pKqVcGQrf4Lwqphf2NmTTAI1NWGuCHYNaNZPHjjF7HkrWI/TJWxcB5GZ0OQi9nV0JcnDJSY4I66NQUbWmBDxoOedCLiH8VkbZtRSTn/I57ud5xrLrZuG08wxwbdO+LgqrPukcDXhuUvwZ6xLWkQyhp2Su9/KtU1Yf7re0a5ROd/wCMhEpKCSJWxF+/3Vhni1Vf5pk+NRfzmbHtmXC5ExHBquDm8pPPGWuvQqhqbiIMPCJVJUEFDsANqpqQ3D3n3syF2jRN12UA2qTgHCfdLYQaSuYLYAazW3b2Zkzih3OVU5tZCKeObl3TNE3TJAWYhWOtwAEgO7PFJ90y6E3TROPELqW02/XI7h66NU5TMKUUPl3btrvdrgSwitu+211dzRS/zsmrnoOcP4cr/948g8vOkBMXfBF/4ukbvPPGawHZ5bUt73dJ33B6Tblv2oNbnHvheWsZ4zvXyaBNL8LCFL421yVScuU3UuoWkeAf82Wrp7jTLqym5OZwWdSkwaNnd3AexzA2QlfByqPYZuarXS+bjdvGuXNlFbI/UYSeJUFIRGrNGYhfj51YilRzrWpOrwQGIe6wAUey6k5WpMET9EgYIEXIeIFELoZ2VJFGiDmQVHgpfUhItbIuQYSMYX3Svu9lUMpZBrnb2GLVzW96849iJESqeDuO20Qv3HDiMqo1kFyK+Anh7tRAoNCdRrLUAdZ1FMb3Muu0H/6Jq3m3mVUSEWeBIuNgT0kBVSQpIEYmAZLS2Pf9aupgmySbjdvGOx+shPsKlIRKOp0wd0epXBa6SgPSgIRDLSLjokY3pxmNAknHWi9J1IC4wdJBScWkLV/AovgAhN0NqrmS38HQM4FRggsDo1waU3uqyuwDfGSTD99s3Dae3a98hmW2TDxF3urYdQpAC1hcsWjRv4VZqniqrRWqzVZUVecB8qy3vGZMGn2x1e70VSqn+ltThYeh2uvEYON6FIhccK9vvttbWS+bjXu9NuV1eWpr0tonCgITE0MK4KQTlqINIhwrUR4qssIIVL33otsgSb3Py3cRMbKsjPn5jwkGLj/q7pnuZDPEv6oaiL3x89FYFpC+ON/Gfv76x4aP28bFNu6ghIDCL3KwHVRAlapIRQi12LfQLnU9dFIpAho8thkInHRwlvUbJuqM3YRDbDwyjjjAS7ldRUgRgxnGhJ0qRKkKaZh0uGsX9G493TFyRg361GuES9UFbuNVxqrn+CkX8co9FmHW6vHPxxkdO2/N8nqPe7/zUVx6v6uB1cs6ksuwkQIPA8d4fGHgIETX9zAPIkwKCKcWkUFxCdPCwgAHA13Ru3dmRtcmJaiD2T1SchH6ag3N86AmVxWUmikz6KIQEZWhqlrFqjlnikpSy0bKbreDKpUODyNFgaSUtGmk2enObnODtNPWHdm8p2f6X3/77d/+j/+G7rfd/g8frnv325uv3//N99nIIgOmQgg1FRfXVhndZ7P0TgDK6b605Vg6mJd+/vT6vXQ9nmMf6k8ew8FdniLY6Ju38aARaqdeu2ZwkFAePK/Rias8vvJPhStz8OBCgmu2CoaUnyxPHYqC4ccFXiThXKaDKtx2jq5mWUiqRGKxVuF7UmCKzrKTIVDt7kqoloMELMbFh7vTLVR6yKb+5H7c9qy/zbzbYzw9Ca2sAvolfMpmHhzBAIbwEC400I4oPJwAG9epOPLAMoKTkkMDP93wVxfCo4dMp1KtQTI8WlcR2XdddrtudpGeS5CmaU5MEs6qKq91vGwJ5UlbZbdN5tSzfsTH/U51v5SklEC1mIJIw2EKSRuNy6gWbcGhFO7bUNNcPJOJlOqMXGQGHImnPIt9lnXVujZRCImx8kaOUYfv9/u+70WSqoYWYkrtthE+cF08qUvRPIV1eD37wyvZSb6FMU+scP54HUIisGlh4OgSvEoGZKMBzkoggip+0L6ZFlW5rKQeSOVGKruFgRu57iCHekChd4rEIcQwkheDAawTBShIAu+su+n2vRtUaRY20wmUDott5myx6harvie7RghJDcpyBYpT5O7BExeR6er+4RFbSiTCmOkRF1LhceSTseoqQm3WLb/qLNeW0YbLsWlwSxWKeLCwC7zqpSV583XffW8fUhsYPlWoR10FyuADBYbEIt34Fvb+l8VIXcpNsMWqW6z6zPHqBCRRe09hOwBl1XhAgFCKUmADmVJwUg6RrJYo+MhSnIml1gQkWFJuVP+V3gaBC2zahL/+OijhyUWCUUQgetvt930nSUfu4iMPZoPOvYpYdbNxW7j6KLNIgdAKXHuwY7N91CEExboNvfI2ZOWOdW4tOX5nBm7VH6mPdvhBq4ukGnn+luYCSbrvc5cN2og2XiCBxauNY9aAQW7dEC8drjZPzd32REDwM9mv7n3ARw8lLiXYek4A/UPmQGTfBTLqy8AE0GzBbR7toBQRl6QAHU53Nw+onLPL3uVeUysCLek5iogiQZDdKgM34WuLakNwvRVDK6KqbjlI0lNK7p7NwjwhKQYK9WiiiNhTNEnk4+BIqqkVJDIAee7uZjQ6ICk1Pfw2d33f55yl75XUlPb7TlslQNGQsQDNqRc9+SVi7t6v8h50T49lXx4yb09c853L58T1b37cNh4tN3diUkUQGk5ctCOEhml2dxAa3Et3TOJZr8Xs96vNXKtOJWVyNF94W+UDUSqpUSaAJDVKn90BkUSK0VULhm58CJv79qqijG1s42GmzUmbwz68gokAGpm2ij1YSfRm2W1Ua/bDt4LO7Y49f664Oug81FVUn/HKDgWQofNrZowOetizOHdEvTRN4+433b7PGUlHUuJtJmw2bhtHY4Q3XYuoqM9LNmp+F1qyUyMUDijk5tnDxnH8zEn3cDpxKyGbVT+udvQKVCWkrEOl4a4AJy51qJmMVjVJah1yu++7LqskQN2QRAGVhcO4jc3GbeOd+HEjghcefpMEMGTg2J0b9EiKhQs3llNn7QdnxqrzD3u5BlRV1OXOEX31PuTxAHXRISwtVd2BUCCcOwUKcSZF9vv9TbePnOAh+bVIwG1mbrNx23j7Nk4EUFLECZMSmS56BsYUmANGN7Ps5qCPnuBqMm78+pr2yjGvbd1TljBt4AKTcqxnPpw4n3c+qGrTW765uSElpRS3v82EzcZt433GqmHRYIeWdnEqV8WfwhsSd5YKbAk5E10A5XQ2KhXUY35c7dAdw4usPu2734gcOQ41uNElqZnd3t5mN02pFnvdxmbjtvFGhx+fP6pMEjpapFILhccgH+3CMQiNNH9279ws2DHXMnGB112rCaxYq4HvnHXwPLvgsc6AquxQDFncnkyasHwoVsydOGp0Nhik681ISYkq0bMR1COFEGUzeq9mvNVerkfna3tyI3EEN6RH6K3u5PN6oodZhV0ODOyP4kmVg1CWSApJGrjAhFnFkriQdJTEXGrSoKqFTDd6zpbde3Ojm2hRF3QQh5bSsCkSktKFYTM53WAEldShD19Ad4e4qu60SSIiQa5pgIsMjCbuJETUck8BCQuXU4XixuzSGiiqdOt6a5qdNo27N5IEMlI9FfkumItQ5er6+svNPju/3Ox3bevMdIc4hQiqJzSBDWYx1w+d4RfRtz0D1eClPHH3XshnrvHjvWhbv+qrMcrPYMvOmzgKoEbqx8+EsWTDpuvHVALpS4j4wKQ26DeIUjzqqQNAJH5Qii/79uMEgQEO5Iesx56lV38IVB1Ih3+S4Ccvibf4vkvYTSfgoEBYFXxFS06QY7handPlYObcHaCBtHy775sP1xRx86q9ltVRgC1Tt8Wq23gTgwM7x6w1dclLXv/y4KCt8CZNDPqs6Wr8sDMTVqNDRIayg7gSysF5GTymOqE2w/0fDjvWT6cfXm3/QmXx4lDu3vX509evFJXU9M55Pm8bm43bxlv3SQc5mpUiyew3EpgS92MUmDhee5kf6iAW7ZhyZM6O5ihtYV5BguNAIxNIrfs1s4m+MJSj1UspiWimf/r82dxRag7bUnqt+bhNd2obZ0WvEJCRiZMA+hppTodyDM8qGqKgkBOMaLipLbnMfyydUioLAQQXERXRKf8SZbBtgwxNSMuUKjAQmUVKgPgIgQ1aOQ4ZPjaS2XmhxBMkkUa1E1HVTze3nZlDIOKgTkoNXlOtbOMlbdz2CN5WPu7J956yWk9dUg3llQENV4d0BWMRKTNW9YQ1xregPGIVzK7SCM96VJe/FBF3QkAq6UY3FFIAC1iwChwuSuboSjhA86bx9cFer11wgEhS23y9vfna7f/o10gJCBkH32gyt1h1G6/fHq/UAcNXUogWqT+hlf6tENbK9Do3NwvxxnzcMfYkTInnxt8okYK3TQb1mqqTYTBzWFqWhYlMpVdhHSQMUIx1BVQPTh8lKPAigvXQfm13X7v+y+3+ps+QBIxomZG52LfU3CsYvtm4bZzrVw5O06HVCebhEB0LQQsY2CmcGKalr3qs5rCAQRgAFhEcXx4qhFCjdOuERQ206vmngNG2pcqhZupHKgyoMHQH7y6C36R7zze567JRDgDmwRbG3frGlPla8nEndtd7xErnfLeewfWfl+LClnj6R+dKfkMx7xIxdL4K3/AtHcxHvJQmMGJuMDMlm0YEYkYYVJtojVLVIEly99EZcneznoKmaaCy73M2G+UuD8IxlTnT0mEqlf9V/n8wcCIqmpISIgzuOi3ygSbkbd+RNJvctzskSdzFtESrfZ+lSWZd3/fBRueDUmoxjQDFM+gs3OZt0+z32ShX19/98PMv/8M//ktXMadCGpe4/dB2Df/3ouVzKe5s4HE5dx0dmycXe0cP02O9N03e6c+vPjc9ZuCeocfoxUWRt3E/P86dNIdTIbMM2uTzLGYrRoIshbdXDfGylDmpn8qorBox7PywTqFo8dqghBYnrui3qgfZ+uDWra+WIxwBADx7dqfABH32r/2ekg7aOlXIf+L42zp6vnzcMVGPp7Zxq7vHHTqV71QP4VUNHsmZK9CoJlU4rc/eu3il/CKFPsRwFAEXtL219kLFy+THdOADnyJwFUY2EAMJ8MHshSNXShuyCvhgrfi1SP+REuVUUAeRnYN9IoUUD1UKZ9/37k4RT3LTdx+/3gTlp1Al8HqDJ0zxZzZwm5lbyccdUy2SI2N7Zt/ufiiNSuPOqC+UPdJx55ZTMvFh1zjxCpcSqPNwY70v1UVEdF5sdffC+1YquaVs6gMfnFeu2UiFMormjGeZa4nJxKMMqnRo0tTszT5++mLugjRZJuE+buvlNeTj7pf3efjWsZpv3sZr8eak2Cag4OPoQ6bO3N3pEgiRKDLimCJ9ebWHODP+j1NPrdaiX5sPActAGLgEiQKrQBKkSBWStOxuAyfSAaK8moGiBMndxJEMopPhwxGGF8XW8YIFoe6aqKJtQ8Gnr19u+3ytGlUMqeJVF098nLLeOfrF2zo6sjcvgvllBuQ1+HFbrPryKTlAHO4OFmn6GSJk1Skbg8gCPZny9x57lcNv5r8M509VB+vjqNrFzIwV9/noxGHgg/PSCVvS0D7Y5jsz2WVRRBoPUFU6RBvX9PnL1y83X3lQTdzG67Nxq2buteXjtvHCnl3VdipAUgUKh8dsbgSZ+Pj5Wa5taeMwLSbOYtVlXWLUUa38PNJ8PFeUeqdXNXyehx+GVJkOjf/jlWhwKI2GvZ6cJRoW6SxTBUm/7m8/fv5c+wEJYxj95D7Bto7OilUvKlc/4mub6Z9vL+Z1eGtH0+R0ieYBUYgkAtlskDGY4PujlcpBQDwiWRYZeQWTCNysaEAQI/1HQNVEK9FnQDkARwoaoyTy3AEYIUEHAismWA4WKoRmSPEAjcS1lW6EKljGhKacAtJc1IXqcuARKQ8hBxbO3ZEUkm77fNP1JmoiLkjlkMGP/CxvbFtHp23cOXqI59u187MDs/Pe+8Usv/gQfdUlffZTz5hz8iz328/Pv/L6u06KsJQvI88FDVa03Pc5B3kvjJY9U3jQtgdr1auUmgElRgZrJlQUyUr7qIJZ6G7iNqLgDlyVEl2jUnJgxTwhAB8iSE0SkSjz5pzNe4hr27hRUNpXCQg9i/f0EplWD0lIUvqc0TTUBG0KDztzgogoGK1hiFJGJgW8ViHdc980zZfOTZrrv/n7//bDX//9v/kf253sb7vW7cOHD7nv97c3H77/I4KAb/Goj81bnqGn85B1dKx+fen8fODnLzrsRRjPxYd1Sx9sY75qsCxxqkRR8iDZp+F2OaT6b7BTqARVZyOJNICCIRoDsFQhZWgJkJVj4ohOTa23UHP5xu8NpbQaRQZUioiHW6MMzuSEO2SotDoHIxVnb5K0GlnF5AJz9ub7Lt/kjoCmFL39KtJoks2leg35uO0RbGPiTcS6pow+z7IThi70i91MGSl8j+TjDhdQ/VBBRNYLX2OJ4RiN3fgVGz5r4IgOqVW7QhGxBs0Fqq6+eEKpqb4Md+/7/suXGxfVpjVn7y7RMuH5zgcyvYvNJn4DNu6pax1bffacuHVpfcbSwZkP7di/qmqk8BwDs/nJ3HyFp2MN3qze5rT/X4WC0YkL544LcPKkPUO0Bg8X525K6jmapJzz8E82mmwHf/39U59d0pVBzFEDnk/YuOXM3Gbgo6/f5h7n2B70+972oi8ThatDoqE0FnYpB1QWkHdNx9nCVlXhIeVPEIvVPj2oH/C/IiqlBBERtQ7ygF5o0md5mYPZohclmpCyFsAoGAjXw4lTTqa3s+QlQYFApAgXBpGcuytVRQhk46+/fbzZ93/cNZDWQBcVzcjcIqXNj9vG63XoRp9uxJ2d73Esc8ClVzwso479AKWpYL2BjIcvzly5VafSIE4p4tCaxq4GwwRNUqC/crBlpQuiKKoW72+tD1SoItpQlBRnRqEe4C8fP3657QwJTSvahKcnelSw5lgP5TbxHn28Oo7Mx6ozbuPhBi5a7s2Rs8OoIqDSXQILQlGBXRICry3pFXs5g1wIoEIdZRwGWEk4Xw7WvaiOIPItFMEiYvCA8bnAg3kpKI1JBX34ooEqI9wkfMJJUCxQwtzElB5YaIcIVBMkffz85dNN1xlS2lEtAHtJjqJHzqT52cbD7YN+g89oy8dd6scFQGHWwzA8UL10OnoYraH2euoaOJe1Wi2tTvorvPCLUAQqhDpLObVAT3jw4EZEnlGGxlupTOvidqi9uWUxs3gmKaWmabRtbju/zbmnMiXRxqJ3duMEfit+3Pkm4N7GYqY58nR5QNVTa9Ldx7VddEJTqvPTY9z0WNfzWBv4nXircyeEpt4cUEVy967rvPcEQdyykx6KgIMjVUExpn+u36DRc8597nPOjM4qd3MPTdWJ2+MkkJI0giSaNEWEG90TwVhnRjMSHIufLibRz0qaex5yf9kIFQezG+G7poWKkVAxs77ve8up2Ymqg9n9OoVyRTTuanS4OtjsrrNR3BowU5iNZNO03/3xb/7z//Ff/y//07/7sLv++uXXVvjHP3y/v7k9/d5nZQ08WLH03rxsL7iVYo3P7hju79jnj/01ksjb2EZlWCrOxdU20mUccOmyrJXqfaHJMHMk07SValQRPBGXDDg+cdEosBYxh9Hpi6KDptCd8KJgg2IPqTVeJGhIhu+KGd1nUopKaG/oXf/6y68ZSZq2VGnODeW38YRjs3HbmAwziqSCYrMAlQEQmMBk7O4EIC7H1EhPHX+hzRUwi9q0FcmI0dIpQrsQbhrkujrhPQwizKg2HHiTJnWJgo/LRKZXYOYDuZMN3y29Ylr+my0Wc2Yr+bhDgAzdm/eOf/rzXzunpBaazPotB/JmYtVtfFN+XEopgvGhy70YkkkWrpbdEiy1Zo4JxI8aXQZKYQYWFS36N0PoO8hCe9Qllh7ckgjzIJZacnB0MpNOMVq0H7g7GQcsRd5Mz4QNmGcXdYEgxLcKsgUHpiYhUTjPAYULYKSLOsU1/emHn77edNffNWpKMiFkLF6RJ/ENao1uftw25iNBlMpcICOhg1UPcdG6if2OeHbmJ1ot3zXyA88i1lHbAZXe1Thl9QDfrS1scCelWWxr9Ex3g1Pi3FCBBoVc8cjC+BkmoD+61P0eGOjwqAnTWoe7M7WSdp9uup9++73LJk0CqVuv5GbjtvEKDVx4czlnM8OauAfW4G9LZqQTNq44FDpnSVoRvR+KBscYwOq/hpEq+A+B4WCcjYVdDlUG0EKGlWN36kAOKqlmapqEpZoIdejAWNebsc+WUtvsrjS1f/nrjzc3+yDX2xAhm43bxuuzcSkFnXc0Lc0MivihGeAEg8UJSzf6cWMjVM2tP2bipmToNnp8Y0A9GB0Z//MFT/rM1So6hCoU4VRKYq62I+LViP7cGXTGHZ4td30MTSk1u6vvvvvzDz9+/vIFVPcMeXXCg9+ghsFm47YxnRCqgI6curXqQmW/DrKhwTV5Z2k1gkofGEF8YD1PlbagABAvsFlxjPKsMUtVokpgpMsQ7ZJ145dDQnkrrmzsVC3V1Wnz6eDfcexzAJA8RGeKE+cotYhSWhVxMkPMYY5skg05e86eVJPod1dXv//++82+MyB7cjSFpf2uZNemNv10o3nZHOTT6aIeQxudav+ebmjjSljGSqf1w/ASPHSzi6zpuY8tJBEpfZ8jmMMFov2+6/YdHEmTQp0HK0Yhaj0XeqaLBhwtdB2oIqqaVHs3cwMASQ6YdeZudBeo6GhlNILDlKqEX5g5imAnO7NsZiZodglJYDTPogJzuoMiEEowMdEcBrijd8855+zR2CVhNKNP3r3f71WFTZKmzdl6ow4GTt2SSJMETqMDSinKqpnsxPfuPdEz3WT7fOP7PoN63e6udsr97T/+/d/+v/63/+3f/7v/p179TZf3rSQBtKJcr6EzlKIge6B158rbxH11VJcT/hy+yEeZgXeui8EptsVv1g8wHD+tHplr/A6h37b5cd/uWLZ5zCQacEwra1gvxYk7PafHfgkg07m2DBRIlU83HJIiEmqpZb+RwL7Z6EsK51dlCJgIWCBy8MkFTgSFSRqklBqAJBI6YwgpCQkVaY+WjAwYJbubIDv22W72uctmlJRS26ZGpUmiClJ+/vUj0pWhpZQ1dmKl+fCnX2I+NmDKuaHJ1tv0zg2ZHNVCxqAcCqcQoV5qZmMHfp13X/W7iyFbzbtN1fzCgxidiMFoQXjcAx386Jp4ri4CzFa7gxZ8v3WJwKVUYodCMMkCjpv2pQnSeApbJOnqNFycYr/vb25uuq5LkKvd7vrqSlWbpkmiJP/5n/+scgiSTtsvPSNntOk2bPm4bTwoUTCOvu/H+uOsqrjqzSl4OjaJPgEfdLNOdN6cWMYjvmTqhR2AHTVTZiTgHGKBCiZtsHeR3Rso51CIRghAo7UhQL/ufpCqER3OVR6FO3vL+/3+9vbWzNqmub7etUmFaJompRaQP//5z51lSe22Gjcbt43XYOBi2QspOZsXnlwFtZQUXUbyccIImxGR32lAR68QVVNq2KzwH+M3EbFOWHarXlRMKqEHaUEKDJId5m7uA1h34YhJ9OSX5i0bsCYHi4wkkuhDwD60TVREweIUc3Rdvr29pVmb9MOu/e7qOonAc4Koakrpt98/ffz0WVJDqD/GUqxroFu8tcWq2zh31NCB8LNG/NosZ3ciVj125IqPl4HbMDoWILiZ31e3do2B6owBZXp2IZQCRyTXYEVixr2clAMTyWBJeLDpoExp5TDzEEF1UVB8UPfqe7u5ve26DuD1bvfherdLWlioAFVt2qt9l//8w89BRLyNzY/bxovk41QkiSTVRpHgQoMZ6yaEicE6Wnm4I390CPEqWSzlhP8SQHRThDlrVJOIAnBKEPAOHfUSTEmM/JqOd2UMD8vN3RHGS0mhC2XsZg12OXoJZhlOYnHuDoZQUbpZdWzDGnv5s2Pf5Zub/X6/V8iHq6td2ySBwkETQETatkVK//yXH/ZmoNSvYF7a5vy/LR+32bhtPGasOpNNgTls0lB1fiKvHj4GhoJg5fWq4322bmfYmhoYPLGqUroWyrVVDfkOBTQoMOMH46j6BS/smADUhw8XrddBNJpThI1IGqkHwpJSordBjMg5d12XcxaRtmlaFdAisI9asDSt6O7nXz92+TGBb1td9X6juTOf8rgY6OdRp171Jh73+MeOduz3NVXGCfarB17PKoucDw2excoURBoBeCbpKaWmSd7f3tzeBgYYgDsAX6WrlZEzTqCaDIQ5GLAQ8YDmDnetKrdd3u/32S21LZ2HaNSjO0qCDI4kLOAaExNMFV0IR0TQ6hB3NyKTRjKwbIbglQvXbKiTYvgFnCgUc5K6PNaOxQ3uYIBTum6XGhG490Y4ouZAy/L5681t119dXf3h++8bgbpdtSqWVcBsRk/Nrr368PXm5r//6c9/+3/6V6q63++vrq4A3N7e7na75Wy8e9tY4NpKNrNSxql/qGFhpzWIx6rOPajrzseBxvXMatkkz0Sv3blMThDnbX7cC6fDnjpQPScfR9KDFs0mU+LOzOzM8KwukiodJjijkDpZq7LOFSyH21OylD8c6qCH8LRMfMmBHD2yb+IYKioyhM6hAjEQyUUgP/ikQlFBAtQht13XZXOHamrbtGtTkwoIOkkYaQKqaeeSfv/01cgRkvIUb3z1Bd3jLC/iFT5DD9nGkfncseHTOcinAkfxFXxWpLTC9ji8d8sH0sfhOpfIrQMgv5RZI0e2tlRKoFrB4sZEYHQejLk5cc4kVuuu1ZKuK9qnA0hEDoYuCgtGz8VxE4voknARQl3UUJQcfOjYp4AuImmQVUXk78rtFw50zEout12OCLRpmut2t0uNAvAstEZTYXAXbXZXjuavP/3cm0tSSWqhZ61yv3zciXlVP5NH6T99Inv3ImZ0s3EvY+ae0cAd1UyY8NwacvQ9OepOgGUXRG13TkRbXjWHBreHoyzvE4twJrhVe6NhgYLoScJABwqlQFvgkKAP8aGQWtJwA/klBRR1lLS/ocKmUEeAARBKrDLqFkb5wkBzN6LP7mDSdrfbtW2bkkRrPtxUq6xisxNtfvrl4+evX6JYXHAzJ0VXX9CPO+2MP/oe/2zzf7NxL2PgntnScfC5Cr6/uiYFxIuggWfqgVhcqqT7wq4NnfOzJMjqnzWZUrBiHswlIMMnEw4aVmOnrWICHJkoB1b8vV4RoyyEdYYmB6qXFrAiHzsTJIxGiHLMAR/nh0OLGfu+/7q/tcyUio1rkqpQ3ei5eKYiDpWkabf7cvP1119/7XKembbV934+Pu6J+EIulZd8+Db/PPN/s3Hv35VbtXoqAhbKoJFJadnSfI6O6urOz+GvhZ8IPO0GLo+2/NhsBQ61AkRw6lDjwYkzIPyvg79WglAdEno6tjpENRaBFynUmMPxoyDr3vf9/rb/+vW2y72q7pq2bZok2oi2qRGn0kFLKQEwyu7qA0T/8te/9n1fkzvwJHfmpeHqY2FKnsh9u2gubTbu/Ri4O0XInsKoHeucd3fPtN7HtReslKsix1MjxROLJKyDT9tU173CejoStVj9Krl56U51XzauVh7oeg50YiVRLu9Qwx3i9EnH63C6gIz0fQ9I0zRN0wzemUeTa3ylSYkUd7a76/bqw48//rzf7yni1V3MblwfsA4fvf/h2SzR8/hxEkDLbbxUrPocm9govsKCCpHBjWEBaxx671Wb8CUGC7DmZ0hQs+lC63nujETkO7IllYWoI/2c173qJ6e7V83/MWMlg4YQUqDXvCk4ytN5oKKDIkhFoD58MKHQBBBGz3UMawKjdo4uE9Qk2qam0VacyOaZsILIiX2CNJjt2rTb7X7/crM3gbRRqBUCNA2au0P68vAgLsXTPSk2+Okm7XMGMXfj4+6BlDnx+zv1H0/c/KrOac2rtbr5H3thJyKmh7/mM8/7dDndg63huI8NhiA40ay/vvrQ9/njl4+3X/dte9U0jbsP9OBOWrCbiUZarCm5KjMhHUgiFDUWcwApZiKIPZJqt+/2uXOzFPy+zuIqukeL/oAKHiNbJzwSYwJRNFBNSYp6VvDxmlMAiktDSRnIlN480whRAQSZPvUEGcFmFBbMqJB214hINlqGpFaQLWRtrKdjl1JSUVVz9A5CrWk6pt9v9jnn73a7693uSpsdm1YEhFtWbfreIOnrzQ2l+XC92+9vrne733/Df/vx43d/+IfUXoFsksCA3ImTQh+gyONEHG3f6rRZ/n6VD+5O/d8TiLlVvrlzcHAXTebqBR30N+ozHzvayDd39ul00+V650NKWSmAwEPdFA5V91yT/YKjApZNKxMHySsPJ06AkI+mExIlz/XdwkvCDCo6eIgipVFq6Hg3rHEfHrRjaKQoSzGULhQxiiuNmsWHskORnDlEowIQhFK8ukIFSBcoSdg0mtFBUEzcKKHCRSOycW/eOaPVrE1NoyoB/oBSGsJ9dCLFQShdIUzXv3y6yVB1cVhyA+hugsP9uoR+tuOYmtnlvsXWBXG3H/e+Kd6frv/hdZ539Upyzl3XB99RtTnz1IKRGdGb49DHHnKCw+crIYWiMCgFkAGM+S+pfPOJiuDUy9aQ+xuzbKXf3klIcAHTi1Dg2pWPPa3DkYs9p5nXlzr1X4DhgCT73iIZRzKl1LZt1BbCkIY5FgRnSoELBmQkpfTTj7+Y0bXUMZKKO2Ud2+ybSXp8G/dY+8ClK/alVrisL4Mnv55j5336/dlXM9oikrPv93tnVm0LX+WMaHsaO6wqY02oz8d/CkdvSPNFZq6Et9GsNZiwCr96XAjCSTJ73AwdpfGrGDiHe4DaYKSoQJIhsyQcddRtWFQwinqs+BwOOCOeCvxg31vOGeIpSdto5EnMbOjgCAMfP5VOWEna7Npffvv9y83N1R93MHXRVsVMZg6bRlPvS8z/dz+2msO3MLx63QUsRkoISh3KqQwCDivwN/HxhyCMI2zMj5NWtCAWhikCtlpH9VgeZ/nzKn7KwOyTJsex7lmktgYoXDCpLA3xqOAVV1+InkJQ2jmy0a3YApY2rD57tuKTNppUQcvM/VjePdygHtq2Ukq7q+svN/uffvmVkoLIRDTN66rc3LeXsHFy4XhDUeq6P/JOz3tsBO7XzILju6ZmO3bBWJN3mP0+DJyD2Swiytmh5oDe857AePAD12bJ5UmNyCtEeDLJc0XnQ42uqJiNa7yFcNF+6w5zZiLUZumyS02jULjTzIqhn9+m+BirNs1OUvPPf/pzGOHh4apL4GT0UebVN6Ul+Opi1Uvrp8+mX3Wm5vFLnfcpn48CMMtmzoidilQN9EiqaIBEECswXdYt9ONXe7c5I2YAMUQxZsCGFb7kpzvwAMuBuRdVA1Zpz2LpPBUIRKgHzN406hRViW8ZXUB3hxQ2lqDJBEM6VoZGrrBudIlGN++yk9y1qW1UIUGaoqoqWicZhxtwUQgFqk27+6c//cUpBoHDIgv5Qlbo6dfdMZ/02PHTFqtu46n8uFHLGYs+ntV8ZZ0+Wy4YjukzgZc2VVpEgVpVWrjiyZ5oX535iYTa0H6OqhORAuqhSz866gM5E5qE0UY2doMdysTQkbBzEGCM1J6QkXGjZTcr/V1N0yQJbngTeBp8ptF5LJRHQyMaRVN79ctvv2cHRTPdLa5tW3rP5cfVUklPd5rlFn2+LuTs80v9xDN3rVmee3ZVx3BA93ssd+KJ7mx1OPZ8Tme1lpft2UK61MxEUkpJqX2ff/v1Y0rp+vpaRMjoJwdpQ9fo3N6ZZVZayxw+ZWZN0xDIOZOumoqBMwvV1JHC9/Dwh4PUUls5G3Do269MpxoR9U93mmV3aNtkC5HToi4h0GDucAG8mKcxH6iqfd8b2fc5W06QRhvQzVwkRdgeSJUg3+x7U6TU7IR0c1K67Gbc7a6+u9rtmiRKhcIs5wxVUYEoKQRFpNVU9g+k1F6ldvf9H//2P/9//vf/x//9P1036L58bppmfLAuOubjBA4ZyrVrvcDHVtYSE3rOvD3Hdzu2vk7z3524ntUd9M4d7t4O6dvoc3iGvNX7zl9MKX/VzHPOj/WEJ2GmhpYzezfHUcHDE/Ny6SHOrs3AQNaNLJxjSMvqM34gGgELLfBw8PqaOMPKai3YGnYqO8wPLPAqFGQhipZPTaQ8ZXmRIUpG0xLp199+v+m6gUg0BGfVhwVYlGO38RR+3FN4ao9obh7dur0cj9uzZlsOjoA4wagPxp4cfZcV9AyDffDzIajj8ZUIh0lENCWK+NSGUtYPGpiy05UHEQlknIFEsVNk6YdwKWo4RMiwTizdPMilUAb6zPgkJexYHEs04mgdLJxQxRmdqt71ORuj+SGBAtfDthEGq/xQ1K5FIC5Q1dS0u17TDz/+/PnLzfUfr5EaHs9OvYtZ6FOgIo8m5s7gPXq4BdBXuEqPZWceq370IuQfT13/OlG3jR9UVSQFf0bYuJXwQRwn9VJn0dOhBYJDwkuQ6dntmETLKprkRDAyU7N2SqZXuN3hSgQVDVKk5IoTl90Ly/kBRiyHQq15BS5ZuWsHcva+N3ek1CaNpltf7pGFuWS402GPSam90mb328dPHz9/pajMF118zzUyhG/b+PnF1vDspXq/aONb5I97QR63F/Ts5IDX7/u+z72LpBmt+TkT7gRwZEwjztQLD8l44lhG5tiRIzs2kvEafZT4Mhx4gV1KBEpE1fJQjpiI2xfBh7CAMrOe0Z4wPqjRzw0/ru+NkN1up6paGiWYBDpovK7unSJioDbt7upDb/ztt9+CDdg3LoxLMlQPzFbp417Tw3Vanwc19kp43J7U/w2zUMg0gDFK7Tur+6Xu/ZqW+T4jA0c2Zr1cjiYHpzZovRGdAvODpgxdDEFd6VN0G3zqfoYYGBD2UTj0gi0pNt2d5sL1DjZ3t8xRhSts3KygtHzyUz9dRVLate3V9V9/+jn3Hs9nG8+WBGte7S3N6oOPiOt5ER6358EDLvF3Q6uoRu2y67q6QXVyGVUKb5k9Yan9EVVpVUTqDoGRa1NVeZxmvc7HVUa2KDjUNoIlWqQPYW7VboVoCqvOH4xJPku5Lrfb8vvx1Fzd+9WNVrq4+r7v2eyapmnExsLEarYhkIAABnycZAdEr66ufvjhh/1+f6V2tWuzb67c/bbSt5+POz9D91LbwpsaoVUaMEs1s9xbNCQddpEwCjKaMEzAI3c8zEEHXjTYNqK34YAR44DpmGqyRL4sSp/x3xjPHhJS4hRxQRD8DqA2DShxHNtAowR/nB+OPJ5FONACV9TnGDQrQIpHLSKwLBXfutEzpHPvzPtsZqZkK8GfXBVzx27VgU5v6tF5codnAZp298vvn2+z91TReCOudC3tcepQsOHbCyr8Ppm48ob0xBcfhZqYZHO/Xvrz2eXuRJnN/I4lHudMJqwzb+RYf9JT+3RPR1t4Gn9nuVQbcrb+tsv7LCJNs4OH40YV0aA9ggUK3wFxGibhvBeULFAVEBGA2ZRUGgdyzn1nDiRNiuABEaUkIUiFEBDVDHEyI2LEMF6qRJM0iZImhAhdcu/5S783UUmNk24kRTWZJAIZ1hFOIklSSQkQKNTdMr3r+y4zeyFuEpFMpxdlhpwzSXOwSblzGiWhFU0UoRu0M3NtOkmf9/n3L58V/LsPH6417SQlZEBEEyE9qXRN6tHUUbEKQyRJ0pyl76+apkvt587/+4+//Kf/+d9/uvn9OjHRQnoH0dclDQAMjcBn5lIeQkR4Xwydo8arRneIMgR2yw40nYzT48gRK7mcw/XqHu/0spsiL49VL32aG4/Vi3v7UV7IeW9mYe9GdJkwHKeiEeMDm5DL3JFb0i6S8WGVgK0BtmAikZGOjQN9XaHoSBTSYQQhYHR4iVTd8VHTjEBVCKeHWxoUxA5nMGlqWQGsvDkvabf4WQC6KD3uVAEDFTBArQLN6RgPgy5qIj3ZM4AxkhQtVOgCFSSHitBBkUM2UObgVWtFmFQEkpqm3f3y8UtnrpKALHCNL9KtOMJvpvthktYonrS9wtDwPhjgZTfP6VjydC3iXYLUXmG46u77/T7nrKo1yH6StJI7MmjLfatuBavLqSc2thlHU+DP3PN8Z5fSLOF1v8LKDE7BKbBs9Z+DSxbNtmEFg3dk9chxU33fR4axGfhCVjE6tS5EXZdQ1bZtAaSUPnz4/oe//Li/7bVpCwMwpzgy2RyCJ1gAL5UvW5VE2SzdQ/y1EyMqqmamCQPZOGs5BVzOVT3wxwlVHDSzsWK4yijngqVlHOFpI2VIxJUA3NBZ0MN5jV8LFF54auFfjUfzapzeWad0I9RJF60YnYDRo9rg7imllJKqJhyV0cECBRm/CRL5lNLu+vrnX3/5fPO1aZr60YxQEuWb4RGZXdjDtXJetY3bxmuPKcyt663rK3XBottQ2p4u0e5YcYjIkK0KG3fKqRdYFY0OxmgCFyutCGQe/Dj4ZP04hgvwMXzWWi1w/LO2dNOlKAPN+jHzB1IGasyeZJtS06oop5zJcxEvTNXLohc48koppaurq9vb248fP0ETRbzq5drGq7Zxj4WD2/y4pxiNaDhxYzmVC0Zc3FdwJNBm4cQFauSEjQvTNjENVohPZoWm0lfryNkPsl4c1CRcstMgpRHVPdPzCA8++HGyYIhbIEioJLVIaklBnzhG2dnOcs4Z8JQkpZQgx3znZdOIlJL24NClpE3S1P78y29mocwzves3FademrN6wT2+ucd3Vqf7mZ9fLq2H0Hts45z3lbP3fR+5oVCID2mBugmJwTcpEtgLrjUZTv6L1ycQ0IHs3ptFx9hMEx5DPCyjpSMp5p6dRrogJQm+kRKQOoIQSbLZrAznoKHQxgWpnJPiIiJ0Ga5NanhwgYVQ6ASVXsAkZRL6zPapwR1iRCbGJGNKqREF/JjWX8WlfFjzKqLJqdHM2wB6ff3hl19+23f5gyqpHLSrgZFZ82hX2TaZ7zX8njbu/Ce+Ga9n21dXHj5VUgonK9wlks51h+5R8oCnDxjiDIKJb5U0BAkXHQ4oWvdaqcIW5dcqtcfK/BUw8QQN54PkzfwpVehlBUSpDp0FrW4YaKAGlk/IKu3P8Ms5DimlZCKj6W9215++3PS9fdglIONQbXa+qdzRcONzH+UVmuLmUkfsBFHU+WsPa7i500HTY9nKpY1+DVZ4tTXqsqRDVcsL70NEkmrOeX+zz11ummbXNFF/OEQWhWVj9ICCiAOzTq+jiQWVHtj33W23d7BJSVXjWEl1/Fjp6yJBRAvEcMAgsnTShBQoCzhWCMnmXd+nJkUPrCKpNilpJrOZqbogPu8RzLq7IKACQ5qsNqZw9whlq955kBQHPFKKlo3uMJHevev7/X6fs121zdXVVdu2Ku7u9PIAGy2PPSrXYcimL44p6ZevX//wx+9+//SlvfrQ72+/fv3662+///Ff/wunagIIy13TNKLNzc3Nbre7zEtxf6x1Me5SBwf/+MEH7MiSFU4euDZXV8GMTvX89UJy01d9V65czNQavhAp89pm1amTkQp8DCp5yV7lghrYsQ6tECwdtEMPPAEBYah4z704cXRIIxKXxUPTV7GbJawWIJDAIJ1IQ8zIg0TW3OEqeTqnU6kswbTSZcjKxQqvqPeKMGCQCuPMPHJpoxOOiQJJjROfv96KpEAjyyj9Q4ae4WuODN5irqZ5hde0WauHGLiRYjeclf3NnpmNaFOoJQlxTWkg49WKcUhF/CBpUKXhgArmKlJURwsszoNLAyojrfloaiP7JiKOomDAuuu0aJ6rEixC9zLQPsM8LikRRlJJhxNKohQ6oAFJkdAndLhTVegynAPlPy+0wFI6NCZ9rxiKD2GDPbDNQXROl6SNpnieWjV4hJbFnZNZpLyL+DNp65Cff/0N8n+maHZvEC/O6EhJXtyyvLjy72MblK0x+H2ZuTHciBVlZre3t2MYNc7gsY45C0VF0p2xxixkyG4zGvolM51j3iRvtfdXh64iSEpob9kcLlCIUJQavCNeOmR1BI6swuKGWxt7xbj4J7q7W5V988MO4RSH5Bxk6NI0jQiVjuO9ibN7rx9CSglwVU2padtWRH75+bdMiqZgsgv3LV7Ta3Dc3lN94zX6cdt44PY72iB377o+994MeSItXJDzBKsP3g3OaA2u41ynm5lhnhDRIP7mRLjeUNq8RmnU4VtOomaOHEnoRNJYK2CEq6CTJjDAiWBFkgXW9ygGuDrckK2LEL3C2SHiYnQ5R2dI27bF+si6POMpjhzxSFGmlMypbavN7rdPn29uu6sPTdPsYB7NmO75BXmAZjiH2V/fdET8SnmAN73Ih4T5RXrZ7Pb2FoAgqTazzyw0sZRcpJpOZp3CHTN6neObkLpVxL91h79XnU9a8wmXWoAYvcueORGL8IGQbtRULdhjt94PGmMzZ23Z0TWD7I76hCOHsJFeqKhyMBqklJLozJadQ+Iw1iLGj6WUrq4+3N7sf/nlF5LaJB88a5JE0TJ7OA/j5s2Nd7HFqu/Hj5v9te/729vbNqUmpXpBhsvA0kGNM8kylyt59LZYerBWhJdmtXKuF2rnFbQ4MkmVNDZazajPaxZfNzhkpo643qM67X/AQBaAtbbWQ3k6JVEStoRK3LklhI0bry26Hcz4448/dl2nqkUKR1Xk0Yqkr9+3es6x2bh36M0JNaLBvu+RgthsQEykkiAbU2CDeYruLlvylwnrRSshSWKEo7DnSoURIRmuyIHNbQKl4JoxHayGJhO4IDvcQUcSQd0zr4mQ8SpJwdAsMehTNz7QxpXbxoTDfQT9wqN3QqOnIQJf1tJYVHEEJVQjmiBCV0Loq3Y/ShALb9fFLTFHTZaikCRta8Jff/u47/swgoXYpNDY6VsybeEkjX++Pp/pLOzImYC4h/O4PVzJ9JwXVgcOz7mnPR1qWqgAGlUVhcDMrLN93ltn1+21Nupu4SyJeqGTlKBbi5yahTBoqbRGW/jIFlfsBJumiaokRSLX1jk7Z0pJqzydiASSI6VU/KV8yOkYqNJEm72KCJROUZUmIbUOEVVJDWB939OZdMeczRiSWpl+azlDJKVwxQrTJqACo9O8J7vsvYX4Awi6M8PFReLvABxKcSfIxOzeee7dlUpJ6ka65Jy7216NH7RJoIJNSs6ObIJhj0TUcipSUXH3EOUSUREI/LsEY5/RiLSpbbJLv+/+8A//8p9+/BFN+9vHj3/Y7fq+B9k2H272t7vmsvm8gODyfjjTWertpEepo/c9/L+WPy+neLjUXFy8HqmbH/euwlWlNtIA8N4jzmIQ5QbOtbgWh88PNHLROuXRcz4ulZGVVwchmAEOotFuxTXW2lGRa5XSdoK+roJVh5gAkoziDjEINUGqrk4d+sw0+sgO3fM41BJ8UKXBVFOijl5L8EsVQlH8uCqyFlKCwDOJ6OEaClfayR19YhqULsgNTMOd1MQgSknaW/7194/atBbYEag7krZvMK+tiz+3WPWlDcFF482l5CLF0/d9znmGKV2V1DrxlGwgLo/c+SzNRPIEMfcxb6KmWptl98YTje39J45p9NOkhMuUXN3jNV76slG/TgjOyODuzL6tGT6lFHFbBYO/r23bnPMPP/zQ7FpzaGoBmFnbbDiHxx/NWylZ3o+T/Vsz3wHOCGZHM2vbdpW38pgA48GIDJKj5TGq0ApVnAgyaHSj37mXLIOg2jZVyBJ19wYtAB/ojCadPS6UYpsMPAikTkxhCEVPqxyDBSulBieOa8XWCJMgQ4+i6qHfXu6eaZPLVgllH4EIREUVSEnattXU/vXHHx3/IYmqKt3N7OrqakkXuo2H2rjtEbybEUaqpnJbtW6c2sT6uwczJ+BQbShpuAEgUjBxZnc6uatmzswyHZQSMoqwdMIfFGBzzhiAFxWYAqXdFJH48lBn8BG5Eri2EdDrEpWPpbunkJlLP3UzOQo+LFtQV7sjK9zvimfnoRwEATxRqAlNc319/dunT7f77g9t60KRRO7vqfyyjS1W/RZi1dFC7ff7rusC8XDCfTuhfbOAzg0CzCohonrAdhzP5x57gKe5y92s73tmV5EEibMEIM4cecSKmEWj1YwF8xhsZQmsOU0XHMH+CBw5R0fpSKyqxcCJKF1JhUTc+t1339/u7ZffPktqsvlo099gPu7dxaovtewvrZ8+j57pq7Jxqurm+/2+7/vI+9RrhkdkkusoVUTcnCpaetcn/zR+pbCqhckbCmwlHhs4PSJbN/bBjvg8A50iQgMVqU4jYlBoJakpiYgZ4XD3DCFl9OMscHAgPZDDIqJOD07jqs1LAA3aOKAUQ8d2WVDcbc2P87jHqR83keOZkf2eMHb0UqnWgeJO4S7SXn3osv/1p5//p3/zr3K+SbuUUqLnh/B2bGPz476JWDUycWOD6glDv1IQmPY/HOyaDMcvCDh33IcACoNSzOLUKlClusFzmMck1BH7VnWAiVeMSY5ZVUFmU/qYZa9yb4oFuH/1Idwz+XvYGxy0QZFVtEnZ+cvHj4RmJ4CU0kaE+SR+3GM91qP0Mkf42p5aw3BFKO/kdS4by5/HT7yDVHIhFDBj+DrkmFRzzre3t33fi0j0fu/3e9XyxaonH3UEOh55BKPy8EAOrVGC0jduZnF8AF3OohNjV5c4lpGjD5cqkoIpM36eeYi1A5VzlqSNpDxQoJDMvZuoGR2UJlHFyQRNKWXzsXIaEbY7zSySeYOyoIa/V+yrKkWKrM/uihR3v729TSntdruUUtM0tC5na3bNMvQL169t2yB+igg3Lp6ApCaiewWUYuhTalT1ttv//T/845/+/OOXfXfV7FRhvYGmSVfn0mkax+UnZ22nOKIsfL9peed8Pp+f8cT6OgH0O17F3vy4d+GsrRpuEYlAb2rOLp6pdVfWZC6qOEp/aFiivEgerbY6jkuOU7DJTOowDJyZ0VyoQa5UZrmLO3JIPk/Fa05o05y3lnSZPSzm2H01vXVmImw8PkNjsBDJIYGFlF0bh/bEx09f025HCJyNTFQdHiV9tvmGm41btyCvdmYsuzLH5dd13VhtiJV/D87F8D68MkC1kRoFTw9mZSH1UGQNh38qAs8oUluUwiQX/pRVOLWccyTjRpMHKx34NhRzR1zeUBzAyIlkGGEpMsbFpVMLMnh28UPJE05UEBdZOUyZRWY11lVXYvkDx3wh2ChUCoq4aRqKmstffvq53V2HnGtK6STU7hUZuzdU09hs3Or2uxJtvZI5sWqFx0xcBKpFt8H9IXOuDnl8PMWg4XJMvWE1n1Ub5fWEIAVQM8vZCyjPD7ozESDbYORGvBvXODrG/NoS2bu8wuXPqKquwIHKfI3HfDJtavWlSVMUWGOAEyRBANfUMDVG+cuPPznUh6h5UK6REzPz3kbtFc7n92zjttr2446u60a4Q83N/xBzTxEfDFwgG+oILvSbTxi4mX0ZqwSGSYNEFA7qWDvcmfFbeUKCWS7A6IejUI8RYR7pdpCaoGmZmR0ZR0a7Vk/OGW3csVk9Xlv5J7gK4794dE2706b9+ZePNzc3WMPcPWQ5zKAz33LEuvlxz+THPXrEMUvM3d7eRjXgEfN99W8iGVdo2pKGSuGq5FBtXk8gDUcp6PE3EauiAjP7yKlZpBUU0DCJYaRqD6uErqs6qmsZN0yZmg6FgilwZNWxPZH2ri2ggzVwBkB07Mdhd7tdaq++fv3686+/iaQi+PDYseoT8cG9ITzpZuOeKR/3WH7rLAc3umw3NzdjQmfMJT3kLmZLOpysOl92Jt/c6ifpczGbaM+ITtWDjTsOGD7ky5JKUhQZh3E9H0LdE7Eq1mAi4ceNObjThHHHTNL4g6p6Yaij0gU+Kjy07VW7u+r6/PNPv8QnOS3uv+ZYdbNx23iq4eDIq1Hbkb7vlah7G0Yb5xX9hleEHKw0+FiiKsXABzcmyigKTaESPdDGRUpsFJ1Z8ZWWtREACSJEYlFLHaoBQ2HBigMFJ5y00K0ZZqkIQnb5QFJnEFdhUjTBDuLUEC4ciO0AUUIrmrO6cBnUu5UpSQFkKfI2oamtAFzoCmC4Xy3kJ2cFBLONM0GSEM6UpG0Syc+fP1NUUhMyPY/lwWErqgJ4hn7Vkb6n+s0dDsTFq/4xHLQZrudOJ+g0P90jzraJQyQwStu0JC3nJqXdru1u918+fkoI3yerKlV8qDFqUobbVLSrCCqDe1IUEuxwcIGqQJgIqkTTuwM2tIN+2X8lINqESlYKZfporvA8hnsDjyYsVFzDrECSat/3fde1kpyIBikzy/tsTbra7bq+/3KzF8eH3QdQ9/sbMUgKTK84vO/7DGdKEO1pEAcII7IklUjg3ez79joJqYQE46ULTWkmVFAE4kEFSoqicZhIpjWa9rfWpGtjkrTr+o8ApNF2p5qygFKkugT0wX8OPZ1irwdFsSjdHuR4hDYQiIqH8o6YQK6vmi9fbr7btZ/a5k9/+aF36TM+7L5360F/uIU63W32iBHP4vcju9zoKa+si+ry7ElTOth68t/isBDhG0I2ZjOzuuY3yUZFq7qs/RxuHeEQhMgohXRx+OTDWkhyIQzc7rCvJAgXe8xse6hb/QFIiNGLc3Df4EIyZ3enUNw9FB9Q4sWEdLhUiFvQzZVrFIDJQzlCGgUK0y8kWrjcAvE7EH7Wy8BE3JnFTaRRUdUEiDmGPllzzzRC6ErxBkJBkmojPi/nUHXUlSsFPAstENr7/f7r7f5DszMa3n4z12sLWr85G/fWdYaKvRjc46BR6vt+cgEPu8fxCLF2vegzc5FbBObaNzqu0GVVd8KGNOjYjyHtfr9394RkZjRYpjgNQJOqKFiCZGlUT61tTUqpQdNPa7Cz5VbH1DJsElKl3kh6tmj4TWPPx3AKVRnt5ExmcDiNS2n2HUCF49c5MbElbk2paZqbm0+//fbbH/+Hf+H25sVAZ4Wd14CU0G/Qxr1pzIqqCiEeXVASCzIqqkvC63vb6IFhSSLt1rvNIMerLtuxJ1mDNuZpgRSWRbqucMbRxfIKCqQ+zqwQMS6nRgfMs/MYAm5WVJ2VhkcsXuhGz/BxI6Z6VltYhX1MHtRqIka1aZpde9Vl/+mX30TTI87D1SrwM8zzJSLnZdfXpsv19saoRxE/BFXcqqW+n5lbJiKj4hkGaoQEc07EpJGSqk6vYwfCUOWUEb5XJV8ToEbfdx2hktq6LgxgBNNVQlxj2TREFQ7gj7qvY2bUlkKr4qV5lnoopx7wMdOREKTnMnp8IjL+aghIfboBcEF9PnnOTdOo6u76SpL+9MvPXXZo84hux1LW+ttcMt9crPrUseSlPfyXzVpCCYvQTNX63HVd6BxPnLiHLQwP2QSBhAhWQHO1RsAO8jYLvN7SRI49XTOlVHM4oCoUMrPrculCk8IVLKqkk86QGSMtABgoODhACcLp4goBkoioIoXQFxFN+TKpd1E5iVVn0osjQd3B0St6EeVfUzF0Mqtire4xo3btamVs1zR9v2/bdnf93S+//vb1dr/7vqUgveVa6Ixs9TUErRtH5hvjwnRmeBY4aTl3ubt165MWoENRnylKdyFVc+HzUZkRV4QfV36jMho7i44FHpRrhhTdQYNuJDsaH7LB65DQ3S1731vf9+GKhbsX7RClZ1biRCMWeGhBdUHQMYVWIQ7A3bqKx4E0DoOBm+UHlwDgQrZO6PD7YBEhqUmSSjwGhcApdLjp6OgxrsxlvuFp5dAFdiSZUZp0/d2H3z59/P3LZz6BE/fMserMbXwN62uLVd+ajbZSVBWCZtG/dbww/6C1EbYrWqmOJdou3WDcnXSnmFlwi7hj4E4npqI2Y28sAEKdAupQGD6YzoKkcyqRojl0WGx6V7ZoYuMixTnwR8UvG02NpgBXJ6wkcGedubN/CvWv0egHDBiDRk/OWZB2u+ub2+7mtrN3MUVfVYKbZPOksdWda+mx1uSKv3MhbfQJ7m+sNe48z9ZUB0QlPxXpcFHr+9vbW8+WII1oZ9mDgJFERAq1pMD0aRxyVYszFnam1Ijqvss3Nzc5M7XNhDENxRmr6c5JWq4zzamqUYQaPFQTwJxz0143TXOzz99dXZPyw19/copok62olrq7eQ+Ig9ncSFVtVDtnbzkboUlEFCENWO5RVJu2lT4XNnassNqVfJ4TLFjhpmk+f/ryd9//UVXd7Pfff4+vBHmcu2uTGmGCtG0ztpeFrmNKSbVqw9JIVJZ9IqmWQDXAy5BRsVuU7rnZ7eD5y6c+7a7+9MMP//7f/VtCVgngTsscn2CxP7HQHr4Gl0eoeRhPM9Yt+aWPrd9z2OhO4FU3P+6tbZIMoh7knD1b+BqFJIPlX/FAjkMRl8LOZuCdgl6X7iVBlJQd0dLfZ8/ZR7LMKa/caJsORYa6uMGhdBCC9iGEM+bAijgsp4sqoHNH1urBrYuKwkD/NhCHBrAPo5d3esOTSbTkEWAXdVeRIL/KdGkapObj15t+60p4An/rzdccvrVuFVE2Cpr1+1vvu1ZFVdzzgMQiANHQs5cTeNLBFE4XIxDQOE7FZTgoXEW5QQYfkBhzZhjPXhrCDkeedHSF6cw5U1JY567r+75vml0NNKNG0z9KaDfUUobXrZHUIsQZ2vRa8t2rmznHasPcdS16XgHKAZiN2TCwKqkqYKHkIIQCFh1poIqoaOHGI1WD6TeylWHOhJJOT92Ukhua9kqb3c+//NblfieD4MXT9NK/Lbt2ft/RKRu30Rm9yN5ybycuqnrZLCqqu90uWM7HelasRqoMxuo+yRQbsBShClgT+Fbqq3dvP+Rhgh5QG6QhK7RpG1L2+96MV7tGJZFVCDO0cgxsmMWJiwOEsXJSBeKK5HPwyvDE6vCcXFG+rtt7A4uTICkoyYcyApylB5aAoEaQDI/i7vmgVeOSiGSyaVqjp12b2ub3Tx8/fbn5w/fbepzMxjtVCu6chFus+gbfurl1vfd5jKpqGMQMo3vvE40iqkt0cc0SPK1OH9g+xn57LBiWxombtHH3rusialtW4iqpmonBI8UNbqgZic8wuGsfk1D2KsDDAFSjQiBi+mwhLsLRwAEYatljcH13Ilg4OWbTNE1q9739+uuvS6Ayvu3W+odXMN68jXvrWJB7vPJQV6nLqcuK3p0z43S/R0AoshtK+ktmS+78J7w0WLWeYdfbfr8HRbUJFnJ3p8tgzWyMl0UkAsEAlxQaSz84ZXK2d7n0FEby5OB3mgEgEmS5hVzaJDMmB4U+2lAz09RqaqVJqW1+/OnnYGDHAsP8jZu2h5i55lvTIX2pWPUR9c/6vu+6DkCKFFKQf4wh3uDURXb+UlqH0QYVEdWRCLMi5q3Rv9P7qutfh6MBB9lTp49U7OHEdV12ATVIPdzd6a5SFLSM7qO5cYTwlRuclILMWxPx4Sk/LrBvcWsjQngsW0cBJ2HRngVJopRDwZqwUYX2+AMVYEHEJA5oSmnfWdM0Ikyp/e7D97/88su2sk7HqvdYR1us+tbeOuF9djOp+GomWip10zjnCPt6grisrEcXMZWQMTWQa0muYarp6fmzdPo8TBvgFIP0RGfeZYvjKAelCBgpHgDb4volACJpqDYUIUGHDleo0VILcalQMYRWkbVDXOHDI9LaQIooocYQOSxMc0Ib84KiA4PSIh1+dHURgecZgtngdkFoIzai7rkJmRqk9vrDxy9fXaOQO1xAKbqsxL9VPWZzJk5NwqP4uAem+uqldOT497zi2c0/tR/66Hxwa9s8lt7HrG0zlnoi6M5uj9y3KSWBuSE1TdN430thMwNkYBLSQvcYmXq3kBakqJgzUnljQcCdRlLb7Nz3+abPZtRGwzbJkPYa818W/oh5FbQdKC0jNRc0dqCYmTETLsLsBhXd7Xrqb5++fu3sX/7D3101LT27WVIYxdxJcWlApdGESIkUM+acSQwxLJXIlEQphWTLiixKBzqnE0aHiDSiBtKcFkgbaFJD9n0SzTk7tM/y+WsP2bk0gtSINioJSAoRMTK7p7Z1gXkGmUw0KJmSgtHBUVoiiodIF++KEyxuUVYeqDv77qaBZweo33//x67Lv3/a//Tr53/8Lv39H/+4v/1M66+vd33fu8CJsQsirFtsCS7gDExzV47inAl85vK/lKVuLfz02WXfLxcZwcFSSGSJA9/GK8ozziaHqorQs0WrwxAzlR6jQyAmB/98zsqrlc7eqncGNYFRssMoDp2FDPMJx6P9FesU5yxQE4e6aHYaizp12E9FBV4ThY6uouKgWCiFM2mIo8NZG0QFKSPHpMBBh1Dq7bYm11MNWmMKRbPDMLZSDJTILG5UaWU7Qhu1GiIpoHBFKUpwEqt6EqogYYx8BZDfP33RZte7ubsq3LIKBj5kuJQ73RbIFqu+Hy891s9YyOu6Lgp/E8NRgcsL59K0KaruIR1XabVQJSD4ZSFNVZnvVEJYLSwc4HALHRljaWaKexlFv2onkYIQsFrakRm9Ut1qWkcPhSpzanDXBMO07iEZdX/mSoMyPjEHXDlP2C2t25mv+EDfJKKqP/74Y2p3fTZzSNN2fYaoYQOUbDbuvTt0oyHY7/fFxunA8yElcHMpv5wQHwlWdaqOEZ9xIBqpe0WxJkJ6zPqcKHMbQ9c5Or1k/3Xf972mAUBnhYV8mXJeGlBH5aIO6gqlmLAoNVQXueREwcj4NDLxLalEiuGDnNNXdE5SNdzwRlSFChdhSppS+umXXwnNDgDRSbaeDwUQ3usG/7prbFznr8mcySErV1wtBuodCslm1uecc1QCZms1erDWDqo+siGVFa9AAX9ZWTCMMmNAcMOdqZ3EpcjWIV8zr0JgUJ7Q8MmqLx76pVTh7re3tznnXXMVOFuW02WHUEvBkwI/GDgs28sOBZbRIkltiEXoKBo3FJaYcGiZoI55T6S+t9zPlbEObHFSSgc6RbeBFjValMgUK3jg4FvHWHnQqaMhSaTV1Lbt7x8/fd3vdxotw40P+tMbyuHeLsK2CbzqWPWgwU7SrL8tTtwYkA6B2UTHc+lrzPSVa5DX3NUaKI+woMc5xsp7vitHSiA+okv/ttvnrm9EA0YrRYphhBNzlshbCTmHBtLoVw3Lr1xpb5g+WIIW3QsA3KNieyAcBRA1lbGjq34U56Te118oMJhIF7iCAldSaAq2je52u9su//rbR6eIJmdB7U0LX3pw4raxxapvwJBxDuaqpQUPBEFO6/N+v48odVmfqvk/xih1psEatYrxqPOKEw/MQqXJXxWLxtXFqtYBzzHElR5VVc5Ygod/lewg4Iauy2YsnEVcmFQpufoDn0r0jq5pVI8+19Tu+KFsN7TZLmP2MVYdbVy9GWil7FBXG0WkRm+U2sJgekOucKx+6PEsRGn5EGk1XbU7I/76y+8GQJucc0rpUaTBNxu3jdfrx+lIlWFuA1flWFWAVqookU2rs2YC6orIw4k1E10EdVHiTsD9CVH6I30RQTGikfUbeXXnUL6Fo+JHfKiDPSJkMGrhzZ30sALXclgCtUzEYCKnbVvT+73I9OjUlSuXSitkoMLUSEoJ1E+fvziFop05JPWHQrNvIet98nFLWMBrZn9/uqt62fstOTg5ZGuiryg4LZy0bPub29z11+1OhD6sFncPeNRgUWRMyZdFLNLn0l0fKlBUpUjvBsANZg4V1WRuXd/f3OwBNE0zpvlSSnWZYjReJYIbsnUkQ9lmLI+4x61EqrCQEd10/Xff/dFcfvnll37ftW2rqgqBedHfoTE1KCqxYmaSREQddD8YIHMDEArPqbowc2vb1DQKeEoNFPuuU1XPAS6OiPjgipl1gqTafPr0maYpJbO8a5t4CE3TuN30PajSgAF8C4YSKRwBSOWXSURSXIiTkaUTgRxM5NhTwWioEIikNjWk9NmS6G63+7t//Bf/5f/33/7X//QfsxHmH9pG0Lj7Y0kSrmrKPP9yqPYSP/2BVcaRM3no4rv6hgzctzMcgBZr1WhKEOuzmylXahT1X736/ZgCQ4VRWPp0MyfumL92fo/qap7uEA4jOaXLnnsjJRg+QmsmuhSmyau7N4YyYyvheqnCk1ESMJyygQj+kLOr85VjFnIl+3acNf50y6pwPTGnkARRFqycCjR8Rk3Q5udffjWRlNpgOB6Z7xaIeuW2Uu/0oFcpRjcb91L5uHoKl8bJlBSS+z7vu+VnTqS9a0s32Dgd2dyKbtag8B7sRTPy1aWdWtqvVRxc3elV/azh/rmj63KA41Sb0PQTcIjghhPJkImbGHGuPsD1GVuyeYUZaSxYV0VhH73OnAsFQZ3BHFYED6XVaiRhGv+pyr4NBx+bZ0ei8/IfEOYtrpGBtmuTNppSu5Nm99//+c+ZSO1VJmZCi0rfVs1lsSoWgKnXaeDePUfAbEMuLrpARMw97zvrs6aCJ8GgTxz9Sy6Hr7NijbNKEbWWNyj9ANMXXRHGYdmfsKa2dbqxYZXUUFPhxey6Lkey/1AoEJ8n9VCVa7FSzz3cWJgwZxKx0mxfgebquyAJB0tnVFFTdM85KxMA1WbEJC/c6zR1BSqfYG1+HiPwU4bWdKC3S+ddpAVSe5Xaqz//8Ndu/x/S336wkAXSuTvIYM2Tzd6dmwndxqt08USSCMxz3/d9D/dGFMcVM1chsuVjKVHVBSO4LBoniwsi6hCj5ynu95ixmxQTph5cBHyDNmDR5aq/oqpu6Lvc5SIanUSwzouloys3YQMu0JI7wv3wuZbx3az2Er6tG8w4MsdVH3ORonlW9zmEBzccgTP/bup9Lr11Akxja5obaDJEtanZNbur3z99+fj5CyRxUHTdlsO9F5HOfLf3Tb72lty6Ianf9/1+v7c+z+Y6R4jsEJO6LF3CEhEt2bhqV2h873WX2B0azAtMHI63TE2PKZ35vs9mFBS9q+ozQ2PmGOghHTOyAe+cpc9Wa6AMsLOEa+arDWo1IegxOOEss/lQ7kbW92WhnUhVbXYO+ennX4LJbsuPP9SPW9W+fYVmjheOtx60Rhk0GlRvb2/jrwcwqkySpyfIV0SEMwhrdIIfHPmDrtUSB3c02bfesnrgAT52d0F+N0omNk2TUgJc6cKjB78gXyG+dNwmZmXwAVct+IklIEqIN1FAra1e5aMtPbhj3lzUE4c85YANKpx92u6ufvrpp4BDbj7HI9g4LCqv22N9Jkd6oAqL2e/DL4FILalCLHfW9YSpKpIeUm8qByduMIurVbaSriqi0lS4aGAbDn6TkUYhxReZwdU9BoUdS4Kd7UAoIgAQ1ORGQdW+BICQvaHPzLlA8BpNSdCIDq21iwKMeAStLHwbSkERWgUcoVbjLkM6jypUHUoX03tQoDAUVfVWji4eBSI6VjYO0GKRNJZEhCJUCOBCCM9hWr87a1YOEvRLwrZtf//0Zd+7o3Gmge3YD1E7laLcejHPGM3j8cQ9lfv2RJf3RPd7KZ9dQTBEd0BZl5YcMGtT4332bu/WN41qq+bOFHy0WjDAVhI2EWKFaujIwptASckJ91wE+iI9nnMjQrhIA1W6Z6c5XdVoDsNIkStFfyulxoOBFwULJh4kdMnc3dzchUpRB5zsskNTNHJ22bObZ+soSLu99V++3u52O9/33103AuSuN0h2ZIiLSGogII2ekRoDe2PvzK5GOJMLmyZgFtFBKlARRQh9pdQ2TRa5cXOMyTIVUB2pNFnQaQ5jkwRiVJob3VQTRUVS3xugSQTZSWt2baMqEtBFB0wEKmPdhoEoXAmT6aO0xUiAXPo0KElAMCCOUDaqDbynp5S+3tx82dvf/OEP3ufUCLuvgAMGCNA4U5SgNcrGZ+tDnsaaPe4yOXHkKvZXHMe7nXNfMznaJVBuy2W+tCPNaV5Gyl8bTSBpvWcDXEQo7jLyiC1i2yphNJEaGNY4SWUQK7rKwRAGRoWkQQ6VirAa1XSZqsMUStyRmNAr6rrhz2DKPHiXhfRbkjkz3d2TaJK4Tx6+cggxxhR9LANxsHg01MJtF95clEZLv5eMAbhMXDkFA002+qqkRGniwCtXvM5qqRShVUgCAtGmEICyrsF9/rLXJemLiqgwiFjccXObjUm1ydnLDcCHUwNsHLrxjty9xLZH8DpH27bBpDRKqASNEisDR1lPzK1q0Myc4rrPfOxRnYnzDR9A8O5GzXQWD5+oRcyrEMMXoy3ULKQMBKkGsiqgfsQ0rO7qE1rNy1xuP/Gs6gd1oHhbU+q6A24VwfQiKDmmFqSqrabQk/z06VPkYWeMgRtkZLNxbztDFyOllHMOtriRgfbYWvKDZzBZby7rBq7+mGFq4zDXLaw5OOvqRD3uNnDVZfR9D6MbSiOX6sg34uPHVGZpwZq2cz2zyVOJsIM66iRF4LO9QadXLkS0YSw3jzM1Ho9xix87oBKjg/zrr7/mnJtmLkhARFuuD20S2ziZj9sewcsOl5WkdOBXc9eP2qPhQawKwc/YyFgfmUOoyGDTFJfDh+NoYeBGrpFjpQZNiaQIRu5MOg2kixOFga3girUOpEMp4kCG1Oeu68J87HY7TMhC/IAH4UEgglMB6uW1jT8rVqqaI73xyP7mU1uTBqzuaCU1cpujIICqimAkO5mkk+ScTStKMvEqCk+MMPQeeCh9UAR0gpZEReT333/vui59+F41ER5M7NjKgRcmBzY/7tW8jMH6xKw3s77vAxYX7Zx+mi8kipsLN8fos5YAAA6O9VmS2S27c4GUXGL9p1jfuR+3hF8sIlnte8td4Tdv2zZqDCJC2vx2BIRyyEmfIDIZ2zkLzJg1hZyHrs3BiZvhdZ2zPp809nJZIZhqRh3b4y7Yo/hxIzBYVXdN++n3jzc3N0ZCB9aSbcFuftxbNG0T72sYfd8HiCycuMjEiZR9fPmt2sIYOPvN4DuUOkBIv4SXV1koDGqqB2KTcJ0iBU4W7wbU4rUBIeY1cAXPOemWgWrXdTnnyHBFFDYi/gzBGTc21ZeMoYGFhIgrxqK2WkoMIJIZcRtrN1cBm4Z4SpATi8M8JCCRSqvWQcH2nv2OS4JSCOmVsBmkSdr3OaWmbdubj1+/frnJ2UfQzMQ+b1Hqlo97u+9DCcuZ2WJLV1Ufuq9mpGojPu5QvpyJxrjPltZSxOsA6Ec61vFSI4RrB+Qcdrn6nwZl6lQycUfYbCnqUJ9VkAfOqKPzeLLsa9LK2XT3cPSE4EC7OZrLutWhCjaPUlfcr8V72ZA3ljXiz7Zto8Ul5zwjJtjG2/DjjqbP3Z/0OM9GjHXRV6SSXAhx6C83Nznn6DFKKWlSVYGIVsl4qgxEZkwpIeRMtbhS2c0LlqIKAKfeX5Ru9/s+HBYH3UxVU6Pu7mbuLkgq0ltXPLiRhsjdSJEkkoBDR5RUjRNROe17E5GUGuv4+dNXULv+5vu/+aNq8/3330VRJdO9NL8CdHXPYE8Y3TnnHz7YhcoqxTNsoFZr0IimlGAucKeLSBLVpgFgsHjwTdPskc3s6qoJhF0jaNr2y5cvwN+JyH5/+4fdTpK4u1Ts5zMXdbUioaGMWvru0yCTRuYsIiqhrUGKmDmBJLjatfvPX5NI0zT//M///B/+/b+znq0mSAr6hVATkzeVmDuOG504+1IDmtaW1Z24uRXRzs3Mv2yg6gBFapUpFQlm8yCzrd+rYaWTYWDWjKz7BA+57N8cvT/KIYXnU4J1nCQauRNEeqK/dSzgDlkvGVJ7eVok0EB+cYC3jlznxxJbVcWAoaRdyDnhOhRtB8I4ntZRrh23QKXoOWR2dxYfFh+YPcz4QCOaRNvUNI2KyO1t9/XLraouEZGPboNOIFre8BIjmxc894vsG69wf5s5ApEmi2RcHdG4DDkzYBnh1RKroWVVoi1NodglAmWRSwm7wapaMHtupfPUg9Wt6DBUK1MibA5rAJliylCLOciYEAxm4xA1VGhK7YD7tzzlRKNg4CyvjOaUBaAO9HR8SoTTkfTA+Fa+YENNs1DNuRyi3uIMroUCExVXp8odObBV03AgHRAXKU+ylqQY/1QIhQlE24plEfn8+fOvv/76N//2X7tlF1V4VVr1N5Rreqn20K2u+jp8eK04LSBh4Pq+D7BCOsi8rwgaEFU+7ghtxonXH3rsqzpeq47YMbkGrHFq1rjWMGchYDp246uqcSStK9iOgUNOB2VrHfmNMaVXmSSwDqIQYzxbeDFX8mjKoc5wNOIbi8fKc/fLO6urSxKRdZoWsk0ppbZt25ubm59//pkqM7XJ4cO2raA7X8pm417XRidBGLfvvM8IEuBwdioJl0OfA2b5+MnKqZm7C2Rk4I+r8R8jLyZKQVZn3CGkmI1GMwqsC/M3hLtxEZExGgNSkaTakNJ1fTTOqjRJRz/Ox1zhaOB81tHBCdhlVh8Y1BJOznUuMv2lkevY54vObMUzfkFwMA33fFQIK96cjruCj9mC8e2PM2G32+Wcf/71lyAgWfIDbTHpOff7zcWqr41SJToLavLenHOQKYlIk0KWb5ida1HqqHQzst2O0gSnz+t0M8vRbBot+HWQKUVixZ1+4M6sXLaBm7eAz4aVSdbNsAcvL9o2xqAsyhGHc3GSLgwnruZ6K3Z5SD7uhu15cOVCcruoV2BNokSlpC1DPKbQc06HTgsybhbStdWh7ugMn5oMH59JIK5nCixTD1pF6JbdXUB3v76+vvnU/Pbbx4+fP/3Lv//DIJU4fjGYovkm1svxjvrNj3vvowZDFDiY2e3t7RjiYYGrOrE/By9QcdAwEZY+lvM+UZY61DoqDvSFEyeo9J5nGOAaJHywcQUPo3d3CyxyKbPLS4PyS8IhLl5G0yKiCWFR5bgGo1aWbqZi8yix6jIbsEw8jNzrZv1ut2ua5uPHj7/+8tso2OjySnfrVxsebTbu5W1cKWgS6lA39OaF9RdM6unA6RZy7ne+1MP6oaJwI03UEgKlYaUvQhyUwgoS7NsUQiF10/4y3XYoQgySpnEvw6mt4HatWNxs0vVE3EKiKIserEA0+DMaytjCzqHVQRziAy547FgQFjI1wRhy+khYJ0HO4aY4KNrUbXOkBZtI0ZFBMLLkCSW5i1PqrnqRouwVWvd3/qlnGEEOhaDilAeLOo3uTdppam9v+s+fbsdCc+3sblC5c8ajxaoX86bdN7nwwNzBq0o9UNAZ26RJoY6duxq1N7+5uf7jHxzc07RJok3YDuNg5qoMlJf1oaqJUAeMOTtUVZMG/aSRbuYh7icQTZDU7W9vb/dA9BsgyC3ScIZQ6qI7aCq0EpcGaXgYG6Ez5w4Ai2hMkNsR5HXT3N7eStPsmvZmbz3Z9enLTWazg+Sm0bbV3m/FTTW6lxq6U1Q0SWpcxTz3br2IuRqFoCoaFZoZLVEaaCOSFCoUpQpEJLuJiqq2oq2oQQnJVDOnwaXUMhKEMJCNppx7gTVJzDtVTdpmepJE4e+fbv/x7/72b66vcv7aSG7a5BmE0zNAQVK4AEkY9jRpolDoUnA+sU8kykDpV+JtIhVG1BJ2hgKRgv3XthFoI7y++dpdX32v/6D/+f/4L//z/+3/2rYUI2hXTUuTbL7b7YwZ046xpc940RJ7oHt4DL92HNdWWnijG/pYDFulPuyiBb75ca9gJA3XKSwZ+8y+S9EDroCKHURb9BwPbtaNMKIWxj85cI14NNUfEnBJh6rjskdicpa4pFkjRAXTC/RINGUUnUMmcxl4ayPZ5wgMR7kqAXUop5bcPIVkpOgPbHFCBG5FSRVqSdhH4aL8GcXQVPjJC10eVARppBeWcspBsj4CffFooQ3iZLoUhcaSiHQddHBmfwY5MGlCxJ+TOsNJg8KqgpQUA2iSqorUgMmIX375TUNX2z2C2UbUzOT1LeFjAMaXGpuNe2kTl1Jku1pNAPb7fdd1mtIyV6WDIPyJ7WvMf53I30VKKjAccwiYjuKEk/rpLASOlT/Lvi136QOKRdCbdZYJHZk8TgBZXeYl4zOXVt1sUFcAZgKsk75Uet0BVn93JmSDk004NUB/ib6WQRoRfpBVFWehGwnPWESIuoMipdQ0Kgp3/9Of/iRIIinAie5Q1Tmv3OszcK/BzG027oXHWFuMLqKbmy993wdh2ZiVdzlrotRsvVjT4hrPNULVZlWHkBadVQyOKQHN+C8LgYcfgCkiyY1uAMSMfWfF9iWd9EIBfhdh0PLUp8XkBqGe0BY8NL2H5HPIMKtMeiQGOzhg60RoHnSeJKM6585z7Gxd6zgt97O8ctUQ24aIpKQjeOjPf/5ztMSNdRhpkrtz68zfbNxr9+MqreWRFLNpk6QEUUoqHNfUqZ7Wmvsz9cvKioIV5b2I9aikuKHvh56DqREZeYArHJ24je5Jyf3foYVWwU3cHZKy+b7PLuI8AHd9GlCfblG6U3StUkRdJUNepwhdOMsHRN/QmJHDop7vwkwp7Vxo8V85Fxy00qHBqPP4SFeXkKJGHE8pmANF5PffPv32229gSqklZdwFX6EfV8OPXgP+brNxLz8nFFSIWd/1t33fkx49AKvh1TnJuOWHl9j6vu8tEyh2M+oJM67dpTc3dxtLd7hOWh2cYXBDbT4TAHpn19sYqyINQfE0nbdiuI8R/66aqhIY+kiqW0PbdCBFGn8O8GH8lyBajAtHJl7Pue97moskQTqBRVtibnBEgRt1pn3wIqfmWwsUUinK6Hjo+/4vf/mrZWpqsyM1O6Nv2tKbjXsLNs5yoyoiZtZ1nZlBBaqMHi8V6ll74JL7aC05olEvIBGtC3VIG73xk4Mg0WU4ssxmCzlL2M1dPBEJsB6g7t6ZBdZjKcN88IDqtq2TseppQ1P0X6ryxawpYnxsoWAz/OAlKUYEL2nOB293pDjWtf/gLmTkTAc9ScoAxBkWmys8+vxFqFJMcGn+N4PFc0aCJBFxU7oqmqYRSX/65z/3vam2OXtQ4Z8BJdrycZuNe9lkHCEskCg382xjSn4xM3TY3vW0K4dTKNNxFmoxW1VV7kQkuKoYXe4gNKoGtl4pql2TwM0Bc1gw8laptEdEsc7cKMFoviujL4eeqoHpcsTHHRQhShQ5YImXZMh3JliXftzMAaxBy1I1qExRjQM5+6C0/cuvn3JPQXKjSMq5e51+3GurqzZn4tfu/P3prfV8nM6yBed+5339IeoQi+Vd06rj6+3XL1++mFnT7gBIUtciHCgqIwNHWXsTOszyc0rJ3Pq+N3C324UnEo8thLAIFVF37Pt9t8/QRHESMlCigVBpMJCBRMa9aHEVrJeC4gMoGEDuTVUlBUKVHgzC4rum2e/3pLa76699vtl3RumyCXn9N9dN0/Q5XzXSNI1YJqlJgdJN4WB2J5hSSqJmPnCklFxeQmrbtmm0Fs2KfyucSvGjasn/OaHQktZklEdUJKmKe1KMPCVjLqzv+6ZpSNvvO3eqJs/euze7dukP1uRRy3YuDtgQgQriEcKtZOJcoJoOnriVGitJEWpC0yqk/eMf/ubHn/76X//r//d//Y//y9/+7d//9tvPf/PH729vv6bUri7PS8XgH7KOVuP02TWssDdX9eslf9z5eYCxmPbm/TgeGe/AlVMRZ45CZ2zanLcYjUgLPTHJltsJBiiDiAiSiNKFjFqnHpyek+nzQ0tpdcDphJvQ+UbnRCV9IHQYxaksILQDpjMgsQPd0yScvPf7VXBSMB3aMMSJ8qcJoAOJQTR1pKHmEd7cLjVJlS593/c500W1iW3j/DU/JvuWL7326dYUxVB46YWBvDNj2+x+/vnXfZ9z9uZql30jHTnPj3uUePvxV/4Ct32pv/lmbJxIAnO2/c1t33dXbZvatk5IlRscJBROB5KRORrjrGF/83DVWJpPmbOThIs0SURFFYDTws3BodRQNBwwuI4sglw+KEmzgIIFBoqTQhmEV8DSD5EJdzqEkpJwjLCMzjhjzQBa2ODER+LPIyTj62/fSxtawqHRX4TiByoBORxqsptMNABVkRIs933fdV3mrlFRbcM+rvRREfXvA/xMgMUDL3eMQSpboseuNNG5EqCDkEjilZQik9JFqXD3q6sPP/zlp48fv36327XNzuxm4z1/k/m4ZbHsffhrx0oFEZV0XXd7e+vubds2TTPyCBWwCHX5ZI4VQOuMPmQOlyPFMvu+H5/o5JgwHMeF1DXW2ptjRdkE5+g3jXl6N1ghh1LRpuYayCxuZi2GvepOHk11rbl+aaSTq7p0h0Y0L9WGcY8JbxNIYOn0QBIRlSZqQYWvFHpiHp7fmzhz62Z/rTS8XRWqSI2mJCm1bXv16fPXv/z5r0YCmiqg+LF19O1wKG01h1ftx1nO3e1t7vZAUSwueQqV6JqqZqecCOFnNm6Vf3FQU/XoYjqWE3CHO5YY4Irddzg+Iv6d9UWM1Y8Ubba90SCQFKDWIO+eFUkqU3vAyp32445lcmfYMV18vio4OOBjCUIkuFokiDxVNW4Na1raZ27PUv1XTK1biWGjdYx1VKthoxMkLiCl1DTNbrdTaZrm+k9/+vP+ts9u4e9vtuzxbdxT58W+KT8umsP7vg8nLqUkw+bsS7/mCNHQ+ApGBqSVchu1oHkHxehVDJcgzSzmUt9rlmI/htovyf7w40rYW/qTUtukabNafcGnE9jLWbHa8FCLNkS2q9gLUAZMyQyhVldgRQQeDFBpoBEdermO9IeuUlcJJ7zvPJg53p3LC3BcI6pIKV3tPqg233///U8///rzzz/HZkbd6JXerB93IiR5f/tV3ndd14VA1MinuFw5q/e75GtbqgJiihCuPpai87RGDiM4haqANIxG3ecwHnzwa3RJfV5fvwdVEEHVcFTHcBWLhoQ7e6HOyRcvp0eUWesi7HputJbUGnCLIZB2P1UaADLr1qpW3bIiEbA5HLg/JR5X2rVN03y4/n6/7//pn/4ppRRzZotVH7/m8OJW70VqIE+wtRigIBqhZ7OcYzZDpR/6tkWEoUsiLkguFoEcR01VASUAF6G+XJjI0sQ0OJAQoSSqgDJEqcPdGFbXmPvHovA/XNIiEJPgYtNoowp2D6FE5dYFztoTJxJEKGpBzKtwkUZExUmBMfLwRc36oJldxHpKA0AaetpUCHFlEughxVZ34Je+d1dJhENEKRBXqghBBiaZKmIY66oUSFJoMpDG3ugMpcDmIlM75isxCMyMfwa5SEk+VKwwkIwi4h1F4cIoQGFKglZB+8uPf23S7na/b5t2Liy9jaezcefXPU/XSY8BCC+tq95J9v1Ee1pNjFifIKU05svoAlFQFc7e9p8+919vrz5cN9fXPQn3tGst2IYKLyOdfciviCZS40CEmqBHdvq+24uI7hTi5n0h8iaoamZUpNRk86+3tze5Q5P2udfkKbVJA5NfIlOBFjJhjJyXgIibYYDOjjyaQgC9SFIkUgdMv1IoCQbTBn3Xfbr53OV901y74Pr7Vprs1ARvBC00xO1z7+ZuCk2KpAqYG0lNAEQ1CZJn9PsMdxElKRqUSkoYKRoVWdW+z5ra66u2+YwbN0SWrdRvQSi9bBNhgDo3M1Npk+jQziVG9Dmnq2vJ+PXTl3/49PUP1/9IISVDykYz0ogWrDEPgdEQA7vTGNXneJIqzrDNRSbC3d2KH61J4MaxgW0kFlA1dNfX8tsvnz982OWc/9//+3/5j//pf7n58mmnBwanY2H+WbuuKk7qlj6D+3LMMkzvRYZ5OLvfFQRV8Mo0b91IvxU/rqSuqIMQQuglJNt/pZkOsYlrMAvNbsrLIgFJLQIuDMeHGERIY9UeYtWBJCO6wQoH+nBkzh+dCgyYaNsNztp86k/56VzExQlCXYvoFSVAHBRYlZFyWkpXKUE1eIIQLaUCcYGLCujQNDRj6GCJCs+bcwj1XIuP5kMXalg8IqkUErdgsnNFk0TMs5SWXFenk4nuw0Ue4jsWHUKWmo9D1By9kR70oU7mEq0fHgKr5zqdnlOJ+5BKxAiKOtQaRuyJgRZbm0pCsXRUwMndVer6tN/3nz9/7bOwNHNt1CPvIlZ96zaupPllpCIKZlh++fIl5xzlMxFRLcvzTKKLJc1D3cxfc6tGqWHWXT9+sdafOfyrg44oZaSUVgoLIhEnk1bmkriIBs1kraFjZk5H8naXUuOqUIF4yX+V7obBRBfPF2KFPpfDZ47nngbBnQZisyRmIf48eoDxX7TC00g6GCwz63vLOe92sXOsEdtWCLjxaMFHPgWdDBA6IgiUhqQDCr/BkMio+nwk4oCc8+7qw67vP3769Punj13XqaT6jG8/h/MkTmLzWLbjUt/4W0t/RhtW5LAPBQTzLzdfzUyGTDxVnKVr6ZRpOzhYcwMXefVRQwuASHKKm+V8lEHkcLCp5RyLD4FoWcOjHOCuohyk9oZ/dXFHtLUTTJBGU6OBSGbCHNcmUzXA4qFNGtcolT7WITAhDs5RZaoUgqFuWxw7RupRguvAzA66gsI0cGo2mtxNIQTMbL/fd+Y7NkMKkqPXfGJDUiKg0Esqp8haYNqKFD2zqwuvaZqu61JKbXvl7jdf931n19eKzZS9ez/uNdciWKVmBr5GiTxy0uTuITOoZEoJSSlQVSVOtOlMsBqYwOJWC2cuGss+6oO1murYPF8aICq76Ua3iapWtNtXdmYMouHu4hCxMVAujioL5Dg4TqThgI0Z6dc5Zq4GVYPi3mIsLA7ao7MnsDSOM6vXiOpoI8+YC1ryaxQ5QE/i624e/My4bjBqrQ6vNmLbmSc4mZ9zvgABSw+fHA5WvN5w3FKEuBXljDZJkiJ7Sqm9us5ut93+uw9/2GzcOW/2zdu4N1Ejr7drVW1EmW3/9SbnDNXo9EZRWxKZNRmdDFFHGuGlszB0O6Rg4u2yu8NKO5Mu2xiim/UQXVY9Eke8Pxmptwd+yigF1Bp6BbjXNM3V1VWjSKo1DeSkp3rtFpaYEqzxgkye8CJs92pUooiL1xREciOGLpKk7vu+63obyTJnjOrH3/pR6cK6aWzOLDDQdI4bSaHPTClYlK+vr834+fNXqBzj3Xuv/d3PEas+Fh/JpWbozDrsyz/TReY52KgFYKDEyCQi8Nzvb75+DvMUyTh3jy6i9VVBgCOLBWZx5SwNd3jClMrcjPm4kgwq+W71aFn3kEsdOhwGmu/CihGA3qnBGeQdShwYmf/Qam5BuhfhCBFpGt1dtSmlRlyUDYMoL0RjxvCymEgAOuBH1jdn1aBXLzZOKjJ3cLQdhRPzyBypiqFhjEJfzEVSsAeoKFQdmnvL2Y3eqshYTuWEvgkrisiHkuEY0sro1A9MnFIdRVXcy+cxMFM54X3ftu2+68V89/9n70+X40iWNUHwU1UzjwBAZp6l6nbXlEiNTJfIvP8TjdSIdHfNrXty4YYIdzNVnR9qZu6xgSCTTDIz4YeCgwQCHh6+qOnyLXl3XMqbd++B/4IXzurLzOG7OlQzIw/3UvNa5vkAOAlDAgfh/Dzfhsu1+qr7nLdhKTm4RgZn6Fz68zWfAq3q54BhotUehQjbtK7LjTR7004FXZvlbjRY8MzIWYTARH2OTCxRSPJVS4dNonQdXXyVr8abRElA4ZrIzOhCn67eJTpbPy78HLgbO7QRbewkBAti9tK58ttpBjYyJ3TeqLi5qF9662DjUxErkI/LTV5rnfavo2ML4eV4+PDhgBdfvd8S475Uvva1Y9MtLvQtP8ffR1bw9NEHA2ZVREDGRCnxcnx8/+7NfDjKlCNQ5JxJxIFgSjaM7uZTnIwX0PrlVZtK7ZnsTxP1jndWlFJCu8nMDKSqKe9Gfkeu3sxA+TjPDgqOpKqbDdnOtBK8LLKMsN2KhCjSt+oeOrh4fDxO96/Y5PHD25TSDmme53/b/y2JsBf3CrIkk4iUpS6LxqVxZhtpmmPYYgFeSimLmmFqOvCrv7WZObd2nhCDw4LVwuqs1ioimbmUUkp1VXKPABuxL6Xk1bkbRQucGdVsShkwAk/7u7kcf33z9t/+8eMuEeOEPSYUSbqtpDRrvtrRlIzGa8y1t9EtTnLOeUopqHiqKGWJsw20Pl7kfXk31Vp3u10x3e/vj0v56edfq2kG5nlOKaWUmkOuyJar96nP42c8mM+JCbfoel+8NX8ZENJLmP8dNhv9aSKGM8yqWtXR1Q6VnwaIb1iCm32cS/Mnvs4iIiBAp16t+85vdrJ2wQZk5AYTft3b+VvwCqQgwwB8gUQkFGtrNa3mTpwoZ4EqMQSUiBnETWrIQH4iPUIUOecIpmeP07Y+PTlmijhF5WPr9NlTHX4O5I2TL77OK8INywyL1jvzwMdFkBKRxCCiZZl7aRw5X2sLHB7n0deLeBpmHRGaI/ZFsGtflbTTe70zbWNsrQ2VzSBhSrXW9+8f//Gq+dc8E2/0kse9bL95MWlA/9bNPqPWEzkTu1oti9VCHkymIQRELbTR+T7PbKGHQeoTyWl0puCsarW2ZhzCJCKc7n3zRuYEc0P3IWgyGX0w1WKZG8HZ/dTzYQPRIorJQxIWAKpNTBjMIpRzcizkJgxmCsep07VA1lZXQ975UAY4K663U4tLrPI4XczMxHY1d+hqxhww5FUN2LFhhxGEiKrZfCz5hwcY3PXMdHW323mY3NSQOy2x54e73QhtOefQzmLmeNmyLAGssbpYhRFy2jHIA2DI5O6lqqoTiUWjjkhEKOW56v/610//fP1vOecxQPnTuNh8QbxEeon9X3rj6/0YgDi64VRrWQ7HMi8c+Y5wDMioJ3EfvbqrVzSBmakPHK7eAUW1lFLVADZyOJjZeh7HGOZXoVTOZz6tp20vOk1/OgmhBQiAjLjZgzbFkVaGcrDioQ4BMyfZWFbTSY/+zM7G/UoL4ilFudOGl1Bj+sCcASNic2Ki0QIM2wQQg5icfJWW45U4IrXa4XAgekW8cuYBeDNadLOqzatQRWSappTSP378W9SeIsGv806W2KkW1ftal2Wpy3Kc56KlthYnRyATVQW0WkkiZkYs4ETJp7xfluVf//pZ/9s/cxYAw5Z3IO9eNjw9V33Zvvi5dncBsXvA4qwulGSLG1hfuVaGdJ6/wE9UKnvRtH2X7YuduFYrpW491Z2YzGEe9AFv4Sz+ex2Guq96t316cAZEcGqT1tqDRfA43SxGtAQQd9EPIU+MLEEN5cvY3fr4m9wwIvlQRtko7AKnpmLc9YeH0t6aHzNr0cscobk6gMDExB3DDIKxr2BmZjbhqv54nI/HYxbLTCI81gYi+vDuPQtEZLfL+/yw3+/3d1Puks4EBln4ErmReRXOIBORlKdpmqqm+Vhqre8PRzcKt9Wo1oko5xzrQL/WnnfTUuubN28eHx/3P+5P5rPbLsTL9lKr/l4RzuAWFGx3qrUux7nWerffiQgxhxzmIDM+kcedGUVvQRIb0P9GTNZMVUutHl1xF9uM8HACA7mex40MDlcMuohIvDkiR5Uq4eJsNjDFzRyGBcxInLJYYgg5w7T5ulY/mZY06mYUxWYDBEcbK3saAgFmNtxTuVf3wwra2HHusgo6LWaNPIaw7GAM8U90PIcwJTOb59l7rAlMtZkROzPlSaZpurvb7ff7XcrMLWKWUgJHHIBnbyzi8KR18wp1Ik5J5EHc3VlqsbkspZRaTEQk5ZTyXNwLREQc5rbb7edjPc7LL29+/fHVfw7o3Bq4mf/oMe5b1qov68OnbhG8aIN4qnVZShfFPAEu02U6dnby22x0OH72GHdr9R6NbXdnEbfG7McGYbd+H2Inqzbctp1/brAULC5sCe1D7KHRlbBJwZiZJVF2TgnCRNAevnow7ZiMbZ1/Nl0ZP9wi51rnkbBBYIzeaDtLl2dmtDIDbntS86qBpedo7aNVs1KKexOmDA10d9/t836/e7jf55ynKaWUyFVVa1UzyyIh5wRyAoN6aQ82N63uUHg4wLIDDw8PWpGW4+Fw0PmoqmiKKk1LThxqLMJ5N+nx+ObNm/q//T2UB0dKGx26l0fvpVb9Ot04tzFnMAoA8KprhgB0aqAiiCmhq2vH66nLw/XH9eSBdGKzWmPgGBEmHkF218gW1xXLCObuxuaIfnQz7jTHOWOB2lfa1o/sbhQmBzhBqLWIA4MzoRLBwAIJpTpyFgcRm0Md1aHuCcjkE3xiJGZhMnN1cyNr8w1rzS+Hs5NiTG3cgAbGgGAt5GNI7c3ixcFgCFDZCWxsIHIBVRhxk8cb+L1oS5JXGR45FDIe8WE5YpmTifcCGlxVHx8facI0JYfCdTflv/346scfX0Ot+UfUpZ13QCRGL9SnG9XNu8ViBUBM3PwkxMxIkVl2+5QnTkIAPhwPpZRqmtMdtwGLM5mklCVVpvePy2K0p9x8Yn3oD582Ovv3f0GxufTp3PuP26+dtpD0rIu8nUZ9gSzp2fyHpzPWL+b7RS0AGaAcUQ8AMmer8+Rcy/LuzTs4P9y/UvddzhaaYg6KkUSLKVGWRmgjpxAEcpl2ZZ7nZXHoNE1pSpzYXc0dbtTs1XuniNKH4/HxWIt6NP1Vq5llFrPeKu/yk04I9GsgdgGFM4ijK2d1uHNZcDbIHFAuBklICZJA5lbJzV1ZlJh+ffeepr3Nh7Ic/9//7b/s/fj6bucWsrpMnNVKNVIXpl7KWbTH2N21OJy1LFYMSoCpg8mFiUFCZHVx893dXohRwckZYAn2rTJ5zmJkVSuZWocHw8ndORywqgrxUudiSPdikqpCEAJPuhdxVzLNKSVQKcvPP719/V//cTgcfvzh4d/+y3921Lv95L40py0jCttAarNqP4XpXsVwjWeBmYXMbU6gh900SXq4uz/M81zK4+NBUtZSd3nKOR+OC7Ex87/efPjlXdk/TEj7opaYhJLVKtQEU0PQcCMhpZ8U5p5+Ls50qk/TfH8OxvZqhn4jkvhnxQf9PfK4S1TeX2Hus11C2UHm4iKEogY1dnImMFtzFjw/R7h2itTJTK1D8L0pkUU3vbGRRqs9Zrtqw9GvwTLYcenMQGsGRxczYmp5Wx8XdzkNawIDDQgsHuQwlIZtC9dBkBFNRJl9okpIocQU2C8Du4u7IuR5AYUROGAqRqDIpzYAPe4stEFLWNPkccsBQc9gcnYwNZMH77Vw7+sxqILMHWamRtzHLEIsTOyGpjDgxsycl2WRPP344+sfXu/v7lNZKrmpLgkTItEMP8FgZPknUq3IYi2Jy5+EdlmAneRMNFeHqZd5MTgcOTHd3Vk9vjssfy+aZAdb3DWllBhWS39rA5K1dSuoNPbZD+/LzOG55+gv2NQzs0iAhz/ASlM9DXBbtRIwnZrIINBUo5EUg7S1PQfedPTIbEsVOPGaObsWKyXefKUxNcnf1UuQAd+I/2zmm9ioqtGwWI2JB+Apc55SSnx2GzzjTjAfz2Q3Ouij1eikeUcCbtqCRCE9IiJEulVbGrNZ9DXB3NVd3YqpmJHzOshp2r3OLAxC4lo15/yPf/zjbi+E+Vkh4KOMq5NspbTBN5iZcxZwYvfd7u5xXg6HeZkXdag7M+Usxfjt27ePj3/7x4+vtRRTk8ROLzTWl7nq79Sb23R/1AIIEuBPI3ASToILHYury0APc76UEogRZjrTpz5RIiMCPAYOV3fVGfsnekRXBOQ6g/UE2jL+KsgGHaghWHv8RGTwahrUtJw553zVZv6ZPlXjpBpBNqQIMLmRNXxhy6A3UYq2o5g1xvW8LrLFSm7m1bS6JeITJqkTAIGDCS6AqnpKk3qp83GAcrc46BbX6HO6MZSELOgaYQjLxEhOadqRcKT8y1zItFZVM2Z+8+bN+/fv//m3H5i5NqiNCp3fikYvMe5L1OfPqb3/ypuZLcuyaA0XLmb255UDPY/z0IpLAd4fmUbrudNqWw8216UO7RA6k1FqQKozhn+kaaEoZ206Ea29FMVs+0LWRihOYkOjt7OfVlSdmVWzlHma0j4nSQbzgW4B6KOaP1fNrnrwZWdbhyHbPO6UAjGIou0Qmcwsohsi5SEK8RQzc1ZiiSEOMZFDiBJLYP1c8f7d47IsKZtWn3ZNOvSErvEbogkRGTncgkDcgdZkrszY302cU9mV41wOh6Mt1eDv37//9ddf/8u//acpccMAb2h5f5Ht9kP0Mlf9eie992K2uokBOFDVab/jlJpC7Mc077blKnqnSYRPwMLjAVM4gRlmFu81tDDPVM6v5FCn3E9rVer1LmrL4zYppNGwvCfvjq7uziw5i4iQG10rda/yYbd73opwuEdqFU4Q4lCFhx5u0LKw1syrqNSmcCRyIu8cYXcHo1mEwVvgI4MLOLEIsYRuMaBALfbmzbtlLrvdnnPOmXSZtfoFh4qfW6ietVxVOzwvgEHkzoDX+egsiTnf7WyXcy7CmBN9+GBW6ptffn379u1//uePOWeti4jAdYRaPy0svkjs+APlK79HP+4qNOnPPXY4Cz7UQBUotS7LYvCgcHWwBDaEgs6PovHUwgB1r8MFlRnCHsATkEMCvkskYa3gcFMv5gHgGinVmYbvCFLbhh1R+Pk51Mh5RJT4GINM6hajgNbRin+B4Wp5nK9PQmJMkpIIbD6LZR9tyZ1Gf15jtdEpfK916S4FClqMI2kegw4ncmtnWEHOcG4gRtsaSzOnxFlIiMnZ3MBcQI8f5lKUSEASyitEtFWZou3Q6RNDgcU4p4t8DscMFhjcyYk8Jb6nKTHKLgvIynI4HN68efOf/vEDMxczytlUr3ZO/gS10EXvGtsO9rfpx52Fub9IxcpNgmyDRN3yB5iZucD4wsTgibNkUGcJ86sxCd3exGFy5w5imJk61G/qrF2uOgQIUTnN41qB59ezy0EGWBV3CXA2irDXmRgShZcTPtn345SUCkIYzRKcnd3gDlJYtJzO3iBsEr0qZ/EeesjhTGarxAvC+SpGsBtUs4jkLInY3as29aSltiZAqSVWl13Oqn5l1PDpLTmmBF4B3v0j2DRNRdXMTWv0KHY5pcRwLqV8eP/28fFRVZ28qk5dT+gFr4/fwV/1Egf3eRnct9KtO8PvXP3Jc4YPpjqlPM/z4+NjzjlNWd04icLPBYLgRCQsGmC2jTa3qgZ6LPriMVWIUMqcVL2051AA1tryOPc2h90a1pyMDjahpKpJ92a32hIkYTatGAZaEbaQkIwIzIBsHkhiItrv9v/z//fzNE3v5w/u6e9//7uVmqkrDAc/1tZ3FxHd3DMx7kwp1cNxO+4oS4X7q1d3IduZEzFxrVWYKLGTlaIP93el1qo1XjPP8263C4doB5uFZ3cQeL10mWJmUlXKnnNW+I+vX+0SUiaRULKzGIXnNH14//6nn375f/yXf5rmWg/3d/vD4UOWibr/l3kjznU9UFwSbE9Xl/ECVw/oTATx9eTUWpmIubHA4swxaD/t/tM//pkI8zy/e/fuxx8eUkrV9NTHLEoCx+1xK50y/IArdqXPeRKf83x90mue2at9wlv2RUf0q2dzo/BRVS3V0JI4Z7p6wbY4j+u6GqfPSUO9rbA4cqdiWk31omB5+tY5E+M8sxm8vO85HK6jA8YenqDeINBuoc7UJEkcQfkge/6NzrAhWEIkgWIzM9XwRWV1GnbXa9FweoQ4hZiOIBspZ0y3Q5S0vaaHexv5bEiOk3UxFcxzmUtlFr+p80H4nLY/dRVl7l9P7goiItdABUpU2F1rE0Ct1QHIX/Gh3lIiz+7eP8zM4Y9b4QZ2RESW47wsi7un3oxz6hZ43WfdOw5DOxo3mviB5DUCMUccieI3oLA2wlso0prVarVGvrTS6c8w6GfTwPZDtUb2cidr4wPqNWbTGgkIblM4U4aB1+oqalvrg2DqWSFRhdt2WX1ORiwiYs2RIZpfg6Lv/TA9eB4kIW0wPumZoEv8WOHqPSYOfaQI0N7rU2ksO4BiAIsuzu4kqvb+3YfDYf7hgdmT2Sq627uojGgSfHrNErGVwESRqDUUidBoocJduZ9qIwozILWllGJmKaVSZrlgbpHjTzJsvdYBOG2IbRZyl5c87vdbZ3Qp8zyHQ1WzK6Wb6feZSwM2HPJLCy6O+k6DkMUhbTKSuHPzrdtwjVtOTldnRAGyHRCNrb9U6PuGnC0xp5REeGu9/HRxcXXmcOL66lQdFrxM9+rnNXh1G7G1xTkLZIybmcbrV2VmOtMfn6apzWTdq1d1M6iRg8hJHPz+8fDu7QeQMHNVvaZM+TlPloMJQiRE0s3FTnAw45ww4oSDeoxj5nme9frB/Gk2e+Z4anuHv2BHvm6humUahe4rAMnJmRQu3QNmWwx6lHuNqQrvPay2H+Hznk6gEwwGc1CkHi2JY2lMVj9n1N8yviDz+Mddwi2Qd+jwt4BecQz9EG4GoVrbZDWYE4i9Yd8whLyJCNaVfp/du7kM0xE+VNVdRoqqkeqOdp77eN/TGnzt7feW1+q0zcTMnDJPuxToEpCtmTAHNAYpTYfH+c2bN//7//ZahEsxSeIG0Mp3a0bV6A7Ya/f/sob10xeEHy4Tj4gGNDEC5y7WHLMgI0rEYJ6mqepca12WZdqlSPnPBqnRj/wL8h/+MCH/j+IXeWuhCfRv+KdE96QlR9dI2mfiBVtNc2aA+bJ13V9GAExRtK5IqxvZ3EcbAlfTq5Gvrf8pq7ufUSQ3TKnJRiWRnHMS4XN132flcbyRON7akGltY982G91meddi3FoX95zI1o8ch8tbw9MGiPNoEZhBASN2gHfTnaq/efe+FCXh1UToC7hksZOgCdEInRpR0sY09ox2ErlnDFiGYY39xRhdZ+3jcdu81KpfrTj1cduCu019EJviwTP4NT/O88nDaJOvhSqPyjGcFnDiP+xNMy7e7rITd2vscEWpxTejjKYbvLU4Jgr5oEYp0yFFGz90JiIX4ZR4m099Upt1W5u7kRlMh1dsWMnLaDO3qGc2DLe4OQdu5Ms3HC8jMCR1lO9lLb91cXRCCMTv93t3f//+/bIs16Izj+vyuYGOwdzw4Q28J2uyGSOSsGf1Nsti5mma3D1i3BN34584wF2tXvEyV/3y53qzeJKDYL1zXc03Q9WwF/iUPtRoxMilRVYrJLullLtVU/XwUji7CYygQxrzvJnrXb+kASFouFO5g3yNoyEhhTbbC7MxgrHDiY0zJBGEYAme2BN0MEVXfT1sjqE9hRaaQAA4hmKyNp5auPeqqurhirgqJ2/DEzsEJEyZCLDuTRNhNyQnCeTcteIR5F9yh5rVqmqh1UtkTZetmSI6mUwZxPNSZ3XH5PHpAYrMyduMwogj8fOLivTW15ge9WIXCA+QuDDbOTvRqTm1AharSHgcniaV3B0q7KMtrT9M3RmfbvO1GZlbTNJkJMKf14+zP/E68Bwc0EdmZSSqSgF6MDUtDpKUFtf3hw9GvrvbgSmJTJLdKQn8rHaj7jbdwRmj+MopN7sqIjInh8M13BMojI+9xjNaHeDMKTqAkRS04WxQPUW8SUV2lUgNXJe15AGksDZrZGYJoUdtETVIUcQKCVYnu8JdOEmeZHo1z6jmCW71+Pe7/yRawc6UVNtg1Mx6z86jv4aUiJwZYactTCAutZY6q6qZFiPOzODqdZIdmMysevViBDVNQcw4HA6vX90Lmy+H+0kedvndYWbOymTOIKREzCTqZmZKzMyZWIs7uZCTV9fMu8bjIAd5AFLAyCnP88L3u8dl+dcvH37829+Wwq/u7kp9ZCigTAIIWJTE3EGVqMnjMZF2m4ZQOCJ3DeVSJmF2kqb4tFoChQeQRexvHT/q81dm9UrJ8z67a1ommTJTDjEo7gi7eGxXaZnn5UGfh0i9OlP6pNHcx/48aHuhBtrIxmje4P3nGL5DkRW/bF80iRt5ygo4CPBqmc0qiG45NlxtyV2a7I3693zlcdcQGtHuOGO0rdFwgqE779RshdhOF7NR7QatPchkLedyQquqQrqSnIjACSSG5EbsSPBMJBSyumviGd+H/qYTNpJIHgK/6MpS7O1khgyANeSHdQPreCQaxqKFXoRHmDJ5W9NFoguv8O6B3Wwf4m0sGnRkzYrW3Zp0KMOT0TqedQJIFvNf3x/n6pLvVJsAOrtxf7wMDTF4lkGNrwHOpu54aCdSgOPfSO4udBiZQmVahKIfC0A4MzNCkH2kcmTrvz/PFOE5X/9QM4c/TBtuU2OO7g+A4/EYfZNtz/iyxz9aS9uBw7aR9NFsNDpxZ7YPfCEk+QkNmkgYbyNXtgTPrYHOE39ya7ZwtuG6m/WNHxrC7XD1qz9r5/UtuCXRGN3ag42O3plo1dnVASA5qerPP//84f1hN92Voh27S0bPFZI5GyM8PYehUw2ubdQLSpfVEg5e/JK4XK9vX7avEOYQVHwiM3t8fAyTmtaMZ3Ym68pFl3PS6NmparObuTZLPX1TJoj76hd19qhsu3jn7+XXP8JZ4XAaf9Yx5QjBIuEy1hR+ItzEfDOsDi674O1r4zPwiRVjFwCNacY4zqtAv8C7RZASXkcczBy+QNvpTZzwOLCzcDYWmKsIm94jYxFx0C+/vn37/oPkXK3rWfXZxUfD3NOslY+Gue1/thGWWUppl4Vf1DFfYtzX7uuts1HvnXLV4/EYPTU+dSC+1YwYIrojF3v6sRlZRuRx2Eie07Xge3M/jdVg3DpR5/Xyeti86kKxQIRS4hbOYObVoYCnxClt8rjmwnczqm4O0nBmk3qR//a8LJDPbvCYXHMo84VDgkgAZUUEwq0ybYwu2ybdl8nU1eNkZuGc0vR4mH/+9U1VD2IZSIDmnwBA1lSZL/8F0HcD923fnF2my4h2Ee9cqA2O73Y553xFBSvGJi8x7mX7GrMLcrjZsiyllKGLiT6OvJUpoNsMnsW4pxqxERVi4LCiOOjpTAE36D0Rp9rwdM00vadj0cBes8sAavRPt+oIIMhYI7L7lTcd0LrINIfdRDNdCTWUM3xMlyyOjl6Lbr1V31Mbc9cR42TKOeeUUszaqvlStJQyXLrPquOzmNLH0GyEwG+naTKin3958/b90Sk7koEizJ1EqE9prj+R0F1ezWg75p7EZaG7uztmiij/8iS+xLivG+O2t6mq6lK86pn2LzPjBi1/dOK0q2IM5MTVpAAbb+mBjNuYLp9lao23cC2Ju6i4W0TToTsUQ0/vokkgJ/JeqErUTW3o0ftxjeRw8gG9WzFu336YDFqQLMhOmlbM23jNq5Cc8zb5JXKWFkkF66xmNXXkc2mNs6bYVSLtBmBMpVqadiz517fv3rx7D2YndmKAncUpvGL9ia7nJfHoMsumj8EnATCDXF1LEr7b74TZq6Zrl/cvm829xLgvH+PYT+9ObaYKApLt88ZPCf+OmHUrgJ4PBlpMXFt4I0MZFd9Z3403gtjkz5xC2KpRecqm7J20c5Zrf5n1KNZtLjyibZsekp8uDyObC9HeTQK3RvwO8HTqAgZODNtCCMdBdiNtAkDo8Zjz1WERboggtYTRvZiSZJL84bC8+/DoSPHPIA3H8IymLS50/T7Wcr3Sj2MQ3NxURHLOAMzqX8H37vlb+m4jxa3q78vWkrhheflb9q+q+132YuUwT/d75Pzrz7/UUvb7ffMzT+Lucy1GmETOaKRdsaP5249aL0qwYifY3a7pTYm4zGVZlviTJNkRomPY7nYkKmRuAHdDLTc3VTMTcoczkxMXc10KCURkmqYIYWYWkhfqBl0Eebfb7fdTyuJutRTiNO2yvj2GDNw//vEP1WLi+92uFltKNW8zX+sts+ilMTOLOEGrjiSUuxaIiMcwo5n3uNdazTKRLcuyEyaSZVmEbb/fL8uSRVgwL8ddnrSUYmScwglDVc2aDkcbjCQBQCLkTWgvhuDRSAwtldB3Uq2UhIrMZXl4/cO7X/71//0//+d//3/9NxCW5bgTSklKKc5IeVfd+FSr9uy+I7rMFu2yg0GnCk4b0gseDx92Sf7+w+tpmnSZCcg5l1KYztFw349D3m/xePmMA37J477KNqaKrlaXUko5a6wMJSWjNUc4SxluLew3bFxiWhDzRR7d62CSjVTuyoSkmw2e30mbWrInHWpmDiXGqBxH/F3vP7LeOjRi3/y2KWPiYpIraMSJOJjWkhsnAR4MisZ43VgRNvuFDTeTiBhGHs3ENQF025wfwOB6Dasx6K4XA5B+ZdHJ/yQEAael2pt3j6DEksHS+XOqWj7DKP16H/BUti+WvXhN5vb9S+72EuN+1zUqqkVhdvfj8VjmOQrDte/D5ExGuOojc7ZkbT30BocxAtlWAm47h31i6ZZNKXeGwGCA0cgVPfAZyEL/clRqrRMn7Ew5i6Qrc8ABHAk0yRgTt0Fto7hfaUttTkg4Z9mGWOaXo+eISAPvOjKjJqDSz3kXZfKgsvUX8w2PR3sCqedGYIYIibDslmL/8a+f1QGeDKjaupA9JD51LZ7u051168YLuNMBVTUlzolTWE6QUz9pL0/iS4z7apvwGICmlGB2PB5rrdvo1viSp3HtbBuh6hwZdyGjEOroccdv3VSJQsXoZMZ3AiVtPMgmmM4XvZ7tI9fTsXMgS85ZLmxTo7aKM9CGrRTRyJqx4TricB77dHM0KJzgRHp7RDrZxNAh3a5mTfOSo+Pp5HoGQt6i84jESZiTXzqNbTy2L1M5hYODEidMCZw4pbnof/zr18OsQWkZsgtDfAHXhqTPDHOXWJbtQbrqbpoCFjNmqS853UuM+/p5nPBAMKhqmWfXhv7dzvgGe/+WJeCtiulCP66NXOsGNoJTpB533xze7G6rRHSVrrh9ly04V+GKE4ZZi0TsMddw91DHbVUVnydouBhAb3IljXnEGFY0dtdWJNJhm7FM3zPjRIupF9rsm1gjvNlGlXcVqHGmZdRjfWpXmcWJOU2O9Mvbt4fjTJwkTU7iLERkXjcKzb81+mxP0WashMjjhPGSu73EuN/xnG5W1JAtHPnOJXPgUtPtEmF/Ekcu0AON0169VtN6mmfZpg71Kx2fng7Y2bufvemqEbABWAQUhq6h/HoqtNKqWnuOaEhodF+WhsVr7vSRjeGcnDsEV8Z0eCB+B0hlhLQzmNt5PuVduzjURoUvx6kicrnGjJBnRGFZr06cMrMcjsvbD48GF8ltGfBhbvtptSpu6KBtgYEDURQ31RPsupftJcZ9+S1u65EflXmJGLctKJ5wAnxOHne1chmA4dOw0rKeq2xHXJNLC03BgLxtI1pUwZvHyWLY2v6WfFDH43CuzkyaqNS1ueFVvuqIaLe6Y5fHf8Y/xWk/buNB0ySFL2N0cLwu08yzzYAg56Upm9lPP/00z+UsJW8HEwJwvYvaNH9GU3X771pxum3Fbo92mqaHh4fTPobC9eUZfIlxXznGDW8Bc6rmVa0qkUPYhY1Q4dZYShaqiy1ZaSO/3gXvN30TOGuvCfzXRkAi7FN7NWigIR5LbhF9ziRGBrtrqIdYtzzExUjXejpYazWvAIhBpuxIxLssDiU3NzjEScJ8XuGBhOOw6DJzD9NljmEoTuG/FFGVCLAQbicioa6xfjKH9S78C3dSZzdxP0cv6waxEYONphylreXnBHUHLGYskfEaVSdjNhYDKqHGCyKTdI480tmdyBnW+bDilH/+9f37Y1kMGlLIIGaeUsLzBLvO7Mou14At5olciXyXZb/fPdG5e9liS596Xm7RRD7v/F4d3l/pcD3d/7p9czzx+q+Uz6fddDzOe+JX+519OB4/PFI1d3dhy6gZnmDwpn5jEGoT1/Ysu7mZGy1LZY7UT7Q6CxFYhMxqYnH3qlUboTOp4/3jvBSLagqAWXUYC7fRLRwEce6aRI4anutkDlU1dkppInYytxq2gQErdXcW5EnQncB2eUqZpywMBytxYpoM4laVYKhAYk7Lh/LDvz3shEw/5ITHQ52mCaxmboBG0kEE4QQGscOj0UYdzecOhmTiwkYwYhIRsGkJXc5smpxq4l3In+92u2mSx8fjLicWgntiYceUcpYUfj5Bc3B3ImtOqK6SpKou83x/d/fw4/6H+7uf/ue/7x5eJxI3dbDkpHAtJbnnBDKrhCmRalV1mXa/Pi4/f5gfXr/O+U7dBJQJpHUsWqeMXawYx0HOpdGpVLNIP1PLZD3m1G6mWufEfH+/mzKW+QNzWGdgtZP4GFb86efi++lrX/ZznhlJzn7+h8/jriLFv+EFayrbzOTwWryU1vtnNyZlaBOWM/KRnvAmWWv52pma+YqNcIzhYzTRI4ppw2TwgPh2Scsb99A2TYAEp/2kwOSWxHlP5eLzMUOYJeyM4TAFDBBCcpLNFIXQ3fvIrStCNpvC9rKz5bONRod+nJFbPwuRzmDARxpeJAQEvNmjEq6YVxBRGjICbgKiULaLhHFLzqXqXkA1Z3r9sIMXqzMzpcwKV4PkFEDoUbA3S1mRWfWXdx8+HBfjDBI4C6XNJX56O9eXOy2LJXodZlbLTO55kpxA5MQvlelXqFX/KN4x3zbGBVZ+WZZlWYYSxpZrCefwBx4t8+3pPdMaOTMoOevWjSb0Wc2yvS785MM2qterTagIRu04mTiJpNSfdrqaUG/7/efnh+DEV9fts1EmI5AiMau1Ffi2UUN5wlBxG+Ni5nDSv/c2yujT55ZtxWnc7XY//vhjSqnWyoAQkyvIUkokJ+JPzh2GYvTzz7++f/8okokkzDpUP/O5ONMfiHNSSgnPo5Uw8+lrOd3Y/qzPIxGlP0FMuRwX4tt5Tod3IBNp0ePxuCyLQ0XyLalI9xWktUV+Xd5/XekfncvUItMWNYILZPwTd+9aC6xBoScS3MF0TJEL9qNKIpJYUmLmE8UOv1gI1zmsbdIrw7WDpNP+OqHBhqP5dU7I9667591K+oYbjo+WWQgy+9mYEhQ/syCwcQqg8pQzPzCqHT8cl+WYABJOgXVmdgllAnUGG4HN4TLld+8f375/r/h7Jo7uQK1FJoF/8mO5jUVwB6yUqlaIsNvnaZrisr/0019mDt9i3TAVYnJYqfM8l1J6Zpc6gpWGKtATSODLOeNZKreNiQOmcAaDCIGAc59N3zDee7f+Mn88yyK3kNotXoGuwWixEfPAtalx/0rDIBUbU2oRCp03ZhCD4UIuDcc/yrsTfBw6muQslVv1fkGX4mtNAQZsZk4QETOEClbO+eHhYb+faq3zPAtRFoY5hCENWyecSRJJYkoi6Xhc3r59fzws7uQkzxQEvghwq4pcdBsC4zzPM4D9fr/f74NyO1a1l+0jLfLfMiX4HnqWt56xb7puhPzOXMoSZpcnHvLbZX3jzHUGx70sVDcxDmsWB6hqKWWgRs6oP5/WhcBqaG0XgPvxlZlH3JOOL7NIurpH2DYVHR/Y7baPKij0mlKXC2dmVqcVO4K+s42q3Ua+fBSbPjSKsQJT4i2465a4RwYngILJFAByzsdSwwZ3l6b73Z4ezFSrOjkYXl2JEkFInEi4Oy6oq4OL1l/fvP317duH/d8SJ3annZj+plu6o7SrQ6cp393d5ZzN6mc3iD7PieYPXau+5HFf+pyG011VLdVKvVQJRzOIIXLGBRV8q1F+Ncyd+UUMhsNZ/+uMGLDN4C6/7xmoX9M07283RhAjSSRYl8k845+NXPWqkjic3Bo9o49HAFqpqYk4UUNqdGovGB7RkgG4mtXt7KXxHJwuGfWNgbsth7tv7DYXBiApAZjneVmOgLHg1d3+Hz/+7eF+D6tal8RbYXcKLq6DAGZOwvn94fjzL2+Wok5cqvOn94LOApyZqRVVzTnf3d3tdruBx76k0L1sf85a9Rao9dscjHdRNlevq4RvU4uLb8AjvwBOSsUnfHBvpXXoVPwndEqes26flHhjB3yFHH5WU9/ygcUNmZOr369AXz9V+m5wue1vV+/Rc34I4ZbC5UqZwCrEssr8kbgREYtkJ7NSrdQo53POP/7w6vX9nVutyyyMACcyg3nglgGAU5JpKqW8+3CYqxa1uar+Zv+9QFOb6W437XZZUjPKGHKkL9uXr1U/+tg8fZc/kRv/doQdnpRO/Z1OKMsk6fjuw7t371RVhMKfeJqm4l7m6kwM2pi6OwmnlFQ1qiSzE3LoCe6PXGsFOTObQVVVUUoppYgkM1OzoFgBcLiIkNHqydAAD07esAhkvlanRIBb6JnEu3fOhnNLduZaqFJKiUmEGBR5E2BqxL4hq8YHDC2zSUS1ikgtZoZw93Mnc2emIPLC3BnE1vQKGBAyEiKbEps6oI4wEqTYczQieSIn1FpLKbjLIiJMZqZATk2UOKW0y3kpFSwiUkp1UwkhOSeo5pyd/XA4ANjtdsfjsdwvDPFEEHm4vxORd8fHx+Mh5bvE5iSBVjGGRbnu5tP0eHj3yy9vfn3z7u7f/iZpKuoShfFF1X82G9nOlMOOQ0TMqqoycH9///r16yCzABZTewzZhS9Rez7RV8UNvcUniDq/MYZcnYx93v4/Bx/3V5s9f3JiTORWPUzqmyfpSVmxZR3QRYr0qUF5lGa3/pY3Tf1brbrLlt/qWzrsYk+5q+MnZ5T+W0LhH72tL2WKEXalcGp81RAj8YZKc4edv+8Z6/bsjg0tk9HgG79ylk2fsGkWDXcecgjxlNP9fv/j6wcvR12OthzgOiWasiShiD4istvdHefl519+PS5Geaf2yc9XvLWIRAsC5ClJztLtNb4X4v0fqH/HnxrLXmLc07WqgLxqmRctNRKlkVidB8NTiuJZnfUc1dZLwbhb17H9rfV4wSyd4r41QKEnEnBuNgjrNJMwhOHOau0nDqnhUQgG3+iFtNaktFrSpWvjcfhPR1yDx9zg6klrrUm36nb2jmfEdY4mXfukcnZuW3oI4lDSRCDj+OFu9+PDw/0uZTLSgjoT6iQ8ZZlSBpBEpv1uUfuf//7T23cfWLKD4M/SPd/kKcTcxIprrcy82+U8SQ9w31GY+6PEu0+OcS8Y4CfvViNyLbUuc601uunMzDmtGZzTVQ24y1TuiZHx6JQHMu6Zz89l4nYVm9I7THSp0r0VcQqt8rMA93Sfzgmfzq+0s9FBqMg1hukGQX0mOrSdvQhx6A9txVc25CpxsIECsVtMS13WXamROcGEOCf882+v//Z6fzcR2+LL4lYm4Ye73S4LEeW0Y0rv3n346ec3c3HO061J8q2LMrLjWhdi7HZ5t88ihO9VOulWj/X7ObwXnsOXP6nLMs/z7HWEHkuJb5e2a+w4mwniApt2Fp62Me7pFHvkMJfhjIiE+KpT17oHXlEg6rZoXXqYO+Np3MhN/GRZdQ4zrSFeAPMQHw5DqzhaJhJQImY4k0eE42t1wyqs5jaCaT/3TftzpHLcw6WAmOhMaz5W8bDFcHd2C2k2ioTO9NVd+tv9/sdXd6/upsyOOptWd727u4t32d/fOeiXX978+vYtcXr+uGyknEPlJecclIat7l7/xr6H8HHZo/gjzRxewtbnbapaSwk9pTN5xZMWXLdceCKPu3ZFmnh3IyR8LI/jcx7Ild0ys28scNxdAen8bmciozNTRIWWUrJ0ooA7aCtwBlzTSqAx2Lj2kS/j79oPJCECDyUU8s7rsrOPdqkTtc3mTnfe38sZBAXFZIWI3KzWSuTMiMjorg6QG5O71knwap9TmvJR3x7rsRyL0sPDq0WEzPb7Per87sOHf/30yz9+eLUjBvT5tWpoDobp/X6/z1m2jtov6dvvEeNeWm8fC3LBOihElkTqU8bPYEcw6rfPJ9+GiZxeBd8wVfmJ67hxq2nkL2zk08wdm4MMjZLLSnYrL9xdXJkImS+zkisqdXQt7Xp6/Q9Cfgf/AqEz3J26mpjAgAfjum3gmCa3GOd+Fu69c77MjJKg83+lW3xDa/jJtqhYK4gSy35i4mys9mEpWmPU67USKO/vyuHDmzfv3n54/59f5VtX8CokoLleEO33u5Dns6ZDN8wbHd+TlMb3nwy9zFW/6Nl0QBW1uBoAY1KCEjvYgAb6dR7n3QhXU/1rGc32tmKAQ0OtmrlTw+RtJ7Z8XbucT+/L7mCK4Q+tg+dJbQZ5Ia3O6maGoq5qxgwSMIhciDjUH1veoSEjF6hA90D5roepThYfpEVgJzdy6/jkTrVqDlvBcIj2XC9nIYMhB9iAzvEYodJI5VYpACeAxZlA7GuSxU6tN1fNFWROalZMe/NRiYhTdiczI8eU0uu76fXd9GovXg67zDFjTSkZ84d5ef84O1ZR+x6krj6GLa9XLe6aGNMuZ6YY8TBv5Ge+Y62g77Mflz4VMrrFst9qmj4n7/uj1MIngeNUiLHWmnNm5uAS5pypmj4e7cOjuPGU1KlMnO8mS4lYiDg5rPEcIpty4uSqWt0UcOaN61LogwdrqydIYhW1VkkJjsNclqqUBCAzdyI0f3h3d4moEGi0ZjgfyLRmFgMGORuBzNzcGe6kqgCHpRUlmnZ5WbzWisYha59dCcdZl6r/uPubEQHK7mzMiPGs7HcMWqrOatOUJvIKU1IlB4NFxFnq4sWVk0QtKmwSynpEkOSOYiYiixV3J3ZmOFmNppsnuJuxKUFADGZIosySkBiAuZGzMYtnofv99Ovj0UzJHSTmagEGZK7axhpFiUlSomL67rjc//gjMZUyZ2ERMnIAxwKiRCTEKTMR0T9+2P3wMP3HT7/U+igssstzobS7P1j6//yf//7//K//KMtCbruUiTzE6Pc5HY/H3W4nkpdlcTNJk4Oq6vHx/d3d9HD/kIXdqpsxsyvgROAQS/gadeLz67YnEKnPNE59zvF/tu/qZRT6w+uOfCdt1yHMPc9HUovmUYUrIbGYkIRrPQlvCVXXCpZbzbh+8SJ2kcLN4AQ4jBxXaHlG7sIS3nyR3XjP7zYcfgdTyBI7LAAiCudNnzvqxXWda6UjudNSIYKdOJFH6c3ODgIZSK2lLaHxXTgKryCchiwkkYEN60khWMxMsU11I5VjChJcqKlYQ2ZwsNY1lEHHvc5RwFrjs8YAonN9jQCwOg3knZM4mTkcrG7mUkGGkXZ6OxiWUIOPVgHD4XCyV3f5OJdDqWpglry7U8dxOf769v2P98QkxTTF3ETNzHJKcO+GbQmAqqnqlFIOIzOYn4eYF+YlnuzeXA95/PtEgT/rHHarxhFn+XA4RD9lq8G/9RO4DGe3YHFPLKFbAwdcg5Ws/i83tq4tdCK+FOLmtpKiaIOkP+1hubuRu4fkyRYscmaqcNYmi8f8yh1idHUCc2ZxPRC8Z7mAabNeDM8wP+2irHg9ssbL7ftPxBwK7bQZEbYa8cxCO86IgyycE9xqoIWY+eHh/u5ul5hgKoS7XU5M8zz/x3/85CZJ9rW4mROJmal6MFsixomQu9ZazGy/30/TtLU3emmC/979uJftaoYVT3Wt9Xg89gZKuzvjfr3lgXIJ/d02+K8HuB7jqqlfM3s/RYf4J2G5t64626O9XJ/i+8Y/u6aRdkE54EvYynlEIwGC6eVXGgQr3o0CdOLoABYzVVfdnA0/iciDHbx5OwNsyNJtBVIG8k7dO+tj1UEYUgjhFcvkiTBlebi/e/1wNyUhGMMTg4GffvqlLEYNgsdE7CTuHtAZdNmCmKWK0P5uGhZuHx09vWyXz9TlMvlSq35yb26w6Nv3caODXG2ZZ10KwVlEN5rAT4fIATFrIeZ02nChbdu6orXWJjfC1IcHdJLvrIHVurgmN2cbeMN9tPRsoDEGGoQiQYwqFUQhy9lsVY0drfen3rgW7m4M6jEp6sEmfOSdFsUE9WsBjrZqUUP3shvvjH4iNjbSW6MtCiF1xZjVtgMZc9XTHNnWPj+RgJQIjm2YKxYfSsiZiJ1tg05T7naOzQiRyUz3u4lZ3P3941GtCPx+vz88Ht5+ON7fv2LOMX0QMYdXU5AIA7BatdaFU0PDbe+XWyYnL9vzt68e4/7El+dUrsdrKfPh6O4cHG03YACsnHiddPZz4hdZzPqUXZZjq0ybe3Uf2r/OBFvzPiGCBRxkU003U5PTva0xbpM0hOvCxsNwIO8BOIbEXD9IgxlqtSwmQiA2vwqXYSJroxMfZmM1DBnMzJncWtzs7hG0zeSk22NF1BVy69IGRhbBhimNsaOh6ci1tx9Wipswt6UWCEgJBCI2cjIzdYuRaLiyuiuZj9B5evXNHALf5fxwvzezw1yICJSWxX/5+c0P9z/cP+zcqjqyZNVi1jSJQ/6PiHa7vN9PQ1jlKvf2ZXtmnDlxvHw5Ox8JZBc6a1soQGMRADDXUg+Hw0jcfBXp5jP2wlkv79JN9TmdzdEw2v6J0IlqE59CfaIbtXEJ8BPh71VMvDsZekQjjhFHdWv8BGr0Ve+WqbXWavFfAvCwMXCw4lKywi/7XFsm/0kBbhhTmpHEXa/0IcwMJicOe+kzi9WtaatsySQw9sZ4b+eFafWQPLkEMeCxoEowIXwQ4T4Je1m8Hu+y/PBw9+ouT+wJlNL0089v3r4/JNm7Ua1KkMALEpGqzvOsVqZd2u+ncEE746i9hLmXftw3zuOkG6B4VV3KmSbSkJC8NUP4qDbUZbkamrfqZniuZtxV+fLn97O3+iKnrTphZoPX04B7Vdz8KssihC3PWB9rsrkRaidvI1eCMV34bzXodFSf7QAMbhjD6BbDucfYFrzd2n/6ukI0J6DxKW6eIRtmGDkl01LnI5M/3O3udrtEgKtwfv/+eDjMkNSgOTHpJkJoONfZ3adpmqYpMZ3JQb/EuOfncbf8+W7i455Ws7iVHF5emG/VMb1K6Pkt2dy414NVEBpe4ds0pexq8+FYS9mxRBMp0rkTsa0N0m0cVTSbT6YNG2Xds+zGzBTOzMfj4Xg8MnPOGScmLEMEPFwHeKmVmdqRGA3MXUqTRi7oRiBmti5VZO5qAcdyAJHBESRkxJOISA4L55D/dPMouEoqDjKX+G2S6Xg8/uPvP5ot0Z5jSM40L2FHbfGQk1uWBIgZVD2SSyY2Q4PdNppq9OOQUpomOh4XKyVkg5mTezWDG6l7DZfAnBiOfiJzzikls0cnpJzC4yqlJE6gEK0j70WimpVOyBVigjCbgxmkVcPfelyRblFUmDmTey3GNiX+4dXdcdH/9e8/L7X+/Osvv/7y5sdXdzSlALKklOb5MM+zJPnhhx9evXoAcDw+JqHLcP89jx2eiYP71BbWLcG4qBueqOUvfZZfZg6fs1m38hxyQKrmITkpN6+ZfyzPevpl2+Toco65Eqn83Dhm/R5PzelCVpyMPul27CU2R65nZo4WlE7THw4E8tWH1n3bjItXnOsjMZScyS1aiFuoR69IKKQ317t81VKixCIiibg2PWEQO8GG4vygSlCvIqtpNSSO4hGmcLbWxmznkreixPHGHB3DxK4JEz88PNRaPxwP7z68f7ibmExdJaW5lGU5suDh4X6/36mWCHzwF8vUL9zf5xcdkU/qx9npuW6+do5aii7lCRLItQfbryI/rl7U7boU+VcEF73mF7Hd+ZaL7q7RcmLmIbg4enPxKwCBmoyiWOGNXtW6kLxakXYfrNihgavqXIsanLjrecD8nPMXtNPNaJVOTQTXI8FGnfwEAtIQJFfWczNzJwXZaTaUsqTcTAibhEmn5TMorL/CyzV+ONcSKXbtlaMFzhjsxEbc4cG8DcqjA5uZdlmmafrxxx8fXr+a5/nXN7+UOhO7eWXBvByq2zRNr1692u12QVOV9AIT+cyW0VOiOy/n6LkLCF2p/4dddJ2XuhTy662uy2+uo3a3OdcFLWZAN5o0pq9SkJcIr8tO3Fmr4sZd4sSrZqRttuvLafTRqI1ZGgp34/Rq2IyMIUMsZDsEALDt9a2tLg7ArW9GKMY96iUZyOrI3RAacDEUXlta3oShhmVi02IhC17KEApdjdOYwFRrLTYQiDSCu603QwtzDr5sesYOE9P9q7u//ePvkvnXd79+OB6iyg3g9DSlh4f7aUqNhMsvicUnd6KeU8u/1Kq/dWQjoEV1nmertdk0McH90mvGb+fbJ7PCG/Wp95Ze+DZsAWV0ao2MEOfokketGlxvBNu8OEBs/c96xWoEcyfjMdwYerkYyI6Wf6Ez5OEelZaCGhmsoXPDWetEziSmMRLpYAtVRs7mp6tJ05XzTZufmRidCdCdKqgVvKpahUcSO1oKXZ/ETBXE3ElaRCS9ecpwdrh51KotuktTKyAiQIIqQc2JiOEOgkeFSg1WE4oM7TFkf/367ni4Pzy+fffuzd9+2Lnr4fiYE79+/frh4T74KiwgSk/Lnb5sV8cAHy06X2rVz8+QR7ZSa12Oc3ijfGqtehmknu7EBc1oq3Z72Xldba46We8ygb/0Mzw3G9wM+LZ53FVZxCHw2wgYtbYJSYcHb6laA7ZyqQ96K+5vJz+hrTSAh1sqWIwLLp1q488FK9ykmQcmiomBbPK4OG3qptXVLWLdpqnKDgY4FFOMmhHbJbA5/kS1piwPD3cppbfv37x//169Vq/39/f3D3cpsaqqlfhEHx30vWy3etlP1KovedznFK1Rk3pH5Ndal2Vx9zxNWOV/z+OIP+NqXQ9wdPLYDPDXSdLuKwtihfMyuxuoj3Nt28A6EYxEjHzHMTif4fHajxHD4c1s62xy7TCzamVb6gYs1wkDq3zej7MNV6z382+fEycC88anwhkb40EzC00R4CSJ3sZ3CW9UkFWlwPhusuCouzsBFqoqdHID+CkQJiisa0+AQ3GTASYzVb27u9P6UMr87v2b/f7vDw93r17dR5eD2Dk8Y12HTNzL9swq9ZnF1sv2m864q3kt5pXcsmwe3XZu41nk+MnHZC+fc4HJu3cfAwCzOzvINfQ8yM1CGK27o7KftNhPdsh0hmcmuoABmY/7hC7uNj6dwITTXmSZ5hKsJ3d3qLsqNN6OQUwu5FtinMEjOdpmfIARA1SpGVPBeeShbWyi2FDuV74qjzucHIA1lyDyRMycSDJLBomvOS9JR89Vt+oojsW8BuehQZ8HUm8Uzz3wdTl5wBoeOVGeyHTOk7z+IdAhRyb54Ye/Tfu7Zo7DPKUMU1dL/GKZ+jkV69Nb+nrv+hnCUl982vL883LTeJiasEevkxCg0ZxSrQtnMS3v370hrXdTruWYBAZyOBMLMeVJponzFEmSmauDQ/vCqqoHgX/rNh913/Z4bAxSIXCuFaUowMKZh76tmzsYICEMjTgzWLdB6PhSczI3ZiYm8fauBodqDDTILLr77q4GdyInNxdK7q7FlI4iImmSFDPZDi9DfM9MqWrJ6f7xQ1kKvX51B8xqC5NSSjEdyMQZLG661MpedynB1S3CnrToYQQT9l1mJa4EMWdlCJs650RVVYuFOh9prYbdnno2V5QATUxMjlr2iSfBQZVSQAFTvrtb9B0Zi5m7kTo5gUiJeJoOXj9YoURZq4jsSFCqJCI4E8N7647YmdSVQBLqdxyMOICqzfP9bnc4fFCt//j73x8f3//865v/4//4bz//9OsuM7GQexJWrWU5cs5MUQt/rcfk1pP4pXS/tz2cbakxyD/na+SNn39qKnDWJdjWPS953GeNGhwhXiigWhevSu7EPgSpm37GqPv6qbbz0ap99Da6kPqgJgbrvDVo4CaY1mxgtq0KdpA52Un7L7IPa6H7BEXc3ytMWzCMAVuVx2PCoNFcR2OGntxycHGTamyKaJYREW/kA5jB0jxPo6StISPXH3KsTThb0S3jJJ/2Mdcb2tsVaPPW/taJJQklFqYWAatp0RrgZCJKxKHbFp/FAvwMMoIS21gFTdmN3QQn2MNG2mNqFb2burpbTiJMIhwgZCJ6/HD89//4OaeJKYUkVFT8wvwnQI58w1b+VVbC76Ef96mdwj9EgIt+zZRSVB9RcURGZUNyg05QGtue+rbX/rR+ziWYe9ueP5shnO1EcILPOCNv3oLmXZotXNVfou57cOvKjg+oquqmZk1RPXYoPPAcaDIqum0yWmv9OS6mxsycCAQLi1jcYLy2ke5QP2dOKcWkIs5icDNaudlnDls44RaDMij6gRk06uQxWjn/25t4mOhEXEsiu2na7/c558fHx//xP/7HSHliLHMD+fNneB5/n4f6ljncl8zjPvUc/eE8qk+EzgGrGj3j4/HY1Vz5CRjaVQP5rbTkrQA3xprx50MX86Yv6unpTSuw49z59FZsOtkPnyByW/7VdQf6gZ3fZFtxykW1lBoDw3DtCpZr7EOEiLu8pfYs9dp9wkIsEEKoHfV8OZSP0LSONmMZRcOkrIsTc0QcbAxisAHuhjJdR6uMmUlMUVbC7uXTe0sccEwhmHmapt1ut9/v1cr/+l//63A4hPlW5wL/qUxRPgm/9rW3l7nqJyZxJ9/TPC/L8YhOo9v20YY/1baJzm15b8JzZ08FTpEZuMaFUA282rDya9NSYmpFdJclojWHO6FJ+G11gCiaiJ0bbjbSLnhjUMXsj6lpFNE4JR28573pTgMVXEopJQGV2ZPEEKbh9phZUtNlKaVMNZvCBQB7k0PvsLYNX1XiHzy87s11cCQA1hOBls1Awywifi8que2VY4ywyiZHyFM314bRMbiqGhNEvA8fgsh1wkfeCKuMn6tqpKsppZT47u7ucbd7+/bw888/T+mfIcTkrtbVi79UlvStasbPwK99vUI1fp6+baT/g27kCH+GeZ6XZRlsB95mVZvXW8dqDML8Gok+Bos7iXEE1xOraVzoDlw0lS+ljQhdU6A38PyymBVhdzYzOimWm2DdWdJ6+eAxsxHUbSllXjK8ZrYqAbWN6aExN49oIioluBsET+7qbrQ69QQv2BJBGInBEklciyYxb4kcMCQ5Q86ESAI6N/I1EcksIDIhBxMTh3GQU8POhNKcc61q5mZW3cysEilMmRNvC//rclini5YRUXgbhT/hq1evSpl/+umnv/3w8HC/J2FTdSIow717in2DWvUrPaffNon7kpz8Tz1Ht35+SzX3m61Ll+VqX/C96jLPVnXKEzObFpLB64QzBQVgk0CN1OK8qLm14l12mgb6N/o3TOTwrXfEE1XD1tKpvdivv1GkHh589VaQbt6Xgvh5qtzrcNIhqxJKbyHNUkohqrnSlIiDn+CNUMUMEQZRrbXqCE+h7VL7kXsAEplMghQGkLuQCwgOAsM8JhOmQD5fyYPywEwpJWYmIBErMSiinBKiIdByxlGJbwrUAYTmsBO0JqRHI+ftrb3mC0lsADLTlGQ3ZXfXUpPIw8NDrcu7X98eDodSHmBVmJgZDtVCf3D0yLdVG/po7fWyfcLYQZgD3xTdFjA9DVI/e+Rgzv58TNz6vmfsiCf6QZFAXiZxt/Q4z/Yc/bJLkn9IA40e1hN5nJOpU3UU8zBbKOrBaQfg5BaCncLEo/4O/kDHE9DaeYw2WQDcmEIyBAP0d0F64069CHxc1ysVsBDH8Da8yOhUmsUhG425lgaCDW7ETg2dd6lWdjmyiBeklHLOOecwqwypuLu7u1LKXMuyLLFoCWciUpD/KZpyv39G8sTM4fPzuFtmX7/xM9+KFF9bn+52BrQJEEHFJgZBQO/ef9ClBAXHnXPOqsWZEDwEIhbug7yeokaTp1QzYxgIKSW/xusaxignAzjVWivMYW6mlWpKSYZd6hh6etiqwtzDYSD2LDFOtRjyYtux2sQIBYylyYGMnC7mKkRDFKAQpejihwRIfMrQmHN4PPXLsizLkvNrSXxcDlqPtPfdfso5Z6B6c43Z7/fHw/tlqfNRp2liSubGjJySFeOgg7ITg9iFaRLe52TqpagXI0bgMI7H5fV+jzFXJUoiAGqxLGoFDEopHY9HVOWUzKOX2eaqpG5EIuJESdNwPqu13u0mSWkplcCQEBJmdKD1uFLsRpHI9Ubs/d0OQKmzw3f7bKa1+n6//+///b+/efPr31+/+rf/9Pda5rksbnWaJvPVHOfWs/NMWdNvs/xvlr0n3JSeeN6fDiy38H2XOLvxji8zh88KiAA5LNjUzPEgaXd4MWwsDxrZyMPF4GqdeH7lLmTNcXFdT/AifpHT+cdv9LPhxpXPyE5OgG7dTrESDHgEX/KYb4AAJlaHh4dhH0fosIhxruZSFEQOJXJOxNISLjeomlY32frbN+lKbiBsE3AoyQmcW9ffm34cAoAdyk5sneEayWtMObhb0xAFaWxoqRoxxMjcZevRRXBiddIQW7hxxgaWuwlnMidJgYzBxkJohcgS3L2aVgsksQAvJPGvsr3EuI/lwBsvrrN7Omz3cuKUkpm6ewBkATdvUv+Kpoobfi+0pcp3qOuZO0GkgVsc3Ik65mbgcKnFRP4JDeuzicRZDGVmtxEl7UpPndczw8wp4k208HyFmNViql7NBeTEZVFyGIwFzJwyUkpgc+JivhQtRXMiaTemEWQsHAJncmES98QUe2BSd4K5GzvTFod4mQI0vT8ij6BJq1gItXFvjMiNma1aE4fqHFhu41QomjFZo/5u5qreNPOQEu92k6uBKXxZN25Ea26uqjRcuo3woiD3h4txXztn/tqz8+2UANGEdyeHllrnxaqmnCUgBT1hpu7gd7oX75hWcLSmhzPWBltnZn6hnHGZ228Rpzit2T8qunn1LA1XG/eVpb/tx52xWdckK4ymQRwCuM4Mtvbgk8Gr6VLrbmIQ4FzVQGYgniA5hV5Ry4CMyuLzUvKUJEXQN16xIw3UwlEjMhJTFirMqhY9Nzhp9eorwXYb75hYhETiUGOYCmJnJ2KGWsPYKYE4i0T7rItZYQwggGHrsypO9ZhlIBORnCUgx2ohiBWqB5szFyC+6uom7sR/kk7cSx7359miWzzCzXqjUxNOvFSCI+sFywgrp1XtaI2dCQ1tUryIcSQgQpNZd2yMQWkdJPmze7Rn6BNfWUpbhMp1wWGAG1YPgmB7gpjW7nukKk4JLE5uqmxeqxO5kwUeWEREpBYqRUtpthXSJ9TNG5BZzIVdiBKzsGUhEUlkiqGmx7VT1pzW89mBfhRvxI1NitBDplaPNvkAZnI4n7pqqGpVZQlenEtPMgEwwd1zTl7VVCVRnvI0pSwJ3uHT5O4e0b/hE6+twS9h7iXGfeMtWj5hhXc8Ht19Smk7qRx3qtFJGjUyo63bqYCcT2wLTrWMaJCucLv9vE3Bxgt8m8T5c2vV3tujKPz6r3wDJXFckL2ITo4cqyClkzCAqm7WzE+ZzCkRTFFQF3USmdwDIjvVYqpWazWTs8+biLVBdzWIq0LMTNKnom401oBIuCKuAGS9qCSiQedSa8OBBlkempfEIDLY6GFfW3WCUCEjhDpDQBUWYTQlzjkTtQUJpyUqDQ/DroLXqcQvIIe/dq36qboIX6NWbRWnOxzH45GIUs5hA7xmQ4PtSGv3rZnJ9KeFR89LJCyRLzVKI6YMpsSIKY23tKFntYzJ/Iucz+hGuZ8nesMP6SQi46RROPyot7iT9itvjHVKSUjNS63Vqoko6I45p5SYq9aq1U2j2bUMqbsG3zUrEYQQDX5ES46I3DxIYGZl6LA725l9D2+NVvscwAjiq1YwESVw2czpzL3GpLr50lCYm21F5frMgVKSxEI+/LbXKtXie1MC1U1e6Vb7wtZcu162L5uavGzPnTy0B96NYFYXCUArEF4mIAqL+O7YySGm6Hyqcm7NuNNEjAUXtC2yRhE9KQxDa+SGsdaXWki6TuRJGiXdyWV83WadYVWocMUIAcZw4kCxMQzwRCQB/pBEodcChRbVYtDGQABMYY54yENfLu5P6wR46R7XSHAhy+SCyk1+jgysDnOK9K2Xk2YDZ8ceHIn4CAKJGlsaAc3HPIg7XQs2YIEeGfq4GXoANYKrKhHlSVJq+OGPrsoMkkRCTDQg1i8Kmd9THvcc8+Mvn089+8G+haf7JB6Fh2ux+12erGo5zq/392T+7//X/83hUpAiwVnrPorWlcMCScGEhptn1xBngzsCHZcC/Lp20kIVFslArrAabKS6qHBKnJYaC34d6VszhoepV3SARc/yIi9LMUlwd3Nzd2ISJq0ec5KWF4bru0s1kDO5wxwe8w2aSIzcLNr5YCZhYmIwIBVMoEzIBCaQqlWfYZRZRHZaZVnUDDLJlJQWJnemSZhVdV7K4+FQ6lExGUq15VhsLvmVPgB791kmN6gjOQBOwpRZjRzl8CD7tKNy8INWpwzKRmS+VPWiviMhgbtVKySy2+2KFadBQaNAJpIawwlCzc3GSZWABL+T5Gri/nD3MM/zu8NhmibKU6jqEZrRqjALPGXaZd5PU8rShhNEDDK1RAnCZs25IgK61jAbZBaaDwuTpwTTApKnn6+rdqKfVz997Wf2CdXIZ77F5QDt1kjtCZv2l37cx84yAKC68cAZaoFWgsVTPjABHVhPgEfiYARqDW2Qepdja9fHWYy4d65Hkoi+mEd05U0ayc8hxj0tDjqGEydkiRPePndRIx1FVgRTD7/oE4i/hRFMK3OdnRxk7CGk4eQMIjcZvXthjiQ1hJESYxIxt1rdSMNF2szcIJJBCpSwSSSE7wIAZUcmEKzCmZS7xbc196xmz2hkLEPB3LGZYAyojaAbbLfS0olI2J04MZlRsx1jVnc1q6ZEziQg86FBzyaUmEM6c3ONmESvYFPjZcxgkLu2dbG17L5NL+glj/v227fSVxiQDnIkFgKWUgL6y2d09zFnuIHPOuvKtybR7dpzODlsFc2ePhuXOsYnfKMm47ORSI2oTdjKN109A01Yxe0qmazHjsYp100Xz7o71yjfmDnU19jhQpaqgZdaQ+94sAsA6TlXKxyD0cUgBjKLEwssEXHYOWCj9RbDXG5ndwXBUxeGMu8LjZDbuGKAMyPoeSLSJssMSdw0VASSmCQxs7t6d5gNvgfONBR6SLUL/ZigeW27nC9GUd9LjPtW68Y31JCJmxQgEVHVeZ5VNYk8ZVS6wccN18CLySPhksf6ZK19VaPtJEv3K6XNVmLp/GgbsuHK2+FUGThkM54RWN1hIIKDhUTIqof8Wj9+Bhq2mJhFKLUOXA3wc61eSqm11kkm4o4mJHZavVCheUputDBERJJKpdFP3Jwrip5p0wQFmLv/FrcxkSCwMjwiYEOQSPvIo7oESillFheapgnOwgZDDcKE5HQm40tE8CsCpaP1mnMOImBbDFRfcrKXmcO3iK1jYOrOzLXWeZ5HO+yqLOXVEHwp7HG1W3G1rXBGXz2JPn23YSa/jX2ntqQXF36rW3tNsGQbgq9Klt5yMhy/CtG0UB9ZBXWH+AqcqLX5V/qBe631uNRjCRmS9S6NA5bAG4OmJElImHLiLIl7275DecjXsyHCTCH47kjEmSWMqNtbMzee/6mZNAvcVbWQW2JiQtUlTLK34poNc8ccYiShLeC0Dqoula/iUg7BJfyOOmsvedx33Bf7RI2mL5hvCrNXi7KxlDLP8xaS1ukBN0ci53lchyisKLZLnbjxh6emAeN5uHYS6GqtusXNXSmHTwPrqnq0qVLPssWt3HkniqLZjxHigMkD/EUpMZd2crh//M0D30weyBB2ByDTqqWUZVlKmZicA+7cdJBo6I7knBZ4Yg22A5HBPMKc4hxE3TXlPSQA+tzJOOAfI/S0Wr6tAYEQbuKaKaU016WRTItpMk7CIsQ5SWL1sGvshPyLmEXUhLaGtXbP4yo3usoVat33XN/85WrVr31Ov6GuKTNbd34p81KXkmKp9/PlN57yM779ebE50p8bS/fVx2N9VjfNtRbFzOENcEsXterWJ8ncz7KJeN62cefsyGlbXJ0moaMFeVoXmFKzuk8sWYSp8giRwd5vgr4gNjEoPDHtkkQqF4pV81KXosLYTavnaD9xxrApcdieJm4C6OoG4+pmSqaobh6Smaoc+i4BhWEOZ1XCmGK0E6LiIKjBzUm6ESFZYuynVKd0rGX43SgShCUHrphWbLdFLGta6g5eF7bG2G8hOPpxVX2znPBLaHqpVX/fQtXBMXrbmMCramh932rG4RnOh1f7X08vJM+P8lcP7LJuOgu+TzhLbMlkl971MTplN2rOD9acFmQwXhtiMJhbrZKN6UHf22rq7FTNVIM+5T1JFEaA41xiUktIPacLn9ZQhWpWNW5uFArAMYIYV3M4lfXxsTVyA5170Ix0j8hT4iwpZJcMpOYWalaSWRKYzWB2fcp0ed5O7Whfoto3yuNu+Y1+2Uvy9fTgblZnn3j8Qrwc5yQypTR/eKzzMkk6I/qE9V5nHYi7q6nz2tkxM1NraprCW7d2hluYBlhT9/ZelooIQQA4eFmWYI812n8f10V20FKkTWJFGzQENtNhdL/BCwOWFh7C2vSEndZf17C7p1srA9s4IHCB5o5StGt817CkMZON2UWkTwxYdoB5LnV/N+12uw+Px1orp8RpqlaOiwrXvEtTnnSp8zwz/B9/+1FE6lzJLTNPKQkvvpRabEoImeJGk+qTFa8aC7oQP+zv5qVWcyFmnNM5BMbMh8NMhGnKtZYPj+9fPdw/3O0Oxw+mnqZpv98zC7z5ii3LkkAh2hlzl4jbKaXADDXnrU3PIed8f3+/1ftLKbnbl+rV/A6DuK3Uyq2184sc/5n6zo1h100s3kse96x+XLg3bJvN55chILzPOOPPSay+1IKB7g5wqcH5qb3L63MJ3wxeyMYJYJhwc/Bal5YztlknG8RsZLT54sXVzNDU0rcCRwLKLFmYQcJITMIQRiJKMuw0rnj9bCZITsOipi1jMb4l3rx8iJsG1YGIUpK7aQJTNV20mrvCi9ZqChaM9PTaFTkTwhqOXE8c6sv2Uqv+fg25xtasWpdinZo6SE2Xxemt2uRmh+7ixU/c8TE/HVNUnM1PA3AXQOQLQNZVlfPnQO0u6/HTnWyUV9AinQhNiZNwopY0nk5CNvvktTaMmFjVY3zpxE1KytlVYVUYU5LdlDIhMWehJJRZcuLMlGjYda8GsrQ5V4F3E2ZpNoMIMl703VabagkGC1gi5VVyTUK73S6lNNfyeDjMtYRf1zCZHWfDiQ1XqvvtUHWapuFy+xLmXmLctw1xnojJEd4rYb411vwTs84nEQC3At8T/ZovUqRfTRauBrhb/cQbcW1NTwKUC3NaC2CT1LAjMUno0hprOGYQB6UNAEzCilAk4BTLXIsakYRmSQiOu1pm2U1plzLBUkjIMSXpAh58wvwN/uya0vpakDKHOLBGP279yFuQW28WmlmtS7Du835Xan33eDgej2ZmxBaKSSRB6z27EHZBrohD2u12IbvwtA3Iy/bba+qXGPfc1kMtRZey6nw82dq/LE++SHPw6dB2hsW7FfKue0VfC3C3XnlrJ61t11XnUpKcJWXuFSgNhfQTrfb+TSL0GIelllItEtawSajF3D1L2qUsDHYT4iRhR43MJLx69FwmR33oQYk4sQRELgYmV+O4Qx3KjDDMKmVWLQ7d7/dEdDweD/OxaL2Eidhp++LWFi42ZwHuhZj1ksd9ixMUd682ZfMwIT65HfmcrvCcsvQyFF7aDH6BltzFXG/86jKQPV2rXo1rV9PSeNLZwcyBetvqIJzv1sMNOsxrOPI+dy9FQ4Z3DG1UlR15kpSblW1iiJAwsTQ5k1NMIl3WgOwgxlb6qQkuga5G9j5dDWCv5Sz7/X7a3xHzMpf5WFQ1uoUGtycZ42cXIl1THnzZXmLct0nigE2hyjyMSPCkA/QT9eP251cD3DNv+m0njoam5Wlpdgvz8Xm16q3/bB8H69ghJolRrl7TevFLQsjQUzNCrXUb48ZoMvamWokgIpMk2WzrjO9agNsCmBuT4dTG+xQ70v91Btk0Ta/uH/I0vXr16v7+vrq9e/xwOB5HLnbLAfIsqdzaNg7ns5cw91KrfqMT5O1r5BHhEd+6b7QKhoQEU5zQWM8HBAzRqHIY1u7MiRrdkwkg+7oQ9TmDPVNlzOjKgzfeizcK6ZuRBfOQ58YaPW/F9M1/GmBGcGKDACkQNYlN2BM7sZMzG4e63Lbn1Q/XCSZdjLMaKnIFg8TD7r5pGTGDYBYcqlhyMktizuSJw2869bqYhgrc8NFpqqNdwyQwcg0zB4hFo9ATi4QQUzfNDl/USez+Lt/d7wA+zsvjYouRIbuB3MmdYeT9GnG7VXp30MiNKUDLGsbX7E3sxFcXo5ftS27p6fzlOcnIJ7USntjJJUcdXxRa8Zx87fyHAFMyQ62mtbWHHWymxDY67quRMUEREphD2xLWcxAWkdCrQNjfEBNb973vXXCnwNk7XFsF5+ZWq6kykarGI8HELKtzg+nlfEO6OMDgOQCAmzk1+acBwWcnN2aYmTFa7RVmVACEw1Oss3ebLQ8bPIezH8MajlbcHZ4yM6oxlru0cDZxd0tMGTa7qxA5EZDNzVnJjakKMCXspsSU5sXfH/yHku7uQHYUpkkmIZT5kNK0y7v5WNwEzMI1MTJpRmG3Wek4+y77fQUmZk5N65fcXc0rWxKRnPPhUI7LwnlPhBSTE3JzF7MKCMthOdzd737Ir979/GvV5e9///HNu7cM22e/3+/fy+OHxfOHut+n6W6CG9tMVAVMieIEOxjm+92kpbprlulw+KDL8W8/vNoJQUtiI2KzumHa/h51yeXKN7Ssn/m8f+oD/qn+yJ9kvfTU8dD3t25cTgCfX7t9rXtCzaq62Vp9bA7HN9mZwi20fwnDRq7bIqDJAl+rNJ86AJymWk0i+COasU+nh12n+GTPA+ZGmz2zf6RJF38SB+MNp5GARMRMLlSTaBYXcoIQCcwbMs65nxSi8KMm56b8y+piLupiziHAS+TtjDVzvwZrEyJhEjZhygRGxNlgHdDpR7Yhz8c9m3OslqliSE4MSpHKpUREpZS5LLVWJ0w5JbIEy6E9wulY/VCsuhiopXIwdlvvZKZYJ1jI1UyLkE+JKCoBX7NypxfPmpd+3LfYhFhVl3I0q0MeAxtOeycU+HPy3E8K1k+PAs6W3JvCIZtIKrQOPUHBuNq01chCBeQ5b33yAufLGyleMMYIW4+r6+e5k0iHE3OwI2B+pqcCjD69h2cNMxIjUaOONe8sD4q+nhBsYe4uOOmI4aJiiNevMW6e51LcLWdJzIl4ynJ3d5dSmuf5cDjMdSmqlVyJHazomvXmiXjYRQYChoh2u93Lk/Xnj3F0Y/sO8zgttcwL1KT3qm/CJvy5MeujmM9bvYInTsjTsN6rcI2nT/JVqPDFy67eQiuLPoYB6FyxM27s+FDS9fgkBTkNnQG29cz20Ocw02DFuitBhVyEhU3IhVqE26pynl8vciEWkRHTL2/L4NKBqKpWt1JKKSWzJBYB7fP0cL/fT6nW5fH44TjPi2sFGZMJEUmgUhJ8qCeFMJeqppRyzi+h5yWP+27GDqa1zKUUAD2JM+qWd9s0ifzj3cZPanFe7U7ekmw7i0rnw4HOl7q6wDCILiDNV7O2WwzBWz0HYORlqlZU1X347/QAxxhadpH3pZQAG7Pss3GzwdUNpPFt4IeFkYWk8//JQaZXB52tLBVJLCkUQqLwp/FGHp6xROQwFmKmucyPxwOADM7EmeV+2u12EwvmOr+fD8V0gSmlqHQjp4zcdGTZ0fMKSaU/7fNyY/uGvS/+bs/R1fbc778CmKqVCrUtm3KAIT6jR/tRJN2tIHLZhX064jwRBMevBHSVxvDMWvXJe9fdlchFiFseV88Sq7PG8xANH8qatdoq6AYK/aiwVQjYGpEJWxbsBEmQxFvHja5Ik3Ir3p3R2BFR524/xZiVM7O5V1MSTlMupRwOB3cXSgmcgUnkfjft9zvAH48fjrUu5gpo0y5uA12HDqX4WmtKabfbvdC2/tK16vd2gqyqqcJdmJk3YrO0Dvop1gqyp80xn1AJ/mhhu+27fRLDtGNNbFM/glpvnkDG6DzNJ2cgH+W3Xv2waz+Oo3tpXe78BLdERO7mrsS+qgcrGl7HfU1COZTaVBhJOOhcSSgnyQlT4nCTJg+bsQESbBZa633fMHJnes7rFZQpR1SKOnqu5XE+xgMjRELO5Hc7eXW/Z8HjfDzU5Vj16F4cYUEZmKFxyaJ2jkK11voSev66tep3lceNLhKZb9W+PiMcf3b4/sSI9uSf+Elo2Ua0y4L0c1edxj+NPw0JuXBUGJT1q2q3m9q2wW5DTjKQbsNcdS1AwkO6xTjP4hNzJmdT8nB17XrLdvp2pgxjgsCfWHhyzk4oqgaQNMMa5zbGgbm4Tcx3k2SmUuZSbTFU5+pcHNZqXx9NgCE3klJ64aj+nlv6grFgW8LcwrU9h/P0RULDZxz/AJ1vjoQO7z9YWZJQbn5z4ckSiFF0SnlzVPBunRUk9FqrcVgeQ3qIHBtDtgGlqwe1am4r4hS/2PrDbovlYal1MU8gAKm3ftrolxyhphGEtBM9EhchQ/TI1+ff4V0rvMmZrJfJwcIdJ9sdcEIcSet2npCzOPuyLBNTBSeKHpwwh+iSEnueUpmNme/u7kTmZVmOR3l81Fe7iYhL0TyJCEwrAaolp2QTqc4M3yW5n/Jh8Yc9HyP/shwtMHfpxCmbUnJAzVjy/d3+cT4ajMMG15ycmImFIDzXMu3ynd0tyyJCJHj/+C4u0yTJBaZ1At3ZdNjlwyLv379n0P00ZaYUjrRQqzXtc94UqtGMExH/RmHu8rm79B1+Arl2yYN+zouvPv7Pr2k+9XOddHVuGSr/RccLF2Z95GaqcTtu6TaffT0+I2RvY8rlEvJ8tuMZzm4bDfniCK/yGa4dHD0xrBkglc2IxiKrupybnzX7uMmCWxtQOJ993s7/b0LE7MZwIRdm7kU3DUbHZqIS7FQhT8SJV9ztyqkiMtqccCZnApO6V1MDFE7mCciEnWCX88O0V/Wl6rFWNaihaFU3EfFTtsn32ZD5Uz7In1+rfmofzW9s32eNjDMDF6DOi6t1K9X29Kh74Mu2jC6CXcWOPGHf9RnkkLEsddlenC3CT7TkRtcJo5TzhoFluDw5drjUYt28gG+FucFL7cqUMXyABVq67cdbQ7B/HaTgUoo7yFOombhR455ABgaFBUIeAOAcNCmmLUD6TL+IiJg8RrGJ5YxDel5nkIXRakBAjvPckLpk5JgY+5xe7XcP93sGLctyPNSqqKDFvJqRrOJOW2rqy8zh6z2/l2Huq8e4P+hp6k+jlVLIPMwHntEftFu6zJ+RxF2qZn56HmdXIqwDTRsSRKuVQb8hPiKddJnuXQtt2/ukGQyO7GyI+uIaTG8DH0Et5jVQugSwtzAXAsHNPDDGtgJKHC45zAwBUdO25Mvr1WQyRVJichciIU4sW2Bw4yB3rwlKom6HZQZ3/WKYwO+Y73N62O13ebLqHw7Hw1wqSBlKrowzxv4L/f53y+DGrfVSq15PmiKOlFK0hPrFcId7IlF6qg3xTGzHE7nwM/K16xv76mi14TaY0FnB+HFtuM9bNkK9kldCKw17l02A85FM5Swhk1trLUVriQqXEbR3w+hXBoefiYQ5seQkOXEiEM68B9GcofuklZmTUG7yc8xN+BSbut0iWDsTJxIh83o8Ho0JTEYWAp8CZPBE8vr+NZMsczkuRR3EYkyl1q7TfpItvuRxv1tC9zkx7lNrzz9KrXoJy1DVZVnMa2gxSntw/KPY1+cUqs+sVa/mcWfqb0+fTD4bnnaO6vVGGOOqV/TVcvWp/H3TgzsBG7e1YmRzdJ51sovINE3TLoWH/DJ3soMRVjgnV+8O9qDU5gQbqxqiDXDEz5SBR4HPfKKxvvVpvPToUrO5HH21bvBgMmRCJr6/u9tPd+50mMtxnoubwovp1TzuJcb9nrVq+oxY8CdO37b/GTEOAMuK/g3bTGLuOhwfIcb7Ryu7ZyTe2xhnpoMKGq4FPanh2ztptp0W2P3TqDee50vzgRZMn+Gu9ESl7B5duXEb0lWvif7WjeI6TZPIcXGf57kU7TYVAFjj47SZQ8RNEyARJ0JmYtKtPc5mKt0FYOACdziDpEkoNQuyk/N2+sy4eSkltBC4OXgRXCb2iY053e12pWgp9f3hMKWdZAXA5OKO7jK+xriXivXrRLozRIf/xWvVLUDM4EOoIgBQpOalnvenzjUph0kKHGzErTCKGv11ygAAgu1JREFUdADnzjJ08rfxCH50XHDy7N3M46jVVsPvKv7WyHCNEdGnKKeR1+lM/cLoZn56+4TaKISpq6Q0eJufBW5d23O05pJZKDMxF4bNasVdrYk7BUa3/wFHShU+rUyWyQSaYNy0hTmGFZE5klHQvzbtaGIBBGB3QOEemr8AQ5oWgK05XXVz6LYGZ2YREiFinTLniVTr8Xicl1ot1TYtYadQ+dmW52erI69Sdy/bF2rJffk87ipk5jn6UF+kfXZZ3139zFE6xBPOHjo77oScd8uypMwpsS3LXZrg+Pndh51IY3OuzgDMDUC6llgGN0P4CEMQym7qCkciIhEmJ1iYHcO8pzVs7m6xsLd1fuDd+sH3IBC8KJ6GL7J7PVWRdQ+kPqH3qchdfdi5jrwPgHe1yAhtTGTCDlUzcMQEB8FGoLYen1uwieeeWYgoSj0QgSAg84C/uSqKmjBTDgKC1epCZAwiqFczELszQZlIuKmG1Nf3+e8/TPPjLx8WvJ3LD0Amn8si2SdhN3fGUmsCiQgyuT6K173QffIPKMVms2yEChRnMdfqeZIEgikTmSqI7u/vD4/vZlcidqbjUph5mvZkWkyt2j7tqsg8H0SEEj8eP8yHx9evf1wOhZiJ87JUiFBS03m35wdjqzbP5fHDtOM9JVEWZwKcmZf5uN9PpSxdq8bWWDsagaRftZB6jm35c/qwtwBxl/XQN6nDtsvuX3TdOPPuQx+ltbUd5Gaoyr0w3FqfjK7WSU/Tu1gvXbkVtm6Bp39rp1kdX165Lc3zrJHPG1xxP8itulzDiwS9/GoSF7jlnsO1DO4cNfKMCcmwcWhviuFCD+6z3aYt3rDEMjp3nWImoNAecQElskyWElW1WW0x0x76I45HZzRyn2iNMYHJE7uwSihiah/IEocmr7v2wtT7OqHu6gQnC/KqwRXOzARuHjdpSikFWzbSypWzwU1ilMkT227Ku31KxKXoXOCUTFHd1GDw6maBmaHLJO7s69ftW30pXIR/fh/j99vSZ5yjP2WfbvSGI36E1NdZk3jbsYrgsL1VA23AxPhEaueT4xob27bAPcNhPCGw8fQx9ISif3/dkWAzZIB/NI/GCcD4mvfNGUjQ3eDDN2aMd1PiXc7v5lKKLnO1JJagILfWY+kQOd4oxFlKPKU0Lwpz7xrLlw3HIIqpljjHDhORmPw6k6uLiDVEm0xMgJUym1mtxfxEMpfbkkPONE3pzu6O1UuZ5/mgu2SAO23sg6IXd3ki//D96+83oXkp4M+aXORgZi21zgtj2BI/qwAHTp3hv0SY2+qgbQPcFrN6yx/6iQCEa7zUp80Gn7PU3ZJju8qB9ej7AyEniQGcswq4MKeU3H0uIbKEcKHftiNHI1+ERSQRT5JSYmGCVdWyXbrO2ymR4/WlokvX8Rg4OCyIsSlxs7U3n8tS3cBkkfoRMVMi3qXoQNqUcsjD1XlZjgftrDgn2HUhVf4TPDvfddH2Et22MW4EhVrrsizjgQxY/lmKhIsqD9fAAZ+HFXi6tbHVtn261rglA/c0cvgE8bdRDN66Td26v88iGp8Ki6ITwCKw9AhOqq7VwnY+YnoMWImkVluWWtv0hY2YJZ3JqXLD9KaceEqShchhVaE1RDNPq281q0TIOeWU2DFkLFnQ6Ku02lFLFNJE7r4sy2DvbtebHgRNyKcp5ymplQ8fPpiZOZyFSIhiurG9svxHf2quuvq+1Krf6SbE5Ao4O6zUMi9nmNtgL2IFkdw4P6OwpS+gKfBEXraVtLtq8XNVxfeCrrCtVe1KpbmVz7xB6r68+FtUyqh5Da0P17xf4YifkpmBCK4GNVOQu8BFiCBVfakarSwjG1SMtVztouqKmp12IomlmoV22zg83/QlDMg539/v5yMe52PMwqPxT8wiot4EVNzJrLuCiSzLomaJm3o7w4UhTCzE5OQGpykL2b7aPM/zsixTQk7iTeAzROU41Ll+/+1LPb8vteofchsCOEDz98wsg5FKwQBiBpqR4NO16hfJ/89q0rP7aSRKw2Xism796O3+ZK1qKxtsYFNOK+kntCWuVrtnUPDWa1T4plQNgAgLJRYwqfoy11JVHepuCoCZEkEGabclUywMn5gyE4Ux1thnv4jmHtliSnx3t7ubJhGOIcZYNmTwHwL4bQZzBqUsSynVzZnGDoNPRuaTpMgvE8vdlPMk7no4HA5zqYEF7o6I3fnodAW9uW6+1KovMe4zJgyjtOyzzqglYN4eDDNXO4MUDlOuFYFxIb3xBdmIVxV6L8PcYFmekSKu7ucZR2ifmgI8J3pefSSanKVvBj7OwU+gwLgxE4mal9B/UdeYTZ625FbhOeaEEAoxoeGDZqPx5yToOlrMvNvtUkrCTA5yDQPHWMwGrA9k4Q3ITEG9uBbB3d2SUJbE5AzLiSdJwjjMx2VZFq2BvnRCfMTbuMgXabnfq1YdpPRthoLbuLOvLdP0qVKRt37OIoRVIRaBkiXklOZ5ziKZ5e1PvxwOh2mazExSHsPBjrYFM9sKpHYzMwLnlESM9LJhvz05m+oS0ayJH/ppitPDFqM7AKjaWSDbxqycc3AzzvKRU+o7YVXKY782V3X3MOgKD0B3h6u7njaSeDP3kJH8hkZeHHlV7yKX7t6EklSVgvMAJ9f4fM1uG1hqLSWkRMgWdXcRebh/9eFwfPvm/Zu76ce7H3a7TOIGJqhFtOOOz4MAPmW713yY8lKrmgZXl5mG4HipRRLfv76/u9+p6sPDA/38L2bOOR+XajZnZnUzUxLOzOZVCAxyGNSK6b9+/um//tv/vstJH5csEznIPae0mGYmSApvmmlK//znP//1r3/98ubtDz/8sCwzDKVolnwZyLxhkD8hY7rlWPrba9LfMy+7JRd6S83/mbqT25+n57fhny9V9r2n1gABRhBvVA8FYF3y39zVyFxOhdWcrpQSToCvxexvCN9DFu2kcN421CNebBveT08Y0IVL4zMHmWnVX/u8zmD7hm9JUW3u2ifOxhAE9v6NqapXh5oHZE4rmrNyNrA5VL0WU2GDm5gQO2kH8Ejjz7umEE0SSmE2A+NGqtMgq0qilDizEBFcmVmIqZ8r7572TiAQoDF9ICIyOBE4JO19Hch0gZJEbOwmRmBou6Om3d08Hz4cHpMgiVRVVU5M9tIn+tJ1z63980fj6yiFngi6f4bq1ZorTSDjRpcHp2PTq6KQX0Ndaps1h6+7iGw6Vn7a8vftEHOLDb4UaHo66T75LL0HFzolgPFoU1GrAS97zx1b65egwrV65RN6HDnD6KLEdibiJMzJzJeic6mLWl3VkhlA6I8DIHN2CGPHMiXOSZjPW4EAwjUmZ2FGzEwnSQCs6ok25+0zU93CYavl2iH55MbkIpyTTCIpcSi8393dmeH9+8dSKlFLxq/Vpy8l6u9eq+LCgOr3CXDfJFUkh3oTwqy16lJcTUIg+yxr67dkrOtw3GqZ/fbPO/jzUUmpttjxRHm+fZhHjLshhXKbo+NXJhvtfc+VSLSxu067Y2ZGzFfByZv/5w7IQTAHEgslsBkzuYumNLmkOrFU01JKXeZSJ1gSA211S9oO2aEgR2Jk4cxUnWAOU3eCuZkTSUqy2+1yziBimBPtpikRVzOwJGLtON31cxEJAU4OOFM1LVotxDoHXs+dAAExiyUyVQep4e7uLu2m4zwDlbEzM05ideEXSv7LzOH3LmB7OAi34CeyXDv9qwHy/C1KErdQsiPtyjkPw/mnTQVPbeGBTzFFxQVU5cJPtquqbdK0y1HpGQHjfG57Rdapwcc2M02kJDnnnHNKE1EgSIpWM8UZLnr94NTAHDmlJMQwh26Ph4jiTDLz8LeYpiTCqspt8Fp7BWoX59aJKMytYwrRbgEyd3UowZicKcTyIMSc06uHH0Ty8bh8+PBh0TpNewuqhr88fd86j9v24K5mBH+yvgARQU2XoqpClIhHnnJtdSDYRi0jkPH0OY2ukVVthY9OlX7BzDEDGU8srmnenX1/MSCizzsz4+r39z0nD7TRiX0EjbyJcGPP3PRRNjErhKuCWCWShasSVLVWq6ZmohXC7DCiTR7Xw1xinkREhC5K5sAJt6ofTswOnaYppeTL0V2bth01M1a4EzkTjIjJFERExbR0nh9MQ3pT3ZlD3B1DCkUFTun+1QOsHm2Zi87zjD7Wj47wSz/uq849iCg90Q+6NIj6HSRMvxXGeDTpoxmXWZi5an1O9jc4lv7pEe6JzxuP7hizhqpaKWXAys6ad5e7HWGuQSH8Orjk9A+v5KMj+La/9S0DdIM9Njqjl109pHXG0qq8tR8ar4jfEnsydiZnASLGVdVJ1WutIgIy5q3AJztzIiaWLDRJkqE71Q6VulOEmZs5RETNIlts3UULr5k0eoK+bUcAYDer0Y/btjLa99G+jDgnDog55TztdndJ/Hh4/+H9oZTy4hX1vdSqn+f/9AdYOgadaFN7NiEhtcBfEbsRtD/DT4W5bag6RcmSN3VIgKmZvW//GQDqIw1yhIx3k0nqS0tYJiNgr6nJ3I7eF64SIbrRATfkV0Q5uXzZNrU7xaA+KewM3YSwE5XdluKSxOlo02o3ATFMIsOBN/pmFxllR+NLNSU4F7iAhEl8YZthaoZqXJSKeTFXOEzhynAJ7U8SkJg4xCWRMDJRckogAdzV2SHm3FZusiYUmFlkQxdZQTkAOYtxHK+BnZi8VcrmDm5z2FDH4378QpSYhTgRCTm5p4SHh7tdluP8OM9zkKD5RQz429aqt8ySby1Bt7gdZ6nfc2DxX73x5s20PeTjGl7Daua8VF0eP5CpSHYyi8cyvJyiTQ5Qa3hjXeHZnSMNUDNlRC4kwX5kY3OklKy9q0exQt303ZvEpiIM3iHBSFdzuCcWAHCFuzB2+6yqRFQ16AEW/+szSiJAiMyjmAZF08cD/BChzB0uwr2n1Zrlago3MAAjaXATh1N8nsRmZrUSuTY5USJIIKWZJeKVuRNZL2xH7e1wo6ZP2fC1ZAG0rgiUhanG4cSZhhGM7Jh1fhBDcjdfFMqTSjZaSpklaWbOxITqNqknE1DOx8NBne7vdrXw28djFXr1MLHQtGPZs7LWRkFNXIkYcy33u+n+/v7D8QjknHcwZE5hdk3k5lJc3ap5/fvf/7ksixGOYfBKcMKUc52XJhHdK3kiAiGLoRSZqMzHh/vJStGyGGdqS5Tf6PR+vI75fR6l31g/fdRP+fn1zUc0/U/Ru9vv0+8QUr6z4cLGK7er/nKgUdW0LK4WwFTAiUeqd03ZbbSCWmJlvW9lDVXvzuZEzcb5fN0mA6CQJpjewXre/Z2jHYhVKdMAD8ytJHMIoGaOjUeB9EIzbLeESLG5yeikNcbM7pZACmfAicTJCcxMbrQhpQMotQTG2MwMDhgjAdGvlA2QmIdCnBC8wQrjvQkEqyV4oQxih7cK38OFIVaB0Rst4j/cZ7dajlxMDWSc07Sbcrpn3nG9T5iSCBOIhZKBgMUTceHMktgmkkwsjqq1GtSrhXpeY8knJUuAdElRYxJQFw0G98S6t1u9Fq21FpaqqmYgKNw28oLtInYyHMGJTRwmziaVS7tlXrAi38PM4YvHrO8IY31OvYSI2FLmeY5WCz6Gejs1Hl5rtm03atstenq98i6r+2SnjIZHZ9iPxozvEll21v/CJq249Ik565Q1Cqq1f65Nut2rubu5bYgTRhBera1Wv5j2vG8mHm5kRu5RBVgIWE2SAnStqruUG7CWCUBVnef5rtK7RZSOh3mOUSYRTXl3d0d3knY0T6RCXSSkeaeycEJiN05JU+KAPSnUjM3MjYxJmAgUpohMPGbWW8DN5qq1yTKBlmUptSTiUopNFkvfakzTkMMtUoPaN6ETxeZu8uI9+L3HuC8S4L5ld4/sdGbf5CUS5Q+lHI9HM0v9QWW+3jNxgpsTcwD+z7xOLvPz5yA2tnySdVc3XE0HOoSZXTecTb8UevMYObRufsjmDoQHmu/EGNdWrdVsCBxhow7QVIZ6eI1jSCkzpQ3mI41xxGjZbcavNklyUwJPSXZ5l5jN3GpJkkEOj9qaqtV53uVi9RF3C6aUDzy3PhihB9PkgHsreuEMckrEzM4swimllMWAUqtnN/PAnTixuTmpOzsQRNTEcXeo87UaMAIfkVbt0w9tAFLuvAjzxpbrgnHOdIqgPLv/6ZI782eFLnxDvaL0+0e37+B8Dwa4bccuy3IMZFw8xnEHh1z29dxn2J53ExX/EsjOSz+KbeAzq9iwqcysE0mbqPoqJbTuYZ1+unuIpphryIa0gsrd3RwhsNFiGJGbQVzcnSZG6CB1f68muSH5RKujTzaiKR9HteaSxnBnOBESU0qShKBQV7PGig3HGLPiqnDLklLinFNMScNxtVTKCYnMyc0JZuYWquMedTqTMcKdY4Ev5ZhSF6P3FubUlIjMCZIGzdbMYBaCIxeLkI7Y3cIcPAuTO+p1XgSIAlXznRtvvuRxz4q7z4nTv6VW/Zp5n5FD61KXYrXG+t9Gb5lgDSIXkc7WVI54I0My1OI80iPQMxuut2rVa0JvV+ThiIaa40mMGymYnZ7Y/suz/Yy0kVJK4xNpS/c6DKXpy7UwNw6SN8SsnsxIf9PRUZT221LBLuBm4hPGhOwcQ041gsPBbkKeCAzPQjm18rzWWkopxY3NZHi4guAQCJNGbstIQplJEkFLrSa+Mw3PNHKHeRBjzeDJkzBLuDkADJMuPNK9gMY51BEKA2N0tZ+x4iUBZlZF47fZxif3JdD9uWvVbzlyiLvw4ufx8LibpElErBZzF+RNn+XKfRyJQ4QDau6lhqui3s+rVS9LpBvzo4HCBbZ16Dl0nkw3vUI3M1Nfi1BrdWirXhnO3oamZpacomJV96Yzzm5wN8TA1M2bKTScTJkZGhNeZ8DcOLDNoygjAntimpKIkMQCQZSZJGdVGEOhCI4AkStStZwo5Mt1Y24xZpdxaWKWS8RCDBZKBKc8IRUmaxRaM5i6Gyk5Bxs2eg5Eayex6ZQ0mhZxdDApFFRCcibS50VrrdUnDz5/vC5kTragOWapRggOrDWoo4iQ2kut+uepVa9+sO+g8xqFqoXOUq0KM3IkZiGou8JTf4S2rbsgM8Q4NVIe3aRFdsHQ/KSreDV9O9lhx+KsTClc915oXzOHt6G7k6mZsdvox/EmKWvhzyyAx2CY9UwNYDSVDzoVgUo50DVOvA3oKpKxAZAzA2ByK65EmcgTM1zNIZEmW/VO5gfU4G7qTpJYhLIQMzRoBM5RXBsGxcxBkSMZU3J2ZxIBMyRBKqAWbF9rHrpEBGJnAauHzXMiFqbk4RjO8PM5eNMN5DA98w3nBDGYptObhIkcIGFWdq1bZhszu74MVn+vPO6j/qTPMg++XZl+lDX5zBCwpVv8puqVrLfaA67hCZwS/fKvd6o6BHWnaXLbzhDXlM378eScOHGtdeCAQ/KslGIWPk+MjYcWTnXccBHO6GJqgYsmjmoZgmt9tfDBYejqbHQmHxIJQ2IOpUkzTUlGb45W0XAfbI0QciQCs0RaJwDAxthOYmxr7EBGFPtoLNeBpox5BsyzpJxklxNza2SCOpqDKYFjjGvmRBDGJDwlTFmmaVIrtdZjWR4KYxqt/ta/DwhNrZUYQq5kkny/n2at0PL27dtXf/8h591SKgE5i5MxY7fbzceZ9/vXr1//6907K0WAZVmyTPDO6CKLxY6JD/Px7u7ueDh8+PCh/Pg3c9eq0gJwGNc6t6q3Db5jRb+/v398+26/3xPRsiwJNOwZf0tJ9Pzn8VMlTp9+rp+jW3f5mN/6ya248fQennmu/rqcEnIIOSPAC2a1kns6dSy9daV9xcStksLAH6DHstUNvrrxuQNsO1frC3rmtf3VR9eerfbnmZfj9gW4HExTZYIIp5CpjNSJYI1Fcq52NdSlEiMJJ/GUOEmoY2ropI85U22E44bHzixEMRmhqDrPPwVhsOtGLnyJMWpTHVqP50wx4U/G5frO0TDprxjdeioV2U3wD0tZ4C7MDA9965BLC2gu3Z4VtAeV6fcNccOk2bsPTNQ+4/vGpLgMcEKbVbHHkjFzABTkZH0Y6wF08zZoJDc4nCPMRc0YJLCWwa1WECvzNRJnNzLTNO1IyAhkRt1KZmAseuIUrXoFjMDCmBKLEMhVVcOE0JtuG6S9WZA8Gu6H1ZhFVIxT5lzFzJZlKaWmPIEiZTWz6iQCgjVJEp7Z3YlDYWWdDFBPUEdK7oRSiqpOnBik0HGf9LviitQKN6nkmGX94eParRHZd7V9RCvxS/lpf7fXSUBWtcxzXQq5J6Yt+cx7Rx9AoNAMG6YOtxaVb8Q07Ps6Q7aZrK5J3Gixn+OEHU//EBiuWG2Me6sdcZaUDWwtJxl2jn5WkTfaKSF6/hyH4cxIiXPOoWAa2D3dTIc7ZMe2dykzWBCqv2EMOM/luFQ4j0mxecxGEevZtEtJpI9NbjwFwnFXhA9hrZWZwevHjCSuYxavAyf/lBncd/sB/6J5HFxBjcupqsfjcVAIqPFYvT9jDdF/di23naa2jjGg3+dS1gkY1OsybolsuEWBQNwSP2gMBxsHVtEyNbjRsJJqs+M4R7T2En0dTXoj+Z6Z/jBziiFNKIijiwZ0/XWiHtqImMSlIrHnxLspiUgtWqtpNffwKq3ehwhB5m8p7EgQGQEGyjmXRUtRbeOCrqnjxkkMYNAuTymlOi/M3XerN1opcltqCWY8zqWUWit26wzNaLSrotA+0fIcF8Psz9Mketpm4bvO4/6UW9xrtuUVAKWU4+NBQqhjZCunVtBb9GwrqU5npt9znns+h72dmF8eP9+2KGyx3q9YuOKaNnJot22CLvxUyNOb+XxXhYn9C4g81N5zztHFL1pjnL0JHr4KefY2oYCYkRiSaL/fd1Cb16rd6aIZp0bet9vtRGiYYFx+kFGrRjocBpURK22Tk2pnj+Bksrx6SP4JPAOeEC58qVW/ffnWmfbNL91qPR6PW8Yirtnd38rSvwEO5oxsu3U+vXBBvepqeuHuvL0hIqXbeDh0hj/asPXiNnCOf/3nvC4CJO7kDYImOWdrPPVR73OD4PCpAesmKDCBCClJShzlaojobYvBzQfhcSqInYVERET2+z2AEM2sqrWX8KucAVHoA28v6C2LtTiwqlqsJYZndfrZUKWxefuo/aVWfcnjvmqvnuFsgzFublWtFiFmWtM0cMOpE4kRAwgX4vF8glsB61dMufjk+X8qxeK+4+tuOB+Jbr8hrbvl9HxrwLG1l22n6MaNfnVhj7aaSIA6HBfG0ic7XyX2SNzZwdSgs2BUr7Vam3NsTq8FLZe9sXapyTiF89aUsoDINGy1TN1YjKh2dVMGZaYEIriAjIbpM1lX10pODCZvLosbYtwwsvTRphwoI450soU4llYGG/0pfGq+/7wn3cLCPJ9PfrYefqUP//RxPj9trub7KetxcYWQHA8fHt+/u5tyThw1hxPcoaYgQcoKDl+HIF9SGNuJmCCYQMxBcncGg9lMKfBoGyhcbxmdzl6dnQEmC+WQrgvim3a1w3unKpAScSiNTcFtjCmjOnMSB4gDytcRhcSjEwffhiEm8jh8BOkTbmJmDvVeLJKFYJ5RKHmGepABzBSYNII212UIHIHdIycmNq1WChPtdjklCUcgFkopBSauaYUzWfg3r661cEDcAWT2RMhCeZdymeD24XCoy30w8KHEDMoJxNU9JfKgaxFDYaqumFj2TK9yPrx9U//+mpNNu9dvj8e7PE15/zgvIjLlfTZ7Pd0dd8fD44e035GgkkOVgImEwIZqqvd5r6pKyHc7Bx2Xcp93UKOwTVSr5DBQJobuRZhUWLzWfeaHux3cEqEJ6m3v52cnHL8F6fb0M/v85/rzOJfbIv3Wfm45nT9/z3/1PI4gMbVPzASo1sANsBtvgALNbJ2FiAnSAHFMzk3ZXIPOeZrjnJ/QlmV8/CQbfVrC/0Qf7aKQpI92VW7V3Se/6slm19qEAUbGm9bkZeXYCn9ZvQqZ0JwLO7v2dtUMIRJyIU9CzBAhFgQgWVX7nwrAbqFgxON8dl0/DrDbTtIkKYOhRkA1rUYVUO+ZOCCOBM/goKBZSyAb4EMcYsy6ntBo8FUzZ5IgoYBCgXkdwyIG0A4PeXRIaDq98FVfatWvlbiKmCrcU0pt/G96hhVwluBLbgGca3uoMxZX0SGm0U76IlnqJYDjVlx7jp/0Ey8YUBLqgkvoM0q6XcmexHSOWbRd9q2G43W0ooLMe2n4cDmnPtXmI2bOLDlxThy2qGplWRZVdTB4LeAvu11hscrMOadpSomlLiX0S1TV1TaCLhaDkcF1OfOrvRxERGew1vqEKdpZwrLR13vZfq9H/luV5b9d+/jz9sOMZSkJzsx1rsuyuDsxW9dWIyYwGxMTNVQFmAO8TqC4R4VdL6BPv3l8fmY0cza33QpwXj0z19N7f/psNL3ikeqfOss0WwMAWyW4KF7PbIzcDUREaaW+ubo7C8JNudXXPQRc8ti2EpXbIxEREUwp7Sebp2JasNg8z8sdu2eAh6nCuAj92EjMmYkBIomRwrIsE5IriDxcuHjMOo2SSJYkgYDxwBcxOZhaKG2KA0TOrLUGRK5l4jHnHc24YVe2cbeJiGleX+LcHy/G/ZE2NUoMYJ7nMEnasm3iNowyB43xPsQ9TubNjezJA8ceXZUvsFpc2gZe1Vm6TKy2X58jdoKTdIyjJbcJtSdxLSq6RgDsFSsTd3opoSnrehcWigjFPTOic8mAayPpy3SVmURIkt7ltExZl7nA53le5lzN1SEEsJxJ0ge9gJlZXABzy8LEvpQ50aug327x3mZGkJRSAIaxwTnHUhGgFmamnpFVYNEaQBYzo616FQBtVte8yfFaPmv+EuNeatWv04zz0DcDg8zseHw0s7ino31Dcl6bxCmK+Rq1SetI+ejSZ89+W2g7TaM+p1Z9Iq17+n3PY/2oIpujWJs/XvbOtkXltrXXk7i1TSYbkYItbfMSZniyfwcTEiEL3+W8T0kYc1mWqnNRNTid19rRajgrHuMdm/WfeRtod1ZD1K0ikkSCUh+CNGdm2CISJySq2ih7q8WMJox2sD0DW1mHwTD5E+DjXmrV369W/dTNzSjokGWZ59ndOaVm007UwAMQoo8coYis6jqNg02f10jm7gHY+eHUIaRbA7DmEOpnOd1ZUPNz/Vp9xoXYNuagDg8JNyKn0Y9fTcgGM7Y5gbVjxhDvbofoYdqQWBjk5kRgEauKU23O7f1wprjXfxitf8+JdhPPWWaRWud5WZZideep9Q/dtEgzCIqjbRklM7m5CCXm41KEUb2SBcN/jbO07cdtVi9r3mkU/dy5tMauimit6qaqmSL7Q4SwdaLuw4SHhGVVG36xWH3J477S5u4MF/IBJZVEa+EWk1Me9/fJH+qgIhKuJnGfl1p+weXkt6w028b/lqy6RmHHE42/s/msuzdHmGB/4Yo01tVzePlzd2e3BE/wiSkJCcMMxXwxryA4+1BqOs9zPUa6Qwizde7MYb7Np+JvBZSI2VsSF5wsMt92MONXscPIHzUsE/sgdbtdHa28yJ1/F3nc1bb3N8zLbu3/U4HjDOeYqB6OZvb61atXr+4P7z+w5BHpupdSInhAwIaU+ZAGCyQdJwl93cFRHHo766NOvnluzzT11nnCGTh+e+ZH28jMtkD88cPN3OOkGXfLrytmgpG44nTkVwqYORmM0HUdfXuQ6Li8EHpLqfXjolnXw5mfjRH7GNoa2NA9HHBGIODTkzBirhmESAmJeSduiXZJ9vs91OalvP9wuL/b3WUri5Po/W5X1rDlLABYBE5+PNYknIV+eP1Q50X2Umopx2W6S8zD4ZtSyvtpt59277WSkXdWQ0opQZh5qYuIMDXgSBxnKYXyzjp3N0lieDULx1hmnueZYA8/vA55wZTSrcbt03pqv/25e/5TdjWz/o312RWy4Ob5/YzPchmdLnfy18PHETHM1dTK8AwcJ+hEDI4233R0yPqCa2CRWyf6SxXaV/dzOW341G7d9vstrfIklRsNzdN93qLBjjwmYGPMHNPVq2/6BNyvuX8RMltmz2RJkJmMUB2LWqlWmxX4yMs2n50M5AzKSeI4c86BQBZ0gMvFxUoiZE5Ar4K3zmenTUMida+mRleuPr8UpC+16u8/cxBycgSbei2vhFu3OKiXCMYWBy7hesF72l/H0EG7ljT9lnB2Fq2uaq5+UvX6RKAEkFosYoqM6zJ4+VgqiHGzaD1DFHZnQj5be8+GDzeyTidGIiTxXaKdcE5CEK1+nOu8VLPWLgxv3BiADsfV/39777bcOq5ki+ZIgJRsz2v16rU7Yu/9/3924jz16e5VVdMWgczzkAAI3mRJljx9AaLCpSnLFAmCibyMHMMRiMR7phgYuu93ve9mNjrZLyIju++6jowXLwekkkmhbXdjmqPkKHei1HDuZRGmRanNxr1SSi4OT3EIjlkZ0bTmKvdNtpJN6YGbp41miI3T1zHrGV7blm1aLcKuWsBTKrM1tdxo5mpXblH8XTVwiwSfLg3ZKrHHeverCkg9qQN1no2DRMFPQ/x1GIYQTS9mktRjrX1JBkSjc2632znnEje8KEWpafRt99p3faHG82AmLFl/RwiRiKEsJ9uPkgM8UhTcrNtbzMd9YFeOlYanxG7IJrzEJus50d8yIlyttmWaSi7RVKvhCDTuuCuHGa2/ji84o20tLbbCQl7UIfIfThI6AC1oLPVoxGpFZyesSCJf46FKGbcG7lMq/MJ6CijxwalSUvNTIkk4W11044/lheV0TfvDzFp0Dr3zvaPdbjdECSKHIRyimAguQ7PWVa0JQOwoDEFEuq7b7XazVGadAFVVh8THSUokaiiU0tYCJUcpF1nuflLwSJNT84NOIMHN0r08X3/BBH7GuqqS6ZyHwtXz3Oeppqsu4jVUqQfM4pHLtEKejVWfpbJZGi93Qqy6incr0eWSP24j+zaxwUnBj5NuqmFOTJ/0XKouKMFYnhx5h85z17ndbue8J6IQUkPVWrOtAqm8a8SW+32/771GIVEPLpZLpwr2Xdd1zpdSSV0hnScoGEQUJImnrsIMb1QfaKPZuI0HRpREjS+7BmQuJJK4FjdZtQ6SxGuYN5RutqLIF25lW7HqucdZPbeRlLyiRJ/9FVcO7fwETJmPxGXitiWueNbReYTPrkYXe3DH8Mzeu877vu+975RwiOHpcHg6HGoSN2TsXgYtawjBOXd3d9d1nX3Sew9R5Sno2hAkmc7T1gmtidXVBfQs+qqr/apH9r82mo27hYUz9feoFDeIMEepl4SMgljVTNYwqzM8FytDODUyjcawUHXktzD+vJbJW+uRYDnuwenkZ4GY1R0CtEjJWW3Rag4o+OkpqC2ZSFd3GqRPVmpa9U/a2h6KmWP2zK5j5xk9qyOBBBqGMAwxYlCOcGONSFnBxI6UiTiqOIe+7733AiGGc04wnbekri0Mdc7ydbHYX0PEGJ1cMVUuM4YG2ykze12WIVTCiKTJ9H9JaKeNV8rHne5iXKZv+OaMeucen/5iR33fD8Pgwbtur6rOYASl3xDEbInsQNZSnlsuR4GSrEtq7WFwYNIgwajTPHcOLJbUEWXXwYpu1owAUk3Cpqw0BRun/yF3v5eEjjMi3px9k9SCnnjhNGPURt46TrKjkwgrpig7pYpEYUKiYIGWBo/SmKmqQbVkuSSxvht/EIvJWJmoswoRmU5Xf9en+gxDlUUVYO8dqcuVFgFxbjIVuywkUebUQULWYkVkXH6iFAdRijtPBzr82BE/URh+HX4hfHkYdP+vx7Dr0fVMQIjCxMz8NDz9+eef9w9f+t2d63CIQ9e5pyH+ehqc96oIQUDBs2MFaTSlom/fv/zX//v/RKXdfv80HKDU7/YxxkhCAHvnFUlAR6NK/PX41/7bd2I6HA4enj0kCFi7rheJzuPwOOx2uxhj33kRsTL81K7zbCP8jVmwJbv1iXH3Fdl3mh938RBL0xjrziSUKORouTVVWLRyw1adoMVN4kR9WbtImLAPFS42M6I3WqY1iOHIMkowCJ1f0RKdXzeuMhJHWllCq2oPs29Usu5Xq2XU5Hq8FenXXcOS75GD7BzuHO0cOZU4hMNTeBokCitIJGQjjhhEFb7f7fd711vgPNZGRaf0J0wjHSnUOVsGkYgk+2J21yYAEU1a0UktDKTW4OEMH2crKF3521d4+YB+3CcMzwHH7M3GRYNSZYS+pde0UNEmOatjOa9liyV+X4J5jbYsvV7tV1myOVGFdTAGYQOIhUGqqHIE06goHZ2cNb0LWf5zwnus8+KJlSVRLCxz3/cxxq53TwcdhuHXr1/7/b7vOgCqsO76GKwVQfb7/v7+PsLE7JO6gmT+uNU75Zzru25Qy8cl/bZZYF0b8RBCqWBQLlIte+M+TtbnVfoubuvHfVTNGnvkikLN7N5IJfq7nIfT/fw1LZWrra0j41jq7RwwcH3+loBfVgyXKbP6T1Z0WlPn2JkLdNZ0wUkXwnfsve/73jkXYzSaLBWooFQJjBQEwN3dnX0S01KGlQ6KVKtOsdB939dl9xjjEWLuujqx1U7X2DGbH/cqNi4BwDoXU4BaGNOqJatKaok3qqjECm6rKiPON65aD2/iH/2mDbZ+3pavlx+zXlSt9clUldR4hOx1pLrlIXOXZ1JJx845hyQqA1XlpKC6MMSz/2873gorYrNI4v0F4Dx23u98F8PBGldERARgMq1vq59mTJyoGkF9rLcKSRVSnvll5iq6X0OIEY4oNwvT2s2dvaaKWIkZR7bANpqNu43vyt57ERHj+SnrT4zAKKshGxJAUqPqZsfv7xQhvFKsWhs+naBnuY7dLBYTkQKURi4s1vAx62Bfld265Iqye2VBaG6AFYg657re7Xb9IQYD4g7DEMR1TCV4dM71fd91XdQqkNTUh6DMUkeYGSPNRAIUOVfnUXjba4hR3f1iXt7MiRst2gsgRC1WvZWNe0fXcLYjBybnmJ2QiG3rRoBWLjAJto/g3zq1pMdmrIQnc7Cu3sSKbfpBy29comSOJNHMq1EaH1dL1xuRhkv+nAqoELHMgHUzmuL6+SfKKAql2bXkOrIYaVshz+PscxGRxY7eQWPy0YYhhBDiMDw9Pd3LvRILIcaoIrvdrtt1znEMkR2cwsGCWbHzCSRMarWC2ST0zi9557c2uZKP47JkMDK8z2bbaGza+M35uI8ZqBKPcVbmiautX6maaeU+nLUDv4U94CWQ49UEX+EgWO1RrR0WzXrRy8NOrNtGnnE2kxv8wEKkzDClCN+xc6kmcKiQwOZYlWQiETmCc65QiRg8eN6UYug/JbYmljW5vK18XEnY1ZQEV7k1bdzEj/uoKQNVJXZd70BuEI6IIIJzMQ6MpORgNs7sIFfRFqqe/K35Sa5HteenMMfaWu2hqmaYCfO4JgXUXL9Pq7CDRc3ERFFr2Rd2XFufrVtcneqoUkaiVLHa2aUxAMcZ6C/OsYH8PbjvvXPOgeNhcBl/R0Rc6XwJp+64yi3S8Xo15oJkarRyiQw5qkragFhZyXs3DAOUet/t9/sYxWzcn//6a7f7wX2ndFBS13nvvVJkJqkI3bz3MWqUKKpBYpCYyqA5C2nVp/v7+8cwPD4+7na7u7u7GCN7zOatcDoZi7pn9/Trcee7vu8Ph0M6Woy73U5VnfdhOKyuH03zdUzPdFXuaw6BWnzyrGd5jFfW1swbsQ9HeO6Wi/zz8lspSHkK42IUJ05ARVjz5fxIv92PO6M5dPtv11tWdRrknqytd1KnmtKMEDjFmKxRBkCdR9e5fue9dwBilBAkBLM51hexvHDlKaexTv1QylUUJhRagZmqw6ozO83svZXF0Mbnq6sSW7xkKLnABBPNYw8a23mSxiCvJNKO72CpC31bmPmymLdOi5+crcORTNzWVXiMfp+UHi+C1LzEqc8+5TDrENWi1GfJYHOWSkfJRkjlwuTWNyjgWImURFQoKokBiINEgnjvnKMY9ak7xDjEGJ/C8Hg4dF1HlTiDKjFURjOdkqfIFfQgkiGBVONLcr+tkuhM9nncGvOLpGydRRtmvkYtWnsVpco2TtxKP6kflx9KLqpRJgUtMKqzpLx1hEPiiH+3yit34Ume08V9hBD42XNenvwS4rdUSnY0JxA+0Y87d36MLaZ0Y4CL1E7qn++6ztBvwyEeDoMl5pKN4+x/sbKmO0y5waPYo6Bj3o2VWMmBTYpwycM+my676hhjYT+nBWd9E3NoftyrDRNYsidE1KUcGVmeLTOOjeagEk+Ypbpqp2pmEXSyz79GnHKc3fe477a5AWryqey1jA6pCY+CmIOoSdE7sEV2Cawy/aoKM7h4yCEYtarliD/L1sCKwric+osBdc71vhsAEXk6hK4b+p0zESI77IjyQMpapjtDINIkscaT4q/5cQUrXpMsTWY7L5Vi46wXOH9M6z2g8uOa8Wk27pZOXBI0NiE4Q49QBl+ZjXO82ZNckVXoYqlqoYws9s7aYM/cvbdi1ePW8ogrNwPcn6EtoqOAXrb4yQNSFYv0q6hQT7Ge6fk/isWp5jOW3Udzq1liNxWoJryuREXkQxys+MCum10yhEqg6kAx33HjGLCGh8Lensgy2XXGda46mdjKR8PUxqVzi1LcN6mYQakBgF89Vv2E+bhkp6DE8AQh1tSKWERGsGlLZlpWqypKmIZ4SXMzxsvM8bmx6mhHFuZso3t0xbYuMc+lYyFl0cosqrJz3vuiHDrhRj5q5k4xuKO+bHEhNZpfZsRNQkyeVZ0K0YBIknSdBzeS9wKZp3PaWaXp5zjPmNzHMfqe4fvqyaxIz20hrRruYuOo1R9ePXD7bIZdEkQr5WZEQcQqVHU48Mi+LbOngicO2vLolOmS8gSP3a8VW1wi2zjuwzxr2mrOEiwsXfptoefFSU9XJJWFYMXsTHL92YAvsZYuPW6RlzjbE25XJCJkyK6FtimZmnWvO8/es/Ps2KJljtFoUEnVrocBV81+ppUhcblsagtgpEpVhZIj9QpODRaiEEr0b2BNP21q1aaOVOvGOCW2IpcK7AyMkG4Zkjej92lj1S111xNVX1eeGSXVmMjQOIUmSsqOk4fC4LG3gZzzI06ttO7nWiAlNmAWUlF1VXZ5tA5wxA4eXLgVLfFN7MbeioIayxlx6waHqFQFR2VkbqKaOSC1l4/K8DnhSBQt0Ettk2Pu3NL2KdSikSs0RlFoDa0wBw2q+f9JWllERWXf71znOs8AghryVkQzHrA4hha8E4iStkOaeSVI3gNUhTi1EFu9UwUkJhJhFCGkYHIdO4BFJIqqBI1KGjsvYGa/G4aoMcZD+J//+tf//d//hzSGITjviJSZHYRUmBQcOcKLKhhEIvIUA3ruQFBFiMzuwfdP/f4/9b+CiPMQIcu0sZK1d7CSiooqM0fVx+Hw9/D0ZXcnpD5q13eq8fB02Pe7h34fhgESO88xHFL9YWQdne9VW076DDW5+oLOr2ysHmS14fo4PdRqTfl22edZfnzte+Vz8scVNjdRIoWYZzLS007ncTUGzMea78aYdunobKNWzqg85yrC4a019+z6qM/mKBVdISKWaaJ8sXNwMnrEM2DaXH6MNEJjKUwvDzvjJRYce4aPuquarw7pPyEVZAY6YSbPxE6Z4TAWCkrwmM5QF44zBEROytSoZP1AAKzKQgz1YCJRUGSdecpc4+xAohpp+piJQskzGUkwQVbQSM3XajWHW1UeFhp6tZr9kfzRMlF1CvPS+I3nbG4nhn5LC6In7IQ67ccYH2DJ1dFVHXJREhURUemdQ9662ZB0PPJwSC2orM9bOOjKea/2gdRupvGhMKkjEgdip8qq0YoA3DnnXK4srVRmZjBjIS2CgcjVVeO5X62HzjoKKpmblEzkSvEjsa+0btVm417NwC1tHG1LXi25wGokxKpxXDwMI0riOAq0dqAm8Porbfp1y079jchVl7nbXztx1Sn5zjJOVbsbJ9B/bXMvph4xQ1NbtzVGtizOAFJvBVcOQWMYogyq7L2TENe7TXUy21HFKwuRte5DNUHkBkgpO6Si8DyUK56jiDig0OYXLHHaOdp43Sf98+mrrpiqpY1b93e2MhGn6NVP7Gk6Gh2vJx4JV5PWw9bf0oVRYQl+tZoopgIbBJRiVax0zKZZkdpOKy9YUamvqgKjd1ROzVSfE80LEciS+rnxdt5ZcGRK2cjdlMh5YbJeiygxTLcHzT6UGSkm1ZJ7UNVYaaAiKxMa8o6ZVYmndDKlLEtVO1dSQWRGtpJJA6xYvebDve7gNgVbbLpL/275Pp0D1l/t+jzFj7vR/rb0iY7r3s+8YKPhnYSN1ScdLRJzF1wKZDVWXVVUKcM5OAffJTZiTXzl9GysahC51NfFsM4H66MwjNzqTlYfrfhxNade8eO0AUdarPqaftwIW99YtVePVWdP1LmNB8scXMnEjXrsJ3twM+ai1YQX1z6tTGJGo1dzXSdKYhC2qvs9ijCzIzL9elW1dtckeDqbk42snG6c7RawLpNRFkvnSj1EMvfv2q6TWVVAiROYTZ8sWSjnMi2++XFVrLp6W2e6q0xqNCrHmejbaH7cb/Djbv2l5/pZV/fjVlP4J55t0XmYBbnpk5oAInUJ8rK5VZUTL8cssXGum8y182ADp4kcuRHL4vg4RSBHcMxYCzG3OO9mmY2PIYTyjvNxFwPNrhgxHfeelp984TfWW65pxD0PtV8EJjVxWH2ezjnHZOgwESE3FtQKV1rpJGPmGIfZ42FP9YK1wr4xgfUz22z11VXkpRWGuc7arc52YhjJ0+K5cMMlog4HBiEWD20IIOo7z8zDMBDIg8RwcxIl8a8RoA7JvTPVbsrcbZppx5nAgJKWhoSUvxsFAJPfRKMOM5WGCpryuVNunOLMWPn161dV7bp+GIYE+s3wLUfOKRQUNdqtSO1cMQo4gBRk0l8UcH9/v/9r//jnX7u+H9IdB0292hDCfr9/+vX469cv/fqDiEIIfd8//frbWJFFxHsPBqS+KcZvXNO3XH/jfMmzszzmSyLu05/3c09+axv7jL1cW1ZvOpV6yl/VXfoXuF01muR46HpiTeMqu9Qyhl1SdbrSvCUyxJj6QyYrTkWjNerqtHRgZLn5wrFk4l05mTWfs/zDDlbOreu8UBQJzqHrHDOOpBFKo345lKgKyFu5oH5OwI4w5wQuBY3pniHZmpcOkAIhVE3Y6SVFcBstH/dK7uTzpnBqSiyXfIo28BL5sUrxdszSaYKnTgxl9bwpg15m6WrPtKaoNAX7GMfOLWjqTjXMV/3ISiE+IKgJe0myS/mfFa+yeZIhjjtHxaU8MXYL/g9JvG9ZDALoOvd4CKq62/V3d3c50y9LhY2UYmO2RivzyZMxZYoqnIkVPMFsuorQhm2qW3SttOqcY56oXCZHvrXlNxv3OhZtqf286sfNsLI1XpTOl0+daTav+kqT88HmEY68Q+czKa1/S21icsWwhIohxCEGZjYO8jnZSSWxauxL5aKiJoAIKl62GaP6SMmbiw9bF1iXGgy0HOMA0N397u5u75wTCXMBHdLK0o0SriISVbIyjjC77Gtz57x37qCyOkuoNhtTCLNiBamscuq19Fyzca/nsqXuy7k5qG3cmoJqeXo3cs/PxpvIcKlVC7UMD0fjWB/Qnitznao+h3Q0rjoWzrVuSrMNwJBfllSSEIcowzAMMVDVw0+5pYmIuq5jZnKZOJPIMZQQQoBai2e+RpHReawjUz01YzAyWTGHeCCivu9NN9pSiHNhGgBwubc35eMgk8xgZn9KmrN913XsDiEax9w02k02TlK2lIZhiDHC9zEKT7sgzKRqa99qNu6Vrd4RG1ebmzpWXUaXVY/8WbHqXHCkzvQRVv58w4nTK9aFl+6VxCh5mEOX1Pags7qk2dbD4QAA3pWxiiskIuusSPRWqouvJl3Px4mMxiuji1VVdbfv7u/vdrveSgFrLRaMJEpdQeQYJMmai6RA1RxYZrKQUwdlHQuvsz6HFLmrmo0zY3e/35U29WoHQgtXm417RQN31I+buTMjbU7Ky+hMTCueH6supZW2snIVJ93owa2UonC5YoAly4o5I2OfAlIenWBCYvYr772QsC7MHNHBWL9DCIByTuFlXtJMNc+LPv+5jYtRSgk71tF99rnGAiuIVPtdv7/fffnyxXsfQogyMGAC2KtbTtGEZWX7BuM9d+zN6okIV9IQsz8v/nhaFSlYTjqEIQTn7u3aRWISpVUhNAPXbNwtjdoWLdrmn+SfyD9pISpsKnlEUFBxvxQj/pCn6xqAGBEF8ZTgW2iJ41dOaR/QFqTREcSyVyAmkCYCy7MeJiYS0eKpJbu2obzlnGPv4uEgiaFXyk8i7Vxnzl+UIESBDlaW0Apk02XDlymeUCjvNMfLZsc0adZUTtPEFKrFvArp+/39/d3d3V5EDsOvGGPXdXCsKlRcMFaKaapJmUkEjikACwo8iIqxsadG3qU1N6nxWHX1BhXrDIsxOgfPxCACRCNExbibWkru1WzcTFlj5hfUu98Sl3Qk572V/zoyimDcWcc593vZO9UoOdLZ+GQ1A4pIygpjRkRKMZNIanZEpqAzfLt3fdQgSh0xyKkQqTAcRVGzgUCsDt6xY/ZEwiyjCDFrjIGZoY6INCV8PMCqUpPTldZIM3MMJHq3fBlBRwX4eqYguXZZ0vxEonQ4HFiNIVI51zaLMkuqGGji94wxcudVRSIREymDQRFK0ZwVR45hB4vm7Enmqnv6dfhzGCx31nVdCWYBZiVVMca4EEU1Ag5wnKJmEZEgsZRWAfR9f/9wv7vbf//+RSHD8EREznt2joiHIEmjholVoyigDkoMpS6SBj2UzUNENAzk3dPTU+87712MAzPf39//519/RRFlx2BHpZIQLezddf3T8BTC0PX7Qzj8evq1u+vv951T0SAg8i5ztSe+KKpzwThKZL+6zpd5xmf/9tYx8hG4Na2hoLb46erjvIyNjv2zLo9OqevfuU0XIneWCRaQITYod0255Z3LVLvJP1j7gILqVE4OKkXFp0z9WMeIi1iZiayHnJeqLrVhnoe9J6y20XMxrkdd0QPbuvUCSnzAJMaLp8pEqgI2/K+qtb6nn0QaFQwGd9wRU4xxeBzCU6jbOZm56zrvvXOk5GJMWfyQXUuzcV3X9X2/3+93u939/f391y+7uz6EYeUkt9OjSF6wIyIoG9Nv7VNb6gysgDKzpog5UyRVdKmaudFVNUgUIueQ6O5uUDFrGb2XxqopgTol9jxipG8949cyr9ftkVrNq7CewQdZMCJjGKg0x5rSeqvjaqv86k15Jv8jCRpiODg6hxEgkfOWaqxShVgjYw+ftXbWdRXL9Fn5Yg3jHvudD+EwDIM1jRjTUe961/mu68zAdV3XdZ3v3LnA2tXJVNVohq26ECZyzJ3D33HeMVxSurl1hS0TZy0Wt7BuzcCdNW/P+HG1WtpxL/StjQ2buALc/82OpaTYcx6BbmlrYfrPaXJwVhg5yUKpljS5iBQNaTqta2di42od0s24SUWolERr1dGSB0zIOGZmcq4DvPeeGX632+93+/2d967b7Zxj57wVV1QlhBAksDsWlKyaNlNchXKZkNRXX54ChWmPdV2HwzBZY9MGCuecimhIDEs1L8t1n9s360O0msPbMvB0pi4E60hxueTGwPSTR5jHE5EaTlpqMz+ONlhSlo1lW84mp47QFJ9qnFQYSpX5FMfB/DZ7zhN2D0oQpZSfS3yaSF9IxMZfVFoZRCVIMIsQYjB90t1u9/Xr12/fvt3d7XYdiwYVgJV97zt23LGjKCZe4VSjHY7AxHp633HG4ghbC39+J5m5OPHsGPDsjAYOSgwrjChNRRStCWQI8RCDkLq+u511a67cFWzc6Q2VF9QEftM+wyRCOGN9bKXYjiXFjh5tIhmhz0xjTtKNHaHnxqq8kZBKQLDsvh1paT4y+aykuW3gFNdPIYc4AGD2zBQjiYQQQggHVXSd+/r16/39/uHh68PD3X5/7zuSYVAa0upLdE0xhKh2Z5QJAnJs1Q1ms5LH/bjR7QKsgkZaGFO4oFI0E7hrzhL2vnNJ1Y1G8DGRBw9MmstxJejx3tPG+bRY9ffbuJIDrgupSSzqTcWkeoZNNGAHCaCF4WIUXF39PC1Ek7AgacMJqTfoeDTJx6l16lYJ3WgDMrqMVU/ZdbIHR0RkteWYRsKIGLxjIj3xHAOo8WasnJ6uTyZBwEwkUUKMSpD9vmfXd363v+u/PHx7+HLX+R1BwhAfHw8SDkQBcMxEzhslnWr0/U7VYt5IFq5K6pE/b9NTUhKHpCKYPFmBEDkrhGd1wc6l/rSEEFSx1wwoyLGLpl9YakegGzXev4VY9b0Y2Wd4R+ocXJ2be78DC+bFywzoiZ83c4b6tzjprryEAXiSeDrqVNa5p+KALMvoJ67+U05YQH3fi0gIw+FwsIzV169f7u/vf/78WQz9YXgsU9F1zmbNOsMAZ03zYNJUZU6gk5jKl+6UmcnXKAQFMek6GVy5a46gIA8u7XSJpH3U281vTpnymxv1+/2444RNS2TNuQRPW0/IOu786NGWQoqq6thVSkiThvnVESWemG8qQce4+kUJRDzqwGNtKqBz3loVYefGg2J85AptiWHxh4FKmFMZHfukAyAsy3uR2o8qAh8zCgCGEJgKKiXrsohY3zhEM6pu2kM2vXdH2DSh6uxhxtj/oEQHCdb9HiVaus0ov0MYnoaDiNzd3/38+fOPP/54eHiwnoRhGIZhkChUOvxJZRCTixRJ79uwmHQC58ZGsrJyTmflYtORAWlMvb92k1PQyuyS3AToMDwJ0cP9/b7/68/HJwfuup5FPVggT8NBHYuI33UyBAAxyn//938P//FPt3hq6prSBTmfV4ZwTbgSttPBdfx3St7wyNO3pMw4cr3runHTD7ynmsNSR2proz7idW65NqtU5nOLfw6ooiDmVpHx5c1k6zM54nEytVNSorMGjNrw5RycjmXNtfTr6sRuLWuzPqVkUb7Id34YhhACgK7rROTx8fHp6anf7x4eHr59+/b9+/f7+3vvvaoeDocKA1wDsM8GfL4k41F7slWBOH2AQZGEXU5P598mis3qzDU77yJCuY5xiyR1Gy+NVd9s7mCZVtdkJhKOgDcWu1AmMFOdJeBAkwZPUCHXldWgNQELUopJ7T+trMlsu06eppIhLRL3a3mMVbfCSgCqEz93FSO+5H2a/Tb11ccYo4qInUBtRErPxkzy4ngZAURaAdyKu/T4+Ghgi2EY/v77b1Xtdv39l4efP7/f398/PDz0fV9wZKbqzUzMNGtaBRHg8lexJcgKB8EkM6qXaJEBClIyOQpySKk2KrybVZJBoNw575kpiIigancthKDJk2UElRACui411a3pz7fxO2sOb9mVm/ioC8dqxkK+ZXO31lwNwkCWKQFN2BnrjvfaG2IDTiy8ttEmmoYL6SwQwNopVX5N/Y+T8MC00IeWcaiIsNZuI47n7I5g7kKuzJbo2Bw6i4WJyF7s9/t/+/d//PHHH/t975wjIgtOVdV7b46eBbNUcQVrpQthtY0jucKsGXie+wYiNSWd3Jmfqg4iCq+SWo7LJtd1XToTUSs+gEYbZzlHApihqk9PT+h70snqbU5cs3GnWjfK5NQzxkpZ8IWtPrSzY27F8+DRrGSJZDBgrGTFHZukWvJZzYsM04R0HVpq5cfNJPvm72wjSOpQa8w/xlgg+3V5QWVkcCPRcpW6Fh2vymKlOcxw2eLFGCLFe2/NCXd3dz//7Y/v37/v93sAwzBEGZgZjH7n7StEA4HA6rzhDklUCAIQRc7OGiYvdKlBdolnVG9XRdJLNA4SHbhTntRwVPZd78BR590gReMt2XrREOPfT4/09etbi92ajXu7seoqB1Ft0U6pOcjCwSm50tVWAWAl+77Ma5bAah6VlE7V2kYvLJGIEElxiIq9YIwMTgy2vDttdzgsL39p41TnIW1txGuw2yw5tZw0O2jJysU6Mef47u7u69ev379///Lta9d1IYRhePIdmxEsrR21n2iu3CTsZczQ1Kuxc1EFOvcZNrZMi3wdc1Q26jexeD59FxfRnkIfMM5PFGUiQqmhMzNIY4iPj4/LJK820pEPlo+79diycZv13DVDUFAya8iJyo0qSb3ngyDltZ1zmdRPvo9G1ZhYJ8l40yIzK8WCAbY4JyKuFrZm6bAxLJoaOBFh4Um267kdfmbd5v8Uk05VkRhNx6Dz3nf93f779+8/fv7c7XYxxsfHv4nIOdfvd0N4OhwOMUZIavAsJdFs11RZlRSC052zyyToC8lBJkuHMhSkAl3rmiiarfZxkcT7VIFIYDZukISPWRYKWzKuxaqbTtw8Yi2RqoAghnpXgVJ6vfyJypOpE+dlAVIVFCkgQoAAzlLOYAOICsMTRSJWjflJMYIxNYhJbWplWuBAAnZZ6idao6aIxBAkRiNS0ygxZ6OIFHCKgZllBeSlR2xcss6iUZWioCTFT+TOWziJeaNQKClJ1GAXF1WElB13+93d3d3/+b//1z7899MjK5k7Fin+61//YkfMbNqsy7xBfdoKgIRGFqPrO0G2FAhSFGBZyVxfIVWQEmui7RMoOSbOvEyiJCAhElJHxKqsMD1WIYmkhyiR1BHn+zghUh85r3T82YzfJ7BxvOhP0rR/Wn9lUSlPYVE0twmUJe4AzsU4w0ZBydwBJjXtd6oET4mIVNQoEFEndlJyJVmkhLRSFSWSRB1nGWcok0CjaogkolEUJE5gUZs6shzdKKmlJFGEoDHkHm8QOSJGF1QkCMOQVZq5I0NQpUgd72iSA8req5g6ARWJKnOuQjgky0sKZevQHPNZZlaYijhfDj3daAQ0kiYu8hI6E6lEiaQBKhRFJGp0nXv4+uWf//znjx8/DodD2SusqmEVAcfepjbKZH8R48cFAc53THBKQzgMbD3xSZtCVJUSt4dMfGoQE6kRCkyL6nX0XWXurJGWIlEEMbMj9aICEgY5FolBcZAIjb2wYwDOM1TCj7v+8Pfffz3+tdt/IeeiyN1urxp750VC79hKGLzv/7+///7X34///PY9HJ5I1DuO4eC9jxSMI94Y7Jh4bHCepXh/kz+xfH0xQeQWF84F53BBTuyd4eNmSY3UZakFc4iarBeZMrdixzEhvEiFaq2YUVqph+ZNHjkpx6lwB7Le8hK5gkwiWUiICSDERAs+35YTIsFwyFEo9/mPRjWtdVaMJYt0/1hI2VrQZ+7tqtBXYYXLQdkIgNki4ajzkmMXRIxjkBUyA1JuzBokPg2PRPTjx4//+I//+Pbtm4j897/+Z7/fT6eRjj+6S0CM5eZytH7isyFkfMxrx9+iFRAk5NAUikJKFElFNZIalS+JOiZnTbrmlbFTBsGRRiJhIoFAHUGUAMYQVQhjM2Q5UaSv5ua8tVh11a7ndvLI6qGTZ6OI1S0fDNHkySyPuYo1EZB1IyIn5qhSMp/gp6JAzMdbycFRDvEkW7eSDpvaQfuXFKM8+aVywm4R1ymeVRMw47nMfplW+Uqe+EA6xk0JzyWqElSk5kECwzrVYxSJcaBwCMPd/d2PHz9+/vz59etX51yM8QJOoVk+3gwcE4LqjH7uJYWs0mJCU8WZujZawzsm+UdbCYBzrnf+6RBFhMBzpqakXQQGKZEVl2fVW5VJxT2lMpqlazaOqk6DxDUWAsPJAvIKIMa4assq9b5TfWCe9rkW/4ey9ydTzGrhLFIW4wSnpCuaqNNQmUJBClKMcFgz7fAaEWOJJWXmtY2AvmlDW92eNXvfAFxrtn7E0xVn2V5Ye1kUGYbhEAMrkacfP779/Lc//vGPf3jvHx8f//rrr67r7u7uDofDudanzlWZKSGwhAA9w6gpnv+KGZUOKwmVDQwzcevS7VCQhMbTSfRUQDP1HDrjs7d0rtKvp8dDCB3WQenc7FqzcauxRr34RCUhM8oiN6WkDR9Q3GamYHUJLqu0qUmLUVTPkenOGTCmIlWFCMVICtNKGWsjU5dBdZOMm5BNek7U0KLKOXPl1pp22WB5VamBRwlnmRcWJFjEHEfsIciSeUISgz4OhyE8gfnu4eHu/v4//vd/wLE1wDKzdS/8+vXL0Lwv8bbsPlpLqVatZ2lS1tTILvmuktqYGThQZeK5dsl770091opCI8KxmDzAig+R6OnpKUj03tF0U2FFbACSZuNWo4xVeBotYB9bjffg53U9Ju+LKgM5o2/PEpQA0sp/I1FYLUJGrAYLGxZEGSW7VzcuzB5Rsy6SsbhLdDGtITlW263qPoEa/Vu6GorlnOuoik7fHom8DzGEEA5hcI7vv375x7/94+uP7/2+CyEY0sV6AKyB4eUGzk7JOWd1pXmsej4ObtyrZgihsutYerSYOaKoElR6JCkPUoKqc673HTOX7EZQ4dklZKj230+PMUZ0fikFWfKwzZtrNm4ey5R3mBlB6wLCyMu6lr5ZCpvSmg7Q7Hsh2eSUlBxBYxIcLr0NVNOfjEmc5ImZVjxVfpbJ0I0rXCkVG7XqHrKKSvr6uFps2qJwKKpd8+7PdBXILJDjb5M4i2gsDfwi0f7FGGIQDfuH/bdv377//PHty9du1//69ZdziSC35AcME3duLmLZkEeqzCwsKqObZneDz/fdlrFqZZIURI4Q5vH+ZHfJMXvnvWfmVG034E6eXLNv5SCHYYgqYuX3qKaZNGNDGJO/zdh9ZhtHayh8OsrduPq+qNA5FMdsqIea9jqn50quypq3RIRFJ4lrIGkdjE/OlAVEE2bFlviRpFMJPDfrg1t11aqoUkdjOtWmKc8zM+wKZeRhkqCiSkHFd/7bj+///Oc/v337Zv2Yu93OcqPmcyGLKL98P7Mz4toHv3Z7QG3dNDO2P5PEEDUEHNPUa8ZYt3YGq1QiohhjUFGcVFKQFr3ewsZt6Rv+Lij21vdacapmp0oaSOAa9rFeXqyrFhUefdWJmK3yCUeTaDFbqe1fBJNGUbWojZ2z+NQ5R3DGdUIMJHye4enVqUaRJDVo1HNIuzkn8RUpVQ4R0LSv43h1NfOsSb6ObPuElNR7b1YvyzprCEOMkTwn4ZiMmxOREAN7/Pz549///d8fvn4B9O/HvwA478yclfvykmVT0+GV8/eceiEOh8MhhOq+r1cblnzO0yTHpK9ZRKiiUMqAFVIir94ED8UlOVcHeGYoGRPUfr//83/+FB52u90wBDj1jvuuIxJjdmFg3/Uh/vqff/3rx9cvQxg6Rdd1h8Nhf7c/hOG3PEczksETb8oR/rgLzuclugg1tok2aozv2I9bydqUPMpaaWJrtld1YVZ1sM4dghRxZAMJBRGDeNKTJCVUAcjxqCcMi7X52arLEbnbhZVfGHFrS7DOilhn4kRVnw6Hruv6rgsSn54eDzEw835398e//3F/f3/3cO+cixpIX6knSab36OXfiKqyjkRoSke4V3Qhj8qAB3rnXW6lZWbKsh8Jsp6g26qqg8RBIict1oTNNvAjViR3r5q//hzj+Kp49/2qxvo1vVpMXhd4WiLp1ZkfN+OSPEY6irQu6yfQmEg0KzOt5M7zP6XwtZmvZrErTJbezsrMjflEkYgULuNRhOre1Ski5MhWqVIZIzXwlgKIUY1kqbKbjpngWFQOT4fH4SAi/X7348e3r1+/fvv5wzmXhK9qsqDb32Ih0iyynYozuNAiLFt9K0SzWrvH2HMK1GR2VLigHRkflHNuSEAcJk3CqwCKwQMQSQ9hiDF6Zsqz/b5kPN+sUTsxffEu+xwqSXliZw0MZJSPxBZMkvWspp+iQsqWZV8w9z+TglnTXsGG90dEQmr0YWDAsQLE5flUipkuZaweVs8eanoSWrhsK77bkhJq0TNf06Jwifdj6aWqg1zGIOEQDnEI7N2PH99//vz57duX3W5Hjk0e0AI8ymxxdHtXrhgdk0zSS3NzS7WKWaWVqva4EcxrTq7d2eyHM8Ns3FMIUYSd9TWPQQCbjwhiZis7wHsVVahLvO1IuLycqGi5uLNcttPN3Dv249K1mR6CURhZn7PkBDByeEDpNQiSUcAzD6jmVpqauOmbGdiR2xRS67h1J+Qu7hSfFgNnDmB6v6xpe4Rya1b2j3J2GiaTkFiIlUjJKc0dp1mzui54zbJoKqgqlczAhiKJgkko/j386vb9jz9+fv/j57dvXwzv9hQGxNFgJjdHCbcH59etXeke4cLVUnXCzGusADkiUwl0BGGGpIp6HRPkOquAyDnnnNNhiDEi639nAEop7pDrvGFr3N5pEICYWdGIR64WmT5r5t4fR2admhnjQRDyTmtkHQlRYm4dp9cJ/bTI08/csWeTPnWZDGtg1IQjYCinRvnUjDH9A6OXXMSY1aeA41IAqwnEqf2S1epKlpHQWNjPAWL99u3bw/evf/z8eX9/D6jZPmaOcbCKzUQm5tWd96pX7wpZqsSrLDpnWCK43KQl024HDx5ESNWY3PH0ZJPsuPqKpOMFAjnnDjEMMY5kE8xEERkBI3V8oNecsc8Tq36cfNxMhKGEq/WNnVytQRCyzUj77yI4nYFOl2WE6TckEJP5a6Ac0WhKThsAqg52tD6UVXW1jiihueLJSqv1kNpz0Q3TXNeb5teio2GyWmrVqpWat3a73X6/73b+6z9++H3X+y6KhHiwFq7O+6gBgAPngyjYnkp+NRtHDFKY1aEFlrvu8j3Fp0uNXEY3vCbdvdq1yuw4Cql2OSWnG8rfduOY+fFxMNmKxCGBuRcn1aJqo8Wqi2VKUoGoNj68yHcct2uT2TxFEVUNAZ8kVWpaXctiJ2aSKddmukk83qIiMh1JTbuLjRGPWBFT/8+2iMyqsJZ1PU0Vp6JZOiEVEoV2Xffw5f779+93X+6w81HDEAMzWWt9COHXr1/OjbS9Y9aJOcrtNzaswH2mH2JC4u+TSqh7Joq2frsZJKQzxvPxY2ZKrQpEAnLODYOZe3QOHeOQCASJ4BROoQoSqMsnk+rXQiKiYJCm5hltRu01hj9XL/Xmxuuo7r2Y0DtDJXWLEoEwCl2XumdReyECRIMKxdT6ZPkkg+AWyU6p3cA6668RmXAi/ca0tUQBY1IiVpUYvcQYY4jqHVjhwMYhSUyiBHYKUqmjJFIgjgLyJb2NXN8jI6gwKm0CgVg0TBqtprTmSZsV7BxCiBLEgU2Ri4gMb6wgITkMAzzv9ruHh4eHr1/u7+/7vifHUQPDOt7E6hLM6Htv3xU0mj+FRLZy+wXBKX3G7HrHzPx0CGEYPI8WLdPacXF1C3ORru7/xS8jehwOqZ5jfQhqlL5OwgBlJheGCA1A571j5kGi6zuRyI6/3u3+61/y6+/H7ssDiOF6cl6iqg4MB1YSYXhm/+eff8YfP/Zdr2FgdiLRsRMigUleq5I+u1WfFYRe6yk+Lqu6LOVv6auey3J6hA/urCtVvM+66rNKo+MDkhP8VsNa5rBm7DrnLqnU4aiE3LLqCIabT+IrmJjvU9ZdYVvL+fUc2pYCIOZI19UbbyOG0HV913UEhBCehsMwHAaJ9w/3u7v9168Pu/u7vu8BRIoUY+4nkje+Bsodnr3Qxc+TjsO5J59AwoxSGy20VGl70FS0ApE4cMcMKIkSOyK26r2QAbgj5dpU4pvhLpeS3Lgkmit3az/u/Z461vLxp7OS1nxEp3iXoJGjePwjXckR1Mk44MIM+VY7KlJ8a2oCKhUxACsbMsZ6Z0UoqviuY+eUSGI0LjPvfed3f/zxx93D/Zcv967vRGSIIekHvvmbXuAvl62Ws4DEa2w3owSXlR08O9HAxnoPJlVX0S7EDIgLMarrmVklAmh0ca+Wv3tn/aq0odk+66++peNQWUld8ZuYmYwVrtKDubgaOGdPETJlBJdUbOZUBRPFaBEVdPtdjPHw+DjEoKr93f7r1y/3Xx7u7++583AIkgRSkxayxrd202cNaoaSe+GhZryYuZIzEyFc4XFJNIYQEFvK0nsvouyWQTZKrTbEOAwDdvdGwMfMRPouPLgPUJ99b9xKG4F9bemevSvLrqBTYlVzySb4lZy004qlgydyzxODWxAnmEZSmCkN1Ol2mnuLrAThglw13jp7QYWhMwXODMjhcAgqIPW7fr/fffn29eHhob/bM1NUOYRQUpBwpBXQ9W3e+sKBflnb/wr6d/ZFOgLolutkbBhRVVXn/a7v+677dXgyFzhVn5CVcDKsr+abWrbEtNFs3K1i1XN3qvJJlyRY0gsYfa4kDnG1BlWGkKXModsRK29wZK72LbBOfrdUUKydDfMoH4eD77uHL18evn758uXB9R0RhRjLR+0pNCFnEeE3j7dP9dwzbdzxWLVmkdNJzYrWA1URkcAwN87z4UA1zX1u31MGK8O5GGPSISQSEatdNOvTbNwlAezVY9VUtajQWI5A2+LN6hJO9iUh6hF7h8QSUhjWTG+FkviJCilUlBQMxw7fHu76u/3X+4f9w33XdaIa4kE0QkAAp7q6hEyo+TbTRDWCpGZpv2msSiu0o5lDkEhEHFHvfO/8XyVpq3WsoFBy7BE4DMNTGMT02aao7Hcaq74Xidj3pCF9vAlhdfne/JQ2bnnpczBUsB49gp5m3Uroinl6aOWqRz+O8b/+1//iznvvRfXx6UlV2VHf90MIzjmwxhgtYvXec9fpEN78MvitOvMMGtWJxJxgroJPHvsHSYnMTRZNHSMFiN7Gx/fjnuW3mo3CKVabvBJZLHnT0p6fZVhT0ZAZG3ZzlqOpu7VVlaKB6iryfkmA9SIRRpnarObjBkxkVeF4i4Sda12xaSauEKYkVJepx4qGmqCciApXkoqq+s7f399/+fKlv9uLMzFTISJ2ZPXhECNYRYPxY3jvVZUgQ3jy5GgDYEzX4BF7iQ+b7wsXMs4VCYsjtDELHmkygj8y1W9yjoWgcEKahMEkFskeVQbYAL3MDFUZAoE771kVrKazm5aBA0VR0RijgsjxEMNfj79+3N3vaBdCWBdIfHtQkiN8jid+/vTOv9lTTGvoglmTD63h72bn+S5j1Vt4ahcfkIlEFEqsVNrvhQjIGDd6/h4fYRCc3HilEEMdRsVMmTkMA3vXd73ru33Xd/ud3/XsWXRci89e4Tvi2s4dI3iVL6qetJEsy/4nHtx5X7OiW76kal8BMaKRqtqDt8YN1coQN4qF/e9do7f+k6vM7/Hddb75MKxldbILYSWwtTa02a3cUmyofJDkvFjLh2gUkSgCB7/r7u7u9vd3ve/YO2ZOktmQaXAtlb1LmDglfV+ArYQguW4Tu074/o5gJwuzAzO897vd7vHpQFGUa78yKsVIKZANEoPEoML4CObs1g/jFi/3e7JxL5/TG+Xd5imwtWc/yQ8qkehKqihl4hKRRE1SspJfqwzo0sDNRLNAZEJ/McdQ5jZw5x8eHrpdv9/v/a63/vwgIkGx4ZsVlr30s/gReDc2jkw17RproErzzZMeyKQIIyd6PgGwMnHn+H63PzwNFhkV0cWqjZ8DEGO0znwry751sPVbtQDn3u73VHNYRuP5562s28wioLYOlZGqVQK4IlakIvxsQaXRxxnP5ZRBt9CQ1L36JRVXqqjJixONcTA+JGb2u77ve+f9ly9f4B0zE2u0fF1Kvm3L+miSZ0d+/Y7cC7PjJWU6Y10+f0Wt+GhLGyeSRMFBMGddVZ1z+33vfzlVJRUkZgaNlJg1LQkcQjgMg2SptlZ4eLXxLmPVW+fjzlBlT5p9k51fkNjraGPnmQahz5zGxJUjCcPBuDm97/u+3+33+/3e9Z1zztJ/Vr+jou2ypamYvTZU3hvenY1TudZKWMaq5YYu3fDE0WC8vsy973a+GyTOEIvWucXsUPtx/BFcuNfHlFx85BarnjGVW85OTTBbvygtBIKTLOmWgRvfAQmpd7zb7br9brfb+b5zzhGzSEzfzqoiCigrWFXq7E9l7wyhPD69RCQCfkfr4cRe49Nj1e2vKHsVagcsMSyDvfd93+vT05A64URnEpeMqBKzRJBQ6sZr48Tn/eJq/vuLVV9i4HC+nwJZZ9aePRBa96Vu3IPCgLL4q/zolKxYIYTN76ik19YH7nfd7su9sSEJUQghDoPxHZnsDIAgQiJRFUcTP1O2NX5fC2BLr+clx2RVIQHYAZGICVxKNsRqFRpNu10khUYyMIsDs9ErI9ecGGDoYEQHQWggCVDbSMY7nDv7Wvj68uzbdfy42+ux8raNms2C4TNCdkqy7yNCRA5Q0RjFMlkg5dRL6FadKYe6N3Q0QyY0CiWYurIxzuXMcZRIAoJjn2BlypCsXJXo11UzE1ze/Ct+c+ddJNWgSlGUVKMKlKIKnAfAEkMIQiTe913v/vjnf0giX8LTEBUEMPtMApwF8JyJlRnUAStzqJVFMw1Xywge79u9ht/EL1v6kxvHTEayUp0205rm7Iwff3w/JzxZSZWY0EGFdFDxTAqNrIYiBLNjJ1GzRK+YOJEghhC6Ho9PIcbBtF8zlIg79sPTAPZ+f/fXYfjz8HS32xNgza0QtcxGBAVSInJnVl3fWr/BsyvkxBN+lj/uCMRqAnUg9R91H5iBbFVPmuJTsnJM2d8ycTmMIUnhUi9/ywSTB9v61tS3yKRKYJPeUVLAUYxRwsEKc7vd3X6/73a9FOU9POO0njFXmHijHzLYOfWv0p0SNmAwYCbOtGgExqWZExeQdNNIO+cyRDyS9qacJEEBZ2g5IQ1KxmDFAClYxdq/YmKqa67cTeyA/zALetnV9Lz0zMnI21W7UPQ0MeFQWjmfYycTU/eiiYqVMx9JfTt/d3d3f3+/2+3g3WHRy62fUuMJ00FH1ddfMkUnZv289wU1kr9Uogg8l/0tqgSJosqOKeiqhW1purdr495Cm/FE62DKbV3FLOsGbiu5sxU4TOkwaRnnnvho1aGTVCOE0HXdfr/f3d/t93vvPWUJ6ptO9fviC1sjettsRLt4No6YuSIcYYI+jlCLJYYQeHp/Qwi5J1+p8WS+ygr5ILwjVDecTkWUj7tsz0b1eDbKK7GLgZ5AmDFWHl3JpreQNAA1tUYSUbff3d3dPTw89LsdAEP8RlI4XjW4H1trbtPAEWpBslkm7iqZYsyE0Y5+kpkjJapUBcFxbSXNxgWVnWMBuabF1WzcLWLVC4zd8xa2aj+UBUnZM4oQQIlMlRRA13Xk+OHhoev7vu+VEQzxS2DvLjvPDx+xLiU+roKmrDHAW6ElW2ZW1DF75zQE26YMEj5j/QoSRYRcEtxBM3DvyMad60fobRjJZ1C1E2PVs87N6JJSXS/VUlO3Np3GLTw5mlH9x2jcJH3fd/udRakGrBMVqShlzcu7nWk7H9vJb8fMbV3CZWZuZH6uC1bAagYDgPe+67ooEkUoM6JIJuZjZpGYMhGgAsizIlLz5t5BPu4teHAvmYjL+i4wFeu+QGUgxmjNp0Las/e7/v7+vt/tRCSoiCoBzvvk7kkjH9uc/6sk4J5dYyMW0lq6NJl5JnTsPDsAEoUAhShSpqJk9CJpzL0ZzbS9zvDHfZklDu538YKuhiF1FFCEHTVKjNF446xnnivF6C2KzWc9heU5qGpcts0v8Nn2K+fcqE5feRzmwXVdd/dw//Dw0O13qhpCsE4sQwinTJyp4U21aa6ehnthCfLi4198ITVhn4hwla/c4jKbTJ2u2E0GNBP2TvtVFc4Rpz45gphb55iHELz3fa//+vuvYYhd33vvo4pI7NjZfQdwOByenp5wfycaSbUWunFk3MzHkn9HdEvPnedj/TzVMWvexvrnubJBR3jfTkFBLB+r1ePY+6MpUKUPwHV+W09BT/X7tPC+bi/HkdCxGDsRdtx5b71Z8M7ILJVT06vmcCYtOGxSvG3biHeGEX1hxHq7mGBdMDCVuQiqTGBm7z0HjaQ8FYgwKhpRjQYC37iVeMOaQS8Jet6iH/eBA5xT/MQ6uZNAv9N9o8jQ6BQFsJBxKuSJcz5bM3N93/d3+7u7O+d98R3Y8QpRMC67rlfIeRTX6QSlWj5V//wklxAr7vblC0O3ImLQdA3U9wV2a0TZ5B267nGQoBpjtLqqamKdsXOOKpGUkZbQjYzaVTt5XztoazbuhmtiVR5hXsFYfd6quAeVPF2xcebeJ9I3kG34AO6+PHR93/W9MnQIkdTaHVct2hGe3t+27M7scr3WeS7Z7Yv6zAW+2+J268wxzJ35WsTBJwfJqmzO+d1u1w0ih0Pi+ytbI0BEQRMf/Xh0s3QlCtSGmWs27rUsXWacwNKcqSpnFWc9iuac2TjLvrnOW+XU9V2/2wkoqPGGKDEIiCp5/Y+m8zgR+Xb+5db+73XyfRf4HWOVs7ZxesmllcoAWXd8NmQlH5esEkFAc7VoUWIY1RIcdc73zj/RoaA1x8QZYGsgxGhtLaJvnSvz6sQHzca9uVj19DstVTe1ToSzxlVuYiu+7/b7/d3dnes7YYjEGIIBR0u69CV+zS1s3NXcvivZuFmRZzRH+oKFcTTXOcaq08VgFtAlTmJ1znVd5w4uyJgIZyVijgwrKMUYif1Zfvot1nnz41qsWqltEhFR3OA8kOnTsa67mld/13W+77z3BnYLRMEwJ8ajsrY06x58PTv/8sFrDnU4uV4WeFmsWstLL2UPE+UV4JyLGkUEDLu50Ekpn5mVWUPScSPXaU71ZY8db+92rddh3lfZodm4zTua1jpBTHxr+6+MmoLXmrZMVcX6H7zjfr/b3d+Z1l+MMQxBHATkltmf83nrf4eNM14Vfn0blzHYICJHiLDW0bMnrtSOpDKPTIjZhGX3CnVcmUSIlBWRlKFQBw0kEuB6ZnLMIgEkqtGSlgwHEiEfhFZhjm+Wa35m5t6dJ+iPKA9daYLcxfHLaYuUc7ww7rTMUIkMTt6/lIiGgoZn/LiqEYKJiF3KOqHoKlT7syb1UxNbAiHEUPtuqQUV9O3nD+89d14dDypCKlDyCdxVCUCc0X1xGh7tWB5tq7vzCBpx5RyqkszzMSmdG5PG+TkY3pDL90TLyzETg1kpZMbdnKEDEaFKAtgRcwIhs/2pEhJvvd05UmEzYGBVdTBvjElFlJRUACJmsIC8cxAxtnnvcNc7kcPw9KfrO3J8CCJKcD0NOhxoiEUOIiqJglQ5x8HHYswVfN+Zz9S5z9oMB3c7jYGtVjyaYxXi6pnk9Uxkt6dacc2Pe/4eAFgaCkuclRVgSBC7N6W2QBa2dB7M3HliLiCpElzR75Mvee+4J6pcrfqnOXTHo60tn652pZgQjTtzzMEl9GIhBETGwkhFtiokjsmTRmgC9gIER4ASq7gYCFY8R5FPFMvatQ7WFqu+OLjayitXuwFNXy/7vbf6JYr7JqQE8s7tdrv+bu+7LqggM8SVBM2NJCkujhk/QEK6rjxcxWTXtdo65bcqOGAf4DxgNM0w5y9VLYx9xHAl9pOmkh1tNBt3/Wf7gmg6hLDaFpOILb1n5q7ruv0utfUMBwBgzBQL27iFjXu5dcvYHUzd23VhY7NcGWZCDvDsvPdeYlQihiOKOSchpCGEZcKrrYdm464Z2mwbs/nrOp+egCCklGBxk7JpWqYM55wJNXGXuGGLeHB6/ESUqDBSvNDavtzWn559u/Vecgsbd9mElXqr5UuzpUumzTIUbmINJ40QtgZcNKFbMIMEMbPdHcJgaHC6mbxcG5/Xxl3mwS1j1UmPvYwqn13XGceO6dVLZvdNPOYVSQlVKNY2bmHj9GW0yXWRdkoIXLimJwdngAhRFUSeuXN+8H4YDgwwoBlWrJI0cBfgpGbsmo27pX9xZHlJUZPP3am5DqdiaRZOSRgAu/0eADtXPDWrqyaPT4QqLgf+fXLCHwD3dNzGVZxXL4pV67o3ZSQQtLZNFchuFAzjzjnPbkYpaCxyUSSoMKlLTNI1triZuWbjXtOJ22b4svCz8CaZ72YoXzNthU5HGQ6J2zL1q2YGmMJ5+RbM3MdwIm5qo5UxtYALF08VCagEB3ZgiEK0BLnFDibkEUYfUJqNe6c2TvUS3HmdvVqmYyf5I+aavo0MHmOsD0BmjqOik+BwdN9efJ3Fm1qZrfLaOdf3vZk2zqcRRcQ2/oK8StdDlV+QrsJO8lrztu6Ensz/tcqRdzsbdBZp+6rLuf7J6nrzZxIf78aZzLtZ0jIQzCrgRBQpltLn2PslSfdj3NVUJUYiut/vHw9PTyEqEdhHEevYizEOIdzd7aBRwsDOxRhDFFMmOmsNbPE8ZmWcTdjj62whz7LUnYKJo21Z1XWbMD3OB/TjbJFZsr/miTUzxLx+k2KMq/N1OBxo3i1UiMfZOWcGzt6MpG+QqPdj4OCuEozf9KlOkru2NSqpUgQ55yBKSlBjwQSRBpWaWFhfTAzVxhH76D/edVqzIWWPzOhby2XHDULyUOmWlvkSy6khGzXnbEsv3fXpGwvHaSYjIXorUcdHxcG9jpmr83qn2DtrbRt3RNXO+SgUB4mktoiiSAwxhBBV/FtaKh/vXtu9e/c2bqvDSfNvRQRVb0eMQTDKYpafULXXynBEAnIEgPq+Ux5RncXG1c7z5By47cZvYsVXQfHlRyidZ2d5c8iWzlTWBlGOFDWlPiJRkPgUBhEhB+v/an7c1VycRVTuP+B15lSw/WTmmhZELEenNPvJDsyAEjHYhDGVHIN9P4tSKWM+adptR5lNU9/ejf887tvsjlych5r1S5Qy69bnXdF8qIhMWKlzrvPeR4pBpTrUMAyqIzd+s3G3G/4jWbd6lRh+jSxTlv04ATn2x21Bbc5kyilQXLaSsJ//FeM31knbWL2bLzHsy36GZ6VVWDUm1S4Yl2rnvPd0iKFoDwEYYggiyo5is3HXD+nqHe7j+nGqnOsLBYUWSdlDTtj/U5mCSKRqmq8Kb7N6pbU9zJoodPpHby1P8QkTNBf4ccfl6I5/tQGGrTYFRBWhnNsNIZRQoLAQNwzwFXNW5a59WHxcJHW5XqUos4B4tPZcK6GlGjxRvdBHocyNOiyY3/jT/rEfJOtCsByro3E/u4ydLU+dEIGIHSHYTrZQ1VJOwemksA5VUYA8yEFJI5SVRBlRSAElJmVlJmKoKU83e3UdJ668/wo2Ts4815JMKwr3dcsoL1ZhqqKOlwpLwzlrKK0vnXINdP3hWGlXpSlx2VheMGzK2vlHWrh9z17vy0ZFj648v8fV/M9SikvMkWaZ2nPX1mqP+rNr8YqU7rP5B+BMUQ0IIoPG1HuXTEitzolK+rPaI2XIn0y0fvZbViK1JC/A43FEhUCS7zoKoJcB1d7Rw64D6HEYBo0AnkL8dZBvX3boEB4fwdqBYxRyfMTMLWdv636Vi5p0jL295Gw5/9ml1TjKzfreabvUR+5zOGtLvLq28fv17S/LfNVL8zc+P8gJgsIoB8DRJde1cA2kHBC6voMplrudEtQBjslxkohWIlESgigYUHZEwkpEGwyun8kLO0tM+hSfrvVyNRt3zWv87d7BalbrAk3C+mjLLoLT5yGn25AR4xKjlMY+EeGjcjmf7bl7dv0cmf8Pi4+74rPx2dbW8pIvSHtfxpB+czNHVLUDXmjjVuXZdCJ1uD4P8wcv93455zqWwBGARDNxkvv7LjRzHym7+nLANn0GfNzVbVwrdZ07Dy+PNa5rwV+i10VrrQ5LnEfJ5dX9zunPlZhIlRy4YwSvHIL1zyYRQp8KuAIStNX1Ukas5ZG5Pb2ztTsbn8qmX1YEGPlBJzblTVxXIR9/ydFWY9XVLzp+PtYn07GzAohp65S//Zy76ayM8JJJ2FqEzY/7pP7atXiAZ7jCj5SFWJcS15OMeHHlGFDRmZkzeohEnlqJIl1wqh8pj3w6z8pZt77ZuM9r466CDa5rqUsyn4+3K5w7P7WmZR0fJCauLE/dHsArPqcfk1tplmgs3Eqn+y+n7IFv+bktlLSbz9j056qy6pEHeOtX2zhBvcAorOVlLtEDBddc5wwAFR+cvZH/CdpW+TxlA5itvTlU0DiBlQclo1RyzvXoh77/9evX493dj7sdmVa5Y6kZcp5be6vCYFv/3KLtu9jfv7qXfeL+esr5zIJW/gDWbRkunQui+VRb32fui7z4Ub/Ot+tIHVz2ldh4lW48/EddxOf6C5/Kt2/t36+6JitWdOSknnOOVLLaEVQ1Nm3V24yP5sc9Ww+9Yh2njfe1+S2Du8vu/lSj69iGgUqznKfoE6M1jzGKSHHlpBm5G9gH/wHW7uo7JzQ26ie5x2flMs6drs/mEq6yLR3B36VG/akfZ3jg4aAhRhFRcFRlpebItVj1pGfs3Ar0dTGHbbxlP64oXxVM3yvf9mIiix83I99vvCMtVt1au6cujc8Wq7Z83O3s1EvQJAZLTu1c2bq1+3KL9c8fY8HRtGR2ouX6hOHqhzdwW5K4lhd73SuvHy4lEgZYBaSc9eGUomrijVNVan1Ht4hVr6Xj+Uqu5YLEt6Kq3ERpTq+x5lOj1dd1buX2dpCfNUyn8F7kz8f50RdtTFux+XWxu9soDTlxmwHWz/b4ea62bSmR914lJntif8sAQax13zjxq7NKXVbLni1OnIRaLRMAzC4XSSsfTTPXelQmUgxeSEWJNErY7ZxE+fX09PPhCxPJ46HvIbJuo2fzeTE/h53bkVzNs4qoxz+2bHHbOu3jOaKtz6/u2QBqztrZb1ufw7txVNs40Y+jwiJX5rBy5YjIESIXsUicuAdceD7EmjYedQohcUSRxOgzScT8OLatTnm5Sx13xj8hMGCJ0z4+Cc3GvRsD14zdLTaMawFKTnsyk8IDACMg1s9qp64YHzw7e75xCr2Lp7EZuBPdWz3hD0fSJNLV+Ot2Zi5zqyOzxo0tZcepR7Z6xT5zn/WJ1978uA8Sq17MF/J5prFGsS0Jfl/xNMgYMc3GlVaH5ljcaDQb985i1fYYvHw+n82dX932mc+49iYZyZLxBJy+h33aZXABpr3Fqi1W/WCx6vMFxzpWnVUYbhcDph4HMtmaSdOhqoKTvWutDqfYuC256ObHffBwtY0TpvF5yrxXo+Q9yzE/FzvySVy5Ux4Qf1nf4ikssqfw+l9X5eQUTNnWSb3lRaNHda+vax/P9euvNW9bOLiz44yNy7V2AmaWRMCbIHJLvNhlXO2Jt2676me1BcmIFZOyVeakztWxMofD4Pp1ocRr1RzONRAvXCcn0kRv8RueaO6PpFY/DkdmG22c+GReJmFzEycOo+07LgjdxktGm9M22vht1pZyzaHZuNuN5se18SldOcNq/NbTsPJI8eM4aRBep7ey1QzL/Ph3dK7tXl4wP9f6/Lu5XpQfk7dKlqfYuN++cpYsEswsKm0xt1i1jTZe4MG9Ddnc2ua2rbrFqm208dGGqiapVqqqhOcb3xbfPDs/zY9r4zOFLUpscgoKKOG17ICiBNBcbBCUQM5+bUiWZphu4scdx7sd97RPeX8L97S9C8nGkbf2rvctM7imH1ptPEvSRMize/gr7I0vmNsZHq1EjutAKhGZNSE80/O0cTqO2VSbodqBHMMLgspg63Ox1HjjW4ROZPVJNHNCSoT0R8pMUFUGdQwRARyDTbmG4ILEWfaoQMBeiEebvX86FfZlz87y+FvHKTTIsz+cvX/WOvyYGtJtfOBYY/bihfxuyXgBSgRRB76dGpaCSEnW0t5MSORKICISIFMt8dY238Zl66fZuDbeh4174Sh+wWUiDC86f6OKS46GAEykzCyiBKGqwgugBavNxrXxeW3cib0+x4/2W/iUalb0wqqUTkYJACuBQWv0JG28cHxA7cE2Pp6Ne3lfc53S+i0gksSISXO9c54SkDTekSunC1o+ro23v0avsp8t/cECBgae+d7Lv1SJAJ7EqhP6E2b2itThYEjgFq02P66N5tZdYIMwsoqP7zAzya1tihSbBk0VD2d6YEpMYGZmTm1c2iSkr79gGj6ujbfuxy3xELgIK3sLOq+zLqXG/agqQQCAlRkgAomB5tq4ro3zr6az+cL1dMqfX3H5nn75q190+pnUvGP1zy0EU32w07/ldjx9x+PB0yftFMqNU8RKTkFuluZQELGSqJS78OzkzK7xdL+SCQoiKNSogNWxixKMSE5EhhC896px+XVHzupcXr9b6/Js8dOduGZOWJxYvaFH8IPNj3tD8ddNF18bR/y7mzp0Ww0VABIwzsDClQJsG1d0gFo+7i3enmbmXtXG5V6LW1g6gxoTQMqsJGbyQKxUA0py/UMadOT0G3didNL8uDY+9bB8/8yVu94eU3UsQBaEdWIZcbCyErf2hjN9ghP3pObHvaF7lh+tF/UqvYvw4U2dJzPXbaE3cqI5QeNy4AolYp5xdjb//eSlVUPBj89bs3FtfHo/TvTWktLLRJvBRCxOdg34+7JY9UhGtdUc3qi/0/bz15z/t0Cc2dp1bjdpzca9uVvVDNyr+nFQB3WEOh0mpAqy/154eCKCsoDsP0pkcUpETAoll2uuLRt3o83AX/e7bwew3MaRjSRrU1NRndv4Sk40IM/inrau7twKXUa2219R9dP+Z9qR118Z19JmfdcOCIh0CAwBAQwoRVIRIWhuLB3Z7pItmua8Z+RoS51Qkpx+g1k1YgJBHPlweGSl3nkmJYhzTukkzZqX7ILlOT0R2bdVijFevxpZnZR3pjjHJX77XM3sxbXLWfPwzvpVl/4OADo73G78XC2Yqq4rPTNijlWsvTkQa+KAe+FQjD8FQkTQyARm9WBX+wd4N+th5tZcd4Vs2zha7jHHj8Pv+hlrYV0b131ia9+E9Sb2nZVYSaMAcM6lZtX3tp6XomL0Kr1Ms8zpKX0p/rPt281/aWPVz2IlBdhSA0pKpBi9BiMGueY3qjrm3jmX/QwFqSjo3WBuSnxaW58LuBJmzuCJWZQTDet71VedZP3aA3rlWOBzucalqmDuAQzOMWrKmNR0BcV6UVw8mWhm9t4XdJ6dDD7xajyL/fT0SPn94+MgZ6bkWjKu2cTFdSE36pMZOqparehGwGAP9uyoqgC8o6BhZo+uQuRxmnd2tt93tVj11mt99WJSzRHylp7tBsd5r8YuV7iB/E8rSChMaeEihSos/DgQEbGSJeNKuMfvKiuyapcvwFHfOlZ9ZxjghiNr4zWWmZIjWMHhgu7IUwabhgNNgBfvLMbP5zyDj7z80T4rVj3JX76uX3axkshZfuJrOvbn4uOudZxr4ddaTHrKfRmxcAARC0goMR8Vz8uclFr3s67GxhhXZ9I+b9/SOQ8gHIZfj09//PGHB0PVMyugqscVRU+xAme5Uat+0OmqQM65mZmbTc6WX3JKeHvkq7dm6QilQutX/T1OaBtvJrew7md5cCQlpfgyE186YVMhMkQo9X3Pul4v+4264C8B8N+64fcl8/MBbNzbqyGclQFAq4H8ThunqZ1k+mbyU0QlxWDjJ899xhiUdRviEOIweIf73Z5NkUtT4ZaUlEFEv5c/7ripOj0L9qZG8+N+q4Fr47VyC+c96sa9LqRQp9ZPd3k+wawGE0RUYnSu2+/3mmOuuff0+3ICy3z/Epy8WhO4ll7ajXIjn87GnTunLcb8PDaueHPFZWOGqIIul3Y2fjpQQsw657qu67wfng4MQI3mfMxq/S4N6WK8Vl25I/i168JHmh/3EW1rm5pXsXFn7VXQdBxHEGYvNJCQqpDyUUWh1fMBQFFDjAx0u92u7+k5Toeb+jW3iFVvxy368vlpNq6NT7GXXGArDT1iRBpMtKycnn5KIjGE0LO7u7vrvSukHfUe93v9uA8cq7bk0VkT9exPJkgqI5z+s42rPqir4wIbZ0hgBpKaPQG6+fBvDlFWgajGAcDOO+/9xebyVUYiYtlCq2zFqm92+GvZ0a3jnKIf+iLbU5Hx119xHG10zv7PRETKhFN+iqoSCZGSTn+CSA1uJQQiEiU1afTVMsWW3mgGM7w/r+r3ZmrKfM5Po5r8SU8CQVVBkQlM5BhOMSgNMiJdGSBASEUkxuicg2MiUhERYWYH9qSHv/+Kg3y5293f3ZPGwyFYPbW4bKlLVfSIE3eKVT39WZ7afUPwpXUFVlIl2NLdwq+RSMgHn5VJjucKan49sgTlxue39GGfn5/ZPPhXXuh0UcPHb03w8OTF8Z/pYi0Gmf2UepMsP0F+FSe1iXVsnvfrGmiMVo8cQYgiaBnTOedqKo5sREQPEUrewbNjaCZDfavrfxlkKF7ysB8PipckdDfx435LfqS1YbXxbva4qjETgANIZMg+Tn5GiZ0TEY2iqsQpi6eqwzCAqOu6ruu2fPP3uwGc+2jX1m31/Xdp49p4YWz1rmPVD2Pgio1jsOSmrroKWXtw7Jx54hpjDGHX+77vzcadm0L5qN7x8Tl/JRt3LXd6k/et4c7aeNuP3GqLNDOzqleV/HfJaIlCiW2AVdVMHADvvRm4Fr7QRsmiKNvehMOqTfrzGYpzWheA9UbETdwWr9ccWj7uDT6cAKjSnLbbyqqRRvo55AZ7e6ff+a7rrIP9Izlxt6M1P4sp803YuG3et/fjx90a4bF6/M0vbf7vKz3DpV5fOuoBENQxkRKbLSMSURYhWMOpqgQzcAx45/ed77seQAjBiq2fPIKZ9UXUTtyNvtG/5nK5Ubz9IcdmPq7N3u97OJmICBE0cltKUrM04yUig4jB35xzFqUWJ85SeC1opddNVb3Ixp2SX5tpUKb2vZPxa6dnKF8ZinVc/3GJmdyqkS8981Uq0Gf5Hma8rOWvbo8fvO0RcGbv1Clr9ZRh81Oj6uwIKcXGDIaqDoiqaoDIIQwhBFU109Z1nWcHSibPe7+ciuV13ZoT8NaPxrPreevCnz3bVdbIUy7nbI7MC7ghZ5fdNrE2PsBIksk62kGvDo4UxMwGl2uz9BbGa9i45Yb8rszcrfNisjga1mavvHbvLlj4SMMaGWC9AVB21CmUmYgCk3Mw748ZDPqt7adtPGfjrtjbPOsZLDCiNvtnxVZtxt5OIqlo2tdI/Q4I0w5Zc/Q+wPU2G9dGG5/GxilR7sk0Fl97UiIpEXlmAJoNnIi4Nwb2WXuu3yjv22+zcS/Uwb5dYvVD+nHL3O21luJb05Z813eqpMNnqfSGZXzTNu5aa3pWV5292cbpz0+bjTe090zuEBkaroD0uSzyjxKbv+s97+Y1h5n2YslWNBvXxoexeoUjaAlwfWc1B+XU2FPae97/3or//M//fBf7xsXHeWEl99YOlDaa0uuunxs7GoVn7aY+zum4uSteZoZMCuCsrUM13ppfcrlb0DS1daIS2JHzaQ9YG220URuRJcH1+x4fvCf/OA99G218FMN0Tf/ugyV/P6yN28KXNUvXRhunGLjjbsE7soMtVm2jjTbm3aAfqZr/wf24NXxZ8+PaaLHq+qE+JHz14+fjGr6sjTZebjRfGKv+Rt+ixapttNHGFazYp/PjzmVSuvqEHueZ+ngx7BbP2sUTewFR15uahxMBkpu6q1daqBfrV524Po9g9acqiM9wYdSrpeYW3GJzu+56mOEfZmnB1e89/QSankMbzStp4yOPFqu20UYbzca10UYbbTQb10YbbbTx1kbLx7XxKUbLxzU/ro022mij2bg22mijjY8dqx7nzjyujVi/3sT7nBlSnMu1uoxZjgNt9NYhzs1gZ4b8Oo6fWk7Clnb1yyPEIxBFOpmT9VlUlCw/YOtt6wxfdj7ln1uYshPXYQHxHdEpPv48zmnWmWuhKKroaek5pNv0u34PLrKGN67OVQEAPjvn/iWrto13PWoz17inzt3j3zJ0vD2k9f1qNYcLl8vHsAgzM9fuy2VxzFuYurZLNRv3m5+l7eO8j2fj1j3Yr9MjdXVj99u9ueaMPzs/rebwee993RXYopt2Kz/q5FwtH/dRN5CPvTG+31j1t9+XWTr/LZzPO72Vb87GfcJ4/rYx71syc28wVj2Xb+PVTNsbtCMtVl1dJ83GtdHG5bb4XA6xZtfegY17Bk32DNbmRauhiE9P5Kg3DlbjlW7hx814x54NE7av+phfsIUxPN0b2vqrrfnZwsedqym+dSYvzHUcQbGt4u9ubYOucth68dzanz1Xy+mFF3gZ5foVv+gjxKq/axM7jmht4434Wc3HaaPZuJvsKm18MFtZr7g2D+9r82j5uCvEF/QG8jLNds+u68QcQhvNj2ujjWYj2mg27tM/2y3v89b86xea5jfbl9LGp7Nxnw2T3PyyNn7jntFs3CeycS3v88afyXeaJ23jrdi403nijuOzlsc5skZnepHpTTlz7TLqLzp+knae9WfK3xYc2VnB7PJ6q47hNXjX9BhEpHIuwZ5s3cJn7+BpRoW3Vkh9v2ZsX7fwL569lVt3+Cox6Uv22lP+9sTjX3waS7bBrRX7Elfg5YOZiynYOv7snG/ux72wp6dtv2200cabjlV/F36tGcc22miD3mA+7tw8V7NxbbTRxrHwtk1BG2208VHHW+xXPRff1Py1Ntpo43fGqreOJZuNa6ONNt6TjWv4pjbaaOP327jTLc5xW1bEEwvqDSdHqc9+7yquraDQZkRpR3ji7Fc1oK+8uXVdW3qyp7B0Hb/wgjib8ehtfv4F+9C1trcaKGd4w1ros/z2hamMy8DYW+vkXB69W/sHL+eJO/Hzq394fH0e+a5n79eW3usW3/IRcdXlQ5ce4Wbm22ijjfc+jmxp/EbOrIWin20tnihy3kYbL7R3/o2cx2jm2mpv4w2Mtum+0/lf6qU1bqXP68P/xvNZ5neaTWnjiku9fu3fzlrPflxz5Npoo43rGDgi+v8B6hZl4qA2PBQAAAAASUVORK5CYII=";
function makeFabric(W, H) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  let sd = 7;
  const R = () => {
    sd = (sd * 16807) % 2147483647;
    return sd / 2147483647;
  };
  const sil = new Path2D();
  sil.moveTo(W * 0.56, H * 0.015);
  sil.bezierCurveTo(W * 0.64, H * 0.18, W * 0.7, H * 0.4, W * 0.95, H * 0.72);
  sil.bezierCurveTo(W * 0.99, H * 0.85, W * 0.9, H * 0.96, W * 0.76, H * 0.985);
  sil.bezierCurveTo(W * 0.55, H * 0.95, W * 0.3, H * 1.0, W * 0.06, H * 0.93);
  sil.bezierCurveTo(W * 0.02, H * 0.86, W * 0.22, H * 0.62, W * 0.36, H * 0.42);
  sil.bezierCurveTo(W * 0.46, H * 0.25, W * 0.52, H * 0.1, W * 0.56, H * 0.015);
  sil.closePath();
  x.save();
  x.clip(sil);
  const g = x.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, "rgba(170,205,240,.55)");
  g.addColorStop(0.35, "rgba(176,228,214,.5)");
  g.addColorStop(0.65, "rgba(205,190,240,.5)");
  g.addColorStop(1, "rgba(248,190,215,.6)");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const pal = [
    "150,195,238",
    "165,225,208",
    "200,185,240",
    "245,175,205",
    "190,215,245",
  ];
  const fold = (i, fill) => {
    const x0 = W * (0.5 + R() * 0.12),
      x1 = W * (0.08 + R() * 0.85),
      y1 = H * (0.45 + R() * 0.55),
      w = W * (0.03 + R() * 0.09),
      dx = x1 - x0;
    const p = new Path2D();
    p.moveTo(x0, H * 0.02);
    p.bezierCurveTo(x0 + dx * 0.2, H * 0.3, x1 - dx * 0.25, H * 0.5, x1, y1);
    p.lineTo(x1 + w, y1);
    p.bezierCurveTo(
      x1 + w - dx * 0.25,
      H * 0.5,
      x0 + dx * 0.2 + w * 0.2,
      H * 0.3,
      x0 + w * 0.3,
      H * 0.02,
    );
    p.closePath();
    if (fill) {
      const gr = x.createLinearGradient(x1, 0, x1 + w, 0),
        c = pal[i % 5];
      gr.addColorStop(0, `rgba(${c},0)`);
      gr.addColorStop(0.5, `rgba(${c},${0.14 + R() * 0.22})`);
      gr.addColorStop(1, `rgba(${c},0)`);
      x.fillStyle = gr;
      x.fill(p);
    } else {
      x.strokeStyle =
        i % 3 ? "rgba(255,255,255,.5)" : `rgba(${pal[i % 5]},.45)`;
      x.lineWidth = 1 + R() * 1.5;
      x.stroke(p);
    }
  };
  for (let i = 0; i < 26; i++) fold(i, true);
  for (let i = 0; i < 20; i++) fold(i, false);
  x.restore();
  x.strokeStyle = "rgba(150,170,210,.35)";
  x.lineWidth = 2;
  x.stroke(sil);
  return c;
}
function loadFabric() {
  return new Promise((res) => {
    if (!FABRIC_SRC) {
      res(makeFabric(900, 1200));
      return;
    }
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      c.getContext("2d").drawImage(im, 0, 0);
      try {
        c.toDataURL();
        res(c);
      } catch (e) {
        res(makeFabric(900, 1200));
      }
    };
    im.onerror = () => res(makeFabric(900, 1200));
    im.src = FABRIC_SRC;
  });
}
// The fabric picture goes through the normal DYE path (FS_STAMP -> dye layer), so DROP / FLOW / BLEED act on it. Only for the blank cloth that START opens.
let fabricCanvas = null,
  introStarted = false;
function seedFabricDye() {
  if (
    mode !== "edit" ||
    !cur ||
    cur.dirty ||
    cur.bytes ||
    item ||
    stampReq ||
    !dyeA ||
    !fabricCanvas
  )
    return;
  try {
    const fw = fabricCanvas.width,
      fh = fabricCanvas.height,
      g = createGraphics(fw, fh);
    g.pixelDensity(1);
    g.clear();
    g.drawingContext.drawImage(fabricCanvas, 0, 0);
    const k = Math.min((height * 0.94) / fh, (width * 0.96) / fw);
    stampReq = { tex: g, x: width / 2, y: height / 2, w: fw * k, h: fh * k };
    const c = cur;
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          c.dirty = false;
          refreshUI();
        }),
      ),
    );
  } catch (e) {
    // the starting fabric is not an edit: nothing to autosave
  }
}
(function () {
  const it = document.getElementById("intro"),
    btn = document.getElementById("introStart");
  if (!it || !btn) return;
  let fabricReady = false;
  loadFabric().then((c) => {
    fabricCanvas = c;
    let u;
    try {
      u = c.toDataURL("image/png");
    } catch (e) {
      fabricCanvas = makeFabric(900, 1200);
      u = fabricCanvas.toDataURL("image/png");
    }
    it.style.setProperty("--fabric", "url(" + u + ")");
    fabricReady = true;
  });
  // START opens only after: fabric picture ready, p5 setup finished (shaders + dye buffers), archive storage answered (so the right screen opens)
  const ready = () =>
      fabricReady &&
      typeof dyeA !== "undefined" &&
      dyeA &&
      typeof shStamp !== "undefined" &&
      shStamp &&
      archLoaded,
    t0 = performance.now();
  (function wait() {
    if (ready() || performance.now() - t0 > 6000) {
      btn.removeAttribute("aria-disabled");
    } else requestAnimationFrame(wait);
  })();
  btn.addEventListener("click", () => {
    if (introStarted || btn.getAttribute("aria-disabled") === "true") return;
    introStarted = true;
    seedFabricDye();
    lockUntil = Date.now() + 900; // swallow trackpad inertia left over from scrolling the intro
    it.classList.add("leaving");
    document.body.classList.remove("intro-on");
    setTimeout(() => it.remove(), 750);
  });
})();
