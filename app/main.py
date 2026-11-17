"""FastAPI entrypoint for Chess Analyzer."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.analysis import analyze_game, parse_pgn
from app.chess_com import (
    ChessComError,
    get_archives,
    get_games_for_month,
    get_player_profile,
    summarize_game,
)
from app.stockfish_engine import StockfishNotFoundError, resolve_binary

ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "static"

app = FastAPI(title="Chess Analyzer", version="0.1.0")


class AnalyzeRequest(BaseModel):
    pgn: str = Field(..., min_length=1)
    depth: int = Field(15, ge=5, le=30)


@app.get("/api/health")
def health() -> dict[str, Any]:
    stockfish_ok = False
    stockfish_path = None
    try:
        path = resolve_binary()
        stockfish_ok = True
        stockfish_path = str(path)
    except StockfishNotFoundError:
        pass
    return {"ok": True, "stockfish": stockfish_ok, "stockfish_path": stockfish_path}


@app.get("/api/player/{username}")
async def player(username: str) -> dict[str, Any]:
    try:
        profile = await get_player_profile(username)
        archives = await get_archives(username)
    except ChessComError as exc:
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc
    return {
        "username": profile.get("username", username),
        "name": profile.get("name"),
        "avatar": profile.get("avatar"),
        "url": profile.get("url"),
        "archives": archives,
    }


@app.get("/api/games")
async def games(
    username: str = Query(..., min_length=1),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
) -> dict[str, Any]:
    try:
        raw_games = await get_games_for_month(username, year, month)
    except ChessComError as exc:
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc

    # Newest first
    summarized = [summarize_game(g, username) for g in raw_games if g.get("rules", "chess") == "chess"]
    summarized.sort(key=lambda g: g.get("end_time") or 0, reverse=True)
    return {
        "username": username,
        "year": year,
        "month": month,
        "count": len(summarized),
        "games": summarized,
    }


@app.post("/api/parse")
def parse(req: AnalyzeRequest) -> dict[str, Any]:
    try:
        return parse_pgn(req.pgn)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest) -> dict[str, Any]:
    try:
        return analyze_game(req.pgn, depth=req.depth)
    except StockfishNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
