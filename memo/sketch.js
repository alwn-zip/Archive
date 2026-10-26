const VS=`precision highp float;attribute vec3 aPosition;varying vec2 vUv;
void main(){vUv=aPosition.xy;vec4 p=vec4(aPosition,1.);p.xy=p.xy*2.-1.;gl_Position=p;}`;
const NOISE=`float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
vec2 curl(vec2 p){float e=.01;float a=vn(p+vec2(0.,e))-vn(p-vec2(0.,e));float b=vn(p+vec2(e,0.))-vn(p-vec2(e,0.));return vec2(a,-b)/(2.*e)*.2;}`;
// 하나의 힘장: DROP(radial+curl) / FLOW(directional) / BLEED(global curl) 모두 같은 이류 패스
const FS_ADV=`precision highp float;varying vec2 vUv;uniform sampler2D uDye;uniform vec4 uF[16];uniform vec4 uP[16];uniform float uAsp,uDiff;uniform vec2 uTex,uFlow;
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
const FS_STAMP=`precision highp float;varying vec2 vUv;uniform sampler2D uDye,uItem;uniform vec2 uC,uSz;uniform float uSeed;
${NOISE}
void main(){vec4 dye=texture2D(uDye,vUv);vec2 q=(vUv-uC)/uSz+.5;
if(q.x<0.||q.x>1.||q.y<0.||q.y>1.){gl_FragColor=dye;return;}
vec4 it=texture2D(uItem,vec2(q.x,1.-q.y));
float e=min(min(q.x,1.-q.x),min(q.y,1.-q.y));float n=vn(q*9.+uSeed);
float m=smoothstep(0.,.14,e+(n-.5)*.16);float a=it.a*m*.8;
gl_FragColor=vec4(it.rgb*a,a)+dye*(1.-a);}`;
// 합성: 패브릭(절차 생성) + 염료 + 미확정 재료. 패브릭은 염료와 섞이지 않음
const FS_COMP=`precision highp float;varying vec2 vUv;uniform sampler2D uDye,uItem;uniform vec2 uC,uSz;uniform float uShow,uAsp;
${NOISE}
void main(){vec2 p=vUv*vec2(uAsp*900.,900.);float g=vn(p*.9)*.5+vn(p*.25)*.5;float wv=.5+.5*sin(p.x*1.4)*sin(p.y*1.4);
vec3 f=vec3(.906,.894,.863)+(g-.5)*.05+(wv-.5)*.03;
vec4 d=texture2D(uDye,vUv);vec3 col=f*(1.-d.a)+d.rgb*(.95+.05*wv);
if(uShow>.5){vec2 q=(vUv-uC)/uSz+.5;
if(q.x>=0.&&q.x<=1.&&q.y>=0.&&q.y<=1.){vec4 it=texture2D(uItem,vec2(q.x,1.-q.y));col=mix(col,it.rgb,it.a*.6);
float e=min(min(q.x,1.-q.x),min(q.y,1.-q.y));if(e<.004&&mod(floor(q.x*60.+q.y*60.),2.)<1.)col=mix(col,vec3(.27),.6);}}
gl_FragColor=vec4(col,1.);}`;

// DROP spread: separate pass AFTER the advect pass. Uses the same radius as the DROP distortion.
const SPREAD_REACH='0.018',SPREAD_K='0.12';
const SPREAD_ON=new URLSearchParams(location.search).get('spread')!=='0';
const FS_SPREAD=`precision highp float;varying vec2 vUv;uniform sampler2D uDye;uniform vec4 uF[16];uniform vec4 uP[16];uniform float uAsp;
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
const FLOW_GAIN=.6,      // global velocity target = drag delta per frame * gain
 FLOW_FOLLOW=.35,        // how fast global velocity follows the drag (smoothing/average)
 FLOW_DECAY=.92,         // per-frame decay after the drag stops (higher = longer glide)
 FLOW_MAX=.06,           // max global speed (uv per frame)
 FLOW_STRETCH=1.3,       // backtrace length multiplier (higher = longer streaks)
 FLOW_VAR_MIN=.35,       // slowest local speed factor (noise) -> shear/stretch between regions
 FLOW_VAR_MAX=1.6,       // fastest local speed factor
 FLOW_WOBBLE=3.,         // edge only: noise offset of the backtrace
 FLOW_RAGGED=.7,         // edge only: flow-aligned streak variation of stretch length
 FLOW_DIFF=2.5;          // edge only: weak smoothing, scaled by speed
