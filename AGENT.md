# AGENT.md

## Repository Structure

- Backend package: `justshare/`
- Frontend assets: `justshare/static/`
- Tests: `tests/`
- Deployment templates: `deploy/`
- Install helpers: `scripts/`
- Default runtime data: `data/`, created at launch and intentionally not required in git

## Architecture

JustShare is a single FastAPI process. It serves the vanilla frontend, exposes JSON APIs, accepts uploads, maintains WebSocket connections, and stores all shared state on the server machine.

SQLite stores rooms, notepad/code text, upload metadata, and activity timestamps. Uploaded files are stored uncompressed in `data/rooms/<room-code>/uploads/`.

## Rooms

Room codes are generated as three short common English words joined with hyphens. Codes are lowercase and normalized on input.

Rooms are created by `POST /api/rooms`. Room data is resolved by code. A background cleanup task deletes rooms whose `last_activity_at` is older than `JUSTSHARE_ROOM_TTL_SECONDS` and that have no active WebSocket clients.

Default cleanup is 1 hour.

## Synchronization

The notepad and code area save through HTTP `PUT` routes with debouncing in the frontend. The backend persists the change first, then broadcasts a WebSocket update to clients in the same room.

Upload tree changes and clear actions are also broadcast through the room WebSocket.

## Uploads And Folder Paths

Browsers send files plus `relative_paths` form fields. The backend sanitizes every relative path before writing to disk.

Do not trust browser path metadata. Preserve hierarchy only after rejecting absolute paths, traversal segments, empty path parts, and control characters.

Folder downloads are generated as temporary ZIP files on demand. Temporary ZIP parent directories are deleted after the response completes.

## LAN-Only Access

Local-network-only access is enforced server-side in middleware with CIDR ranges from `JUSTSHARE_ALLOWED_NETWORKS`. Do not move this check to the frontend only.

Default allowed networks are:

- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `127.0.0.1/32`
- `::1/128`

## Running Tests

```bash
python -m pytest -q
python -m compileall justshare tests
```

## Manual Two-Machine Test

1. Start the server with `run_justshare.ps1` or `run_justshare.sh`.
2. Open the printed local URL on the server machine.
3. Open the printed LAN URL on another machine.
4. Create a room on one machine and join it from the other.
5. Edit notepad and code content in both browsers.
6. Upload files and folders, then download them from the other machine.
7. Clear notepad, code, and uploads and verify both browsers update.

## Known Limitations

- Folder upload APIs differ across Chrome, Edge, Brave, Firefox, and Safari.
- `webkitdirectory` is not a standard name, but it is widely used by Chromium browsers.
- Drag-and-drop folder traversal is browser-specific.
- Large uploads are streamed in chunks but still share the same FastAPI process.
- No authentication is provided; use only on trusted LANs.

## Common Mistakes

- Do not load frontend dependencies from CDNs.
- Do not store uploads only in memory.
- Do not skip path sanitization for folder uploads.
- Do not confuse binding to `0.0.0.0` with public internet safety.
- Do not rely on WebSocket presence alone for persistence; SQLite and disk are the source of truth.
- Do not leave generated ZIP files behind after folder downloads.
