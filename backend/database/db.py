from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from backend.config.settings import Settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    genre TEXT NOT NULL,
    generated_story TEXT NOT NULL,
    original_text TEXT,
    continuation TEXT,
    combined_story TEXT,
    summary TEXT,
    model_used TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    rating INTEGER DEFAULT 0,
    word_count INTEGER NOT NULL,
    reading_time REAL NOT NULL,
    generation_time REAL NOT NULL,
    temperature REAL NOT NULL,
    top_k INTEGER NOT NULL,
    top_p REAL NOT NULL,
    max_tokens INTEGER NOT NULL,
    language TEXT NOT NULL DEFAULT 'English',
    mode TEXT NOT NULL DEFAULT 'generation',
    visibility TEXT NOT NULL DEFAULT 'private',
    author_name TEXT NOT NULL DEFAULT 'Anonymous',
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_stories_timestamp ON stories(timestamp);
CREATE INDEX IF NOT EXISTS idx_stories_genre ON stories(genre);
CREATE INDEX IF NOT EXISTS idx_stories_model ON stories(model_used);
CREATE INDEX IF NOT EXISTS idx_stories_rating ON stories(rating);
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
"""


def ensure_database() -> None:
    Settings.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(Settings.DB_PATH) as conn:
        conn.executescript(SCHEMA)
        # Try to add user_id column if it doesn't exist for backward compatibility
        try:
            conn.execute("ALTER TABLE stories ADD COLUMN user_id INTEGER REFERENCES users(id)")
        except sqlite3.OperationalError:
            pass
        conn.commit()


def get_connection() -> sqlite3.Connection:
    ensure_database()
    conn = sqlite3.connect(Settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def reset_database_for_tests(path: Path) -> None:
    Settings.DB_PATH = path
    if path.exists():
        path.unlink()
    ensure_database()