const FS_FLOW=`precision highp float;varying vec2 vUv;uniform sampler2D uDye,uSet;uniform vec2 uG,uTex;uniform float uAsp,uSeed;
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
const FS_SETTLE=`precision highp float;varying vec2 vUv;uniform sampler2D uSet,uDye;uniform vec2 uG;uniform float uAsp,uSeed;
${NOISE}
void main(){float s=texture2D(uSet,vUv).r;float sp=length(uG);vec2 dir=sp>1e-5?uG/sp:vec2(0.);
float a=texture2D(uDye,vUv).a;
float dwx=(dir.x>0.?1.-vUv.x:vUv.x)*uAsp,dwy=dir.y>0.?1.-vUv.y:vUv.y;
float bx=.14*(.4+1.2*vn(vec2(vUv.y*9.,3.1)+uSeed)),by=.14*(.4+1.2*vn(vec2(vUv.x*9.*uAsp,7.7)+uSeed));
float toward=max(abs(dir.x)*(1.-smoothstep(0.,bx,dwx)),abs(dir.y)*(1.-smoothstep(0.,by,dwy)));
float inc=toward*smoothstep(.3,.7,a)*min(1.,sp*50.)*.07;
gl_FragColor=vec4(min(1.,s+inc),0.,0.,1.);}`;
function mkSet(){const mk=()=>createFramebuffer({width:Math.max(2,SW>>1),height:Math.max(2,SH>>1),density:1,format:UNSIGNED_BYTE,textureFiltering:LINEAR,depth:false,antialias:false});setA=mk();setB=mk();clearSettle()}
function clearSettle(){[setA,setB].forEach(f=>{f.begin();clear();f.end()})}

// ---- BLEED: omnidirectional, time-varying dispersion + ring gather (separate pass; no global direction) ----
const BLEED_REACH=.008,  // per-frame reach (uv) at full strength; raise for wider spread
 BLEED_MIX=.15,           // how much of the multi-direction gather is mixed in (capped at .35)
 BLEED_SPEED=.015,       // how fast the direction field evolves (higher = more churning)
 BLEED_FRAMES=75;       // duration in frames
const FS_BLEED=`precision highp float;varying vec2 vUv;uniform sampler2D uDye;uniform float uAsp,uStr,uPh,uSeed;
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

const FS_COPY=`precision highp float;varying vec2 vUv;uniform sampler2D uDye;void main(){gl_FragColor=texture2D(uDye,vUv);}`;
addEventListener('error',e=>{const d=document.getElementById('diag');d.textContent='ERROR: '+e.message+' (line '+(e.lineno||'?')+')'});
let setA,setB,shSettle,cnv,dyeA,dyeB,shFlow,shBleed,shAdv,shStamp,shComp,shSpread,SW,SH,asp,fbName='?',isMobile,
 item=null,stampReq=null,dirty=true,forces=[],busyFrames=0,lastDiag=0,exts={};
const $=s=>document.querySelector(s),diag=$('#diag'),toast=$('#toast');
let tt;function say(s){toast.textContent=s;toast.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>toast.classList.remove('show'),1600)}

