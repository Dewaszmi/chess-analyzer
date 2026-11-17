const PIECES = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const state = {
  games: [],
  analysis: null,
  ply: 0, // index into positions (0 = start)
  selectedIndex: -1,
};

const el = {
  username: document.getElementById("username"),
  year: document.getElementById("year"),
  month: document.getElementById("month"),
  depth: document.getElementById("depth"),
  loadGames: document.getElementById("load-games"),
  status: document.getElementById("status"),
  games: document.getElementById("games"),
  panel: document.getElementById("analysis-panel"),
  meta: document.getElementById("game-meta"),
  board: document.getElementById("board"),
  evalInfo: document.getElementById("eval-info"),
  movesList: document.getElementById("moves-list"),
  prev: document.getElementById("prev"),
  next: document.getElementById("next"),
  start: document.getElementById("start"),
  end: document.getElementById("end"),
};

function setStatus(msg) {
  el.status.textContent = msg || "";
}

function loadPrefs() {
  const now = new Date();
  el.username.value = localStorage.getItem("ca_username") || "";
  el.year.value = localStorage.getItem("ca_year") || String(now.getFullYear());
  el.month.value = localStorage.getItem("ca_month") || String(now.getMonth() + 1);
  el.depth.value = localStorage.getItem("ca_depth") || "15";
}

function savePrefs() {
  localStorage.setItem("ca_username", el.username.value.trim());
  localStorage.setItem("ca_year", el.year.value);
  localStorage.setItem("ca_month", el.month.value);
  localStorage.setItem("ca_depth", el.depth.value);
}

function formatEval(ev) {
  if (!ev) return "?";
  if (ev.type === "mate") return `M${ev.value}`;
  const pawns = (ev.value / 100).toFixed(2);
  return (ev.value >= 0 ? "+" : "") + pawns;
}

function fenToBoard(fen) {
  const placement = fen.split(" ")[0];
  const rows = placement.split("/");
  const squares = [];
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) {
        const n = Number(ch);
        for (let i = 0; i < n; i++) {
          squares.push({ piece: null, rank: 8 - r, file: file++ });
        }
      } else {
        squares.push({ piece: ch, rank: 8 - r, file: file++ });
      }
    }
  }
  return squares;
}

function renderBoard(fen) {
  const squares = fenToBoard(fen);
  el.board.innerHTML = "";
  for (const sq of squares) {
    const div = document.createElement("div");
    const dark = (sq.rank + sq.file) % 2 === 0;
    div.className = "sq " + (dark ? "dark" : "light");
    div.textContent = sq.piece ? PIECES[sq.piece] : "";
    el.board.appendChild(div);
  }
}

function renderMoves() {
  if (!state.analysis) return;
  const moves = state.analysis.moves;
  const lines = [];
  for (let i = 0; i < moves.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const w = moves[i];
    const b = moves[i + 1];
    const wMark = state.ply === i + 1 ? "current-move" : "";
    const bMark = state.ply === i + 2 ? "current-move" : "";
    let line = `${num}. `;
    line += `<span class="${wMark}" data-ply="${i + 1}">${w.san}`;
    if (w.judgment && w.judgment !== "good") line += ` (${w.judgment})`;
    line += `</span>`;
    if (b) {
      line += ` <span class="${bMark}" data-ply="${i + 2}">${b.san}`;
      if (b.judgment && b.judgment !== "good") line += ` (${b.judgment})`;
      line += `</span>`;
    }
    lines.push(line);
  }
  el.movesList.innerHTML = lines.join("\n");
  el.movesList.querySelectorAll("[data-ply]").forEach((node) => {
    node.addEventListener("click", () => {
      state.ply = Number(node.dataset.ply);
      renderPosition();
    });
  });
}

