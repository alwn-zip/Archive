// 서버(Firestore)와 앱 상태(S)를 맞추는 부분이에요.
// - 서버가 바뀌면 → 앱 상태(S)를 갱신하고 화면을 다시 그려요.
// - 앱에서 sv()가 불리면 → 바뀐 부분만 골라 서버에 써요. (두 사람이 동시에 다른 칸을 고쳐도 서로 덮어쓰지 않아요)
// Firebase 함수는 밖에서 넣어 주는 구조라서(fs), 가짜 DB로도 시험할 수 있어요.

const LET = ["A", "B", "C"];
const DEL = Symbol("delete");
const J = JSON.stringify;
const clone = (x) => JSON.parse(JSON.stringify(x));
// null 값은 서버에 저장하지 않아요 (규칙의 pay.get(...)이 null 에서 오류가 나서 수정이 전부 거부돼요)
const strip = (v) => {
  if (Array.isArray(v)) return v.map((x) => (x === null ? "" : strip(x)));
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== null && v[k] !== undefined) o[k] = strip(v[k]);
    return o;
  }
  return v;
};
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// 바뀐 "칸" 목록을 만들어요. 예: ["pl","until","A"] → "22:00"
export function leafDiff(a, b, path, out) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if (path.length === 0 && (k === "ph" || k === "phIds" || k === "id")) continue;
    const x = a ? a[k] : undefined,
      y = b ? b[k] : undefined;
    if (y === undefined || y === null) {
      if (x !== undefined && x !== null) out.push([[...path, k], DEL]);
    } else if (isObj(x) && isObj(y)) leafDiff(x, y, [...path, k], out);
    else if (J(x) !== J(y)) out.push([[...path, k], y]);
  }
}

