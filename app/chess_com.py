"""Chess.com Published Data API client."""

from __future__ import annotations

from typing import Any

import httpx

BASE_URL = "https://api.chess.com/pub"
USER_AGENT = "ChessAnalyzer/1.0 (local personal tool)"


class ChessComError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


async def _get_json(path: str) -> Any:
    url = f"{BASE_URL}{path}"
    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=30.0,
        follow_redirects=True,
    ) as client:
        response = await client.get(url)
        if response.status_code == 404:
            raise ChessComError(f"Not found: {path}", status_code=404)
        if response.status_code != 200:
            raise ChessComError(
                f"Chess.com API error {response.status_code} for {path}",
                status_code=response.status_code,
            )
        return response.json()


async def get_player_profile(username: str) -> dict[str, Any]:
    return await _get_json(f"/player/{username.lower()}")


async def get_archives(username: str) -> list[str]:
    data = await _get_json(f"/player/{username.lower()}/games/archives")
    return list(data.get("archives", []))


async def get_games_for_month(username: str, year: int, month: int) -> list[dict[str, Any]]:
    path = f"/player/{username.lower()}/games/{year}/{month:02d}"
    data = await _get_json(path)
    return list(data.get("games", []))


def summarize_game(game: dict[str, Any], username: str) -> dict[str, Any]:
    white = game.get("white", {})
    black = game.get("black", {})
    user = username.lower()
    if white.get("username", "").lower() == user:
        result = white.get("result")
        color = "white"
        opponent = black.get("username", "?")
        opponent_rating = black.get("rating")
        user_rating = white.get("rating")
    else:
        result = black.get("result")
        color = "black"
        opponent = white.get("username", "?")
        opponent_rating = white.get("rating")
        user_rating = black.get("rating")

    return {
        "url": game.get("url"),
        "end_time": game.get("end_time"),
        "time_class": game.get("time_class"),
        "time_control": game.get("time_control"),
        "rules": game.get("rules", "chess"),
        "white": white.get("username"),
        "black": black.get("username"),
        "white_rating": white.get("rating"),
        "black_rating": black.get("rating"),
        "result_white": white.get("result"),
        "result_black": black.get("result"),
        "user_color": color,
        "user_result": result,
        "user_rating": user_rating,
        "opponent": opponent,
        "opponent_rating": opponent_rating,
        "pgn": game.get("pgn", ""),
        "fen": game.get("fen"),
    }
