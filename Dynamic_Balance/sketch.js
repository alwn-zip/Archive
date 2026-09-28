const { Engine, Bodies, Body, Vertices, Composite } = Matter;
const hypot = Math.hypot;
const DT = 1000 / 60;
const N_PIECES = 8;
const MASK_ALL = 0xffffffff,
  MASK_WALL = 0x0002;
const CREAM = "#FFF5D6";

let engine, R, CX, CY;
let pieces = [];
let state = "scattered";
let stateT = 0,
  autoTimer = 1.4,
  locked = false;

function setup() {
  createCanvas(windowWidth, windowHeight);
  init();
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  init();
}

function init() {
  R = min(width, height) * 0.36;
  CX = width / 2;
  CY = height / 2;
  engine = Engine.create();
  engine.gravity.y = 0;
  engine.gravity.x = 0; // 기본 중력 끔
  buildWalls();
  buildPieces();
  placeScattered();
  state = "scattered";
  autoTimer = 1.0;
  locked = false; // 새로고침 후 1.0초 뒤 자동으로 모이기 시작
}

// 벽만들기
function buildWalls() {
  const T = 400,
    o = { isStatic: true, restitution: 0.6, collisionFilter: { category: 2 } };
  Composite.add(engine.world, [
    Bodies.rectangle(CX, -T / 2, width + 2 * T, T, o),
    Bodies.rectangle(CX, height + T / 2, width + 2 * T, T, o),
    Bodies.rectangle(-T / 2, CY, T, height + 2 * T, o),
    Bodies.rectangle(width + T / 2, CY, T, height + 2 * T, o),
  ]);
}

// 오렌지 조각
function buildPieces() {
  pieces = [];
  const M = 12,
    K0 = 2,
    r0 = (R * K0) / M;
  let w = Array.from({ length: N_PIECES }, () => random(0.88, 1.14));
  const sum = w.reduce((a, b) => a + b, 0);
  let ang = [random(TWO_PI)];
  for (let i = 0; i < N_PIECES; i++) ang.push(ang[i] + (w[i] / sum) * TWO_PI);

  const bnd = ang.slice(0, N_PIECES).map((a) => {
    const amp = R * random(0.008, 0.02),
      ph = random(TWO_PI),
      fr = random(0.5, 0.9);
    const pts = [];
    for (let k = 0; k <= M; k++) {
      const r = (R * k) / M;
      const off = 0;
      pts.push({ x: cos(a) * r - sin(a) * off, y: sin(a) * r + cos(a) * off });
    }
    return pts;
  });

  for (let i = 0; i < N_PIECES; i++) {
    const a0 = ang[i],
      a1 = ang[i + 1],
      d = a1 - a0;
    const A = bnd[i],
      B = bnd[(i + 1) % N_PIECES];

    const cap = (P, Q, ts) =>
      ts.map((t) => {
        const f = 1 - 0.35 * sin(PI * t);
        return {
          x: (P.x + (Q.x - P.x) * t) * f,
          y: (P.y + (Q.y - P.y) * t) * f,
        };
      });
    const vis = A.slice(K0);
    for (let s = 1; s < 8; s++)
      vis.push({ x: cos(a0 + (d * s) / 8) * R, y: sin(a0 + (d * s) / 8) * R });
    for (let k = M; k >= K0; k--) vis.push(B[k]);
    vis.push(...cap(A[K0], B[K0], [0.75, 0.5, 0.25]));

    // 충돌용 볼록
    const Pa = { x: cos(a0) * r0, y: sin(a0) * r0 },
      Pb = { x: cos(a1) * r0, y: sin(a1) * r0 };
    const hull = [Pa, ...cap(Pa, Pb, [0.25, 0.5, 0.75]), Pb];
    for (let s = 3; s >= 0; s--)
      hull.push({ x: cos(a0 + (d * s) / 3) * R, y: sin(a0 + (d * s) / 3) * R });
    const c = Vertices.centre(hull); // 무게중심 = 최종 위치 기준점

    const body = Bodies.fromVertices(
      0,
      0,
      [hull.map((p) => ({ x: p.x, y: p.y }))],
      {
        density: 0.002,
        friction: 0.25,
        frictionAir: 0.02,
        restitution: 0.35,
        collisionFilter: { category: 1, mask: MASK_ALL },
      },
    );

    const loc = (pt) => ({ x: pt.x - c.x, y: pt.y - c.y }); // 오렌지 좌표 -> 조각 로컬 좌표
    const g = R * 0.075,
      fr0 = R * 0.27,
      fr1 = R * 0.79,
      ea = atan2(g, fr1),
      er = hypot(fr1, g);
    const n0 = { x: -sin(a0), y: cos(a0) },
      n1 = { x: -sin(a1), y: cos(a1) };
    const flesh = [
      loc({ x: cos(a0) * fr0 + n0.x * g, y: sin(a0) * fr0 + n0.y * g }),
      loc({ x: cos(a0) * fr1 + n0.x * g, y: sin(a0) * fr1 + n0.y * g }),
    ];
    for (let s = 1; s < 6; s++) {
      const a = lerp(a0 + ea, a1 - ea, s / 6);
      flesh.push(loc({ x: cos(a) * er, y: sin(a) * er }));
    }
    flesh.push(
      loc({ x: cos(a1) * fr1 - n1.x * g, y: sin(a1) * fr1 - n1.y * g }),
      loc({ x: cos(a1) * fr0 - n1.x * g, y: sin(a1) * fr0 - n1.y * g }),
    );
    const am = (a0 + a1) / 2,
      sp = loc({ x: cos(am) * R * 0.52, y: sin(am) * R * 0.52 });
    const yellow = i % 2 === 0;

    // 최종 오렌지 형태
    const target = { x: CX + c.x, y: CY + c.y, angle: 0 };

    Composite.add(engine.world, body);
    pieces.push({
      body,
      target,
      poly: vis.map(loc),
      sideA: A.slice(K0).map(loc),
      sideB: B.slice(K0).map(loc),
      ox: -c.x,
      oy: -c.y,
      flesh,
      sx: sp.x,
      sy: sp.y,
      rot: am,
      col: yellow ? "#FDB022" : "#F98A1E",
      seedCol: yellow ? "#F47B2C" : "#EE5A26",
    });
  }
}