function setup(){
 isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.maxTouchPoints>1;
 cnv=createCanvas(innerWidth,innerHeight,WEBGL);pixelDensity(Math.min(devicePixelRatio||1,2));noStroke();
 const gl=drawingContext;
 ['EXT_color_buffer_float','EXT_color_buffer_half_float','OES_texture_float_linear'].forEach(n=>exts[n]=!!gl.getExtension(n));
 const long=isMobile?768:1280;asp=width/height;
 if(asp>=1){SW=long;SH=Math.round(long/asp)}else{SH=long;SW=Math.round(long*asp)}
 const mk=fmt=>createFramebuffer({width:SW,height:SH,density:1,format:fmt,textureFiltering:LINEAR,depth:false,antialias:false});
 try{dyeA=mk(HALF_FLOAT);dyeB=mk(HALF_FLOAT)}catch(e){dyeA=mk(UNSIGNED_BYTE);dyeB=mk(UNSIGNED_BYTE)}
 fbName=dyeA.format===HALF_FLOAT?'HALF_FLOAT':dyeA.format===FLOAT?'FLOAT':'UNSIGNED_BYTE(폴백)';
 [dyeA,dyeB].forEach(f=>{f.begin();clear();f.end()});
 shAdv=createShader(VS,FS_ADV);shStamp=createShader(VS,FS_STAMP);shComp=createShader(VS,FS_COMP);shSpread=createShader(VS,FS_SPREAD);shFlow=createShader(VS,FS_FLOW);shBleed=createShader(VS,FS_BLEED);shCopy=createShader(VS,FS_COPY);shSettle=createShader(VS,FS_SETTLE);
 tmp8=createFramebuffer({width:SW,height:SH,density:1,format:UNSIGNED_BYTE,textureFiltering:LINEAR,depth:false,antialias:false});
 mkSet();bind();archInit();
}
const flowV=[0,0];let flowG=[0,0],flowAcc=[0,0],flowSeed=0;
const flowing=()=>Math.hypot(flowG[0],flowG[1])>8e-4||flowAcc[0]!==0||flowAcc[1]!==0;
let bleedAge=1e9,bleedSeed=0;const bleeding=()=>bleedAge<BLEED_FRAMES;
function run(fb,sh,u){fb.begin();blendMode(REPLACE);shader(sh);for(const k in u)sh.setUniform(k,u[k]);rect(0,0,fb.width,fb.height);fb.end()}
const swap=()=>{const t=dyeA;dyeA=dyeB;dyeB=t};
const swapS=()=>{const t=setA;setA=setB;setB=t};
const itemU=()=>item?{uItem:item.tex,uC:[item.x/width,1-item.y/height],uSz:[item.w/width,item.h/height]}:{};

let selKey='';
function syncSel(){const e=document.getElementById('sel');
 const k=item?[item.x,item.y,item.w,item.h].join():'';if(k===selKey)return;selKey=k;
 if(!item){e.style.display='none';return}
 const r=el?el.getBoundingClientRect():{left:0,top:0};
 e.style.display='block';e.style.left=(r.left+item.x-item.w/2)+'px';e.style.top=(r.top+item.y-item.h/2)+'px';e.style.width=item.w+'px';e.style.height=item.h+'px'}
function draw(){
 syncSel();
 const t0=performance.now();
 if(!dirty&&!forces.length&&!stampReq&&!flowing()&&!bleeding()){busyFrames=0;report();return}  // 유휴 시 모든 패스 중단
 busyFrames++;
 if(stampReq||forces.length||flowing()||bleeding())markDirty();  // working copy changed (archive: unsaved)
 if(stampReq){const it=stampReq;
  run(dyeB,shStamp,{uDye:dyeA,uItem:it.tex,uC:[it.x/width,1-it.y/height],uSz:[it.w/width,it.h/height],uSeed:Math.random()*50});
  swap();stampReq=null;item=null}
 if(forces.length){
  const F=new Array(64).fill(0),P=new Array(64).fill(0),use=forces.slice(-16);
  use.forEach((f,i)=>{const s=Math.pow(1-f.age/f.max,1.5);
   F.splice(i*4,4,f.x,f.y,f.a,f.b);
   P.splice(i*4,4,f.r0+(f.r1-f.r0)*(f.age/f.max),f.kind,s,f.seed)});
  run(dyeB,shAdv,{uDye:dyeA,uF:F,uP:P,uAsp:asp,uDiff:40,uTex:[1/SW,1/SH],uFlow:flowV});swap();
  if(SPREAD_ON){const P2=new Array(64).fill(0);let any=false;
   use.forEach((f,i)=>{const sw=f.kind===1?Math.max(0,1-(f.age/f.max)/.55):0;if(sw>0)any=true;
    P2.splice(i*4,4,f.r0+(f.r1-f.r0)*(f.age/f.max),f.kind,sw,f.seed)});
   if(any){run(dyeB,shSpread,{uDye:dyeA,uF:F,uP:P2,uAsp:asp});swap()}}
  forces.forEach(f=>f.age++);forces=forces.filter(f=>f.age<f.max)}
 if(flowing()){
  const ax=flowAcc[0],ay=flowAcc[1];flowAcc=[0,0];
  if(ax||ay)flowG=[flowG[0]+(ax*FLOW_GAIN-flowG[0])*FLOW_FOLLOW,flowG[1]+(ay*FLOW_GAIN-flowG[1])*FLOW_FOLLOW];  // drag: follow average drag velocity
  else flowG=[flowG[0]*FLOW_DECAY,flowG[1]*FLOW_DECAY];  // released: inertia, decaying
  const m=Math.hypot(flowG[0],flowG[1]);if(m>FLOW_MAX)flowG=[flowG[0]*FLOW_MAX/m,flowG[1]*FLOW_MAX/m];
  if(m<8e-4)flowG=[0,0];  // stop: no residual velocity
  else{run(setB,shSettle,{uSet:setA,uDye:dyeA,uG:flowG,uAsp:asp,uSeed:flowSeed});swapS();
   run(dyeB,shFlow,{uDye:dyeA,uSet:setA,uG:flowG,uAsp:asp,uTex:[1/SW,1/SH],uSeed:flowSeed});swap()}}
 if(bleeding()){const t=bleedAge/BLEED_FRAMES,str=Math.pow(1-t,1.2)*Math.min(1,bleedAge/6);
  run(dyeB,shBleed,{uDye:dyeA,uAsp:asp,uStr:str,uPh:bleedSeed+bleedAge*BLEED_SPEED,uSeed:bleedSeed});swap();bleedAge++}
 dirty=false;
 shader(shComp);blendMode(REPLACE);
 shComp.setUniform('uDye',dyeA);shComp.setUniform('uAsp',asp);
 shComp.setUniform('uShow',item?1:0);
 if(item){const u=itemU();for(const k in u)shComp.setUniform(k,u[k])}else{shComp.setUniform('uItem',dyeA);shComp.setUniform('uC',[0,0]);shComp.setUniform('uSz',[1,1])}
 rect(0,0,width,height);
 report(performance.now()-t0);
}
let lastMs=0;
function report(ms){if(ms)lastMs=ms;const n=performance.now();if(n-lastDiag<300)return;lastDiag=n;
 const gl=drawingContext;
 diag.textContent=`p5 ${p5.prototype.VERSION||'1.9.4'} · ${webglVersion}\nfloat target: ${fbName}\nEXT_color_buffer_float: ${exts.EXT_color_buffer_float}  half: ${exts.EXT_color_buffer_half_float}\nfloat linear: ${exts.OES_texture_float_linear}  maxTex: ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}\nsim ${SW}×${SH} · canvas ${width}×${height} ×${pixelDensity()}\n${busyFrames?'ACTIVE  fps '+frameRate().toFixed(0)+'  cpu '+lastMs.toFixed(1)+'ms':'IDLE (passes stopped)'}`}
