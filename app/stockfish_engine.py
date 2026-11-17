"""Local Stockfish process helpers."""

from __future__ import annotations

from pathlib import Path

import chess
import chess.engine

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BINARY = ROOT / "bin" / "stockfish"


class StockfishNotFoundError(FileNotFoundError):
    pass


def resolve_binary(path: Path | None = None) -> Path:
    binary = path or DEFAULT_BINARY
    if not binary.exists():
        raise StockfishNotFoundError(
            f"Stockfish binary not found at {binary}. "
            "Run: python scripts/download_stockfish.py"
        )
    return binary


def analyze_positions(
    fens: list[str],
    *,
    depth: int = 15,
    multipv: int = 1,
    binary: Path | None = None,
) -> list[dict]:
    """Analyze a list of FENs with Stockfish and return evals + principal variations."""
    engine_path = resolve_binary(binary)
    results: list[dict] = []

    with chess.engine.SimpleEngine.popen_uci(str(engine_path)) as engine:
        limit = chess.engine.Limit(depth=depth)
        for fen in fens:
            board = chess.Board(fen)
            info = engine.analyse(board, limit, multipv=multipv)
            infos = info if isinstance(info, list) else [info]
            lines = []
            for item in infos:
                score = item["score"].white()
                if score.is_mate():
                    eval_payload = {"type": "mate", "value": score.mate()}
                else:
                    eval_payload = {"type": "cp", "value": score.score()}
                pv = item.get("pv", [])
                lines.append(
                    {
                        "eval": eval_payload,
                        "pv": [move.uci() for move in pv],
                        "depth": item.get("depth"),
                    }
                )
            results.append({"fen": fen, "lines": lines})
    return results
