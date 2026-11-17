"""PGN parsing and game analysis helpers."""

from __future__ import annotations

import io
from typing import Any

import chess
import chess.pgn

from app.stockfish_engine import analyze_positions


def parse_pgn(pgn_text: str) -> dict[str, Any]:
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Could not parse PGN")

    headers = {key: game.headers[key] for key in game.headers.keys()}
    board = game.board()
    moves: list[dict[str, Any]] = []
    fens: list[str] = [board.fen()]

    for i, node in enumerate(game.mainline(), start=1):
        move = node.move
        san = board.san(move)
        board.push(move)
        fen = board.fen()
        fens.append(fen)
        moves.append(
            {
                "ply": i,
                "san": san,
                "uci": move.uci(),
                "fen_after": fen,
            }
        )

    return {
        "headers": headers,
        "moves": moves,
        "fens": fens,
        "final_fen": board.fen(),
    }


def classify_delta(cp_loss: float | None) -> str | None:
    if cp_loss is None:
        return None
    # Thresholds roughly inspired by common free analyzers (centipawns from player's POV)
    if cp_loss < 50:
        return "good"
    if cp_loss < 100:
        return "inaccuracy"
    if cp_loss < 300:
        return "mistake"
    return "blunder"


def analyze_game(pgn_text: str, depth: int = 15) -> dict[str, Any]:
    parsed = parse_pgn(pgn_text)
    # Analyze positions before each move + final position is enough via before-move FENs
    # fens[0] = start, fens[i] = after move i
    positions = analyze_positions(parsed["fens"], depth=depth, multipv=1)

    def white_cp(eval_obj: dict) -> float | None:
        if eval_obj["type"] == "mate":
            mate = eval_obj["value"]
            if mate is None:
                return None
            # Large score surrogate for mate
            return 100000.0 if mate > 0 else -100000.0
        return float(eval_obj["value"])

    analyzed_moves: list[dict[str, Any]] = []
    for i, move in enumerate(parsed["moves"]):
        before = positions[i]["lines"][0]
        after = positions[i + 1]["lines"][0]
        before_cp = white_cp(before["eval"])
        after_cp = white_cp(after["eval"])

        # Player to move on position i is white if i is even (0-based ply before move)
        white_to_move = i % 2 == 0
        cp_loss = None
        if before_cp is not None and after_cp is not None:
            if white_to_move:
                cp_loss = before_cp - after_cp
            else:
                cp_loss = after_cp - before_cp
            cp_loss = max(0.0, cp_loss)

        best_uci = before["pv"][0] if before["pv"] else None
        analyzed_moves.append(
            {
                **move,
                "eval_before": before["eval"],
                "eval_after": after["eval"],
                "best_move": best_uci,
                "pv": before["pv"][:5],
                "cp_loss": cp_loss,
                "judgment": classify_delta(cp_loss),
                "depth": before.get("depth"),
            }
        )

    return {
        "headers": parsed["headers"],
        "start_fen": parsed["fens"][0],
        "final_eval": positions[-1]["lines"][0]["eval"] if positions else None,
        "moves": analyzed_moves,
        "positions": [
            {
                "fen": p["fen"],
                "eval": p["lines"][0]["eval"],
                "best_move": p["lines"][0]["pv"][0] if p["lines"][0]["pv"] else None,
                "pv": p["lines"][0]["pv"][:5],
            }
            for p in positions
        ],
    }