function windowResized(){resizeCanvas(innerWidth,innerHeight);dirty=true}

// ---------- 재료 ----------
function setItem(tex,w0,h0){if(item){say('먼저 현재 재료를 길게 눌러 확정하세요');return}
 const s=Math.min(1,width*.4/w0,height*.45/h0);item={tex,w:w0*s,h:h0*s,x:width/2,y:height/2};dirty=true;say('드래그로 위치 조정 · 길게 눌러 DYE')}
function addImageFile(f){if(!f)return;if(item){say('먼저 현재 재료를 확정하세요');return}const r=new FileReader();
 r.onerror=()=>say('파일을 읽지 못했어요');
 r.onload=()=>{const im=new Image();im.onerror=()=>say('이 이미지 형식은 불러올 수 없어요');
  im.onload=()=>{const m=Math.min(1,1024/Math.max(im.naturalWidth,im.naturalHeight)),w=Math.max(1,Math.round(im.naturalWidth*m)),h=Math.max(1,Math.round(im.naturalHeight*m));
   const g=createGraphics(w,h);g.pixelDensity(1);g.clear();g.drawingContext.drawImage(im,0,0,w,h);setItem(g,w,h)};im.src=r.result};
 r.readAsDataURL(f)}

$('#file').onchange=e=>{addImageFile(e.target.files[0]);e.target.value=''};
addEventListener('paste',e=>{const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(it){e.preventDefault();addImageFile(it.getAsFile())}});
$('#bTxt').onclick=()=>{if(item){say('먼저 현재 재료를 확정하세요');return}$('#modal').style.display='flex';$('#ti').focus()};
$('#mc').onclick=()=>$('#modal').style.display='none';
$('#ma').onclick=()=>{const s=$('#ti').value.trim();if(!s)return;const L=s.split('\n'),fs=54;
 const g=createGraphics(10,10);g.pixelDensity(1);g.textSize(fs);g.textFont('Arial');
 const w=Math.ceil(Math.max(...L.map(l=>g.textWidth(l))))+40,h=Math.ceil(L.length*fs*1.35)+30;
 g.resizeCanvas(w,h);g.clear();g.textSize(fs);g.textFont('Arial');g.fill('#44463f');g.noStroke();L.forEach((l,i)=>g.text(l,20,fs+i*fs*1.35));
 $('#modal').style.display='none';$('#ti').value='';setItem(g,w,h)};

