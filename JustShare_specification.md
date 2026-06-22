# JustShare

## Project Overview

JustShare is a privacy-focused local-network sharing application that allows multiple devices on the same LAN to access a shared room through a simple code.

The application runs entirely on a local server and is accessed through a web browser.

Its primary purpose is to quickly share:

1. Plain text notes
2. Formatted code snippets
3. Files and folders

without requiring cloud services, accounts, or internet access.

## Core Features

### Persistent Notepad
- Shared persistent text area
- Auto-save
- Real-time synchronization
- Preserves line breaks

### Code Area
- Preserves indentation and formatting
- Monospaced font
- Copy-to-clipboard
- Optional syntax highlighting

### File Sharing
- Drag-and-drop upload
- Download from other machines
- Support for common file formats

### Folder Sharing (First-Class Feature)

Users must be able to upload one or more folders without manually creating ZIP archives.

Requirements:
- Drag-and-drop folders
- Folder picker support
- Multiple folders at once
- Preserve hierarchy
- Tree-view browsing
- Download individual files
- Download entire folders
- Preserve relative paths during upload
- Use the browser File System Access API when available
- Use `webkitdirectory` as fallback for folder selection
- Support recursive folder upload from compatible browsers
- Gracefully fall back to multi-file upload when folder APIs are unavailable

Storage remains uncompressed and folder-based.

Download behavior:
- File -> direct download
- Folder -> ZIP generated on demand

## Room System

Each room contains:
- Shared notepad
- Shared code section
- Shared files
- Shared folders

Access via simple code:
- 482913
- A7K2Q9
- BLUE-FOX

No account required.

## Compatibility Requirements

JustShare must work on common desktop operating systems and common modern browsers.

### Supported Operating Systems

The local server should run on:

- Windows 10 and newer
- macOS
- Linux

Optional later support:

- Raspberry Pi OS
- NAS/Linux server environments
- Docker-compatible systems

### Supported Browsers

The web interface should support:

- Google Chrome
- Microsoft Edge
- Mozilla Firefox
- Brave
- Safari

### Browser Feature Strategy

Folder upload support differs between browsers. Therefore, JustShare must use progressive enhancement:

1. Prefer the File System Access API when available.
2. Use `webkitdirectory` for Chromium-based browsers.
3. Use drag-and-drop folder traversal where supported.
4. Fall back to normal multi-file upload if folder upload is not supported.

The application must clearly inform the user when their browser does not support folder upload.

Example warning:

```text
Your browser does not support folder upload. You can still upload multiple files, or use Chrome/Edge for full folder sharing.
```

### Offline Compatibility

All frontend assets must be served locally by the JustShare server.

The app must not rely on:

- External CDNs
- Remote JavaScript libraries
- Cloud-hosted fonts
- External analytics
- External APIs

---

## Privacy

- Local server only
- LAN-only access
- No cloud dependency
- No telemetry
- No analytics
- No external data storage

Allowed networks:
- 10.0.0.0/8
- 172.16.0.0/12
- 192.168.0.0/16
- 127.0.0.1

## Synchronization

Real-time synchronization for:
- Notepad
- Code area
- File list
- Folder tree

Preferred implementation:
- WebSockets

## Suggested Stack

Backend:
- Python FastAPI
- SQLite

Frontend:
- HTML
- CSS
- JavaScript

Optional:
- Monaco Editor
- CodeMirror

All assets served locally.

## Documentation and Repository Requirements

### README.md

The final repository must include a complete and clear `README.md`.

The README must explain:

- What JustShare does
- Main features
- Privacy model
- Supported operating systems
- Supported browsers
- How to install dependencies
- How to run the tool locally
- How to access it from another machine on the same network
- How to create and join a room
- How to use the notepad section
- How to use the code section
- How to upload files
- How to upload folders
- How to download files and folders
- How to configure storage path, port, and allowed networks
- How to run JustShare as an always-on service
- Basic troubleshooting

The README should include copy-pasteable commands for:

- Windows
- Ubuntu/Linux
- macOS

Example:

```bash
./run_justshare.sh
```

```powershell
.\run_justshare.ps1
```

---

### AGENT.md

The repository must include an `AGENT.md` file intended for future AI agents or developers working on the project.

`AGENT.md` must include:

- A minimal overview of the repository structure
- Where the backend code lives
- Where the frontend code lives
- Where configuration files live
- Where uploaded room data is stored
- How rooms are created and resolved
- How notepad synchronization works
- How code block synchronization works
- How file and folder upload works
- How folder relative paths are preserved
- How local-network-only access is enforced
- How to run tests
- How to manually test the app from two machines
- Known limitations
- Common development mistakes
- Common testing issues
- Non-obvious implementation details
- Any unconventional design choices that are difficult to understand from the code alone

Examples of issues to document in `AGENT.md`:

- Browser folder upload APIs differ between Chrome, Edge, Firefox, and Safari.
- `webkitdirectory` is not a standard name but is widely used in Chromium browsers.
- Folder drag-and-drop may expose relative paths differently depending on browser.
- The app must not load frontend libraries from CDNs.
- LAN-only restriction should be enforced server-side, not only in the frontend.
- `0.0.0.0` allows LAN access but must not be confused with public internet exposure.
- Windows firewall may block access from other machines.
- Antivirus tools may interfere with local server ports.
- Folder download may require creating a temporary ZIP on demand.
- Temporary ZIP files must be cleaned up after download.
- Large uploads should not block the server event loop.

---

## Always-On Deployment Requirements

JustShare is intended to eventually run permanently on a company computer or internal server.

The project must therefore support always-on deployment.

### Requirements

The repository must include scripts or instructions to run JustShare as a persistent service.

Supported deployment targets:

- Windows workstation/server
- Ubuntu/Linux server
- macOS machine
- Optional Docker host

### Windows Always-On Mode

The project should provide one of the following:

- A Windows service setup script
- A Task Scheduler setup script
- Clear instructions for using NSSM or another service wrapper

Suggested file:

```text
scripts/install_windows_service.ps1
```

The service should:

- Start automatically after reboot
- Run JustShare in the background
- Restart on failure if possible
- Write logs to a local logs folder

### Linux Always-On Mode

The project should provide a `systemd` service file or installer script.

Suggested files:

```text
scripts/install_linux_service.sh
deploy/justshare.service
```

The service should:

- Start automatically after reboot
- Restart on failure
- Run under a non-root user when possible
- Store logs using `journalctl` or a local logs folder

### macOS Always-On Mode

The project should provide a `launchd` plist or setup instructions.

Suggested files:

```text
scripts/install_macos_service.sh
deploy/com.justshare.server.plist
```

### Docker Option

Optional but recommended:

```text
Dockerfile
docker-compose.yml
```

The Docker setup should expose only the configured local port and mount persistent storage from the host.

---

## Plug-and-Play Launch Requirement

The repository must be designed so that a user can start JustShare with one obvious command.

There should be one plug-and-play launch script per major operating system.

Required scripts:

```text
run_justshare.ps1      # Windows PowerShell
run_justshare.sh       # Linux/macOS shell
```

Optional convenience scripts:

```text
run_justshare.bat      # Windows double-click fallback
install_dependencies.ps1
install_dependencies.sh
```

### Launch Script Responsibilities

The launch script should:

1. Detect whether required dependencies are installed.
2. Create a virtual environment if needed.
3. Install missing dependencies if needed.
4. Create required local folders.
5. Load the default configuration.
6. Start the JustShare backend.
7. Print the local access URL.
8. Print the LAN access URL.
9. Print the storage directory.
10. Print a clear warning that access is intended only for trusted local networks.

Example terminal output:

```text
JustShare is running.

Local access:
http://localhost:8787

LAN access:
http://192.168.1.20:8787

Storage:
./data

Press CTRL+C to stop.
```

### Cross-Platform Behavior

The scripts should behave consistently across:

- Windows
- Ubuntu/Linux
- macOS

The user should not need to manually start separate frontend and backend processes.

The launcher must start all required components for the application to work.

If the frontend is built separately, the launcher must either:

- Build it automatically if needed, or
- Serve a prebuilt local frontend from the backend.

For the MVP, the preferred architecture is:

```text
Single backend process serves both API and frontend.
```

This makes the tool easier to deploy and run permanently.

---

## Acceptance Criteria

1. Local server starts.
2. Room creation works.
3. Another LAN machine joins using room code.
4. Notepad sync works.
5. Code formatting preserved.
6. Files upload/download correctly.
7. Folders upload without zipping.
8. Folder hierarchy preserved.
9. Folder download supported.
10. No cloud services required.
11. Works without internet.
12. Data stored only on the host machine.
