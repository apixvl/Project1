/***********************
 * Utilities
 ***********************/
function seededRandom(seed) {
  let value = seed % 2147483647;
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/***********************
 * Minesweeper Board
 ***********************/
class MinesweeperBoard {
  constructor(container, rows, cols, bombs, seed, interactive, onWin) {
    this.container = container;
    this.rows = rows;
    this.cols = cols;
    this.bombs = bombs;
    this.seed = seed;
    this.random = seededRandom(seed);
    this.interactive = interactive;
    this.onWin = onWin;

    this.board = [];
    this.revealedCount = 0;
    this.gameOver = false;

    this.init();
  }

  init() {
    this.container.innerHTML = '';
    this.container.style.gridTemplateColumns = `repeat(${this.cols}, 30px)`;

    for (let r = 0; r < this.rows; r++) {
      this.board[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const cell = {
          r, c,
          bomb: false,
          revealed: false,
          flagged: false,
          el: document.createElement('div'),
          adj: 0
        };

        cell.el.className = 'cell';

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

    this.placeBombs();
    this.calculateAdj();
  }

  placeBombs() {
    let placed = 0;
    while (placed < this.bombs) {
      const r = Math.floor(this.random() * this.rows);
      const c = Math.floor(this.random() * this.cols);
      if (!this.board[r][c].bomb) {
        this.board[r][c].bomb = true;
        placed++;
      }
    }
  }

  calculateAdj() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.board[r][c];
        if (cell.bomb) continue;
        cell.adj = this.neighbors(r, c).filter(n => n.bomb).length;
      }
    }
  }

  neighbors(r, c) {
    const res = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          res.push(this.board[nr][nc]);
        }
      }
    }
    return res;
  }

  reveal(cell) {
    if (this.gameOver || cell.revealed || cell.flagged) return;

    cell.revealed = true;
    this.revealedCount++;
    cell.el.classList.add('revealed');

    if (cell.bomb) {
      cell.el.textContent = '💣';
      cell.el.classList.add('bomb');
      this.gameOver = true;
      return;
    }

    if (cell.adj > 0) {
      cell.el.textContent = cell.adj;
    } else {
      this.neighbors(cell.r, cell.c).forEach(n => this.reveal(n));
    }

    if (this.checkWin()) {
      this.gameOver = true;
      this.onWin();
    }
  }

  toggleFlag(cell) {
    if (cell.revealed || this.gameOver) return;
    cell.flagged = !cell.flagged;
    cell.el.classList.toggle('flagged');
    cell.el.textContent = cell.flagged ? '🚩' : '';
  }

  checkWin() {
    return this.revealedCount === (this.rows * this.cols - this.bombs);
  }
}

/***********************
 * WebRTC (1v1)
 ***********************/
let pc, dc;
let isHost = false;

function setupConnection() {
  pc = new RTCPeerConnection();

  pc.ondatachannel = e => {
    dc = e.channel;
    dc.onmessage = handleMessage;
  };

  dc = pc.createDataChannel('game');
  dc.onmessage = handleMessage;
}

async function hostGame() {
  isHost = true;
  setupConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signalBox.value = JSON.stringify(offer);
}

async function joinGame() {
  isHost = false;
  setupConnection();
  const offer = JSON.parse(signalBox.value);
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  signalBox.value = JSON.stringify(answer);
}

async function sendSignal() {
  const msg = JSON.parse(signalBox.value);
  await pc.setRemoteDescription(msg);
}

/***********************
 * Game Sync
 ***********************/
function send(data) {
  if (dc && dc.readyState === 'open') {
    dc.send(JSON.stringify(data));
  }
}

function handleMessage(e) {
  const msg = JSON.parse(e.data);
  if (msg.type === 'WIN') {
    statusText.textContent = '💀 You lose!';
    playerBoard.gameOver = true;
  }
}

/***********************
 * Game Boot
 ***********************/
let playerBoard, opponentBoard;
const statusText = document.getElementById('status');

function startMatch() {
  const rows = +document.getElementById('rows').value;
  const cols = +document.getElementById('cols').value;
  const bombs = +document.getElementById('bombs').value;

  const mySeed = Math.floor(Math.random() * 1e9);
  const theirSeed = Math.floor(Math.random() * 1e9);

  playerBoard = new MinesweeperBoard(
    document.getElementById('player-board'),
    rows, cols, bombs, mySeed, true,
    () => {
      statusText.textContent = '🎉 You win!';
      send({ type: 'WIN' });
    }
  );

  opponentBoard = new MinesweeperBoard(
    document.getElementById('opponent-board'),
    rows, cols, bombs, theirSeed, false,
    () => {}
  );

  statusText.textContent = '';
}

/***********************
 * UI Bindings
 ***********************/
document.getElementById('startBtn').onclick = startMatch;
document.getElementById('darkModeBtn').onclick =
  () => document.body.classList.toggle('dark-mode');

document.getElementById('hostBtn').onclick = hostGame;
document.getElementById('joinBtn').onclick = joinGame;
document.getElementById('signalBtn').onclick = sendSignal;