// ---------- 힘 주입 (Matter.js 없이 단순 힘 — 테스트 3) ----------
const uvOf=p=>[p.x/width,1-p.y/height];
function drop(p){const[x,y]=uvOf(p);forces.push({kind:1,x,y,a:.0014,b:.0011,r0:.05,r1:.12,age:0,max:70,seed:Math.random()*40});say('DROP')}
function bleed(){bleedAge=0;bleedSeed=Math.random()*40;say('BLEED')}
function flowSeg(p,q){const a=uvOf(p),b=uvOf(q);if(!flowing())flowSeed=Math.random()*40;
 flowAcc[0]+=b[0]-a[0];flowAcc[1]+=b[1]-a[1]}

// ---------- 입력 ----------
let el;
let down=null,moved=false,lp=null,hold=0,fired=false,onItem=false,clicks=[],ct=0;
// ---- two-finger pinch -> archive. Touch pointers are tracked by pointerId; the second finger cancels every single-finger gesture. ----
const ptrs=new Map();let pinch=null,pinchLock=false;
function startPinch(){clearTimeout(hold);clearTimeout(ct);clicks=[];   // no leftover DYE hold or pending DROP / BLEED timer
 down=null;lp=null;rz=null;moved=false;fired=false;onItem=false;flowAcc=[0,0];flowG=[0,0];   // single-finger gesture and FLOW input stop here
 const v=[...ptrs.values()];pinchLock=true;pinch={d0:Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y),done:false}}
function pinchMove(){if(!pinch||pinch.done||ptrs.size<2)return;const v=[...ptrs.values()],d=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);
 if(mode!=='edit'||AR.entering||Date.now()<lockUntil||item)return;   // a placed material (image/text) is being handled: the pinch never opens the archive
 if(pinch.d0-d>Math.max(40,pinch.d0*.25)){pinch.done=true;collapse()}}   // fingers moved together -> same save-and-collapse as the wheel
function ptrUp(e){if(e.pointerType==='touch'){ptrs.delete(e.pointerId);if(ptrs.size===0){pinchLock=false;pinch=null}}}
addEventListener('blur',()=>{ptrs.clear();pinchLock=false;pinch=null});
document.addEventListener('gesturestart',e=>e.preventDefault());   // iOS Safari page-zoom gesture
const pt=e=>{const r=el.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
const hit=p=>item&&Math.abs(p.x-item.x)<=item.w/2&&Math.abs(p.y-item.y)<=item.h/2;
// corner handles: nearest corner within the hit radius (larger on touch). Takes priority over hit().
let rz=null;const MIN_SIDE=28;
function hitHandle(p){if(!item)return null;const HR=isMobile?24:14;let best=null,bd=1e9;
 for(const sx of[-1,1])for(const sy of[-1,1]){const cx=item.x+sx*item.w/2,cy=item.y+sy*item.h/2;
  const dx=p.x-cx,dy=p.y-cy;if(Math.abs(dx)<=HR&&Math.abs(dy)<=HR){const d=Math.hypot(dx,dy);if(d<bd){bd=d;best={sx,sy,ox:dx,oy:dy}}}}
 if(!best)return null;
 // anchor = opposite corner (fixed while resizing); ox/oy = grab offset so the corner does not jump
 return{sx:best.sx,sy:best.sy,ox:best.ox,oy:best.oy,ax:item.x-best.sx*item.w/2,ay:item.y-best.sy*item.h/2,ar:item.w/item.h}}
function resizeTo(p){const r=rz;if(!r||!item)return;
 const dx=(p.x-r.ox-r.ax)*r.sx,dy=(p.y-r.oy-r.ay)*r.sy;
 let w=Math.max(dx,dy*r.ar);                       // keep aspect ratio: follow the larger projection
 w=Math.max(w,MIN_SIDE,MIN_SIDE*r.ar);             // minimum size
 w=Math.min(w,width*1.5,height*1.5*r.ar);          // maximum size
 const h=w/r.ar;item.w=w;item.h=h;item.x=r.ax+r.sx*w/2;item.y=r.ay+r.sy*h/2;dirty=true}
function bind(){el=cnv.elt;
 el.addEventListener('pointerdown',e=>{if($('#modal').style.display==='flex')return;const p=pt(e);
  if(e.pointerType==='touch'){ptrs.set(e.pointerId,p);el.setPointerCapture?.(e.pointerId);
   if(ptrs.size>=2){startPinch();return}
   if(pinchLock)return}
  down=p;lp=p;moved=false;fired=false;rz=hitHandle(p);onItem=!rz&&hit(p);   // handle first: resizing never starts a DYE hold
  if(onItem)hold=setTimeout(()=>{if(!moved){stampReq=item;fired=true;dirty=true;say('DYE · 천에 흡수됨')}},650);
  el.setPointerCapture?.(e.pointerId)});
 el.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&ptrs.has(e.pointerId)){ptrs.set(e.pointerId,pt(e));if(pinch){pinchMove();return}}
  if(!down){const h=hitHandle(pt(e));el.style.cursor=h?(h.sx*h.sy>0?'nwse-resize':'nesw-resize'):'';return}const p=pt(e);
  if(rz){moved=true;clearTimeout(hold);resizeTo(p);lp=p;return}
  if(Math.hypot(p.x-down.x,p.y-down.y)>6){moved=true;clearTimeout(hold)}
  if(moved){if(onItem&&item){item.x=p.x;item.y=p.y;dirty=true}else if(!item&&lp){flowSeg(lp,p)}}
  lp=p});
 const up=e=>{ptrUp(e);clearTimeout(hold);if(!down)return;const p=pt(e);
  if(!moved&&!fired&&!item){const n=Date.now();clicks.push({p,t:n});clicks=clicks.filter(c=>n-c.t<700);clearTimeout(ct);
   if(clicks.length>=3&&n-clicks[0].t<520){clicks=[];bleed()}
   else ct=setTimeout(()=>{if(clicks.length===2)drop(clicks[1].p);clicks=[]},280)}
  down=null;lp=null;rz=null};
 el.addEventListener('pointerup',up);el.addEventListener('pointercancel',e=>{ptrUp(e);clearTimeout(hold);down=null;lp=null;rz=null});
}

