/*************************
 * Firebase (MODULAR SDK)
 *************************/
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAtR4UxoU8x38By_MkSo7SEsQJ4CI6yoSs",
  authDomain: "minesweeper-aa9a6.firebaseapp.com",
  projectId: "minesweeper-aa9a6",
  storageBucket: "minesweeper-aa9a6.firebasestorage.app",
  messagingSenderId: "320578646146",
  appId: "1:320578646146:web:c0b70ca52c6544951c849b",
  measurementId: "G-4H3HDD633H"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/*************************
 * Utilities
 *************************/
function seededRandom(seed) {
  let v = seed % 2147483647;
  return () => (v = v * 16807 % 2147483647) / 2147483647;
}

function lobbyCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

/*************************
 * Minesweeper Board
 *************************/
class MinesweeperBoard {
  constructor(container, rows, cols, bombs, seed, interactive, onWin) {
    this.c = container;
    this.r = rows;
    this.cl = cols;
    this.b = bombs;
    this.rand = seededRandom(seed);
    this.interactive = interactive;
    this.onWin = onWin;
    this.revealed = 0;
    this.over = false;
    this.board = [];
    this.init();
  }

  init() {
    this.c.innerHTML = "";
    this.c.style.gridTemplateColumns = `repeat(${this.cl},30px)`;

    for (let r = 0; r < this.r; r++) {
      this.board[r] = [];
      for (let c = 0; c < this.cl; c++) {
        const cell = {
          r, c, bomb: false, rev: false, flag: false, adj: 0,
          el: document.createElement("div")
        };
        cell.el.className = "cell";

        if (this.interactive) {
          cell.el.onclick = () => this.reveal(cell);
          cell.el.oncontextmenu = e => {
            e.preventDefault();
            this.flag(cell);
          };
        }

        this.c.appendChild(cell.el);
        this.board[r][c] = cell;
      }
    }

    let placed = 0;
    while (placed < this.b) {
      const r = Math.floor(this.rand() * this.r);
      const c = Math.floor(this.rand() * this.cl);
      if (!this.board[r][c].bomb) {
        this.board[r][c].bomb = true;
        placed++;
      }
    }

    for (let r = 0; r < this.r; r++)
      for (let c = 0; c < this.cl; c++)
        this.board[r][c].adj = this.neigh(r, c).filter(n => n.bomb).length;
  }

  neigh(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < this.r && nc < this.cl)
          out.push(this.board[nr][nc]);
      }
    return out;
  }

  reveal(cell) {
    if (this.over || cell.rev || cell.flag) return;
    cell.rev = true;
    this.revealed++;
    cell.el.classList.add("revealed");

    if (cell.bomb) {
      cell.el.textContent = "💣";
      cell.el.classList.add("bomb");
      this.over = true;
      return;
    }

    if (cell.adj) cell.el.textContent = cell.adj;
    else this.neigh(cell.r, cell.c).forEach(n => this.reveal(n));

    if (this.revealed === this.r * this.cl - this.b) {
      this.over = true;
      this.onWin();
    }
  }

  flag(cell) {
    if (cell.rev || this.over) return;
    cell.flag = !cell.flag;
    cell.el.classList.toggle("flagged");
    cell.el.textContent = cell.flag ? "🚩" : "";
  }
}

/*************************
 * WebRTC + Lobby
 *************************/
let pc, dc, lobbyId, isHost = false;

function setupRTC() {
  pc = new RTCPeerConnection();
  dc = pc.createDataChannel("game");
  dc.onmessage = e => handleMsg(JSON.parse(e.data));
}

async function hostGame() {
  isHost = true;
  setupRTC();

  lobbyId = lobbyCode();
  status.textContent = `Lobby: ${lobbyId}`;

  const ref = doc(db, "lobbies", lobbyId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await setDoc(ref, {
    offer,
    createdAt: serverTimestamp()
  });

  onSnapshot(ref, async snap => {
    const d = snap.data();
    if (d?.answer && !pc.currentRemoteDescription)
      await pc.setRemoteDescription(d.answer);
  });
}

async function joinGame() {
  isHost = false;
  setupRTC();

  lobbyId = lobbyCodeInput.value.toUpperCase();
  const ref = doc(db, "lobbies", lobbyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return alert("Lobby not found");

  await pc.setRemoteDescription(snap.data().offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await updateDoc(ref, { answer });
}

/*************************
 * Game Sync
 *************************/
function send(msg) {
  dc?.readyState === "open" && dc.send(JSON.stringify(msg));
}

function handleMsg(msg) {
  if (msg.type === "WIN") {
    status.textContent = "💀 You lose!";
    player.over = true;
  }
}

/*************************
 * Game Boot
 *************************/
let player, opponent;
const status = document.getElementById("status");
const lobbyCodeInput = document.getElementById("lobbyCode");

document.getElementById("startBtn").onclick = () => {
  const r = +rows.value, c = +cols.value, b = +bombs.value;

  player = new MinesweeperBoard(
    document.getElementById("player-board"),
    r, c, b, Math.random() * 1e9, true,
    () => {
      status.textContent = "🎉 You win!";
      send({ type: "WIN" });
    }
  );

  opponent = new MinesweeperBoard(
    document.getElementById("opponent-board"),
    r, c, b, Math.random() * 1e9, false,
    () => {}
  );

  status.textContent = "";
};

hostBtn.onclick = hostGame;
joinBtn.onclick = joinGame;
darkModeBtn.onclick = () => document.body.classList.toggle("dark-mode");
