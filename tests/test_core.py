from __future__ import annotations

import time
import zipfile

import pytest

from justshare.codes import new_room_code, normalize_room_code
from justshare.config import load_config
from justshare.db import Database
from justshare.security import is_allowed_client
from justshare.storage import UnsafePathError, build_tree, make_folder_zip, resolve_upload_path, sanitize_relative_path


def test_room_code_is_three_words() -> None:
    code = new_room_code()
    assert len(code.split("-")) == 3
    assert normalize_room_code(code.upper()) == code


def test_lan_client_checks() -> None:
    config = load_config()
    assert is_allowed_client("192.168.1.10", config.allowed_networks)
    assert is_allowed_client("127.0.0.1", config.allowed_networks)
    assert not is_allowed_client("8.8.8.8", config.allowed_networks)


def test_rejects_unsafe_relative_paths(tmp_path) -> None:
    with pytest.raises(UnsafePathError):
        sanitize_relative_path("../secret.txt")
    with pytest.raises(UnsafePathError):
        sanitize_relative_path("/absolute.txt")
    with pytest.raises(UnsafePathError):
        resolve_upload_path(tmp_path, "red-yes-fly", "../../secret.txt")


def test_tree_and_zip_preserve_hierarchy(tmp_path) -> None:
    source = tmp_path / "rooms" / "red-yes-fly" / "uploads" / "folder" / "child.txt"
    source.parent.mkdir(parents=True)
    source.write_text("hello", encoding="utf-8")
    rows = [
        {
            "id": "1",
            "relative_path": "folder/child.txt",
            "filesystem_path": str(source),
            "size": 5,
            "mime_type": "text/plain",
            "uploaded_at": 1.0,
        }
    ]
    tree = build_tree(rows)
    assert tree["children"][0]["name"] == "folder"
    assert tree["children"][0]["children"][0]["name"] == "child.txt"

    zip_path = make_folder_zip(tmp_path, "red-yes-fly", "folder", rows)
    with zipfile.ZipFile(zip_path) as archive:
        assert archive.namelist() == ["folder/child.txt"]


def test_expired_rooms_skip_active(tmp_path) -> None:
    db = Database(tmp_path / "data.sqlite3")
    db.init()
    code = db.create_room()
    with db.connect() as connection:
        connection.execute(
            "UPDATE rooms SET last_activity_at = ? WHERE code = ?",
            (time.time() - 5000, code),
        )
    assert db.expired_rooms(3600, active_codes={code}) == []
    assert db.expired_rooms(3600, active_codes=set()) == [code]
