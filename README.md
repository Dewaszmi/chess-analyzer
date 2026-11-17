# Chess Analyzer

Local web app that fetches your Chess.com games and analyzes a selected game with a locally downloaded Stockfish engine.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_stockfish.py
```

## Run

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000

1. Enter your Chess.com username (saved in browser localStorage).
2. Choose year/month and load games.
3. Click a game to analyze it with Stockfish.
4. Step through moves with buttons or left/right arrow keys.

## Notes

- Chess.com public API needs no login; only finished public games are available.
- Analysis runs entirely on your machine via `bin/stockfish`.
- Increase depth for stronger analysis but slower performance (default 15).
