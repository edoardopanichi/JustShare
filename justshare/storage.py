from __future__ import annotations

import shutil
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath


class UnsafePathError(ValueError):
    pass


def sanitize_relative_path(raw_path: str) -> str:
    raw_normalized = raw_path.replace("\\", "/")
    if raw_normalized.startswith("/"):
        raise UnsafePathError("Path must be relative and cannot be absolute.")
    cleaned = raw_normalized.strip("/")
    if not cleaned:
        raise UnsafePathError("Path cannot be empty.")
    if any(ord(char) < 32 for char in cleaned):
        raise UnsafePathError("Path contains control characters.")
    path = PurePosixPath(cleaned)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise UnsafePathError("Path must be relative and cannot contain traversal segments.")
    return str(path)


def room_upload_dir(storage_dir: Path, code: str) -> Path:
    return storage_dir / "rooms" / code / "uploads"


def resolve_upload_path(storage_dir: Path, code: str, relative_path: str) -> Path:
    safe_path = sanitize_relative_path(relative_path)
    base = room_upload_dir(storage_dir, code).resolve()
    target = (base / safe_path).resolve()
    if base != target and base not in target.parents:
        raise UnsafePathError("Resolved path escapes the room upload directory.")
    return target


def remove_room_files(storage_dir: Path, code: str) -> None:
    shutil.rmtree(storage_dir / "rooms" / code, ignore_errors=True)


def build_tree(rows: list[dict]) -> dict:
    root = {"name": "", "path": "", "type": "folder", "children": {}}
    for row in rows:
        parts = row["relative_path"].split("/")
        node = root
        current = []
        for folder in parts[:-1]:
            current.append(folder)
            children = node["children"]
            node = children.setdefault(
                folder,
                {"name": folder, "path": "/".join(current), "type": "folder", "children": {}},
            )
        filename = parts[-1]
        node["children"][filename] = {
            "id": row["id"],
            "name": filename,
            "path": row["relative_path"],
            "type": "file",
            "size": row["size"],
            "mime_type": row["mime_type"],
            "uploaded_at": row["uploaded_at"],
        }

    def finalize(node: dict) -> dict:
        if node["type"] == "folder":
            children = [finalize(child) for child in node["children"].values()]
            children.sort(key=lambda item: (item["type"] == "file", item["name"].lower()))
            return {"name": node["name"], "path": node["path"], "type": "folder", "children": children}
        return node

    return finalize(root)


def make_folder_zip(storage_dir: Path, code: str, folder_path: str, rows: list[dict]) -> Path:
    safe_folder = sanitize_relative_path(folder_path) if folder_path else ""
    prefix = f"{safe_folder}/" if safe_folder else ""
    matches = [row for row in rows if row["relative_path"].startswith(prefix)]
    temp_dir = Path(tempfile.mkdtemp(prefix="justshare-zip-"))
    zip_path = temp_dir / f"{safe_folder.replace('/', '-') or code}-{uuid.uuid4().hex[:8]}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for row in matches:
            source = Path(row["filesystem_path"])
            if source.exists() and source.is_file():
                archive.write(source, arcname=row["relative_path"])
    return zip_path