function renderPosition() {
  if (!state.analysis) return;
  const pos = state.analysis.positions[state.ply];
  renderBoard(pos.fen);
  const move = state.ply > 0 ? state.analysis.moves[state.ply - 1] : null;
  const lines = [
    `Ply: ${state.ply}/${state.analysis.moves.length}`,
    `Eval: ${formatEval(pos.eval)} (white POV)`,
    `Best: ${pos.best_move || "-"}`,
    `PV: ${(pos.pv || []).join(" ") || "-"}`,
  ];
  if (move) {
    lines.push(`Played: ${move.san} (${move.uci})`);
    lines.push(`Judgment: ${move.judgment || "-"}`);
    if (move.cp_loss != null) lines.push(`CP loss: ${move.cp_loss.toFixed(0)}`);
  }
  el.evalInfo.textContent = lines.join("\n");
  renderMoves();
}

function renderGames() {
  el.games.innerHTML = "";
  if (!state.games.length) {
    el.games.textContent = "No games loaded.";
    return;
  }
  state.games.forEach((game, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-item" + (index === state.selectedIndex ? " active" : "");
    const when = game.end_time ? new Date(game.end_time * 1000).toISOString().slice(0, 10) : "?";
    btn.textContent = [
      when,
      game.time_class || "?",
      `${game.white} vs ${game.black}`,
      `you=${game.user_color}/${game.user_result}`,
    ].join(" | ");
    btn.addEventListener("click", () => analyzeSelected(index));
    el.games.appendChild(btn);
  });
}

async function loadGames() {
  savePrefs();
  const username = el.username.value.trim();
  if (!username) {
    setStatus("Enter a username.");
    return;
  }
  const year = Number(el.year.value);
  const month = Number(el.month.value);
  setStatus("Loading games…");
  el.loadGames.disabled = true;
  try {
    const res = await fetch(`/api/games?username=${encodeURIComponent(username)}&year=${year}&month=${month}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to load games");
    state.games = data.games || [];
    state.selectedIndex = -1;
    state.analysis = null;
    el.panel.hidden = true;
    renderGames();
    setStatus(`Loaded ${state.games.length} games.`);
  } catch (err) {
    setStatus(String(err.message || err));
  } finally {
    el.loadGames.disabled = false;
  }
}

async function analyzeSelected(index) {
  const game = state.games[index];
  if (!game || !game.pgn) {
    setStatus("Game has no PGN.");
    return;
  }
  state.selectedIndex = index;
  renderGames();
  const depth = Number(el.depth.value) || 15;
  setStatus(`Analyzing with Stockfish (depth ${depth})… this may take a minute.`);
  el.panel.hidden = false;
  el.meta.textContent = `${game.white} vs ${game.black} · ${game.time_class} · analyzing…`;
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pgn: game.pgn, depth }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Analysis failed");
    state.analysis = data;
    state.ply = 0;
    const h = data.headers || {};
    el.meta.textContent = [
      `${h.White || game.white} vs ${h.Black || game.black}`,
      h.Result || "",
      h.Event || game.time_class || "",
      h.Date || "",
    ].filter(Boolean).join(" · ");
    renderPosition();
    setStatus("Analysis ready.");
  } catch (err) {
    setStatus(String(err.message || err));
  }
}

el.loadGames.addEventListener("click", loadGames);
el.prev.addEventListener("click", () => {
  if (!state.analysis) return;
  state.ply = Math.max(0, state.ply - 1);
  renderPosition();
});
el.next.addEventListener("click", () => {
  if (!state.analysis) return;
  state.ply = Math.min(state.analysis.moves.length, state.ply + 1);
  renderPosition();
});
el.start.addEventListener("click", () => {
  if (!state.analysis) return;
  state.ply = 0;
  renderPosition();
});
el.end.addEventListener("click", () => {
  if (!state.analysis) return;
  state.ply = state.analysis.moves.length;
  renderPosition();
});

document.addEventListener("keydown", (e) => {
  if (!state.analysis) return;
  if (e.key === "ArrowLeft") {
    state.ply = Math.max(0, state.ply - 1);
    renderPosition();
  } else if (e.key === "ArrowRight") {
    state.ply = Math.min(state.analysis.moves.length, state.ply + 1);
    renderPosition();
  }
});

loadPrefs();

fetch("/api/health")
  .then((r) => r.json())
  .then((h) => {
    if (!h.stockfish) {
      setStatus("Stockfish missing. Run: python scripts/download_stockfish.py");
    }
  })
  .catch(() => {});
