from __future__ import annotations

import shutil
import tempfile
import uuid
import zipfile
from queue import Queue
from pathlib import Path, PurePosixPath
from threading import Thread


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


def folder_zip_rows(folder_path: str, rows: list[dict]) -> tuple[str, list[dict]]:
    safe_folder = sanitize_relative_path(folder_path) if folder_path else ""
    prefix = f"{safe_folder}/" if safe_folder else ""
    matches = [row for row in rows if row["relative_path"].startswith(prefix)]
    return safe_folder, matches


def selection_zip_rows(rows: list[dict], file_ids: list[str], folder_paths: list[str]) -> list[dict]:
    wanted_ids = set(file_ids)
    wanted_folders = [sanitize_relative_path(path) for path in folder_paths if path]
    matches = []
    seen = set()
    for row in rows:
        if row["id"] in wanted_ids or any(row["relative_path"].startswith(f"{folder}/") for folder in wanted_folders):
            if row["id"] not in seen:
                matches.append(row)
                seen.add(row["id"])
    return matches


def make_folder_zip(storage_dir: Path, code: str, folder_path: str, rows: list[dict], progress_callback=None) -> Path:
    safe_folder, matches = folder_zip_rows(folder_path, rows)
    return make_rows_zip(code, safe_folder, matches, temp_root=storage_dir / "tmp", progress_callback=progress_callback)


def make_selection_zip(code: str, rows: list[dict], file_ids: list[str], folder_paths: list[str], progress_callback=None) -> Path:
    matches = selection_zip_rows(rows, file_ids, folder_paths)
    return make_rows_zip(code, "selection", matches, progress_callback=progress_callback)


def zip_filename(code: str, label: str) -> str:
    return f"{label.replace('/', '-') or code}-{uuid.uuid4().hex[:8]}.zip"


def make_rows_zip(code: str, label: str, rows: list[dict], temp_root: Path | None = None, progress_callback=None) -> Path:
    if temp_root:
        temp_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="justshare-zip-", dir=temp_root))
    zip_path = temp_dir / zip_filename(code, label)
    try:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as archive:
            write_zip_rows(archive, rows, progress_callback)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    return zip_path


def write_zip_rows(archive: zipfile.ZipFile, rows: list[dict], progress_callback=None) -> None:
    for row in rows:
        source = Path(row["filesystem_path"])
        if source.exists() and source.is_file():
            archive.write(source, arcname=row["relative_path"])
            if progress_callback:
                progress_callback(int(row.get("size") or 0))


class StreamingZipWriter:
    def __init__(self, output: Queue) -> None:
        self.output = output
        self.position = 0

    def writable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return False

    def tell(self) -> int:
        return self.position

    def write(self, data) -> int:
        chunk = bytes(data)
        self.position += len(chunk)
        if chunk:
            self.output.put(chunk)
        return len(chunk)

    def flush(self) -> None:
        return None


def stream_rows_zip(rows: list[dict]):
    output = Queue(maxsize=8)
    done = object()

    def worker() -> None:
        try:
            writer = StreamingZipWriter(output)
            with zipfile.ZipFile(writer, "w", compression=zipfile.ZIP_STORED) as archive:
                write_zip_rows(archive, rows)
        except Exception as exc:
            output.put(exc)
        finally:
            output.put(done)

    Thread(target=worker, daemon=True).start()

    while True:
        item = output.get()
        if item is done:
            break
        if isinstance(item, Exception):
            raise item
        yield item