export function createSync({ win, fs, db, me }) {
  const { doc, collection, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, deleteField, FieldPath } = fs;
  const APP = win.APP,
    document = win.document;
  const cache = { users: {}, fav: null, props: {}, photos: {} },
    unsubs = [],
    photoSubs = {},
    ready = { users: new Set(), fav: false, props: false };
  let started = false,
    stopped = false,
    S0 = null,
    dirty = false,
    flushing = false,
    pending = false,
    needR = false,
    ver = 0,
    timer = 0,
    slow = 0;

  // ── 서버 → 앱 ──
  function build() {
    const base = APP.mk(),
      users = {},
      sl = [];
    for (const k of LET) {
      const d = clone(cache.users[k] || {}),
        usl = d.sl || [];
      delete d.sl;
      users[k] = { ...base.users[k], ...d };
      usl.forEach((e) => sl.push({ k, s: e.s, at: e.at || 0 }));
    }
    sl.sort((a, b) => a.at - b.at);
    const P = Object.entries(cache.props)
      .map(([id, d]) => {
        const ph = (cache.photos[id] || [])
          .slice()
          .sort((a, b) => (a.at || 0) - (b.at || 0) || (a.id < b.id ? -1 : 1));
        return {
          ...clone(d),
          id: Number.isFinite(+id) ? +id : id,
          ph: ph.map((x) => x.data),
          phIds: ph.map((x) => x.id),
        };
      })
      .sort((a, b) => a.id - b.id);
    return { me, users, P, fav: clone((cache.fav && cache.fav.list) || []), sl };
  }
  function softRender() {
    const a = document.activeElement,
      typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    // 입력 중이거나 카메라 화면이면 화면을 새로 그리지 않아요 (입력·카메라가 끊기지 않게)
    if (typing || ["cam", "start", "drunk"].includes(APP.view())) {
      needR = true;
      return;
    }
    needR = false;
    APP.render();
  }
  function apply(force, hard) {
    if (stopped) return;
    if (!force && (dirty || flushing)) {
      pending = true; // 내가 저장하는 중에는 서버 변경을 잠깐 미뤄요
      return;
    }
    const st = build();
    APP.setS(st);
    S0 = clone(st);
    hard ? APP.render() : softRender();
  }
  const maybeApply = () => started && apply(false);
  const fail = (e) => {
    console.error(e);
    APP.toast("데이터를 불러오지 못했어요 (" + ((e && (e.code || e.message)) || "알 수 없음") + ")");
  };
  function maybeStart() {
    if (started || ready.users.size < 3 || !ready.fav || !ready.props) return;
    started = true;
    clearTimeout(slow);
    apply(true, true);
  }

  // ── 앱 → 서버 ──
  const mine = (st, k) => {
    const u = clone(st.users[k]);
    u.sl = (st.sl || [])
      .filter((e) => e.k === k && (u.s || []).includes(e.s))
      .map((e) => ({ s: e.s, at: e.at }));
    return u;
  };
  async function push(cur, old) {
    const ops = [];
    // 내 프로필 (다른 사람 프로필은 규칙이 막아요)
    const u1 = mine(cur, me),
      u0 = mine(old, me),
      ch = {};
    for (const key of Object.keys(u1)) if (J(u1[key]) !== J(u0[key])) ch[key] = u1[key];
    if (Object.keys(ch).length) ops.push(setDoc(doc(db, "users", me), ch, { merge: true }));
    // 공용 즐겨찾기
    if (J(cur.fav) !== J(old.fav)) ops.push(setDoc(doc(db, "meta", "fav"), { list: clone(cur.fav) }));
    // 술약
    for (const p of cur.P) {
      const o = old.P.find((x) => x.id === p.id),
        id = String(p.id);
      if (!o) {
        const { ph, phIds, ...rest } = p;
        ops.push(setDoc(doc(db, "proposals", id), strip(rest)));
      } else {
        const out = [];
        leafDiff(o, p, [], out);
        if (out.length)
          ops.push(
            updateDoc(
              doc(db, "proposals", id),
              ...out.flatMap(([path, v]) => [new FieldPath(...path), v === DEL ? deleteField() : strip(v)]),
            ),
          );
      }
      // 사진은 한 장씩 따로 저장해요
      const oph = o ? o.ph : [],
        oid = o ? o.phIds : [],
        nph = p.ph || [];
      nph.forEach((d) => {
        if (!oph.includes(d))
          ops.push(addDoc(collection(db, "proposals", id, "photos"), { data: d, by: me, at: Date.now() }));
      });
      oph.forEach((d, i) => {
        if (!nph.includes(d) && oid[i]) ops.push(deleteDoc(doc(db, "proposals", id, "photos", oid[i])));
      });
    }
    await Promise.all(ops);
  }
  async function flush() {
    if (stopped) return;
    if (flushing) {
      timer = setTimeout(flush, 200);
      return;
    }
    flushing = true;
    const v = ver,
      snap = clone(APP.getS());
    try {
      await push(snap, S0);
      S0 = snap;
    } catch (e) {
      console.error(e);
      flushing = dirty = pending = false;
      APP.toast("저장하지 못했어요. 권한이나 인터넷을 확인해 주세요");
      apply(true); // 서버에 있는 그대로 되돌려요
      return;
    }
    flushing = false;
    if (v === ver) {
      dirty = false;
      if (pending) {
        pending = false;
        apply(true);
      }
    }
  }
  function onSave() {
    ver++;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  }
  const onBlur = () => needR && setTimeout(() => !stopped && softRender(), 80);

  function start() {
    APP.onSave = onSave;
    document.addEventListener("focusout", onBlur);
    for (const k of LET)
      unsubs.push(
        onSnapshot(
          doc(db, "users", k),
          (s) => {
            cache.users[k] = s.exists() ? s.data() : null;
            ready.users.add(k);
            started ? maybeApply() : maybeStart();
          },
          fail,
        ),
      );
    unsubs.push(
      onSnapshot(
        doc(db, "meta", "fav"),
        (s) => {
          cache.fav = s.exists() ? s.data() : null;
          ready.fav = true;
          started ? maybeApply() : maybeStart();
        },
        fail,
      ),
    );
    unsubs.push(
      onSnapshot(
        collection(db, "proposals"),
        (snap) => {
          snap.forEach((d) => {
            cache.props[d.id] = d.data();
            if (!photoSubs[d.id])
              photoSubs[d.id] = onSnapshot(
                collection(db, "proposals", d.id, "photos"),
                (ps) => {
                  cache.photos[d.id] = ps.docs.map((x) => ({ id: x.id, ...x.data() }));
                  maybeApply();
                },
                fail,
              );
          });
          ready.props = true;
          started ? maybeApply() : maybeStart();
        },
        fail,
      ),
    );
    slow = setTimeout(() => !started && APP.toast("데이터를 불러오는 중이에요… 인터넷을 확인해 주세요"), 8000);
  }
  function stop() {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(slow);
    document.removeEventListener("focusout", onBlur);
    unsubs.forEach((u) => u && u());
    Object.values(photoSubs).forEach((u) => u && u());
    APP.onSave = null;
    APP.setS(APP.mk());
    APP.reset();
  }
  return { start, stop, flush, state: () => ({ started, dirty, flushing, pending }) };
}
