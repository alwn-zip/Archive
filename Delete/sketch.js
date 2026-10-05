const Engine = Matter.Engine;
const Bodies = Matter.Bodies;
const Composite = Matter.Composite;
const Body = Matter.Body;
// 이번 작업에서 추가로 사용하는 것들 (마우스 드래그용)
const Mouse = Matter.Mouse;
const MouseConstraint = Matter.MouseConstraint;
const Events = Matter.Events;

let engine;
let mouseConstraint;

// 충돌
const CAT_MOUSE = 0x0001;
const CAT_BUG = 0x0002; // 벌레
const CAT_WALL = 0x0004; // 벽과 바닥
const CAT_LEAF = 0x0008; // 잎과 파편

let season = 0; // 0 = 봄, 1 = 가을
let leaves = [];
let particles = [];
let bug;
let walls = [];
let spawnTimer = 0;
let currentBg;

let slider = {
  dragging: false,
};

let branchX, branchY, branchW, branchH;

// 가지곡선
const mainStem = [
  [0.27, 1.0],
  [0.27, 1.0],
  [0.24, 0.9],
  [0.32, 0.78],
  [0.52, 0.65],
  [0.64, 0.51],
  [0.67, 0.41],
  [0.63, 0.31],
  [0.52, 0.2],
  [0.33, 0.08],
  [0.33, 0.08],
];
const rightStem = [
  [0.52, 0.65],
  [0.52, 0.65],
  [0.65, 0.57],
  [0.75, 0.51],
  [0.84, 0.45],
  [0.84, 0.45],
];
const leftStem = [
  [0.24, 0.9],
  [0.24, 0.9],
  [0.26, 0.8],
  [0.35, 0.7],
  [0.38, 0.6],
  [0.33, 0.5],
  [0.18, 0.43],
  [0.18, 0.43],
];

const spots = [
  { x: 0.33, y: 0.08, angle: -160, size: 0.17, leaf: null },
  { x: 0.6, y: 0.25, angle: -65, size: 0.13, leaf: null },
  { x: 0.63, y: 0.32, angle: -155, size: 0.15, leaf: null },
  { x: 0.67, y: 0.42, angle: -45, size: 0.11, leaf: null },
  { x: 0.84, y: 0.45, angle: -35, size: 0.13, leaf: null },
  { x: 0.18, y: 0.43, angle: -170, size: 0.13, leaf: null },
  { x: 0.64, y: 0.53, angle: -125, size: 0.15, leaf: null },
  { x: 0.32, y: 0.79, angle: -20, size: 0.12, leaf: null },
];

const bgStops = [
  [0.0, 243, 249, 238], // 봄
  [0.5, 248, 238, 210], // 중간
  [1.0, 240, 214, 176], // 가을
];
const leafStops = [
  [0.0, 84, 160, 90],
  [0.3, 150, 200, 75],
  [0.55, 235, 200, 60],
  [0.75, 190, 120, 45],
  [0.9, 110, 70, 40],
  [1.0, 95, 60, 35],
];
const branchStops = [
  [0.0, 85, 110, 90],
  [1.0, 90, 65, 45],
];

function lerpStops(stops, t) {
  t = constrain(t, 0, 1);
  for (let i = 0; i < stops.length - 1; i++) {
    let a = stops[i];
    let b = stops[i + 1];
    if (t <= b[0]) {
      let k = (t - a[0]) / (b[0] - a[0]);
      return lerpColor(color(a[1], a[2], a[3]), color(b[1], b[2], b[3]), k);
    }
  }
  let last = stops[stops.length - 1];
  return color(last[1], last[2], last[3]);
}

function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  rectMode(CENTER);

  engine = Engine.create();
  engine.gravity.y = 0.8;

  updateLayout();
  makeWalls();

  // 벌레 만들기
  bug = new Bug();

  let mouse = Mouse.create(document.querySelector("canvas"));
  mouse.pixelRatio = pixelDensity();
  mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.2,
      render: { visible: false },
    },
  });
  Composite.add(engine.world, mouseConstraint);

  Events.on(mouseConstraint, "enddrag", function (e) {
    if (e.body === bug.body) {
      bug.onRelease();
    }
  });

  for (let i = 0; i < spots.length; i++) {
    spawnLeaf(i, random(0, 4));
  }
}