// ===================== ARCHIVE (cloth stack) =====================
// mode 'edit' = existing work screen (unchanged). mode 'archive' = DOM overlay of translucent cloths; input is separated by the overlay.
let cloths=[],cur=null,mode='edit',AR={sel:null,p:0,auto:0,entering:false},db=null,tmp8=null,shCopy=null,lastT=0,wheelAcc=0,wheelT=0,lockUntil=0;
const idb=()=>db?Promise.resolve(db):new Promise((res,rej)=>{const r=indexedDB.open('absorb-archive',1);r.onupgradeneeded=()=>r.result.createObjectStore('cloths',{keyPath:'id'});r.onsuccess=()=>res(db=r.result);r.onerror=()=>rej(r.error)});
const dbAll=()=>idb().then(d=>new Promise((res,rej)=>{const q=d.transaction('cloths').objectStore('cloths').getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}));
const dbPut=o=>idb().then(d=>new Promise((res,rej)=>{const t=d.transaction('cloths','readwrite');t.objectStore('cloths').put(o);t.oncomplete=res;t.onerror=()=>rej(t.error)}));
function markDirty(){if(cur&&!cur.dirty){cur.dirty=true;refreshUI()}}
function refreshUI(){cloths.forEach(c=>{if(c.el)c.el.firstChild&&(c.el.firstChild.style.display=c.dirty?'block':'none')})}
const mkLay=()=>({x:.18+Math.random()*.64,y:.2+Math.random()*.6,s:.34+Math.random()*.24,r:0,a:.72+Math.random()*.18});
function mkCloth(o={}){const c={id:o.id||('c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)),bytes:o.bytes||null,w:o.w||0,h:o.h||0,lay:o.lay||mkLay(),thumb:o.thumb||'',dirty:false,el:null};cloths.push(c);return c}
function buildEl(c){const e=document.createElement('div');e.className='cloth';e.innerHTML='<i style="display:none"></i>';
 e.onclick=ev=>{ev.stopPropagation();if(mode!=='archive'||AR.entering)return;
  if(AR.sel===c&&matchMedia('(pointer:coarse)').matches){AR.auto=1;startTick();return}   // touch: tap selected cloth again to unfold
  AR.sel=c;AR.p=0;AR.auto=0;layout()};
 c.el=e;$('#arch').appendChild(e);updateEl(c)}
function updateEl(c){const w='repeating-linear-gradient(0deg,rgba(255,255,255,.12) 0 1px,transparent 1px 4px)';c.el.style.backgroundImage=c.thumb?`url(${c.thumb}),${w}`:w}
function makeThumb(b,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),im=x.createImageData(w,h),d=im.data;
 for(let y=0;y<h;y++){const sr=(h-1-y)*w*4,dr=y*w*4;for(let i=0;i<w*4;i+=4){const k=1-b[sr+i+3]/255;d[dr+i]=b[sr+i]+231*k;d[dr+i+1]=b[sr+i+1]+228*k;d[dr+i+2]=b[sr+i+2]+220*k;d[dr+i+3]=255}}
 x.putImageData(im,0,0);const t=document.createElement('canvas');t.width=420;t.height=Math.round(420*h/w);t.getContext('2d').drawImage(c,0,0,t.width,t.height);return t.toDataURL('image/jpeg',.88)}
// GPU -> CPU readback happens ONLY here (save / leaving edit). dye -> 8-bit premultiplied copy -> readPixels
function snapshot(){run(tmp8,shCopy,{uDye:dyeA});const gl=drawingContext,prev=gl.getParameter(gl.FRAMEBUFFER_BINDING);
 gl.bindFramebuffer(gl.FRAMEBUFFER,tmp8.framebuffer);const b=new Uint8Array(SW*SH*4);gl.readPixels(0,0,SW,SH,gl.RGBA,gl.UNSIGNED_BYTE,b);gl.bindFramebuffer(gl.FRAMEBUFFER,prev);return b}
function restoreBytes(b,w,h){const gl=drawingContext;let src=tmp8,tmp=null;
 if(w!==SW||h!==SH)tmp=src=createFramebuffer({width:w,height:h,density:1,format:UNSIGNED_BYTE,textureFiltering:LINEAR,depth:false,antialias:false});  // other resolution: stretched by LINEAR copy
 gl.bindTexture(gl.TEXTURE_2D,src.color.rawTexture());gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
 gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);gl.bindTexture(gl.TEXTURE_2D,null);
 run(dyeB,shCopy,{uDye:src});swap();if(tmp)tmp.remove()}
function stash(){if(cur&&cur.dirty){const b=snapshot();cur.bytes=b;cur.w=SW;cur.h=SH;cur.thumb=makeThumb(b,SW,SH);updateEl(cur)}}  // working copy kept in memory (never written to DB here)
function persist(c,quiet){c.dirty=false;refreshUI();
 return dbPut({id:c.id,w:c.w,h:c.h,bytes:c.bytes.buffer.slice(0),lay:c.lay,savedAt:Date.now()}).then(()=>{if(!quiet)say('저장됨')})
  .catch(()=>{c.dirty=true;refreshUI();if(!window._sf){window._sf=1;say('자동 저장하지 못했어요 (저장소 사용 불가)')}})}
function saveCur(quiet){if(mode!=='edit'||!cur)return;let b;try{b=snapshot()}catch(e){if(!quiet)say('현재 상태를 읽지 못했어요');return}
 cur.bytes=b;cur.w=SW;cur.h=SH;cur.thumb=makeThumb(b,SW,SH);updateEl(cur);persist(cur,quiet)}
// autosave: every 5s while edited and idle (no drag / flow / bleed / drop / stamp in progress)
const autoSave=()=>{if(mode==='edit'&&cur&&cur.dirty&&!down&&!forces.length&&!flowing()&&!bleeding()&&!stampReq)saveCur(true)};
function showArchive(){mode='archive';document.body.classList.add('arch');$('#arch').style.display='block';lockUntil=Date.now()+700;startTick()}
function collapse(){if(item){say('먼저 재료를 길게 눌러 확정하세요');return}
 try{stash()}catch(e){say('현재 상태를 읽지 못했어요');return}
 if(cur.dirty&&cur.bytes)persist(cur,true);
 flowG=[0,0];flowAcc=[0,0];forces=[];bleedAge=1e9;
 AR.sel=cur;AR.p=1;AR.auto=-1;showArchive();layout();refreshUI()}
function enterEdit(c){AR.auto=0;AR.entering=true;
 try{if(c.bytes)restoreBytes(c.bytes,c.w,c.h);else{[dyeA,dyeB].forEach(f=>{f.begin();clear();f.end()})}}
 catch(e){say('천을 불러오지 못했어요');AR.entering=false;AR.auto=-1;startTick();return}
 cur=c;item=null;dirty=true;clearSettle();flowG=[0,0];flowAcc=[0,0];forces=[];bleedAge=1e9;mode='edit';lockUntil=Date.now()+700;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{$('#arch').style.display='none';document.body.classList.remove('arch');AR.sel=null;AR.p=0;AR.entering=false;refreshUI()}))}
