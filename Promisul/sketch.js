const K = "sy1",
  CL = { A: "#fd6f75", B: "#6ecb7c", C: "#f6b73c" },
  EM = ["😎", "🥴", "😋", "🐻", "🐯", "🐰", "🦊", "🐸"],
  DR = ["소주", "맥주", "막걸리", "와인", "하이볼", "위스키", "사케"],
  FN = ["부유", "적당", "가난"],
  FC = { 부유: "ok", 적당: "y", 가난: "r" },
  ST = {
    pending: ["제안 대기", "y"],
    confirmed: ["술약 성립", "ok"],
    live: ["진행 중", "ok"],
    cancelled: ["성립 안 됨", "r"],
    ended: ["종료", ""],
  },
  DN = "일월화수목금토";
const LIVE = true,
  APP = (window.APP = { onSave: null });
const mk = () => ({
  me: "A",
  users: {
    A: { n: "사용자 A", e: "😎", f: "적당", a: "", bank: "", s: [], v: null },
    B: { n: "사용자 B", e: "🐻", f: "적당", a: "", bank: "", s: [], v: null },
    C: { n: "사용자 C", e: "🐸", f: "적당", a: "", bank: "", s: [], v: null },
  },
  P: [],
  fav: [],
});
let S = mk();
S.fav = S.fav || [];
for (const k of ["A", "B", "C"])
  if (S.users?.[k])
    S.users[k].v = Array.isArray(S.users[k].v)
      ? S.users[k].v
      : S.users[k].v?.a && S.users[k].v?.d
        ? (() => {
            const a = [],
              x = new Date(S.users[k].v.a + "T00:00"),
              z = new Date(S.users[k].v.d + "T00:00");
            for (let q = new Date(x); q <= z; q.setDate(q.getDate() + 1))
              a.push(iso(q));
            return a;
          })()
        : [];
let V = { v: "home" },
  hist = [],
  M = null,
  AC = null,
  G = 0,
  SD = 0,
  lastHit = 0,
  base = 0.02,
  firing = 0,
  T = "me",
  cm = 0,
  stream2 = null,
  scheduleEditing = false,
  scheduleDraft = [];
let tmModel = null,
  tmBusy = false,
  tmLast = 0,
  tmStable = 0,
  tmScriptPromise = null;
const TM_URL = "https://teachablemachine.withgoogle.com/models/UPZqRBEeP/";
const TM_TARGET_LABEL = "gesture";
const sv = () => {
  if (APP.onSave) APP.onSave();
};
const h = (s) =>
  s == null
    ? ""
    : String(s).replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
      );
const $ = (i) => document.getElementById(i),
  me = () => S.users[S.me],
  P = () => S.P.find((p) => p.id == V.id),
  nm = (k) => S.users[k].n;