function draw() {
  Engine.update(engine);

  let dt = min(deltaTime, 50) / 1000;

  // 배경
  currentBg = lerpStops(bgStops, season);
  background(currentBg);

  // 가지
  drawBranches();

  updateSpawn(dt);

  for (let leaf of leaves) {
    leaf.update(dt);
  }

  leaves = leaves.filter(function (leaf) {
    if (leaf.state === "dead") {
      Composite.remove(engine.world, leaf.body);
      return false;
    }
    return true;
  });
  for (let leaf of leaves) {
    leaf.display();
  }

  // 파편
  for (let p of particles) {
    p.update();
    p.display();
  }
  particles = particles.filter(function (p) {
    if (p.dead) {
      Composite.remove(engine.world, p.body);
      return false;
    }
    return true;
  });

  // 벌레
  bug.update();
  bug.display();

  // 슬라이더
  drawSlider();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateLayout();
  makeWalls();
  bug.onResize();
}

function updateLayout() {
  branchH = height * 0.9;
  branchW = branchH * 0.55;
  if (branchW > width * 0.75) {
    branchW = width * 0.75;
    branchH = branchW / 0.55;
  }
  branchX = width * 0.6 - branchW / 2;
  branchY = (height - branchH) / 2;
}

function bx(nx) {
  return branchX + nx * branchW;
}
function by(ny) {
  return branchY + ny * branchH;
}

function unit() {
  return min(width, height);
}

function makeWalls() {
  Composite.remove(engine.world, walls);
  let t = 100;
  let opt = {
    isStatic: true,
    collisionFilter: { category: CAT_WALL, mask: CAT_BUG, group: 0 },
  };
  walls = [
    Bodies.rectangle(width / 2, height * 0.94 + t / 2, width * 2, t, opt),
    Bodies.rectangle(width / 2, -t / 2, width * 2, t, opt),
    Bodies.rectangle(-t / 2, height / 2, t, height * 3, opt),
    Bodies.rectangle(width + t / 2, height / 2, t, height * 3, opt),
  ];
  Composite.add(engine.world, walls);
}

function drawBranches() {
  let c = lerpStops(branchStops, season);
  stroke(c);
  noFill();
  strokeCap(ROUND);
  drawBranch(mainStem, branchH * 0.014, branchH * 0.004);
  drawBranch(rightStem, branchH * 0.008, branchH * 0.003);
  drawBranch(leftStem, branchH * 0.008, branchH * 0.003);
  noStroke();
}

function drawBranch(pts, wStart, wEnd) {
  let steps = 14;
  let segs = pts.length - 3;
  let total = segs * (steps + 1);
  let k = 0;
  let px, py;
  for (let i = 0; i < segs; i++) {
    let p0 = pts[i];
    let p1 = pts[i + 1];
    let p2 = pts[i + 2];
    let p3 = pts[i + 3];
    for (let j = 0; j <= steps; j++) {
      let t = j / steps;
      let x = catmullRom(bx(p0[0]), bx(p1[0]), bx(p2[0]), bx(p3[0]), t);
      let y = catmullRom(by(p0[1]), by(p1[1]), by(p2[1]), by(p3[1]), t);
      if (k > 0) {
        strokeWeight(lerp(wStart, wEnd, k / total));
        line(px, py, x, y);
      }
      px = x;
      py = y;
      k++;
    }
  }
}

function catmullRom(a, b, c, d, t) {
  let t2 = t * t;
  let t3 = t2 * t;
  return (
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3)
  );
}

function spawnLeaf(spotIndex, delay) {
  let leaf = new Leaf(spotIndex, delay);
  spots[spotIndex].leaf = leaf;
  leaves.push(leaf);
}

function updateSpawn(dt) {
  if (season > 0.6) {
    spawnTimer = 0;
    return;
  }
  spawnTimer += dt;
  if (spawnTimer < 0.5) return;

  let empty = [];
  for (let i = 0; i < spots.length; i++) {
    if (spots[i].leaf === null) empty.push(i);
  }
  if (empty.length > 0) {
    spawnLeaf(random(empty), 0);
    spawnTimer = 0;
  }
}

