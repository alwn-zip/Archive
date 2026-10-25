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
const FS_FLOW=`precision highp float;varying vec2 vUv;uniform sampler2D uDye;uniform vec2 uG,uTex;uniform float uAsp,uSeed;
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
float a0=texture2D(uDye,vUv-v*${FLOW_STRETCH.toFixed(2)}).a;
float edge=1.-smoothstep(.3,.9,a0);
float rag=vn(vec2(dot(p,dir)*5.,dot(p,perp)*26.)+uSeed);
vec2 nz=curl(p*8.+2.3+uSeed)*sp*${FLOW_WOBBLE.toFixed(2)}*edge;
vec2 q=vUv-v*${FLOW_STRETCH.toFixed(2)}*(1.+edge*${FLOW_RAGGED.toFixed(2)}*(rag-.5)*2.)-nz;
vec4 c=texture2D(uDye,q);
vec2 da=dir*uTex*2.,dp=perp*uTex*(2.+5.*rag);
vec4 b=(texture2D(uDye,q+da)+texture2D(uDye,q-da)+texture2D(uDye,q+dp)+texture2D(uDye,q-dp))*.25;
gl_FragColor=mix(c,b,clamp(sp*${FLOW_DIFF.toFixed(2)}*10.*edge,0.,.2));}`;

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

addEventListener('error',e=>{const d=document.getElementById('diag');d.textContent='ERROR: '+e.message+' (line '+(e.lineno||'?')+')'});
let cnv,dyeA,dyeB,shFlow,shBleed,shAdv,shStamp,shComp,shSpread,SW,SH,asp,fbName='?',isMobile,
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
 shAdv=createShader(VS,FS_ADV);shStamp=createShader(VS,FS_STAMP);shComp=createShader(VS,FS_COMP);shSpread=createShader(VS,FS_SPREAD);shFlow=createShader(VS,FS_FLOW);shBleed=createShader(VS,FS_BLEED);
 bind();
}
const flowV=[0,0];let flowG=[0,0],flowAcc=[0,0],flowSeed=0;
const flowing=()=>Math.hypot(flowG[0],flowG[1])>8e-4||flowAcc[0]!==0||flowAcc[1]!==0;
let bleedAge=1e9,bleedSeed=0;const bleeding=()=>bleedAge<BLEED_FRAMES;
function run(fb,sh,u){fb.begin();blendMode(REPLACE);shader(sh);for(const k in u)sh.setUniform(k,u[k]);rect(0,0,fb.width,fb.height);fb.end()}
const swap=()=>{const t=dyeA;dyeA=dyeB;dyeB=t};
const itemU=()=>item?{uItem:item.tex,uC:[item.x/width,1-item.y/height],uSz:[item.w/width,item.h/height]}:{};

function draw(){
 const t0=performance.now();
 if(!dirty&&!forces.length&&!stampReq&&!flowing()&&!bleeding()){busyFrames=0;report();return}  // 유휴 시 모든 패스 중단
 busyFrames++;
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
  else{run(dyeB,shFlow,{uDye:dyeA,uG:flowG,uAsp:asp,uTex:[1/SW,1/SH],uSeed:flowSeed});swap()}}
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
$('#bSmp').onclick=()=>{const g=createGraphics(460,320);g.pixelDensity(1);g.clear();g.noStroke();
 ['#d4553a','#3b6fb6','#e8b83a','#2f8f6b'].forEach((c,i)=>{g.fill(c);g.circle(110+i*80,150+(i%2?-40:40),150)});
 g.fill('#222');g.rect(30,250,400,14,7);g.textSize(40);g.textStyle(BOLD);g.text('ABSORB',150,60);setItem(g,460,320)};

// ---------- 힘 주입 (Matter.js 없이 단순 힘 — 테스트 3) ----------
const uvOf=p=>[p.x/width,1-p.y/height];
function drop(p){const[x,y]=uvOf(p);forces.push({kind:1,x,y,a:.0014,b:.0011,r0:.05,r1:.12,age:0,max:70,seed:Math.random()*40});say('DROP')}
function bleed(){bleedAge=0;bleedSeed=Math.random()*40;say('BLEED')}
function flowSeg(p,q){const a=uvOf(p),b=uvOf(q);if(!flowing())flowSeed=Math.random()*40;
 flowAcc[0]+=b[0]-a[0];flowAcc[1]+=b[1]-a[1]}

// ---------- 입력 ----------
let el;
let down=null,moved=false,lp=null,hold=0,fired=false,onItem=false,clicks=[],ct=0;
const pt=e=>{const r=el.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
const hit=p=>item&&Math.abs(p.x-item.x)<=item.w/2&&Math.abs(p.y-item.y)<=item.h/2;
function bind(){el=cnv.elt;
 el.addEventListener('pointerdown',e=>{if($('#modal').style.display==='flex')return;const p=pt(e);down=p;lp=p;moved=false;fired=false;onItem=hit(p);
  if(onItem)hold=setTimeout(()=>{if(!moved){stampReq=item;fired=true;dirty=true;say('DYE · 천에 흡수됨')}},650);
  el.setPointerCapture?.(e.pointerId)});
 el.addEventListener('pointermove',e=>{if(!down)return;const p=pt(e);
  if(Math.hypot(p.x-down.x,p.y-down.y)>6){moved=true;clearTimeout(hold)}
  if(moved){if(onItem&&item){item.x=p.x;item.y=p.y;dirty=true}else if(!item&&lp){flowSeg(lp,p)}}
  lp=p});
 const up=e=>{clearTimeout(hold);if(!down)return;const p=pt(e);
  if(!moved&&!fired&&!item){const n=Date.now();clicks.push({p,t:n});clicks=clicks.filter(c=>n-c.t<700);clearTimeout(ct);
   if(clicks.length>=3&&n-clicks[0].t<520){clicks=[];bleed()}
   else ct=setTimeout(()=>{if(clicks.length===2)drop(clicks[1].p);clicks=[]},280)}
  down=null;lp=null};
 el.addEventListener('pointerup',up);el.addEventListener('pointercancel',()=>{clearTimeout(hold);down=null;lp=null});
}