function newCloth(){if(mode==='edit'){if(item){say('먼저 재료를 확정하세요');return}try{stash()}catch(e){say('현재 상태를 읽지 못했어요');return}if(cur.dirty&&cur.bytes)persist(cur,true)}
 const c=mkCloth();buildEl(c);
 if(mode==='edit'){showArchive();$('#arch').style.display='none';document.body.classList.remove('arch');mode='edit';enterEdit(c)}   // instant: current cloth is kept in the stack
 else{AR.sel=c;AR.p=0;AR.auto=1;layout();startTick()}}
const ease=t=>t*t*(3-2*t);
function layout(){const W=innerWidth,H=innerHeight;cloths.forEach((c,i)=>{const sel=AR.sel===c,e=sel?ease(AR.p):0,L=c.lay;
 c.el.style.transform=`translate(${(L.x*W-W/2)*(1-e)}px,${(L.y*H-H/2)*(1-e)}px) scale(${L.s+(1-L.s)*e})`;
 c.el.style.opacity=L.a+(1-L.a)*e;c.el.style.zIndex=sel?1000:i;c.el.classList.toggle('sel',sel)})}
let ticking=false;
function startTick(){if(!ticking){ticking=true;lastT=performance.now();requestAnimationFrame(tick)}}
function tick(t){const dt=Math.min(50,t-lastT);lastT=t;
 if(AR.auto){AR.p=Math.max(0,Math.min(1,AR.p+AR.auto*dt/700));
  if(AR.p>=1&&AR.auto>0)enterEdit(AR.sel);else if(AR.p<=0&&AR.auto<0)AR.auto=0}
 layout();if(mode==='archive'||AR.entering)requestAnimationFrame(tick);else ticking=false}
