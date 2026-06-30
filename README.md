# JustShare

JustShare is a privacy-focused local-network sharing app. It runs on one machine as a local server and lets other devices on the same LAN join a shared room from a browser.

Use it to share plain text notes, formatted code snippets, files, and folders without accounts, cloud services, telemetry, analytics, or internet access.

## How Storage Works

The machine running JustShare is the server and storage hub. If Machine A uploads data, the data is transferred to Machine S, stored on Machine S under `./data`, and later downloaded by Machine B from Machine S.

Browser clients keep only temporary UI state. Uploaded files and folders occupy disk space on the server machine until the room is cleared or expires.

Rooms expire after 1 hour with no connected clients and no activity. Expiry deletes notepad text, code text, upload metadata, uploaded files, and uploaded folders from the server.

## Features

- Three-word room codes such as `red-yes-fly`
- Shared persistent notepad with autosave
- Shared code area with monospace formatting and copy button
- Drag-and-drop file upload
- Folder upload where the browser supports it
- Folder picker using browser folder APIs
- Tree-view browsing
- Individual file downloads
- Folder downloads as ZIP files generated on demand
- Clear buttons for notepad, code, and uploads
- Real-time synchronization with WebSockets
- Local-only frontend assets

## Supported Systems

Server:

- Windows 10 and newer
- macOS
- Linux
- Docker-compatible hosts

Browsers:

- Chrome
- Edge
- Brave
- Firefox
- Safari

Folder upload support varies by browser. Chrome and Edge provide the best folder support. Browsers without folder APIs can still upload multiple files.

## Quick Start

### Windows

```powershell
.\run_justshare.ps1
```

### Linux, macOS, WSL, or Git Bash

```bash
./run_justshare.sh
```

The launcher creates a virtual environment, installs dependencies, creates local folders, and starts the server.

Example output:

```text
JustShare is running.

Local access:
http://localhost:8787

LAN access:
http://192.168.1.20:8787

Storage:
./data

Use only on trusted local networks. Press CTRL+C to stop.
```

## Manual Install

```bash
python -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m justshare
```

On Windows:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m justshare
```

## Joining From Another Machine

1. Start JustShare on the server machine.
2. Note the LAN URL printed by the launcher.
3. Open that URL from another machine on the same network.
4. Create a room or join using the three-word room code.

Windows Firewall or antivirus software may block access. If the LAN URL does not load, allow Python or port `8787` on the server machine.

## Using Rooms

- Click **Create room** to create a room.
- Share the three-word code with another LAN user.
- The other user opens the same server URL and enters the code.
- Notepad, code, and upload tree changes sync live.

## Uploading Files And Folders

- Drag files into the upload area, or use **Choose files**.
- Use **Choose folder** in compatible browsers.
- Folder hierarchy is preserved on upload.
- Files are stored uncompressed on the server.
- Download individual files from the tree.
- Download folders as ZIP files generated on demand.

## Clearing Data

Each room includes buttons to clear:

- notepad
- code area
- all uploads

Clear actions affect everyone in the room and delete persisted server data for that section.

Inactive rooms are deleted automatically after 1 hour when no clients are connected.

## Configuration

Set environment variables before starting JustShare:

```bash
export JUSTSHARE_HOST=0.0.0.0
export JUSTSHARE_PORT=8787
export JUSTSHARE_STORAGE_DIR=./data
export JUSTSHARE_ROOM_TTL_SECONDS=3600
export JUSTSHARE_MAX_UPLOAD_FILES=10000
export JUSTSHARE_ALLOWED_NETWORKS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32
```

PowerShell:

```powershell
$env:JUSTSHARE_PORT = "8787"
$env:JUSTSHARE_STORAGE_DIR = ".\data"
$env:JUSTSHARE_MAX_UPLOAD_FILES = "10000"
.\run_justshare.ps1
```

`JUSTSHARE_MAX_UPLOAD_FILES` controls how many files can be uploaded in one request. Set it to `0` to remove the count limit, but large folders can still be constrained by browser memory, request size, disk space, and server load.

## Always-On Deployment

### Windows

Install a logon Scheduled Task:

```powershell
.\scripts\install_windows_service.ps1
```

For server-style background operation, NSSM can also wrap `run_justshare.ps1`.

### Linux

```bash
sudo ./scripts/install_linux_service.sh
sudo systemctl status justshare
journalctl -u justshare -f
```

### macOS

```bash
./scripts/install_macos_service.sh
launchctl list | grep justshare
```

### Docker

```bash
docker compose up --build
```

Persistent data is mounted from `./data`.

## Development

Run tests:

```bash
python -m pytest -q
```

Compile check:

```bash
python -m compileall justshare tests
```

## Troubleshooting

- LAN page does not load: check firewall rules and confirm both devices are on the same network.
- Folder upload is missing: use Chrome or Edge for full folder support.
- Room disappeared: rooms are deleted after 1 hour of inactivity with no connected clients.
- Downloads fail: verify the server still has the files under `./data`.
- Port conflict: set `JUSTSHARE_PORT` to another port before starting.