function iso(d) {
  const z = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
const fd = (d) => {
  const t = new Date(d + "T00:00");
  return isNaN(t)
    ? "-"
    : `${t.getMonth() + 1}/${t.getDate()}(${DN[t.getDay()]})`;
};
const won = (n) => (+n || 0).toLocaleString("ko-KR") + "원";
function toast(m) {
  const e = document.createElement("div");
  e.className = "toast";
  e.textContent = m;
  document.body.append(e);
  setTimeout(() => e.remove(), 2400);
}
function stopMedia() {
  if (M) {
    M.getTracks().forEach((t) => t.stop());
    M = null;
  }
  if (AC) {
    AC.close();
    AC = null;
  }
  if (stream2) {
    stream2.getTracks().forEach((t) => t.stop());
    stream2 = null;
  }
}
function go(v, id) {
  scheduleEditing = false;
  stopMedia();
  hist.push([V.v, V.id]);
  V = { v, id };
  R();
  scrollTo(0, 0);
}
function back() {
  scheduleEditing = false;
  const p = hist.pop();
  stopMedia();
  if (p) {
    V = { v: p[0], id: p[1] };
  } else {
    V = { v: "home", id: undefined };
  }
  R();
  scrollTo(0, 0);
}
function swap(k) {
  if (LIVE) return;
  scheduleEditing = false;
  S.me = k;
  sv();
  R();
}
function upd(f) {
  f();
  sv();
  R();
}
const TT = {
  home: "홈",
  profile: "프로필",
  cal: "본가 방문 일정",
  songs: "노래방 선곡",
  new: "술약 제안",
  d: "술약",
  plan: "술자리 계획",
  cam: "사진 촬영",
  start: "술자리 시작",
  drunk: "오늘의 만취자",
  pay: "정산",
  rec: "술약 기록",
  arc: "아카이브",
};
function R() {
  // 서버 데이터가 바뀌어 보고 있던 술약이 사라졌으면 홈으로 (로그아웃·되돌림 때)
  if (V.id !== undefined && !S.P.find((p) => p.id == V.id)) {
    hist = [];
    V = { v: "home" };
  }
  $("top").innerHTML =
    `<div class="top">${V.v != "home" ? '<button class="u" onclick="back()" aria-label="뒤로">←</button>' : ""}<b>${TT[V.v]}</b><span class="u on" style="cursor:default" title="${h(nm(S.me))}">${S.me}</span><button class="u" onclick="APP.logout&&APP.logout()" aria-label="로그아웃">로그아웃</button></div>`;
  $("app").innerHTML = VW[V.v]();
  if (V.v == "home" && M && $("cam")) $("cam").srcObject = M;
  if (V.v == "cam") startCam();
  if (V.v == "start") startHandCam("sv", "start");
  if (V.v == "drunk" && DRK.ph === "aim") startHandCam("dv", "drunk");
}
const chipU = (k) =>
  `<span class="chip" style="background:${CL[k]};color:#161616">${h(nm(k))}</span>`;
const av = (k) =>
  `<div class="av" style="background:${CL[k]}">${S.users[k].e}</div>`;
function datesOf(v) {
  if (Array.isArray(v)) return v;
  if (v && v.a && v.d) {
    const out = [],
      a = new Date(v.a + "T00:00"),
      d = new Date(v.d + "T00:00");
    for (let x = new Date(a); x <= d; x.setDate(x.getDate() + 1))
      out.push(iso(x));
    return out;
  }
  return [];
}
function calendarGrid(only, editable = false) {
  const t = new Date(),
    d0 = new Date(t.getFullYear(), t.getMonth() + cm, 1),
    y = d0.getFullYear(),
    m = d0.getMonth(),
    n = new Date(y, m + 1, 0).getDate(),
    ks = only ? [only] : ["A", "B", "C"];
  let c =
    [...DN].map((x) => `<div class="h">${x}</div>`).join("") +
    '<div style="visibility:hidden;border:0"></div>'.repeat(d0.getDay());
  for (let d = 1; d <= n; d++) {
    const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      marked = editable
        ? scheduleDraft.includes(date)
        : ks.some((k) => datesOf(S.users[k].v).includes(date));
    c += `<div ${editable ? `role="button" tabindex="0" onclick="toggleScheduleDate('${date}')" onkeydown="if(event.key==='Enter'||event.key===' ')toggleScheduleDate('${date}')" style="cursor:pointer;${marked ? "background:#f6e4a8" : ""}"` : ""}>${d}${ks
      .map((k) => {
        const hit = datesOf(S.users[k].v).includes(date);
        const draft = editable && only === S.me && scheduleDraft.includes(date);
        return hit || draft
          ? `<i style="background:${CL[k]};height:9px"></i>`
          : '<i style="background:transparent"></i>';
      })
      .join("")}</div>`;
  }
  return `<div class="row"><button class="btn sm" onclick="cm--;R()">‹</button><b style="text-align:center">${y}년 ${m + 1}월</b><button class="btn sm" onclick="cm++;R()">›</button></div><div class="cal" style="margin-top:8px">${c}</div><div style="margin-top:8px">${ks.map(chipU).join("")}</div>`;
}
const VW = {
  home() {
    const ps = [...S.P].reverse();
    return `
<div class="card"><h3>제스처로 술약 제안하기</h3><div class="cam"><video id="cam" autoplay muted playsinline></video><div class="frame"></div><div class="big"><img class="g2" src="data:image/png;base64,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" alt="손목을 굽혀 옆을 가리키는 L자 손"><img class="g1" src="data:image/png;base64,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" alt="손목을 세워 위를 가리키는 손"></div></div>
<p class="sm" id="hint">학습한 손동작을 카메라에 보여 주세요. 모델이 손동작을 인식하고 입안에서 ‘똑!’ 소리가 나면 넘어가요.</p>
<div class="sm" id="gd"></div>
<span class="chip" id="cg">👆 손 제스처 대기</span><span class="chip" id="cs">🔊 ‘똑!’ 대기</span>
<button class="btn pri" onclick="startMedia()">카메라·마이크 켜기</button>
<details><summary>개발용 테스트 기능</summary><p class="sm">모델 연결이 안 될 때만 아래 버튼으로 테스트하세요.</p>
<button class="btn sm" onclick="G=Date.now();tick()">손 제스처 인식됨</button><button class="btn sm" onclick="SD=Date.now();tick()">‘똑!’ 인식됨</button><button class="btn sm" onclick="fire()">수동 실행</button></details></div>
<h2>친구들</h2>${["A", "B", "C"]
      .map((k) => {
        const u = S.users[k];
        return `<div class="card fr" onclick="go('profile','${k}')">${av(k)}<div><b>${h(u.n)}</b> ${k == S.me ? '<span class="chip">나</span>' : ""}<br><span class="chip ${FC[u.f]}">${u.f}</span><span class="sm">${h(u.a) || "귀가 주소 미등록"}</span></div><span>›</span></div>`;
      })
      .join("")}
<div class="card"><h3>📅 본가 방문 일정</h3>${calendarGrid()}</div>${songCard()}
${favCard()}<h2 style="margin-top:20px">술약 현황</h2>${
      ps
        .filter((p) => p.st != "ended")
        .map(pc)
        .join("") ||
      '<div class="card sm">아직 술약이 없어요. 제스처로 첫 술약을 제안해 보세요.</div>'
    }
<button class="btn" onclick="go('arc')">🗂 지난 술약 아카이브</button>

<p class="sm" style="margin-top:18px">로그인한 계정: ${h(nm(S.me))} · 데이터는 세 명이 실시간으로 함께 써요.</p>`;
  },
  profile() {
    const k = V.id,
      u = S.users[k],
      own = k === S.me;
    return `<div class="card fr">${av(k)}<div><b>${h(u.n)}</b><br><span class="sm">${own ? "내 프로필" : "친구 프로필 · 읽기 전용"}</span></div></div>
 ${
   own
     ? `<div class="card"><h3>이름 · 이미지</h3><input value="${h(u.n)}" maxlength="12" onchange="upd(()=>S.users['${k}'].n=this.value.trim()||S.users['${k}'].n)"><div style="margin-top:8px">${EM.map((e) => `<button class="btn sm" onclick="upd(()=>S.users['${k}'].e='${e}')">${e}</button>`).join("")}</div></div>
 <div class="card"><h3>재정 상태</h3>${FN.map((f) => `<button class="btn sm ${u.f == f ? (FC[f] === "ok" ? "grn" : "pri") : ""}" onclick="upd(()=>S.users['${k}'].f='${f}')">${f}${u.f == f ? " ✓" : ""}</button>`).join("")}<p class="sm">바꾸기 전까지 유지돼요.</p></div>
 <div class="card"><h3>귀가 주소</h3><input value="${h(u.a)}" placeholder="예: 서울시 ○○구 ○○동" onchange="upd(()=>S.users['${k}'].a=this.value.trim())"></div><div class="card"><h3>계좌번호</h3><input value="${h(u.bank || "")}" placeholder="은행명 계좌번호" maxlength="40" onchange="upd(()=>S.users['${k}'].bank=this.value.trim())"><p class="sm">프로필당 계좌 하나만 등록할 수 있어요. 수정하면 기존 계좌번호가 변경돼요.</p></div>
 <div class="card"><h3>노래방 선곡 (${u.s.length}곡)</h3><div class="row"><input id="profileSong" placeholder="곡 제목 - 가수" style="flex:3" onkeydown="if(event.key=='Enter')addSong('${k}')"><button class="btn sm" style="flex:1;margin-top:6px" onclick="addSong('${k}')">추가</button></div>${u.s.map((song, i) => `<div class="row" style="margin-top:6px"><span style="flex:4">🎵 ${h(song)}</span><button class="btn sm" onclick="upd(()=>S.users['${k}'].s.splice(${i},1))">삭제</button></div>`).join("") || '<span class="sm">등록된 곡이 없어요</span>'}</div>`
     : `<div class="card"><h3>프로필 정보</h3><p>재정 상태 · ${h(u.f)}</p><p>귀가 주소 · ${h(u.a) || "미등록"}</p><p>계좌번호 · ${h(u.bank) || "미등록"}</p></div><div class="card"><h3>노래방 선곡 (${u.s.length}곡)</h3>${u.s.map((song) => `<div style="padding:7px 4px;border-bottom:1px solid var(--sub)">🎵 ${h(song)}</div>`).join("") || '<span class="sm">등록된 곡이 없어요</span>'}</div>`
 }
 <div class="card"><h3>📅 본가 방문 일정</h3>${calendarGrid(k, own && scheduleEditing)}${own ? `<p class="sm">${scheduleEditing ? "달력의 날짜를 눌러 방문 일정을 추가하거나 해제하세요." : "등록된 날짜를 달력에서 확인할 수 있어요."}</p><button class="btn ${scheduleEditing ? "grn" : ""}" onclick="${scheduleEditing ? "saveSchedule('" + k + "')" : "editSchedule('" + k + "')"}">${scheduleEditing ? "저장" : "수정"}</button>` : `<p class="sm">${datesOf(u.v).length ? `방문 일정 ${datesOf(u.v).length}일 등록됨` : "등록된 방문 일정이 없어요."}</p>`}</div>`;
  },
  cal() {
    const u = me();
    return `<div class="card"><h3>본가 방문 일정</h3>${calendarGrid(S.me, scheduleEditing)}</div><button class="btn" onclick="${scheduleEditing ? "saveSchedule('" + S.me + "')" : "editSchedule('" + S.me + "')"}">${scheduleEditing ? "저장" : "수정"}</button>`;
  },
  songs() {
    const ks = ["A", "B", "C"],
      mg = {};
    ks.forEach((k) =>
      S.users[k].s.forEach((x) => {
        const q = x.trim().toLowerCase();
        (mg[q] = mg[q] || { s: x, w: [] }).w.push(k);
      }),
    );
    const mgBody =
      Object.values(mg)
        .map(
          (o) =>
            `<div style="padding:7px 4px;border-bottom:1px solid var(--sub)">🎵 ${h(o.s)} ${o.w.map(chipU).join("")}</div>`,
        )
        .join("") || '<p class="sm">등록된 곡이 없어요</p>';
    const tabs = `<div class="tabs">${[
      ["all", "통합"],
      ["ind", "개인별"],
    ]
      .map(
        ([k, l]) =>
          `<button class="btn sm ${(T == "all") == (k == "all") ? "pri" : ""}" onclick="T='${k}';R()">${l}</button>`,
      )
      .join("")}</div>`;
    const body =
      T == "all"
        ? mgBody
        : ks
            .map((k) => {
              const u = S.users[k];
              return `<section style="margin:12px 0 18px"><div class="row"><b style="flex:1">${av(k)} ${h(u.n)}</b><span class="chip">${u.s.length}곡</span></div>${u.s.map((song) => `<div style="padding:7px 4px;border-bottom:1px solid var(--sub)">🎵 ${h(song)}</div>`).join("") || '<p class="sm">등록된 곡이 없어요</p>'}</section>`;
            })
            .join("");
    return `${tabs}<div class="card"><h3>세 명의 노래방 선곡 리스트</h3>${body}</div><p class="sm">각자의 프로필에서 선곡을 추가하거나 삭제할 수 있어요. 이 화면에서는 세 명의 리스트를 한 번에 확인할 수 있어요.</p>`;
  },
  new() {
    const t = iso(new Date(Date.now() + 864e5 * 3));
    return `<div class="card"><h3>${h(nm(S.me))}의 술약 제안</h3><label class="sm">날짜<input type="date" id="nd" value="${t}"></label><label class="sm">시간<input type="time" id="nt" value="19:00"></label><button class="btn pri" onclick="addP()">제안하기</button><p class="sm">날짜와 시간은 하나씩만 정할 수 있어요. 나머지 두 친구에게 제안이 공유돼요.</p></div>`;
  },
  d() {
    const p = P(),
      ks = ["A", "B", "C"],
      ys = ks.filter((k) => p.votes[k] == "y").length,
      isP = p.by == S.me,
      [l, c] = ST[p.st];
    return `<div class="card"><span class="chip ${c}">${l}</span><h3 style="margin-top:6px">${fd(p.date)} ${p.time}</h3>제안자 ${chipU(p.by)}</div>
<div class="card"><h3>응답</h3>${ks
      .filter((k) => k != p.by)
      .map(
        (k) =>
          `<div class="fr" style="margin:6px 0">${av(k)}<div>${h(nm(k))}<br><span class="chip ${p.votes[k] == "y" ? "ok" : p.votes[k] == "n" ? "r" : ""}">${p.votes[k] == "y" ? "찬성 · 참석" : p.votes[k] == "n" ? "반대 · 불참" : "응답 전"}</span></div></div>`,
      )
      .join("")}
${!isP && p.st == "pending" ? `<div class="row"><button class="btn grn" onclick="vote('y')">👍 찬성(참석)</button><button class="btn pri" onclick="vote('n')">👎 반대(불참)</button></div>` : ""}
${
  false
    ? `<details style="margin-top:12px"><summary>개발용 테스트 · 응답 조작</summary><p class="sm">현재 사용자와 관계없이 두 친구의 응답을 직접 설정할 수 있어요.</p>${ks
        .filter((k) => k != p.by)
        .map(
          (k) =>
            `<div style="margin-top:10px"><b>${h(nm(k))}</b> ${p.votes[k] == "y" ? '<span class="chip ok">찬성 · 참석</span>' : p.votes[k] == "n" ? '<span class="chip r">반대 · 불참</span>' : '<span class="chip">응답 전</span>'}<div class="row"><button class="btn grn" onclick="voteAs('${k}','y')">찬성</button><button class="btn pri" onclick="voteAs('${k}','n')">반대</button><button class="btn" onclick="voteAs('${k}','')">응답 취소</button></div></div>`,
        )
        .join("")}</details>`
    : ""
}
${isP && p.st == "pending" ? (ys ? `<p class="sm">친구 ${ys}명이 찬성했어요. 최종 결정은 제안자에게 있어요.</p><div class="row"><button class="btn grn" onclick="decide('confirmed')">술약 성립</button><button class="btn" onclick="decide('cancelled')">성립 안 함</button></div>` : `<p class="sm">최소 한 명이 찬성하면 성립 여부를 결정할 수 있어요.</p><button class="btn" onclick="decide('cancelled')">제안 취소</button>`) : ""}</div>
${p.st == "confirmed" ? `<button class="btn pri" onclick="go('plan',${p.id})">📝 술자리 계획</button><button class="btn grn" onclick="openStart(${p.id})">🥂 술자리 시작 (V 별 제스처)</button>` : ""}
${p.st == "live" ? liveTiles(p) : ""}
${p.st == "ended" ? `<button class="btn pri" onclick="openRec(${p.id})">📖 술약 기록</button><button class="btn" onclick="go('pay',${p.id})">💸 정산 보기</button>` : ""}`;
  },
  plan() {
    const p = P(),
      l = p.pl,
      ks = ["A", "B", "C"],
      k = S.me,
      PRE = ["없음", "1~2잔", "반 병", "한 병+"];
    return `<div class="card"><h3>📍 장소</h3>${l.place ? `<div style="margin:6px 0"><span class="chip ok">${h(l.place)}</span>${/^https?:\/\//.test(l.link || "") ? `<a class="btn sm grn" style="text-decoration:none" href="${h(l.link)}" target="_blank" rel="noopener">지도 앱에서 열기</a>` : ""}</div>` : '<p class="sm">아직 정하지 않았어요. 아래에서 골라 주세요</p>'}${S.fav.map((f, i) => `<button class="btn sm ${l.place === f.n ? "grn" : ""}" onclick="pickPlace(${i})">${h(f.n)}</button>`).join("") || '<p class="sm">홈의 ⭐ 즐겨찾기에 먼저 등록해 주세요</p>'}<details style="margin-top:8px"><summary>즐겨찾기에 없는 새 장소</summary><div class="row"><input id="fn" placeholder="이름" style="flex:2"><input id="fl" placeholder="지도 링크(선택)" style="flex:3"></div><button class="btn" onclick="addFavPick()">즐겨찾기에 추가하고 선택</button></details></div>
<div class="card"><h3>📋 합류 전 한 잔 했어요?</h3><p class="sm">내 상태만 고를 수 있어요</p>${PRE.map((x) => `<button class="btn sm ${l.pre[k] === x ? "grn" : ""}" onclick="pl('pre.${k}','${x}')">${x}</button>`).join("")}${ks.map((x) => `<div class="sm">${chipU(x)} ${h(l.pre[x]) || "미선택"}</div>`).join("")}</div>
<div class="card"><h3>⏰ 함께 있을 수 있는 마지막 시간</h3><input type="time" value="${l.until[k]}" onchange="pl('until.${k}',this.value)">${ks.map((x) => `<div class="sm">${chipU(x)} ${l.until[x] || "미설정"}</div>`).join("")}</div>`;
  },
  start() {
    const p = P();
    if (!p) return "";
    if (p.st !== "confirmed")
      return '<div class="card">이미 시작했거나 시작할 수 없는 술약이에요.</div><button class="btn" onclick="back()">돌아가기</button>';
    return `<div class="card"><h3>🥂 술자리 시작</h3><div class="cam"><video id="sv" autoplay muted playsinline style="transform:none"></video><svg viewBox="0 0 100 100" style="position:absolute;inset:8%;width:84%;height:84%;z-index:2"><polygon points="${starPts()}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 3"/></svg></div><p class="sm" id="hs">카메라 준비 중…</p><div class="bar"><i id="hb" style="width:0%"></i></div><p class="sm">두 명은 양손, 한 명은 한 손으로 V(✌️)를 만들어 가운데로 모아 별을 만들어요. 남은 한 손으로 폰의 후면 카메라를 위에서 비춰 주세요.</p><details><summary>개발용 테스트 기능</summary><p class="sm">인식이 어려울 때만 사용하세요.</p><button class="btn sm" onclick="startLive()">별 인식 시뮬레이션</button></details></div>`;
  },
  drunk() {
    const p = P();
    if (!p) return "";
    const z = "position:absolute;border:3px dashed #fff;border-radius:16px;display:grid;place-items:center;color:#fff;font-weight:800;text-shadow:0 0 6px #000;z-index:2";
    return `<div class="card"><h3>🍺 오늘의 만취자 촬영</h3><div class="cam"><video id="dv" autoplay muted playsinline style="transform:none"></video><div style="${z};left:5%;top:6%;width:32%;height:30%">☝️ 검지 손</div><div style="${z};left:32%;right:5%;bottom:7%;height:46%">🥴 만취자</div></div><p class="sm" id="hs">카메라 준비 중…</p><div class="bar"><i id="hb" style="width:0%"></i></div><p class="sm">후면 카메라로 만취한 친구를 비추고, 검지 하나를 세운 손을 화면 왼쪽 위에 함께 담아요. 검지가 0.6초 인식되면 바로 찍혀요.</p><details><summary>개발용 테스트 기능</summary><button class="btn sm" onclick="capture()">수동 촬영 (검지 인식 시뮬레이션)</button></details></div>`;
  },
  cam() {
    const p = P();
    return `<div class="card"><div class="cam"><video id="cv" autoplay muted playsinline style="transform:none"></video><div class="big" id="cph" style="font-size:50px">📷</div></div><button class="btn pri" onclick="snap()">📸 촬영</button><p class="sm" id="cmsg">촬영한 사진은 이 술약의 기록에 저장돼요. 갤러리 사진은 종료 후 기록 페이지에서 추가해요.</p></div><div class="ph">${p.ph.map((x) => `<div><img src="${x}" alt="촬영 사진"></div>`).join("")}</div>`;
  },
  pay() {
    const p = P(),
      a = p.pay || { t: "", who: S.me, x: "" },
      r = calc(a.t, a.x);
    return `<div class="card"><h3>총 결제 금액</h3><label class="sm">결제한 사람<select id="pw" onchange="updPay()">${["A", "B", "C"].map((k) => `<option value="${k}" ${a.who == k ? "selected" : ""}>${h(nm(k))}</option>`).join("")}</select></label><div id="bankInfo" class="sm" style="margin-top:6px">${S.users[a.who].bank ? `입금 계좌: <b>${h(S.users[a.who].bank)}</b>` : "선택한 사람의 계좌번호가 등록되지 않았어요."}</div><input id="pt" type="number" inputmode="numeric" placeholder="총 결제 금액" value="${a.t}" oninput="updPay()">
<h3 style="margin-top:14px">🎁 선심 쓰기 (선택)</h3><input id="px" type="number" inputmode="numeric" placeholder="결제자가 추가로 부담할 금액" value="${a.x}" oninput="updPay()"><p class="sm">선심 쓰기 금액을 먼저 제외하고, 남은 금액을 세 명이 균등하게 나눠 부담해요.</p></div><div class="card" id="pr">${payHTML(a, r)}</div><button class="btn grn" onclick="savePay()">정산 저장</button>`;
  },
  rec() {
    const p = P();
    if (p.st != "ended")
      return '<div class="card">술자리를 종료하면 기록 페이지가 활성화돼요.</div>';
    return recPage(p, recEdit);
  },
  arc() {
    const l = S.P.filter((p) => p.st === "ended").sort(
      (a, b) =>
        new Date(b.date + "T" + (b.time || "00:00")) -
        new Date(a.date + "T" + (a.time || "00:00")),
    );
    const ph = l.reduce((n, p) => n + (p.ph || []).length, 0),
      tt = {};
    l.forEach((p) =>
      Object.entries(p.tot || {}).forEach(
        ([k, v]) => (tt[k] = (tt[k] || 0) + v),
      ),
    );
    const ts = Object.entries(tt)
      .filter((x) => x[1] > 0)
      .map(([k, v]) => `<span class="chip y">${h(k)} ${v}병</span>`)
      .join("");
    let last = "",
      out = "";
    l.forEach((p) => {
      const mo = p.date.slice(0, 7).replace("-", "년 ") + "월";
      if (mo !== last) {
        out += `<h2 style="margin:18px 0 4px">${mo}</h2>`;
        last = mo;
      }
      const dr = Object.entries(p.tot || {})
          .filter((x) => x[1] > 0)
          .map(([k, v]) => `<span class="chip">${h(k)} ${v}병</span>`)
          .join(""),
        m = (p.memo || "").trim().split("\n")[0],
        n = (p.ph || []).length;
      out += `<div class="card" style="cursor:pointer" onclick="openRec(${p.id})"><b>${p.title ? h(p.title) + " · " : ""}${fd(p.date)} ${h(p.time)}</b> ${rdText(p) ? "· 📍 " + h(rdText(p)) : ""}${
        n
          ? `<div class="ph" style="margin-top:8px">${p.ph
              .slice(0, 3)
              .map((x) => `<div><img src="${x}" alt="사진"></div>`)
              .join("")}</div>`
          : ""
      }<div style="margin-top:6px">${dr || '<span class="sm">음주량 기록 없음</span>'}</div>${m ? `<div class="sm" style="margin-top:6px">📝 ${h(m.slice(0, 40))}</div>` : ""}<div class="sm" style="margin-top:6px">제안 ${h(nm(p.by))} · 사진 ${n}장 · 열기 ›</div></div>`;
    });
    return `<div class="card"><h3>🗂 종료된 술약</h3><b>${l.length}번</b> · 사진 ${ph}장<div style="margin-top:6px">${ts || '<span class="sm">누적 음주량 기록 없음</span>'}</div></div>${out || '<div class="card sm">종료된 술약이 아직 없어요. 술자리 종료를 누르면 이곳에 저장돼요.</div>'}`;
  },
};
const pc = (p) =>
  `<div class="card fr" onclick="go('d',${p.id})"><div><span class="chip ${ST[p.st][1]}">${ST[p.st][0]}</span></div><div><b>${fd(p.date)} ${p.time}</b><br><span class="sm">제안 ${h(nm(p.by))}</span></div><span>›</span></div>`;
function calc(t, x) {
  t = Math.max(0, +t || 0);
  x = Math.max(0, Math.min(+x || 0, t));
  const share = t - x,
    b = Math.floor(share / 3),
    remainder = share - b * 3;
  return { b, pay: b + x + remainder, o: b, x, remainder, share };
}
function payHTML(a, r) {
  a.done = a.done || {};
  a.done[a.who] = true;
  const others = ["A", "B", "C"].filter((k) => k !== a.who);
  return `<b>${h(nm(a.who))} 결제 ${won(a.t)}</b><div class="sm">선심 쓰기 ${won(r.x)}를 제외한 ${won(r.share)}를 세 명이 균등 분할해요.</div><div class="payline" style="margin-top:10px">${chipU(a.who)} <span>선심 ${won(r.x)} + N빵 ${won(r.b)}${r.remainder ? ` + 잔여 ${won(r.remainder)}` : ""}</span><button class="btn sm grn" disabled>완료 ✓</button></div>${others.map((k) => `<div class="payline">${chipU(k)} <span>${won(r.o)} 보내기</span><button class="btn sm ${a.done[k] ? "grn" : ""}" onclick="togglePaid('${k}')">${a.done[k] ? "완료 ✓" : "완료"}</button></div>`).join("")}`;
}
function updPay() {
  const sp = P().pay,
    a = {
      t: $("pt").value,
      who: $("pw").value,
      x: $("px").value,
      done: { ...(sp && sp.who === $("pw").value ? sp.done : {}) },
    };
  $("pr").innerHTML = payHTML(a, calc(a.t, a.x));
  const b = S.users[a.who].bank;
  $("bankInfo").innerHTML = b
    ? `입금 계좌: <b>${h(b)}</b>`
    : "선택한 사람의 계좌번호가 등록되지 않았어요.";
}
function savePay() {
  const old = P().pay || {},
    a = {
      t: $("pt").value,
      who: $("pw").value,
      x: $("px").value,
      done: old.who && old.who !== $("pw").value ? {} : { ...(old.done || {}) },
    };
  if (!(+a.t > 0)) return toast("총 결제 금액을 입력해 주세요");
  a.done[a.who] = true;
  upd(() => (P().pay = a));
  toast("정산을 저장했어요");
}
function togglePaid(k) {
  const a = P().pay;
  if (!a) return toast("먼저 정산 저장을 눌러 주세요");
  a.done = a.done || {};
  a.done[k] = !a.done[k];
  a.done[a.who] = true;
  sv();
  R();
}
function addP() {
  const d = $("nd").value,
    t = $("nt").value;
  if (!d || !t) return toast("날짜와 시간을 모두 정해 주세요");
  const p = {
    id: Date.now(),
    by: S.me,
    date: d,
    time: t,
    votes: {},
    st: "pending",
    pl: {
      place: "",
      addr: "",
      link: "",
      menus: [],
      drinks: { A: [], B: [], C: [] },
      pre: { A: "", B: "", C: "" },
      until: { A: "", B: "", C: "" },
      kr: null,
    },
    ph: [],
    tot: {},
    memo: "",
    pay: null,
  };
  S.P.push(p);
  sv();
  stopMedia();
  V = { v: "d", id: p.id };
  R();
  scrollTo(0, 0);
}
const vote = (v) => upd(() => (P().votes[S.me] = v)),
  voteAs = (k, v) =>
    upd(() => {
      if (v) P().votes[k] = v;
      else delete P().votes[k];
    }),
  decide = (s) => upd(() => (P().st = s));
function liveTiles(p) {
  const l = p.pl || {},
    tile = (cls, bg, ico, label, sub, on) =>
      `<button class="btn ${cls}" style="margin:0;min-height:138px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;box-shadow:3px 3px 0 var(--ink);${bg ? "background:" + bg + ";color:#161616;" : ""}" onclick="${on}"><span style="font-size:38px;line-height:1.1">${ico}</span><span style="font-size:17px">${label}</span><span style="font-size:12px;font-weight:700;opacity:.75">${sub}</span></button>`;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">${tile("pri", "", "📸", "사진 촬영", "사진 " + (p.ph || []).length + "장", `go('cam',${p.id})`)}${tile("", "", "📝", "술자리 계획", l.place ? h(l.place) : "장소 미정", `go('plan',${p.id})`)}${tile("", "var(--yel)", "🍺", "만취자 촬영", p.drunk ? "✓ 남겼어요" : "검지로 찰칵", `openDrunk(${p.id})`)}${tile("grn", "", "💸", "정산", p.pay && p.pay.t ? won(p.pay.t) : "입력 전", `go('pay',${p.id})`)}</div><div style="text-align:right;margin-top:12px"><button class="btn sm" style="margin:0" onclick="endP()">🥂 술자리 종료</button></div>`;
}
function recentSongs(n) {
  const lst = ["A", "B", "C"].flatMap((k) => S.users[k].s.map((x) => ({ k, s: x }))),
    has = (e) => lst.some((q) => q.k === e.k && q.s === e.s),
    log = (S.sl || []).filter(has),
    legacy = lst.filter((q) => !log.some((e) => e.k === q.k && e.s === q.s)),
    all = [...legacy, ...log].reverse(),
    seen = new Set(),
    out = [];
  for (const e of all) {
    const key = e.k + "|" + e.s;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out.slice(0, n);
}
function songCard() {
  const r = recentSongs(4),
    uniq = new Set(["A", "B", "C"].flatMap((k) => S.users[k].s.map((x) => x.trim().toLowerCase()))).size;
  return `<div class="card"><h3>🎤 노래방 선곡 <span class="sm">최근 등록 · 총 ${uniq}곡</span></h3>${r.map((e) => `<div class="row" style="flex-wrap:nowrap;margin:6px 0"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🎵 ${h(e.s)}</span><span style="flex:none">${chipU(e.k)}</span></div>`).join("") || '<p class="sm">아직 등록된 곡이 없어요. 프로필에서 추가해 보세요</p>'}<button class="btn" onclick="T='all';go('songs')">전체 보기${uniq ? " (" + uniq + "곡)" : ""}</button></div>`;
}
function addSong(k) {
  const el = $("profileSong"),
    v = el && el.value.trim();
  if (!v) return;
  if (S.users[k].s.some((x) => x.toLowerCase() == v.toLowerCase()))
    return toast("이미 등록된 곡이에요");
  upd(() => {
    S.users[k].s.push(v);
    (S.sl = S.sl || []).push({ k, s: v, at: Date.now() });
  });
}
let recEdit = false;
function openRec(id) {
  recEdit = false;
  go("rec", id);
}
const rdText = (p) =>
  (p.rounds || (p.pl && p.pl.place ? [{ place: p.pl.place }] : []))
    .map((x) => x.place)
    .filter(Boolean)
    .join(" → ");
function recPage(p, ed) {
  const l = p.pl || {},
    ks = ["A", "B", "C"],
    tt = Object.entries(p.tot || {}).filter((x) => x[1] > 0),
    dw = DN[new Date(p.date + "T00:00").getDay()],
    ph = p.ph || [];
  const strip = `<div class="ps">${ph.map((x, i) => `<div class="pt"><img src="${x}" alt="사진">${ed ? `<button class="dk x" onclick="upd(()=>P().ph.splice(${i},1))" aria-label="사진 삭제">×</button>` : ""}</div>`).join("")}${ed ? `<label class="pt add2">＋ 사진 추가<input type="file" accept="image/*" multiple hidden onchange="gal(this.files)"></label>` : ph.length ? "" : '<div class="pt add2">사진 없음</div>'}</div>`;
  const head = `<div class="bx"><div class="row2"><div class="tt">${ed ? `<input class="dki" value="${h(p.title)}" maxlength="30" placeholder="제목" oninput="P().title=this.value;sv()">` : h(p.title) || '<span class="s2">제목 없음</span>'}</div><div class="s2">${p.date.replace(/-/g, ".")} (${dw})</div></div>${ed ? `<textarea class="memo" rows="5" placeholder="셋이 함께 쓰는 기록 내용" oninput="P().memo=this.value;sv()">${h(p.memo)}</textarea>` : `<div class="memo">${h(p.memo) || '<span class="s2">아직 적은 내용이 없어요. ‘기록 수정’에서 적어 보세요.</span>'}</div>`}</div>`;
  const dr = `<div class="bx"><div class="dl">주종 · 병 수</div>${ed ? [...new Set([...DR, ...Object.keys(p.tot || {})])].map((d) => `<div class="sr"><span>${h(d)}</span><button class="dk" onclick="tot('${d}',-1)" aria-label="${h(d)} 줄이기">−</button><b>${(p.tot || {})[d] || 0}</b><button class="dk" onclick="tot('${d}',1)" aria-label="${h(d)} 늘리기">＋</button></div>`).join("") + `<div class="sr"><input id="tn" class="dki" placeholder="직접 입력" style="min-width:0"><button class="dk" onclick="addT()" aria-label="추가">＋</button></div>` : tt.map(([k, v]) => `<div>${h(k)} <b>${v}병</b></div>`).join("") || '<span class="s2">기록 없음</span>'}</div>`;
  const ut = ks.filter((k) => l.until && l.until[k]),
    pre = ks.filter((k) => l.pre && l.pre[k]);
  if (!p.rounds)
    p.rounds = l.place ? [{ place: l.place, addr: l.addr || "" }] : [];
  const rd = ed
    ? p.rounds
        .map(
          (r, i) =>
            `<div style="margin:6px 0"><div class="row2"><b>${i + 1}차</b><button class="dk" style="min-width:32px;min-height:32px;padding:0" onclick="upd(()=>P().rounds.splice(${i},1))" aria-label="${i + 1}차 삭제">×</button></div><input class="dki" style="width:100%;margin:2px 0" value="${h(r.place)}" placeholder="장소명" oninput="P().rounds[${i}].place=this.value;sv()"><div>${S.fav.map((f, j) => `<button class="dk" style="min-height:30px;margin:3px 3px 0 0;font-size:15px" onclick="pickRound(${i},${j})">${h(f.n)}</button>`).join("")}</div></div>`,
        )
        .join("") +
      `<button class="dk" onclick="upd(()=>P().rounds.push({place:'',addr:''}))">＋ ${p.rounds.length + 1}차 추가</button>`
    : p.rounds
        .map((r, i) =>
          r.place
            ? `<div>${i + 1}차 📍 <span class="ov">${h(r.place)}</span>${r.addr ? '<div class="s2">' + h(r.addr) + "</div>" : ""}</div>`
            : "",
        )
        .join("") || '<span class="s2">미입력</span>';
  if (p.kr === undefined) p.kr = l.kr == null ? null : l.kr;
  const kr = ed
    ? `<button class="dk ${p.kr === true ? "on" : ""}" onclick="upd(()=>P().kr=true)">드감</button> <button class="dk ${p.kr === false ? "on" : ""}" onclick="upd(()=>P().kr=false)">안드감</button>`
    : "🎤 " + (p.kr === true ? "드감" : p.kr === false ? "안드감" : "미정");
  const side = `<div class="bx"><div class="dl">장소</div>${rd}<div class="dl">노래방</div>${kr}<div class="dl">부차적 요소</div>${pre.map((k) => `<div>${h(nm(k))} 합류 전: ${h(l.pre[k])}</div>`).join("")}${ut.map((k) => `<div>${h(nm(k))} ~${h(l.until[k])}</div>`).join("")}${!pre.length && !ut.length ? '<span class="s2">없음</span>' : ""}</div>`;
  const pay = `<div class="bx"><div class="dl">정산 금액</div>${p.pay && p.pay.t ? `<div class="tt">${won(p.pay.t)}</div>${payHTML(p.pay, calc(p.pay.t, p.pay.x))}` : '<span class="s2">정산 전이에요</span>'}${ed ? `<div><button class="dk" onclick="go('pay',${p.id})">정산 입력·수정</button></div>` : ""}</div>`;
  const dkBox = p.drunk
    ? `<div class="bx"><div class="dl">🍺 오늘의 만취자</div><div class="pt" style="width:62%"><img src="${p.drunk.img}" alt="오늘의 만취자"></div>${ed ? `<div style="margin-top:8px"><button class="dk" onclick="openDrunk(${p.id})">다시 찍기</button> <button class="dk" onclick="upd(()=>delete P().drunk)">삭제</button></div>` : ""}</div>`
    : ed
      ? `<div class="bx"><div class="dl">🍺 오늘의 만취자</div><button class="dk" onclick="openDrunk(${p.id})">만취자 사진 남기기</button></div>`
      : "";
  return `<div class="dy2">${strip}${head}${dkBox}<div class="g2c">${dr}${side}</div>${pay}</div>
<button class="btn ${ed ? "grn" : "pri"}" onclick="recEdit=${!ed};R();scrollTo(0,0)">${ed ? "저장하고 기록 보기" : "✏️ 기록 수정"}</button>`;
}
function ask(msg, ok) {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML =
    '<div class="card"><p style="margin:0 0 6px;font-weight:800">' +
    h(msg) +
    '</p><div class="row"><button class="btn" id="ask0">취소</button><button class="btn pri" id="ask1">확인</button></div></div>';
  document.body.append(m);
  m.querySelector("#ask0").onclick = () => m.remove();
  m.querySelector("#ask1").onclick = () => {
    m.remove();
    ok();
  };
}
function endP() {
  const p = P();
  if (!p) return toast("술약 정보를 찾을 수 없어요");
  ask("술자리를 종료하고 이 술자리의 기록 화면으로 이동할까요?", () => {
    const q = S.P.find((x) => x.id === p.id);
    if (!q) return;
    q.st = "ended";
    q.endedAt = new Date().toISOString();
    sv();
    stopMedia();
    hist = [
      ["home", undefined],
      ["arc", undefined],
    ];
    recEdit = true;
    V = { v: "rec", id: p.id };
    R();
    scrollTo(0, 0);
    toast("술자리가 종료되어 아카이브에 저장됐어요");
  });
}
function favCard() {
  return `<div class="card"><h3>⭐ 즐겨찾기 장소</h3>${S.fav.map((f, i) => `<div class="row" style="margin:6px 0"><span style="flex:4">${/^https?:\/\//.test(f.link || "") ? `<a href="${h(f.link)}" target="_blank" rel="noopener">📍 ${h(f.n)}</a>` : "📍 " + h(f.n)}</span><button class="btn sm" onclick="delFav(${i})" aria-label="${h(f.n)} 삭제">삭제</button></div>`).join("") || '<p class="sm">자주 가는 곳을 등록해 두면 계획에서 탭 한 번으로 골라요</p>'}<div class="row"><input id="fn" placeholder="이름" style="flex:2"><input id="fl" placeholder="지도 링크(선택)" style="flex:3"></div><button class="btn" onclick="addFav()">＋ 즐겨찾기 추가</button></div>`;
}
function readFav() {
  const n = $("fn").value.trim(),
    l = $("fl").value.trim();
  if (!n) {
    toast("이름을 입력해 주세요");
    return null;
  }
  if (l && !/^https?:\/\//.test(l)) {
    toast("링크는 https://로 시작해야 해요");
    return null;
  }
  return { n, link: l };
}
function addFav() {
  const f = readFav();
  if (!f) return;
  if (S.fav.some((x) => x.n === f.n)) return toast("이미 등록된 곳이에요");
  upd(() => S.fav.push(f));
}
function addFavPick() {
  const f = readFav();
  if (!f) return;
  upd(() => {
    if (!S.fav.some((x) => x.n === f.n)) S.fav.push(f);
    const l = P().pl;
    l.place = f.n;
    l.link = f.link;
    l.addr = "";
  });
}
function delFav(i) {
  upd(() => S.fav.splice(i, 1));
}
function pickPlace(i) {
  const f = S.fav[i];
  upd(() => {
    const l = P().pl;
    l.place = f.n;
    l.link = f.link || "";
    l.addr = "";
  });
}
function pickRound(i, j) {
  upd(() => {
    P().rounds[i].place = S.fav[j].n;
  });
}
function pl(path, val) {
  const l = P().pl,
    [a, b] = path.split(".");
  b ? (l[a][b] = val) : (l[a] = val);
  sv();
  R();
}
function addM() {
  const v = $("mn").value.trim();
  if (!v) return;
  const l = P().pl.menus;
  if (l.some((m) => m.n == v)) return toast("이미 있는 메뉴예요");
  upd(() => l.push({ n: v, v: [] }));
}
function addD() {
  const v = $("dn").value.trim();
  if (!v) return;
  upd(() => {
    const a = P().pl.drinks[S.me];
    a.includes(v) || a.push(v);
  });
}
function addS() {
  const v = $("sg").value.trim();
  if (!v) return;
  if (me().s.some((s) => s.toLowerCase() == v.toLowerCase()))
    return toast("이미 등록된 곡이에요");
  upd(() => {
    me().s.push(v);
    (S.sl = S.sl || []).push({ k: S.me, s: v, at: Date.now() });
  });
}
function editSchedule(k) {
  if (k !== S.me) return;
  scheduleDraft = datesOf(S.users[k].v).slice();
  scheduleEditing = true;
  R();
}
function toggleScheduleDate(date) {
  if (!scheduleEditing) return;
  const i = scheduleDraft.indexOf(date);
  if (i >= 0) scheduleDraft.splice(i, 1);
  else scheduleDraft.push(date);
  scheduleDraft.sort();
  R();
}
function saveSchedule(k) {
  if (k !== S.me) return;
  S.users[k].v = scheduleDraft.slice();
  scheduleEditing = false;
  sv();
  R();
  toast("본가 방문 일정이 저장됐어요");
}
function tot(d, n) {
  upd(() => {
    const t = (P().tot = P().tot || {});
    t[d] = Math.max(0, (t[d] || 0) + n);
  });
}
function addT() {
  const v = $("tn").value.trim();
  if (v) tot(v, 1);
}
function shrink(src, cb) {
  const i = new Image();
  i.onload = () => {
    const w = Math.min(360, i.width),
      c = document.createElement("canvas");
    c.width = w;
    c.height = (i.height * w) / i.width;
    c.getContext("2d").drawImage(i, 0, 0, c.width, c.height);
    cb(c.toDataURL("image/jpeg", 0.7));
  };
  i.src = src;
}
function gal(fs) {
  [...fs].forEach((f) => {
    const r = new FileReader();
    r.onload = () => shrink(r.result, (u) => upd(() => P().ph.push(u)));
    r.readAsDataURL(f);
  });
}
// ───── 손 인식 (MediaPipe Hand Landmarker) : 술자리 시작(V 별) / 오늘의 만취자(검지) ─────
const MP_VER = "0.10.14",
  MP_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VER + "/wasm",
  MP_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  V_MIN = 4, // 별에 필요한 V 손 개수 (2명 양손 + 1명 한 손 = 5. 엄격하게 하려면 5로)
  STAR_R = 4.5, // V 손들이 모여 있다고 보는 거리 (손 크기의 배수). 인식이 안 되면 올리세요
  START_HOLD = 1000, // 별을 이 시간(ms) 유지해야 시작
  POINT_HOLD = 600; // 검지를 이 시간(ms) 유지해야 촬영 시작
let hl = null,
  hlPromise = null,
  hRun = 0,
  hLast = 0,
  HS = { since: 0, last: 0, busy: 0 },
  DRK = { ph: "aim", img: null };
const dst = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function fingerState(lm) {
  const size = dst(lm[0], lm[9]) || 1e-6,
    ext = (t, p) => dst(lm[0], lm[t]) > dst(lm[0], lm[p]) * 1.12;
  return { size, i: ext(8, 6), m: ext(12, 10), r: ext(16, 14), p: ext(20, 18) };
}
function isV(lm) {
  const f = fingerState(lm);
  return f.i && f.m && !f.r && !f.p && dst(lm[8], lm[12]) > f.size * 0.35;
}
function isPoint(lm) {
  const f = fingerState(lm);
  return f.i && !f.m && !f.r && !f.p;
}
function starOk(hands) {
  const v = hands.filter(isV);
  if (v.length < V_MIN) return { n: v.length, ok: false };
  const c = v.map((lm) => ({
      x: (lm[0].x + lm[9].x) / 2,
      y: (lm[0].y + lm[9].y) / 2,
      s: dst(lm[0], lm[9]),
    })),
    cx = c.reduce((a, b) => a + b.x, 0) / c.length,
    cy = c.reduce((a, b) => a + b.y, 0) / c.length,
    sz = c.reduce((a, b) => a + b.s, 0) / c.length;
  return {
    n: v.length,
    ok: c.every((q) => Math.hypot(q.x - cx, q.y - cy) < sz * STAR_R),
  };
}
function starPts() {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 17 : 42,
      a = (Math.PI / 5) * i - Math.PI / 2;
    p.push((50 + r * Math.cos(a)).toFixed(1) + "," + (50 + r * Math.sin(a)).toFixed(1));
  }
  return p.join(" ");
}
async function loadHL() {
  if (hl) return hl;
  if (!hlPromise)
    hlPromise = (async () => {
      const { FilesetResolver, HandLandmarker } = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VER + "/+esm"
      );
      const files = await FilesetResolver.forVisionTasks(MP_WASM),
        mk = (d) =>
          HandLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: MP_MODEL, delegate: d },
            runningMode: "VIDEO",
            numHands: 6,
            minHandDetectionConfidence: 0.4,
            minHandPresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          });
      try {
        return await mk("GPU");
      } catch (e) {
        return await mk("CPU");
      }
    })();
  try {
    hl = await hlPromise;
  } catch (e) {
    hlPromise = null;
    throw e;
  }
  return hl;
}
const hStat = (t, pct) => {
  const e = $("hs"),
    b = $("hb");
  if (e) e.textContent = t;
  if (b && pct != null) b.style.width = Math.round(pct * 100) + "%";
};
async function startHandCam(vid, screen) {
  const run = ++hRun;
  stopMedia();
  HS = { since: 0, last: 0, busy: HS.busy };
  try {
    stream2 = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch (e) {
    return hStat("카메라를 쓸 수 없어요. 권한을 확인하거나 아래 테스트 버튼을 사용하세요");
  }
  const v = $(vid);
  if (!v || run !== hRun) {
    stream2 && stream2.getTracks().forEach((t) => t.stop());
    stream2 = null;
    return;
  }
  v.srcObject = stream2;
  hStat("손 인식 모델을 불러오는 중…");
  try {
    await loadHL();
  } catch (e) {
    console.error("HandLandmarker load error", e);
    return hStat("손 인식 모델 연결 실패(인터넷 확인). 아래 테스트 버튼을 사용하세요");
  }
  hStat(screen === "start" ? "V 손을 모아 별을 만들어 주세요" : "검지 하나만 세워 보여 주세요", 0);
  handLoop(run, screen, vid);
}
function handLoop(run, screen, vid) {
  if (run !== hRun || V.v !== screen || !hl) return;
  const v = $(vid),
    now = performance.now();
  if (v && now - hLast >= 100 && v.readyState >= 2 && v.videoWidth) {
    hLast = now;
    try {
      handStep(screen, hl.detectForVideo(v, now).landmarks || []);
    } catch (e) {
      console.warn("hand detect failed", e);
    }
  }
  requestAnimationFrame(() => handLoop(run, screen, vid));
}
function handStep(screen, lms) {
  if (HS.busy) return;
  const t = Date.now();
  if (screen === "start") {
    const r = starOk(lms);
    if (r.ok) {
      if (!HS.since) HS.since = t;
      HS.last = t;
    } else if (t - HS.last > 300) HS.since = 0;
    const pr = HS.since ? Math.min(1, (t - HS.since) / START_HOLD) : 0;
    hStat(
      "V 손 " + r.n + "/" + V_MIN + " 인식" +
        (r.ok ? " · 별이 모였어요! 유지해 주세요" : r.n >= V_MIN ? " · 더 가까이 모아 주세요" : ""),
      pr,
    );
    if (pr >= 1) startLive();
  } else if (screen === "drunk" && DRK.ph === "aim") {
    const pt = lms.some(isPoint);
    if (pt) {
      if (!HS.since) HS.since = t;
      HS.last = t;
    } else if (t - HS.last > 250) HS.since = 0;
    const pr = HS.since ? Math.min(1, (t - HS.since) / POINT_HOLD) : 0;
    hStat(pt ? "☝️ 검지 인식 중… 유지해 주세요" : "검지 하나만 세워 보여 주세요", pr);
    if (pr >= 1) {
      HS.since = 0;
      capture();
    }
  }
}
function openStart(id) {
  HS = { since: 0, last: 0, busy: 0 };
  go("start", id);
}
function startLive() {
  const p = P();
  if (!p || p.st !== "confirmed" || HS.busy) return;
  HS.busy = 1;
  hRun++;
  stopMedia();
  const e = document.createElement("div");
  e.className = "pop";
  e.textContent = "짠!";
  document.body.append(e);
  setTimeout(() => {
    e.remove();
    const q = S.P.find((x) => x.id === p.id);
    if (q) {
      q.st = "live";
      q.startedAt = new Date().toISOString();
    }
    sv();
    HS.busy = 0;
    back();
    toast("술자리가 시작됐어요!");
  }, 800);
}
function openDrunk(id) {
  DRK = { ph: "aim", img: null };
  HS = { since: 0, last: 0, busy: 0 };
  go("drunk", id);
}
function capture() {
  if (V.v !== "drunk" || DRK.ph !== "aim") return;
  DRK.ph = "done";
  const p = P(),
    v = $("dv"),
    c = document.createElement("canvas");
  if (stream2 && v && v.videoWidth) {
    c.width = Math.min(480, v.videoWidth);
    c.height = Math.round((v.videoHeight * c.width) / v.videoWidth);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  } else {
    c.width = 480;
    c.height = 360;
    const x = c.getContext("2d");
    x.fillStyle = "#f6b73c";
    x.fillRect(0, 0, 480, 360);
    x.font = "150px serif";
    x.textAlign = "center";
    x.fillText("🥴", 240, 230);
  }
  hRun++;
  stopMedia();
  if (!p) return;
  p.drunk = { img: c.toDataURL("image/jpeg", 0.7), at: new Date().toISOString() };
  sv();
  toast("오늘의 만취자 사진을 저장했어요");
  back();
}
async function startCam() {
  try {
    stream2 = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    $("cv").srcObject = stream2;
    $("cph").style.display = "none";
  } catch (e) {
    $("cmsg").textContent =
      "카메라를 쓸 수 없어요. 브라우저 권한을 확인해 주세요.";
  }
}
function snap() {
  const v = $("cv");
  if (!stream2 || !v.videoWidth)
    return toast("카메라가 아직 준비되지 않았어요");
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  shrink(c.toDataURL(), (u) => {
    P().ph.push(u);
    sv();
    const g = document.querySelector(".ph");
    R();
    toast("사진을 저장했어요");
  });
}
function fake() {
  const c = document.createElement("canvas");
  c.width = c.height = 360;
  const x = c.getContext("2d");
  x.fillStyle = ["#fd6f75", "#6ecb7c", "#f6b73c"][P().ph.length % 3];
  x.fillRect(0, 0, 360, 360);
  x.font = "160px serif";
  x.textAlign = "center";
  x.fillText(["🍻", "🍶", "🥂"][P().ph.length % 3], 180, 230);
  P().ph.push(c.toDataURL("image/jpeg", 0.7));
  sv();
  R();
}
function loadTMscript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((x) => x.src === src);
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => {
      el.dataset.loaded = "1";
      resolve();
    };
    el.onerror = reject;
    document.head.appendChild(el);
  });
}
// ───── 손동작 인식 (Teachable Machine) ─────
// 클래스 구성: ① side(옆)+up(위) 두 자세를 학습하면 "옆 → 위" 순서로 인식 (권장)
//             ② 위 이름이 없으면 기존처럼 TM_TARGET_LABEL("gesture") 한 클래스만 인식
const TM_THRESH = 0.88; // 이 확률 이상이어야 인식으로 침 (오인식 많으면 올리고, 인식 안 되면 내리세요)
const TM_FRAMES = 3; // 단일 클래스 모드: 연속 몇 번 인식돼야 하는지
const TM_SEQ_MS = 2500; // 순서 모드: 옆 자세 후 이 시간 안에 위 자세가 나와야 함
const TM_FLIP = true; // TM 사이트 웹캠은 좌우 반전으로 학습돼요. 인식이 이상하면 false로 바꿔 보세요
let tmRun = 0,
  tmMode = null,
  tmSideAt = 0,
  tmSideN = 0,
  tmUpN = 0;
