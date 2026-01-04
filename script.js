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
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/*************************
 * DOM REFERENCES
 *************************/
const rowsInput = document.getElementById("rows");
const colsInput = document.getElementById("cols");
const bombsInput = document.getElementById("bombs");
const lobbyCodeInput = document.getElementById("lobbyCode");

const hostBtn = document.getElementById("hostBtn");
const joinBtn = document.getElementById("joinBtn");
const startBtn = document.getElementById("startBtn");
const darkModeBtn = document.getElementById("darkModeBtn");

const statusText = document.getElementById("status");
const playerContainer = document.getElementById("player-board");
const opponentContainer = document.getElementById("opponent-board");

/*************************
 * Utilities
 *************************/
function seededRandom(seed) {
  let v = seed % 2147483647;
  return () => (v = v * 16807 % 2147483647) / 2147483647;
}

function generateLobbyCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

/*************************
 * Minesweeper Board
 *************************/
class MinesweeperBoard {
  constructor(container, rows, cols, bombs, seed, interactive, onWin) {
    this.container = container;
    this.rows = rows;
    this.cols = cols;
    this.bombs = bombs;
    this.random = seededRandom(seed);
    this.interactive = interactive;
    this.onWin = onWin;
    this.revealed = 0;
    this.gameOver = false;
    this.board = [];
    this.init();
  }

  init() {
    this.container.innerHTML = "";
    this.container.style.gridTemplateColumns = `repeat(${this.cols},30px)`;

    for (let r = 0; r < this.rows; r++) {
      this.board[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const cell = {
          r, c, bomb: false, rev: false, flag: false, adj: 0,
          el: document.createElement("div")
        };
        cell.el.className = "cell";

        if (this.interactive) {
          cell.el.onclick = () => this.reveal(cell);
          cell.el.oncontextmenu = e => {
            e.preventDefault();
            this.toggleFlag(cell);
          };
        }

        this.container.appendChild(cell.el);
        this.board[r][c] = cell;
      }
    }

    let placed = 0;
    while (placed < this.bombs) {
      const r = Math.floor(this.random() * this.rows);
      const c = Math.floor(this.random() * this.cols);
      if (!this.board[r][c].bomb) {
        this.board[r][c].bomb = true;
        placed++;
      }
    }

    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        this.board[r][c].adj = this.neighbors(r, c).filter(n => n.bomb).length;
  }

  neighbors(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < this.rows && nc < this.cols)
          out.push(this.board[nr][nc]);
      }
    return out;
  }

  reveal(cell) {
    if (this.gameOver || cell.rev || cell.flag) return;
    cell.rev = true;
    this.revealed++;
    cell.el.classList.add("revealed");

    if (cell.bomb) {
      cell.el.textContent = "💣";
      cell.el.classList.add("bomb");
      this.gameOver = true;
      return;
    }

    if (cell.adj) cell.el.textContent = cell.adj;
    else this.neighbors(cell.r, cell.c).forEach(n => this.reveal(n));

    if (this.revealed === this.rows * this.cols - this.bombs) {
      this.gameOver = true;
      this.onWin();
    }
  }

  toggleFlag(cell) {
    if (cell.rev || this.gameOver) return;
    cell.flag = !cell.flag;
    cell.el.classList.toggle("flagged");
    cell.el.textContent = cell.flag ? "🚩" : "";
  }
}

/*************************
 * WebRTC + Lobby
 *************************/
let pc, dc, lobbyId;

function setupRTC() {
  pc = new RTCPeerConnection();
  dc = pc.createDataChannel("game");
  dc.onmessage = e => handleMessage(JSON.parse(e.data));
}

async function hostGame() {
  setupRTC();
  lobbyId = generateLobbyCode();

  lobbyCodeInput.value = lobbyId;
  lobbyCodeInput.select();
  statusText.textContent = "Share this lobby code with your opponent";

  const ref = doc(db, "lobbies", lobbyId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await setDoc(ref, { offer, createdAt: serverTimestamp() });

  onSnapshot(ref, async snap => {
    const data = snap.data();
    if (data?.answer && !pc.currentRemoteDescription)
      await pc.setRemoteDescription(data.answer);
  });
}

async function joinGame() {
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
  if (dc && dc.readyState === "open")
    dc.send(JSON.stringify(msg));
}

function handleMessage(msg) {
  if (msg.type === "WIN") {
    statusText.textContent = "💀 You lose!";
    player.gameOver = true;
  }
}

/*************************
 * Game Start
 *************************/
let player, opponent;

startBtn.onclick = () => {
  const r = +rowsInput.value;
  const c = +colsInput.value;
  const b = +bombsInput.value;

  player = new MinesweeperBoard(
    playerContainer, r, c, b, Math.random() * 1e9, true,
    () => {
      statusText.textContent = "🎉 You win!";
      send({ type: "WIN" });
    }
  );

  opponent = new MinesweeperBoard(
    opponentContainer, r, c, b, Math.random() * 1e9, false,
    () => {}
  );

  statusText.textContent = "";
};

hostBtn.onclick = hostGame;
joinBtn.onclick = joinGame;
darkModeBtn.onclick = () => document.body.classList.toggle("dark-mode");
