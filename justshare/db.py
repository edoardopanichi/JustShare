from __future__ import annotations

import sqlite3
import time
import uuid
from pathlib import Path
from typing import Iterable

from .codes import new_room_code, normalize_room_code


SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    created_at REAL NOT NULL,
    last_activity_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS room_text (
    room_code TEXT PRIMARY KEY,
    notepad TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT '',
    updated_at REAL NOT NULL,
    FOREIGN KEY(room_code) REFERENCES rooms(code) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    original_name TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    filesystem_path TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    uploaded_at REAL NOT NULL,
    UNIQUE(room_code, relative_path),
    FOREIGN KEY(room_code) REFERENCES rooms(code) ON DELETE CASCADE
);
"""


class Database:
    def __init__(self, path: Path):
        self.path = path

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def init(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)

    def create_room(self) -> str:
        for _ in range(50):
            code = new_room_code()
            now = time.time()
            try:
                with self.connect() as connection:
                    connection.execute(
                        "INSERT INTO rooms(code, created_at, last_activity_at) VALUES (?, ?, ?)",
                        (code, now, now),
                    )
                    connection.execute(
                        "INSERT INTO room_text(room_code, notepad, code, updated_at) VALUES (?, '', '', ?)",
                        (code, now),
                    )
                return code
            except sqlite3.IntegrityError:
                continue
        raise RuntimeError("Could not generate a unique room code.")

    def require_room(self, code: str) -> str:
        code = normalize_room_code(code)
        with self.connect() as connection:
            row = connection.execute("SELECT code FROM rooms WHERE code = ?", (code,)).fetchone()
        if row is None:
            raise KeyError(code)
        return code

    def touch_room(self, code: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE rooms SET last_activity_at = ? WHERE code = ?",
                (time.time(), code),
            )

    def get_room_state(self, code: str) -> dict:
        code = self.require_room(code)
        with self.connect() as connection:
            text = connection.execute(
                "SELECT notepad, code FROM room_text WHERE room_code = ?",
                (code,),
            ).fetchone()
            uploads = self.list_uploads(code, connection)
        return {"code": code, "notepad": text["notepad"], "code_text": text["code"], "uploads": uploads}

    def set_text(self, code: str, field: str, value: str) -> None:
        if field not in {"notepad", "code"}:
            raise ValueError("Invalid text field.")
        code = self.require_room(code)
        now = time.time()
        with self.connect() as connection:
            connection.execute(
                f"UPDATE room_text SET {field} = ?, updated_at = ? WHERE room_code = ?",
                (value, now, code),
            )
            connection.execute(
                "UPDATE rooms SET last_activity_at = ? WHERE code = ?",
                (now, code),
            )

    def add_upload(self, code: str, original_name: str, relative_path: str, filesystem_path: Path, size: int, mime_type: str) -> str:
        code = self.require_room(code)
        upload_id = uuid.uuid4().hex
        now = time.time()
        with self.connect() as connection:
            connection.execute(
                "DELETE FROM uploads WHERE room_code = ? AND relative_path = ?",
                (code, relative_path),
            )
            connection.execute(
                """
                INSERT INTO uploads(id, room_code, original_name, relative_path, filesystem_path, size, mime_type, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (upload_id, code, original_name, relative_path, str(filesystem_path), size, mime_type, now),
            )
            connection.execute(
                "UPDATE rooms SET last_activity_at = ? WHERE code = ?",
                (now, code),
            )
        return upload_id

    def list_uploads(self, code: str, connection: sqlite3.Connection | None = None) -> list[dict]:
        query = "SELECT * FROM uploads WHERE room_code = ? ORDER BY relative_path"
        if connection is not None:
            rows = connection.execute(query, (code,)).fetchall()
        else:
            with self.connect() as local:
                rows = local.execute(query, (code,)).fetchall()
        return [dict(row) for row in rows]

    def get_upload(self, code: str, upload_id: str) -> dict:
        code = self.require_room(code)
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM uploads WHERE room_code = ? AND id = ?",
                (code, upload_id),
            ).fetchone()
        if row is None:
            raise KeyError(upload_id)
        self.touch_room(code)
        return dict(row)

    def clear_uploads(self, code: str) -> None:
        code = self.require_room(code)
        with self.connect() as connection:
            connection.execute("DELETE FROM uploads WHERE room_code = ?", (code,))
            connection.execute(
                "UPDATE rooms SET last_activity_at = ? WHERE code = ?",
                (time.time(), code),
            )

    def expired_rooms(self, ttl_seconds: int, active_codes: Iterable[str]) -> list[str]:
        active = set(active_codes)
        cutoff = time.time() - ttl_seconds
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT code FROM rooms WHERE last_activity_at < ?",
                (cutoff,),
            ).fetchall()
        return [row["code"] for row in rows if row["code"] not in active]

    def delete_room(self, code: str) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM rooms WHERE code = ?", (code,))
