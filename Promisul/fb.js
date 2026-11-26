// Firebase 연결 + 로그인 화면. (sketch.js 뒤에 불러와요)
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, doc, collection, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, deleteField, FieldPath,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { createSync } from "./sync.js?v=1";

const firebaseConfig = {
  apiKey: "AIzaSyCYPMUk1daN7OPukDLFKWIrFg0huIZrAxI",
  authDomain: "promisul.firebaseapp.com",
  projectId: "promisul",
  storageBucket: "promisul.firebasestorage.app",
  messagingSenderId: "601227637343",
  appId: "1:601227637343:web:db1d019c748ead178d21ea",
};

// 로그인한 계정(UID) → 앱에서 쓰는 이름. firestore.rules 의 members() 와 같아야 해요.
const MEMBERS = {
  FUSKJPJluqh5OOEa3bOLX6xm7ps1: "A",
  qQeQmzwjdrZV7tvA3sPFR0FOP642: "B",
  "71u7pI80r9P4fFpVyXBX3jHMV8j2": "C",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const fs = { doc, collection, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, deleteField, FieldPath };
const $app = document.getElementById("app"),
  $top = document.getElementById("top");
let sync = null,
  notice = "";

const ERR = {
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않아요",
  "auth/wrong-password": "이메일 또는 비밀번호가 맞지 않아요",
  "auth/user-not-found": "이메일 또는 비밀번호가 맞지 않아요",
  "auth/invalid-email": "이메일 형식이 올바르지 않아요",
  "auth/missing-password": "비밀번호를 입력해 주세요",
  "auth/too-many-requests": "시도가 너무 많아요. 잠시 뒤에 다시 해 주세요",
  "auth/network-request-failed": "인터넷 연결을 확인해 주세요",
  "auth/user-disabled": "사용할 수 없는 계정이에요",
};
const msg = (e) => ERR[e && e.code] || "로그인하지 못했어요 (" + ((e && e.code) || "알 수 없음") + ")";

function shell(inner) {
  $top.innerHTML = '<div class="top"><b>로그인</b></div>';
  $app.innerHTML = inner;
}
function loading(t) {
  shell('<div class="card"><h3>' + t + "</h3></div>");
}
function loginView() {
  shell(
    '<div class="card"><h3>로그인</h3>' +
      '<form id="lf" autocomplete="on">' +
      '<input id="em" type="email" inputmode="email" autocomplete="username" placeholder="이메일" required>' +
      '<input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" required>' +
      '<button class="btn pri" type="submit" id="go">로그인</button>' +
      "</form>" +
      '<p id="er" role="alert" style="color:var(--ink);font-weight:800;min-height:1.4em;margin:10px 0 0">' +
      notice +
      "</p>" +
      '<button class="btn sm" type="button" id="rs">비밀번호 재설정 메일 받기</button>' +
      "</div>",
  );
  notice = "";
  const em = document.getElementById("em"),
    pw = document.getElementById("pw"),
    er = document.getElementById("er"),
    go = document.getElementById("go");
  document.getElementById("lf").onsubmit = async (ev) => {
    ev.preventDefault();
    er.textContent = "";
    go.disabled = true;
    try {
      await signInWithEmailAndPassword(auth, em.value.trim(), pw.value);
    } catch (e) {
      er.textContent = msg(e);
      go.disabled = false;
    }
  };
  document.getElementById("rs").onclick = async () => {
    if (!em.value.trim()) {
      er.textContent = "위에 이메일을 먼저 적어 주세요";
      return;
    }
    try {
      await sendPasswordResetEmail(auth, em.value.trim());
      er.textContent = "재설정 메일을 보냈어요. 메일함(스팸함도)을 확인해 주세요";
    } catch (e) {
      er.textContent = msg(e);
    }
  };
}

function stopSync() {
  if (sync) {
    sync.stop();
    sync = null;
  }
}
window.APP.logout = () => {
  stopSync();
  signOut(auth);
};

onAuthStateChanged(auth, (user) => {
  stopSync();
  if (!user) return loginView();
  const me = MEMBERS[user.uid];
  if (!me) {
    notice = "이 앱을 쓸 수 없는 계정이에요";
    signOut(auth); // → user=null 로 다시 들어와서 로그인 화면을 보여줘요
    return;
  }
  loading("불러오는 중…");
  window.APP.setS(window.APP.mk());
  window.APP.setS({ ...window.APP.getS(), me });
  sync = createSync({ win: window, fs, db, me });
  sync.start();
});