class Leaf {
  constructor(spotIndex, delay) {
    let s = spots[spotIndex];
    this.spotIndex = spotIndex;
    this.sizeRatio = s.size * random(0.92, 1.08);
    this.angle = radians(s.angle) + random(-0.12, 0.12);

    this.state = "sprout";
    this.timer = -delay;
    this.growTime = random(2.5, 3);

    this.crumbleStart = random(0.7, 0.86);
    this.crumbleSpan = 0.12;
    this.colorOffset = random(-0.04, 0.04);

    this.damage = 0;
    this.eatProgress = 0;
    this.phase = random(TWO_PI);

    this.bites = [];
    let n = 14;
    for (let i = 0; i < n; i++) {
      let bxL = random(-0.4, 0.4);
      let widthAt = 1 - pow(bxL / 0.5, 2);
      this.bites.push({
        x: bxL,
        y: random(-0.16, 0.16) * widthAt,
        r: random(0.07, 0.12),
        t: (i + 0.5) / n,
      });
    }

    let c = this.centerPos();
    this.body = Bodies.circle(c.x, c.y, 5, {
      frictionAir: 0.03,
      collisionFilter: { category: CAT_LEAF, mask: 0, group: 0 },
    });
    Body.setAngle(this.body, this.angle);
    Body.setStatic(this.body, true);
    Composite.add(engine.world, this.body);
  }

  growth() {
    let g = constrain(this.timer / this.growTime, 0, 1);
    return g * g * (3 - 2 * g);
  }

  length() {
    let scaleNow = this.growth() * (1 - 0.3 * this.damage);
    return this.sizeRatio * branchH * scaleNow;
  }

  attachPos() {
    let s = spots[this.spotIndex];
    return { x: bx(s.x), y: by(s.y) };
  }

  centerPos() {
    let a = this.attachPos();
    let L = this.length();
    return {
      x: a.x + cos(this.angle) * L * 0.5,
      y: a.y + sin(this.angle) * L * 0.5,
    };
  }

  releaseSpot() {
    let s = spots[this.spotIndex];
    if (s.leaf === this) s.leaf = null;
  }

  isAttached() {
    return this.state === "sprout" || this.state === "alive";
  }

  update(dt) {
    if (this.state === "sprout") {
      this.timer += dt;
      if (this.timer >= this.growTime) {
        this.state = "alive";
      }
    }

    if (this.isAttached() && this.timer > 0) {
      let d = constrain((season - this.crumbleStart) / this.crumbleSpan, 0, 1);
      this.damage = d * 0.85;
      if (d >= 1) {
        this.crumbleAway();
        return;
      }
    }

    if (this.state === "eating") {
      this.eatProgress += dt / 1.8;
      this.damage = min(this.eatProgress, 1);

      let idx = constrain(
        floor(this.damage * this.bites.length),
        0,
        this.bites.length - 1,
      );
      let w = this.biteWorldPos(this.bites[idx]);
      bug.moveTo(w.x, w.y);

      if (this.eatProgress >= 1) {
        this.releaseSpot();
        this.state = "dead";
        bug.finishEating();
        return;
      }
    }

    if (this.state === "falling") {
      let flutter =
        sin(frameCount * 0.08 + this.phase) * this.body.mass * 0.0005;
      Body.applyForce(this.body, this.body.position, { x: flutter, y: 0 });
      if (this.body.position.y > height + 200) {
        this.state = "dead";
      }
    }

    if (this.isAttached() || this.state === "eating") {
      let c = this.centerPos();
      Body.setPosition(this.body, c);
    }
  }

  currentColor() {
    return lerpStops(leafStops, season + this.colorOffset);
  }

  biteWorldPos(b) {
    let L = this.length();
    let lx = b.x * L;
    let ly = b.y * L;
    let a = this.angle;
    let p = this.body.position;
    return {
      x: p.x + cos(a) * lx - sin(a) * ly,
      y: p.y + sin(a) * lx + cos(a) * ly,
    };
  }

  isClickable(mx, my) {
    if (this.state !== "alive") return false;
    let p = this.body.position;
    return dist(mx, my, p.x, p.y) < this.length() * 0.42;
  }

  // 클릭 -> 낙하
  drop() {
    this.releaseSpot();
    this.state = "falling";
    Body.setStatic(this.body, false); // static 해제 -> 이제부터 중력의 영향을 받는다
    Body.setVelocity(this.body, { x: random(-1.2, 1.2), y: -0.5 });
    Body.setAngularVelocity(this.body, random(-0.05, 0.05));
  }

  // 벌레가 먹기 시작
  startEating() {
    this.state = "eating";
    this.eatProgress = 0;
  }