// 조각의 초기 위치
function placeScattered() {
  const placed = [],
    m = R * 0.5;
  for (const p of pieces) {
    let x, y;
    for (let t = 0; t < 40; t++) {
      x = random(m, width - m);
      y = random(m, height - m);
      if (placed.every((q) => dist(x, y, q.x, q.y) > R * 0.6)) break;
    }
    placed.push({ x, y });
    const b = p.body;
    Body.setPosition(b, { x, y });
    Body.setAngle(b, random(TWO_PI));
    Body.setVelocity(b, { x: random(-1.5, 1.5), y: random(-1.5, 1.5) });
    Body.setAngularVelocity(b, random(-0.03, 0.03));
  }
}

function accel(b, ax, ay) {
  const f = b.mass / (DT * DT);
  Body.applyForce(b, b.position, { x: ax * f, y: ay * f });
}
const smooth = (t, a, b) => {
  const x = constrain((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const wrapPI = (a) => {
  a = (a + PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - PI;
};

// radial gravity
function radialGravity(p, wT) {
  const b = p.body,
    dx = CX - b.position.x,
    dy = CY - b.position.y,
    d = max(1, hypot(dx, dy));
  const g = 0.5 * (1 - wT) * (0.35 + 0.65 * min(d / R, 1.5));
  accel(b, (dx / d) * g, (dy / d) * g);
}

// target position으로 정렬
function alignForce(p, wT) {
  const b = p.body,
    k = 0.06 * wT,
    c = 2 * sqrt(k) * 0.75;
  const ex = p.target.x - b.position.x,
    ey = p.target.y - b.position.y;
  accel(b, k * ex - c * b.velocity.x, k * ey - c * b.velocity.y);
  const err = wrapPI(p.target.angle - b.angle);
  Body.setAngularVelocity(
    b,
    b.angularVelocity * (1 - 0.25 * wT) + err * 0.04 * wT,
  );
  b.frictionAir = lerp(0.04, 0.1, wT);
}

function setCollide(on) {
  pieces.forEach(
    (p) => (p.body.collisionFilter.mask = on ? MASK_ALL : MASK_WALL),
  );
}

function assemble() {
  state = "assembling";
  stateT = 0;
  locked = false;
  setCollide(true);
}

function scatter() {
  state = "scattered";
  locked = false;
  setCollide(true);
  for (const p of pieces) {
    const b = p.body,
      dx = b.position.x - CX + random(-20, 20),
      dy = b.position.y - CY + random(-20, 20),
      d = max(1, hypot(dx, dy));
    const s = random(8, 15);
    Body.setVelocity(b, { x: (dx / d) * s, y: (dy / d) * s });
    Body.setAngularVelocity(b, random(-0.25, 0.25));
    b.frictionAir = 0.02;
  }
}

function checkLock() {
  if (stateT > 4.0) setCollide(false);
  const ok = pieces.every(
    (p) =>
      hypot(p.target.x - p.body.position.x, p.target.y - p.body.position.y) <
        2.5 && abs(wrapPI(p.target.angle - p.body.angle)) < 0.02,
  );
  if ((stateT > 3.5 && ok) || stateT > 7) {
    if (ok)
      pieces.forEach((p) => {
        Body.setPosition(p.body, p.target);
        Body.setAngle(p.body, 0);
        Body.setVelocity(p.body, { x: 0, y: 0 });
        Body.setAngularVelocity(p.body, 0);
      });
    setCollide(false);
    state = "assembled";
    locked = true;
  }
}

function limitSpeed() {
  for (const p of pieces) {
    const v = p.body.velocity,
      s = hypot(v.x, v.y);
    if (s > 22)
      Body.setVelocity(p.body, { x: (v.x / s) * 22, y: (v.y / s) * 22 });
  }
}

// 오렌지 조각
function tracePath(ctx, pts, close = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}
function disc(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.fillStyle = fill;
  ctx.fill();
}
function seg(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawPiece(p) {
  const b = p.body,
    ctx = drawingContext;
  push();
  translate(b.position.x, b.position.y);
  rotate(b.angle);
  ctx.save();
  tracePath(ctx, p.poly);
  if (state !== "assembled") {
    ctx.shadowColor = "rgba(120,60,0,0.3)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
  }
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.clip();

  const { ox, oy } = p;
  disc(ctx, ox, oy, R * 1.02, "#FDB618");
  disc(ctx, ox, oy, R * 0.91, CREAM);

  tracePath(ctx, p.flesh);
  ctx.fillStyle = p.col;
  ctx.fill();
  ctx.strokeStyle = p.col;
  ctx.lineWidth = R * 0.07;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.fillStyle = p.seedCol;
  ctx.beginPath();
  ctx.ellipse(p.sx, p.sy, R * 0.085, R * 0.042, p.rot, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = "rgba(255,245,214,0.9)";
  ctx.beginPath();
  ctx.ellipse(
    p.sx - cos(p.rot) * R * 0.12,
    p.sy - sin(p.rot) * R * 0.12,
    R * 0.03,
    R * 0.012,
    p.rot,
    0,
    TWO_PI,
  );
  ctx.fill();
  ctx.restore();
  pop();
}

function draw() {
  background("#FBF6DC");
  stateT += 1 / 60;

  if (state === "scattered" && autoTimer > 0 && (autoTimer -= 1 / 60) <= 0)
    assemble(); // 시작 후 자동 조립

  const wT =
    state === "assembling"
      ? smooth(stateT, 1.0, 3.2)
      : state === "assembled"
        ? 1
        : 0;
  if (state !== "scattered") {
    for (const p of pieces) {
      radialGravity(p, wT);
      alignForce(p, wT);
    }
  }
  Engine.update(engine, DT);
  limitSpeed();
  if (state === "assembling") checkLock();

  drawCore();
  pieces.forEach(drawPiece);
}

function drawCore() {
  if (state === "scattered") return;
  let e = 0;
  pieces.forEach(
    (p) =>
      (e += hypot(
        p.target.x - p.body.position.x,
        p.target.y - p.body.position.y,
      )),
  );
  const al = constrain(1 - e / pieces.length / (R * 0.35), 0, 1),
    ctx = drawingContext,
    r = R / 6;
  ctx.save();
  ctx.globalAlpha = al;
  disc(ctx, CX, CY, r * 1.2, CREAM);
  ctx.restore();
}