function onWheel(e){if($('#modal').style.display==='flex')return;e.preventDefault();if(Date.now()<lockUntil||AR.entering)return;
 if(mode==='archive'){if(!AR.sel){say('천을 클릭해 선택한 뒤 휠을 위로 굴려 펼치세요');return}
  AR.auto=0;AR.p=Math.max(0,Math.min(1,AR.p-e.deltaY/700));layout();if(AR.p>=1)enterEdit(AR.sel)}
 else{if(e.deltaY<0)wheelAcc=0;else wheelAcc+=e.deltaY;clearTimeout(wheelT);wheelT=setTimeout(()=>wheelAcc=0,300);if(wheelAcc>160){wheelAcc=0;collapse()}}}
function archInit(){$('#plus').onclick=newCloth;
 $('#arch').onclick=()=>{if(mode==='archive'&&!AR.entering&&AR.p<.05){AR.sel=null;layout()}};
 addEventListener('wheel',onWheel,{passive:false});
 addEventListener('keydown',e=>{if($('#modal').style.display==='flex')return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveCur()}
  else if(e.key==='Enter'&&mode==='archive'&&AR.sel&&!AR.entering){AR.auto=1;startTick()}});
 setInterval(autoSave,5000);addEventListener('visibilitychange',()=>{if(document.hidden)autoSave()});addEventListener('pagehide',autoSave);
 cur=mkCloth();buildEl(cur);
 dbAll().then(list=>{if(!list.length)return;list.sort((a,b)=>a.savedAt-b.savedAt).forEach(o=>{const bytes=new Uint8Array(o.bytes);const c=mkCloth({id:o.id,bytes,w:o.w,h:o.h,lay:o.lay,thumb:makeThumb(bytes,o.w,o.h)});buildEl(c)});
  if(!cur.dirty&&mode==='edit'){cur.el.remove();cloths.splice(cloths.indexOf(cur),1);cur=null;AR.sel=null;showArchive();layout();say('천을 클릭해 선택하고, 휠을 위로 굴려 펼치세요')}
  else layout()}).catch(()=>{})}

// interaction guide toggle
$('#helpBtn').onclick=e=>{e.stopPropagation();const h=$('#help');h.style.display=h.style.display==='block'?'none':'block'};
document.addEventListener('click',e=>{const h=$('#help');if(h.style.display==='block'&&!h.contains(e.target))h.style.display='none'});