  // 계절 붕괴 -> 잎 Body 제거 + 파편 Body 생성
  crumbleAway() {
    let L = this.length();
    let col = this.currentColor();
    let p = this.body.position;
    for (let i = 0; i < 14; i++) {
      // 잎 모양 안쪽의 무작위 위치
      let lx = random(-0.45, 0.45);
      let ly = random(-0.18, 0.18) * (1 - pow(lx / 0.5, 2));
      let a = this.angle;
      let wx = p.x + cos(a) * lx * L - sin(a) * ly * L;
      let wy = p.y + sin(a) * lx * L + cos(a) * ly * L;
      particles.push(new Particle(wx, wy, col));
    }
    this.releaseSpot();
    this.state = "dead";
  }

  display() {
    let L = this.length();
    if (L < 1) return;

    let p = this.body.position;
    let col = this.currentColor();
    let g = constrain(this.timer / this.growTime, 0, 1);

    if (this.state === "sprout") {
      col = lerpColor(color(190, 225, 120), col, g);
    }

    let ang = this.body.angle;
    if (this.isAttached() || this.state === "eating") {
      ang = this.angle + sin(frameCount * 0.03 + this.phase) * 0.03;
    }

    let shakeX = 0;
    let shakeY = 0;
    if (this.damage > 0.3 && this.state !== "falling") {
      shakeX = random(-1, 1) * this.damage * 2;
      shakeY = random(-1, 1) * this.damage * 2;
    }

    push();
    translate(p.x + shakeX, p.y + shakeY);
    rotate(ang);

    noStroke();
    fill(col);
    let W = L * 0.32;
    beginShape();
    vertex(-L / 2, 0);
    bezierVertex(-L * 0.4, -W * 1.1);
    bezierVertex(L * 0.05, -W * 0.9);
    bezierVertex(L / 2, 0);
    bezierVertex(L * 0.05, W * 0.9);
    bezierVertex(-L * 0.4, W * 1.1);
    bezierVertex(-L / 2, 0);
    endShape(CLOSE);

    stroke(255, 255, 255, 150);
    strokeWeight(max(1, L * 0.02));
    line(-L * 0.42, 0, L * 0.25, 0);

    noStroke();
    fill(currentBg);
    for (let b of this.bites) {
      if (b.t < this.damage) {
        let d = b.r * 2 * L * (0.4 + this.damage);
        circle(b.x * L, b.y * L, d);
      }
    }
    pop();
  }
}

class Bug {
  constructor() {
    this.r = unit() * 0.022;
    this.eatingLeaf = null;
    this.body = Bodies.circle(width * 0.3, height * 0.8, this.r, {
      restitution: 0.4,
      friction: 0.1,
      frictionAir: 0.02,

      collisionFilter: {
        category: CAT_BUG,
        mask: CAT_WALL | CAT_MOUSE,
        group: 0,
      },
    });
    Composite.add(engine.world, this.body);
  }

  hit(mx, my) {
    let p = this.body.position;
    return dist(mx, my, p.x, p.y) < this.r * 2.2;
  }

  onRelease() {
    if (this.eatingLeaf) return;
    let p = this.body.position;
    let target = null;
    let best = 99999;
    for (let leaf of leaves) {
      if (leaf.state !== "alive") continue;
      let c = leaf.body.position;
      let d = dist(p.x, p.y, c.x, c.y);
      if (d < leaf.length() * 0.55 + this.r && d < best) {
        best = d;
        target = leaf;
      }
    }
    if (target) {
      this.eatingLeaf = target;
      target.startEating();
      Body.setStatic(this.body, true);
      Body.setAngle(this.body, target.angle);
      setBugDraggable(false);
    }
  }

  moveTo(x, y) {
    Body.setPosition(this.body, { x: x + random(-1, 1), y: y + random(-1, 1) });
  }

  finishEating() {
    Body.setStatic(this.body, false);
    Body.setVelocity(this.body, { x: 0, y: 0 });
    this.eatingLeaf = null;
    setBugDraggable(true);
  }

  update() {
    let p = this.body.position;
    if (p.y > height + 100 || p.x < -100 || p.x > width + 100 || p.y < -100) {
      this.resetPosition();
    }
  }

  resetPosition() {
    Body.setPosition(this.body, { x: width * 0.3, y: height * 0.8 });
    Body.setVelocity(this.body, { x: 0, y: 0 });
  }

  onResize() {
    let newR = unit() * 0.022;
    Body.scale(this.body, newR / this.r, newR / this.r);
    this.r = newR;
    this.resetPosition();
  }