async function startTM() {
  const run = ++tmRun;
  try {
    if (!tmModel) {
      if (!tmScriptPromise)
        tmScriptPromise = (async () => {
          await loadTMscript(
            "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js",
          );
          await loadTMscript(
            "https://cdn.jsdelivr.net/npm/@teachablemachine/image@latest/dist/teachablemachine-image.min.js",
          );
        })();
      await tmScriptPromise;
      tmModel = await tmImage.load(
        TM_URL + "model.json",
        TM_URL + "metadata.json",
      );
    }
    const labels = tmModel.getClassLabels();
    console.log("Teachable Machine labels:", labels);
    const side = labels.find((x) => /^(side|옆)/i.test(x.trim())),
      up = labels.find((x) => /^(up|위)/i.test(x.trim())),
      target =
        labels.find(
          (x) => x.trim().toUpperCase() === TM_TARGET_LABEL.trim().toUpperCase(),
        ) || labels.find((x) => /cross|교차/i.test(x));
    if (side && up) tmMode = { side, up };
    else if (target) tmMode = { target };
    else {
      toast("클래스 이름을 확인해야 해요: " + labels.join(", "));
      return;
    }
    toast(
      tmMode.target
        ? "손동작 모델 연결 완료: " + tmMode.target
        : "손동작 모델 연결 완료: 옆 → 위 순서로 인식해요",
    );
    tmStable = tmSideN = tmUpN = tmSideAt = 0;
    tmLoop(run);
  } catch (e) {
    console.error("TM load/predict error", e);
    toast("손동작 모델 연결 실패. 모델 링크와 인터넷 연결을 확인해 주세요.");
  }
}
function tmStep(preds) {
  const top = preds.reduce((a, b) => (b.probability > a.probability ? b : a)),
    now = Date.now(),
    p = (n) => (preds.find((x) => x.className === n) || { probability: 0 }).probability,
    g = $("gd");
  if (g)
    g.textContent =
      "모델이 보는 것: " + top.className + " " + Math.round(top.probability * 100) + "%" +
      (tmMode.side ? (tmSideAt && now - tmSideAt < TM_SEQ_MS ? " · 옆 확인 → 위로!" : " · 옆 자세 대기") : "");
  if (tmMode.target) {
    if (p(tmMode.target) >= TM_THRESH) {
      if (++tmStable >= TM_FRAMES) G = now;
    } else tmStable = 0;
    return;
  }
  if (p(tmMode.side) >= TM_THRESH) {
    if (++tmSideN >= 2) tmSideAt = now;
  } else tmSideN = 0;
  if (tmSideAt && now - tmSideAt > TM_SEQ_MS) tmSideAt = 0;
  if (p(tmMode.up) >= TM_THRESH) {
    if (tmSideAt && ++tmUpN >= 2) {
      G = now;
      tmSideAt = tmUpN = 0;
    }
  } else tmUpN = 0;
}
async function tmLoop(run) {
  if (run !== tmRun || !M || V.v !== "home" || !tmModel) return;
  const v = $("cam"),
    now = performance.now();
  if (v && now - tmLast >= 130 && !tmBusy && v.readyState >= 2 && v.videoWidth) {
    tmLast = now;
    tmBusy = true;
    try {
      tmStep(await tmModel.predict(v, TM_FLIP));
    } catch (e) {
      console.warn("TM prediction failed", e);
    } finally {
      tmBusy = false;
    }
  }
  requestAnimationFrame(() => tmLoop(run));
}
async function startMedia() {
  try {
    M = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true,
    });
  } catch (e) {
    try {
      M = await navigator.mediaDevices.getUserMedia({ audio: true });
      toast("카메라 없이 마이크만 켰어요");
    } catch (e2) {
      return toast("권한이 없어 켤 수 없어요. 테스트 버튼을 사용하세요");
    }
  }
  if (M.getVideoTracks().length) {
    const v = $("cam");
    let started = false;
    const go2 = () => {
      if (!started) {
        started = true;
        startTM();
      }
    };
    v.srcObject = M;
    v.onloadeddata = go2;
    if (v.readyState >= 2) go2();
  } else toast("손동작 인식에는 카메라 권한이 필요해요");
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const an = AC.createAnalyser();
    an.fftSize = 1024;
    AC.createMediaStreamSource(M).connect(an);
    const buf = new Float32Array(1024),
      ctx = AC;
    (function lp() {
      if (AC !== ctx) return;
      an.getFloatTimeDomainData(buf);
      let pk = 0;
      for (const x of buf) pk = Math.max(pk, Math.abs(x));
      const n = Date.now();
      if (pk > 0.2 && pk > base * 5 && n - lastHit > 500) {
        lastHit = n;
        SD = n;
      } else base = base * 0.97 + Math.min(pk, 0.3) * 0.03;
      requestAnimationFrame(lp);
    })();
  } catch (e) {
    toast("마이크를 시작하지 못했어요");
  }
}
function tick() {
  if (V.v != "home" || !$("cg")) return;
  const n = Date.now(),
    g = n - G < 4000,
    s = n - SD < 4000;
  $("cg").className = "chip " + (g ? "ok" : "");
  $("cg").textContent = "👆 손 제스처 " + (g ? "인식됨" : "대기");
  $("cs").className = "chip " + (s ? "ok" : "");
  $("cs").textContent = "🔊 ‘똑!’ " + (s ? "인식됨" : "대기");
  if (g && s) fire();
}
setInterval(tick, 200);
function fire() {
  if (firing) return;
  firing = 1;
  G = SD = 0;
  const e = document.createElement("div");
  e.className = "pop";
  e.textContent = "똑!";
  document.body.append(e);
  setTimeout(() => {
    e.remove();
    firing = 0;
    go("new");
  }, 800);
}
function demo() {
  S = mk();
  const t = new Date(),
    y = t.getFullYear(),
    m = String(t.getMonth() + 1).padStart(2, "0");
  S.fav = [
    { n: "연남동 포차", link: "" },
    { n: "부평 막걸리집", link: "" },
    { n: "코인노래방", link: "" },
  ];
  S.users.A.a = "서울시 마포구 연남동";
  S.users.B.a = "인천시 부평구 부평동";
  S.users.C.a = "수원시 팔달구 인계동";
  S.users.A.f = "가난";
  S.users.B.f = "부유";
  S.users.A.s = ["취중진담 - 김동률"];
  S.users.B.s = ["취중진담 - 김동률", "밤편지 - 아이유"];
  S.users.C.s = ["Hype Boy - NewJeans"];
  S.users.A.v = Array.from(
    { length: 6 },
    (_, i) => `${y}-${m}-${String(18 + i).padStart(2, "0")}`,
  );
  S.users.B.v = Array.from(
    { length: 4 },
    (_, i) => `${y}-${m}-${String(20 + i).padStart(2, "0")}`,
  );
  S.users.C.v = Array.from(
    { length: 4 },
    (_, i) => `${y}-${m}-${String(21 + i).padStart(2, "0")}`,
  );
  const d = new Date(Date.now() + 864e5 * 4).toISOString().slice(0, 10),
    pp = (id, st, by, v) => ({
      id,
      by,
      date: d,
      time: "19:00",
      votes: v,
      st,
      pl: {
        place: "",
        addr: "",
        link: "",
        menus: [],
        drinks: { A: [], B: [], C: [] },
        pre: { A: "", B: "", C: "" },
        until: { A: "", B: "", C: "" },
        kr: null,
      },
      ph: [],
      tot: {},
      memo: "",
      pay: null,
    });
  const fk = (i) => {
      const c = document.createElement("canvas");
      c.width = c.height = 240;
      const x = c.getContext("2d");
      x.fillStyle = ["#fd6f75", "#6ecb7c", "#f6b73c"][i % 3];
      x.fillRect(0, 0, 240, 240);
      x.font = "110px serif";
      x.textAlign = "center";
      x.fillText(["🍻", "🍶", "🥂"][i % 3], 120, 155);
      return c.toDataURL("image/jpeg", 0.6);
    },
    en = (id, off, pl, tot, memo) => {
      const q = pp(id, "ended", "C", { A: "y", B: "y" }),
        t = new Date(Date.now() - 864e5 * off);
      q.date = iso(t);
      q.time = "20:00";
      q.pl.place = pl;
      q.tot = tot;
      q.memo = memo;
      q.title = id == 3 ? "오랜만의 연남동" : "막걸리 밤";
      q.ph = [fk(id), fk(id + 1), fk(id + 2)];
      q.endedAt = t.toISOString();
      q.pay = { t: "90000", who: "C", x: "0", done: { C: true } };
      return q;
    };
  S.P = [
    pp(1, "pending", "A", { B: "y" }),
    pp(2, "confirmed", "B", { A: "y", C: "y" }),
    en(3, 40, "연남동 포차", { 소주: 3, 맥주: 2 }, "오랜만에 셋이 모였다!"),
    en(4, 120, "부평 막걸리집", { 막걸리: 4 }, "다음엔 노래방 가자"),
  ];
  sv();
  hist = [];
  V = { v: "home" };
  R();
  toast("예시 데이터를 채웠어요");
}

// ───── 로그인·동기화 연결 (fb.js / sync.js가 사용) ─────
// 로그인 전에는 화면을 그리지 않아요. 로그인 후 fb.js가 render()를 불러요.
APP.getS = () => S;
APP.setS = (x) => {
  S = x;
};
APP.mk = mk;
APP.render = () => R();
APP.view = () => V.v;
APP.toast = (m) => toast(m);
APP.reset = () => {
  hist = [];
  V = { v: "home" };
};
APP.logout = null;
