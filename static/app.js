const PIECES = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const PV_TOOLTIP =
  "Principal Variation: Stockfish's predicted best continuation from this position (sequence of moves).";

const state = {
  view: "loader", // "loader" | "analysis"
  games: [],
  analysis: null,
  ply: 0,
  selectedIndex: -1,
  showBest: true,
};

const el = {
  loaderView: document.getElementById("loader-view"),
  analysisView: document.getElementById("analysis-view"),
  username: document.getElementById("username"),
  year: document.getElementById("year"),
  month: document.getElementById("month"),
  depth: document.getElementById("depth"),
  loadGames: document.getElementById("load-games"),
  status: document.getElementById("status"),
  analysisStatus: document.getElementById("analysis-status"),
  games: document.getElementById("games"),
  back: document.getElementById("back"),
  meta: document.getElementById("game-meta"),
  board: document.getElementById("board"),
  evalInfo: document.getElementById("eval-info"),
  whiteHeader: document.getElementById("white-header"),
  blackHeader: document.getElementById("black-header"),
  movesBody: document.getElementById("moves-body"),
  showBest: document.getElementById("show-best"),
  prev: document.getElementById("prev"),
  next: document.getElementById("next"),
  start: document.getElementById("start"),
  end: document.getElementById("end"),
};

function setStatus(msg) {
  el.status.textContent = msg || "";
}

function setAnalysisStatus(msg) {
  el.analysisStatus.textContent = msg || "";
}

function showLoaderView() {
  state.view = "loader";
  el.loaderView.hidden = false;
  el.analysisView.hidden = true;
}

function showAnalysisView() {
  state.view = "analysis";
  el.loaderView.hidden = true;
  el.analysisView.hidden = false;
}

function goBack() {
  showLoaderView();
  setAnalysisStatus("");
}

function loadPrefs() {
  const now = new Date();
  el.username.value = localStorage.getItem("ca_username") || "";
  el.year.value = localStorage.getItem("ca_year") || String(now.getFullYear());
  el.month.value = localStorage.getItem("ca_month") || String(now.getMonth() + 1);
  el.depth.value = localStorage.getItem("ca_depth") || "15";
  state.showBest = localStorage.getItem("ca_show_best") !== "0";
  el.showBest.checked = state.showBest;
}

function savePrefs() {
  localStorage.setItem("ca_username", el.username.value.trim());
  localStorage.setItem("ca_year", el.year.value);
  localStorage.setItem("ca_month", el.month.value);
  localStorage.setItem("ca_depth", el.depth.value);
  localStorage.setItem("ca_show_best", state.showBest ? "1" : "0");
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

function moveCellHtml(move, ply) {
  if (!move) return "";
  const mark = state.ply === ply ? "current-move" : "";
  let text = move.san;
  if (move.judgment && move.judgment !== "good") text += ` (${move.judgment})`;
  return `<span class="${mark}" data-ply="${ply}">${text}</span>`;
}

function renderMoves() {
  if (!state.analysis) return;
  const headers = state.analysis.headers || {};
  el.whiteHeader.textContent = `White · ${headers.White || "?"}`;
  el.blackHeader.textContent = `Black · ${headers.Black || "?"}`;

  const moves = state.analysis.moves;
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const w = moves[i];
    const b = moves[i + 1];
    rows.push(
      `<tr>
        <td>${num}</td>
        <td data-ply="${i + 1}">${moveCellHtml(w, i + 1)}</td>
        <td${b ? ` data-ply="${i + 2}"` : ""}>${moveCellHtml(b, i + 2)}</td>
      </tr>`
    );
  }
  el.movesBody.innerHTML = rows.join("");
  el.movesBody.querySelectorAll("[data-ply]").forEach((node) => {
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
  ];
  if (state.showBest) {
    lines.push(`Best: ${pos.best_move || "-"}`);
    lines.push(`PV: ${(pos.pv || []).join(" ") || "-"}`);
  }
  if (move) {
    lines.push(`Played: ${move.san} (${move.uci})`);
    lines.push(`Judgment: ${move.judgment || "-"}`);
    if (move.cp_loss != null) lines.push(`CP loss: ${move.cp_loss.toFixed(0)}`);
  }
  el.evalInfo.textContent = "";
  lines.forEach((line, idx) => {
    if (idx > 0) el.evalInfo.appendChild(document.createTextNode("\n"));
    if (line.startsWith("PV:")) {
      const label = document.createElement("span");
      label.className = "pv-label";
      label.title = PV_TOOLTIP;
      label.textContent = "PV";
      el.evalInfo.appendChild(label);
      el.evalInfo.appendChild(document.createTextNode(line.slice(2)));
    } else {
      el.evalInfo.appendChild(document.createTextNode(line));
    }
  });
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
    btn.className = "game-item";
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
  const depth = Number(el.depth.value) || 15;
  showAnalysisView();
  el.meta.textContent = `${game.white} vs ${game.black} · ${game.time_class}`;
  el.movesBody.innerHTML = "";
  el.evalInfo.textContent = "";
  el.board.innerHTML = "";
  setAnalysisStatus(`Analyzing with Stockfish (depth ${depth})… this may take a minute.`);
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
    setAnalysisStatus("Analysis ready.");
  } catch (err) {
    setAnalysisStatus(String(err.message || err));
  }
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

el.loadGames.addEventListener("click", loadGames);
el.back.addEventListener("click", goBack);
el.showBest.addEventListener("change", () => {
  state.showBest = el.showBest.checked;
  savePrefs();
  renderPosition();
});
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
  if (state.view === "analysis" && e.key === "Backspace" && !isTypingTarget(e.target)) {
    e.preventDefault();
    goBack();
    return;
  }
  if (state.view !== "analysis" || !state.analysis || isTypingTarget(e.target)) return;
  if (e.key === "ArrowLeft") {
    state.ply = Math.max(0, state.ply - 1);
    renderPosition();
  } else if (e.key === "ArrowRight") {
    state.ply = Math.min(state.analysis.moves.length, state.ply + 1);
    renderPosition();
  }
});

loadPrefs();
showLoaderView();

fetch("/api/health")
  .then((r) => r.json())
  .then((h) => {
    if (!h.stockfish) {
      setStatus("Stockfish missing. Run: python scripts/download_stockfish.py");
    }
  })
  .catch(() => {});