  display() {
    let p = this.body.position;
    let r = this.r;
    push();
    translate(p.x, p.y);
    rotate(this.body.angle);
    noStroke();

    fill(120, 170, 60);
    circle(-r * 0.95, 0, r * 1.4);
    circle(0, 0, r * 1.5);
    fill(150, 200, 70);
    circle(r * 0.95, 0, r * 1.5);

    fill(255);
    circle(r * 1.15, -r * 0.3, r * 0.5);
    circle(r * 1.15, r * 0.3, r * 0.5);
    fill(30);
    circle(r * 1.22, -r * 0.3, r * 0.22);
    circle(r * 1.22, r * 0.3, r * 0.22);

    // 더듬이
    stroke(60, 80, 40);
    strokeWeight(max(1, r * 0.1));
    line(r * 1.4, -r * 0.5, r * 1.9, -r * 0.9);
    line(r * 1.4, r * 0.5, r * 1.9, r * 0.9);
    pop();
  }
}

function setBugDraggable(on) {
  if (on && !slider.dragging && !bug.eatingLeaf) {
    mouseConstraint.collisionFilter.mask = 0xffffffff;
  } else {
    mouseConstraint.collisionFilter.mask = 0;
  }
}

class Particle {
  constructor(x, y, col) {
    this.size = unit() * random(0.006, 0.014);
    this.isCircle = random() < 0.4;
    this.dead = false;

    this.col = lerpColor(col, color(60, 40, 25), random(0, 0.5));

    let opt = {
      frictionAir: random(0.01, 0.04),
      restitution: 0.2,
      collisionFilter: { category: CAT_LEAF, mask: 0, group: 0 },
    };
    if (this.isCircle) {
      this.body = Bodies.circle(x, y, this.size * 0.6, opt);
    } else {
      this.body = Bodies.rectangle(x, y, this.size * 1.6, this.size, opt);
    }
    Body.setVelocity(this.body, { x: random(-1.2, 1.2), y: random(-1.5, 0.3) });
    Body.setAngularVelocity(this.body, random(-0.2, 0.2));
    Composite.add(engine.world, this.body);
  }

  update() {
    if (this.body.position.y > height + 100) {
      this.dead = true;
    }
  }

  display() {
    let p = this.body.position;
    push();
    translate(p.x, p.y);
    rotate(this.body.angle);
    noStroke();
    fill(this.col);
    if (this.isCircle) {
      circle(0, 0, this.size * 1.2);
    } else {
      rect(0, 0, this.size * 1.6, this.size);
    }
    pop();
  }
}

function sliderX() {
  return max(width * 0.07, 40);
}
function sliderTop() {
  return height * 0.15;
}
function sliderBottom() {
  return height * 0.85;
}

function drawSlider() {
  let x = sliderX();
  let yTop = sliderTop();
  let yBottom = sliderBottom();
  let hy = lerp(yTop, yBottom, season);
  let hr = unit() * 0.022;

  let ui = lerpColor(color(60, 80, 60), color(240, 225, 200), season);

  // 선
  stroke(ui);
  strokeWeight(3);
  line(x, yTop, x, yBottom);
  fill(ui);
  noStroke();
  circle(x, yTop, 8);
  circle(x, yBottom, 8);

  // 핸들
  fill(lerpStops(leafStops, season));
  stroke(ui);
  strokeWeight(3);
  circle(x, hy, hr * 2);

  // 글자
  noStroke();
  fill(ui);
  textAlign(CENTER, CENTER);
  textSize(max(12, unit() * 0.02));
  text("SPRING", x, yTop - hr * 2);
  text("AUTUMN", x, yBottom + hr * 2);
}

function sliderHit(mx, my) {
  let hr = unit() * 0.022;
  return (
    abs(mx - sliderX()) < hr * 2 &&
    my > sliderTop() - hr &&
    my < sliderBottom() + hr
  );
}

function updateSeasonFromMouse() {
  season = constrain(map(mouseY, sliderTop(), sliderBottom(), 0, 1), 0, 1);
}

function mousePressed() {
  // 슬라이더
  if (sliderHit(mouseX, mouseY)) {
    slider.dragging = true;
    setBugDraggable(false);
    updateSeasonFromMouse();
    return;
  }

  // 벌레
  if (bug.hit(mouseX, mouseY)) {
    return;
  }

  // 잎 클릭 -> 낙하
  for (let leaf of leaves) {
    if (leaf.isClickable(mouseX, mouseY)) {
      leaf.drop();
      break;
    }
  }
}

function mouseDragged() {
  if (slider.dragging) {
    updateSeasonFromMouse();
  }
}

function mouseReleased() {
  if (slider.dragging) {
    slider.dragging = false;
    setBugDraggable(true);
  }
}
