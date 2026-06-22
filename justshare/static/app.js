const state = {
  code: null,
  socket: null,
  localNotepadEdit: false,
  localCodeEdit: false,
  notepadTimer: null,
  codeTimer: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  createRoom: $("createRoom"),
  joinForm: $("joinForm"),
  roomInput: $("roomInput"),
  roomGate: $("roomGate"),
  workspace: $("workspace"),
  roomBanner: $("roomBanner"),
  roomCode: $("roomCode"),
  copyRoom: $("copyRoom"),
  leaveRoom: $("leaveRoom"),
  warning: $("warning"),
  status: $("status"),
  editorGrid: $("editorGrid"),
  editorSplitter: $("editorSplitter"),
  notepad: $("notepad"),
  codeArea: $("codeArea"),
  codeHighlight: $("codeHighlight"),
  clearNotepad: $("clearNotepad"),
  clearCode: $("clearCode"),
  copyCode: $("copyCode"),
  clearUploads: $("clearUploads"),
  dropZone: $("dropZone"),
  filePicker: $("filePicker"),
  folderButton: $("folderButton"),
  folderPicker: $("folderPicker"),
  uploadProgress: $("uploadProgress"),
  tree: $("tree"),
};

function setStatus(message) {
  els.status.textContent = message;
}

function setWarning(message) {
  els.warning.textContent = message;
  els.warning.classList.toggle("hidden", !message);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

function detectLanguage(value) {
  const trimmed = value.trim();
  if (!trimmed) return "plain";
  if (/^({[\s\S]*}|\[[\s\S]*\])$/.test(trimmed)) return "json";
  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) return "markup";
  if (/\b(def|import|from|self|elif|print)\b|^\s*#.*$/m.test(trimmed)) return "python";
  if (/\b(function|const|let|var|return|async|await|class|=>)\b/.test(trimmed)) return "javascript";
  if (/[.#][\w-]+\s*\{|\b(color|display|margin|padding|grid|flex)\s*:/.test(trimmed)) return "css";
  return "plain";
}

function renderTokens(value, pattern, tokenClass) {
  let html = "";
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    html += escapeHtml(value.slice(lastIndex, match.index));
    const className = tokenClass(match);
    html += className ? `<span class="${className}">${escapeHtml(token)}</span>` : escapeHtml(token);
    lastIndex = match.index + token.length;
  }

  return html + escapeHtml(value.slice(lastIndex));
}

function highlightCode(value) {
  const language = detectLanguage(value);
  let html = escapeHtml(value || " ");

  if (value && language === "markup") {
    html = renderTokens(value, /<!--[\s\S]*?-->|<\/?[\w:-]+|\s[\w:-]+(?==)|"[^"]*"|'[^']*'/g, (match) => {
      if (match[0].startsWith("<!--")) return "tok-comment";
      if (match[0].startsWith("<")) return "tok-keyword";
      if (match[0].startsWith("\"") || match[0].startsWith("'")) return "tok-string";
      return "tok-attr";
    });
  } else if (value && language === "css") {
    html = renderTokens(value, /\/\*[\s\S]*?\*\/|[.#]?[-_a-zA-Z][-\w]*(?=\s*\{)|[-_a-zA-Z][-\w]*(?=\s*:)|:\s*[^;\n]+/g, (match) => {
      if (match[0].startsWith("/*")) return "tok-comment";
      if (/^[.#]/.test(match[0]) || /\{/.test(value.slice(match.index + match[0].length, match.index + match[0].length + 4))) return "tok-keyword";
      if (/[-_a-zA-Z][-\w]*/.test(match[0]) && value[match.index + match[0].length] === ":") return "tok-attr";
      return "tok-string";
    });
  } else if (value) {
    const keywords = /\b(async|await|break|case|class|const|def|elif|else|except|finally|for|from|function|if|import|in|let|new|null|return|self|try|var|while|true|false|None|pass)\b/;
    html = renderTokens(value, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|#.*|\b0x[\da-fA-F]+\b|\b\d+(?:\.\d+)?\b|\b(?:async|await|break|case|class|const|def|elif|else|except|finally|for|from|function|if|import|in|let|new|null|return|self|try|var|while|true|false|None|pass)\b/g, (match) => {
      if (/^["'`]/.test(match[0])) return "tok-string";
      if (/^(\/\/|#)/.test(match[0])) return "tok-comment";
      if (/^(0x|\d)/i.test(match[0])) return "tok-number";
      if (keywords.test(match[0])) return "tok-keyword";
      return "";
    });
  }

  els.codeHighlight.innerHTML = html;
  els.codeHighlight.dataset.language = language === "plain" ? "" : language;
}

function setCodeValue(value) {
  els.codeArea.value = value;
  highlightCode(value);
}

function setEnabled(enabled) {
  for (const el of [els.notepad, els.codeArea, els.clearNotepad, els.clearCode, els.copyCode, els.clearUploads, els.filePicker, els.folderButton, els.folderPicker]) {
    el.disabled = !enabled;
  }
}

function showWorkspace() {
  els.roomGate.classList.add("hidden");
  els.workspace.classList.remove("hidden");
  setEnabled(true);
}

function showGate(message = "Create a room or join one to start sharing.") {
  state.code = null;
  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }
  clearTimeout(state.notepadTimer);
  clearTimeout(state.codeTimer);
  state.localNotepadEdit = false;
  state.localCodeEdit = false;
  els.roomCode.textContent = "not connected";
  els.notepad.value = "";
  setCodeValue("");
  els.uploadProgress.textContent = "";
  renderTree(null);
  setEnabled(false);
  els.workspace.classList.add("hidden");
  els.roomGate.classList.remove("hidden");
  setStatus(message);
}

function currentRoomCode() {
  const code = String(state.code || "").trim();
  if (!code) {
    setEnabled(false);
    setStatus("No active room. Create or join a room before editing.");
    return null;
  }
  return code;
}

function api(path, options = {}) {
  return fetch(path, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options,
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `Request failed: ${response.status}`);
    }
    return response.json();
  });
}

async function createRoom() {
  const room = await api("/api/rooms", { method: "POST" });
  if (!room.code) {
    throw new Error("The server did not return a room code.");
  }
  await joinRoom(room.code);
}

async function joinRoom(code) {
  if (!code || !code.trim()) {
    throw new Error("Enter a room code first.");
  }
  const normalized = code.trim().toLowerCase();
  const room = await api(`/api/rooms/${encodeURIComponent(normalized)}`);
  const roomCode = room.room_code || room.code;
  if (!roomCode) {
    throw new Error("The room response did not include a room code.");
  }
  state.code = roomCode;
  els.roomCode.textContent = roomCode;
  els.roomInput.value = roomCode;
  els.roomBanner.classList.remove("hidden");
  els.notepad.value = room.notepad || "";
  setCodeValue(room.code_text || "");
  renderTree(room.tree);
  showWorkspace();
  connectSocket(roomCode);
  setStatus(`Connected to ${roomCode}. Data is stored on the JustShare server until the room expires or is cleared.`);
}

function connectSocket(code) {
  if (!code || !String(code).trim()) {
    setStatus("Cannot connect realtime sync because the room code is missing.");
    return;
  }
  if (state.socket) {
    state.socket.close();
  }
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${location.host}/ws/rooms/${encodeURIComponent(code)}`);
  state.socket = socket;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "notepad:update" && !state.localNotepadEdit) {
      els.notepad.value = message.value;
    }
    if (message.type === "code:update" && !state.localCodeEdit) {
      setCodeValue(message.value);
    }
    if (message.type === "tree:update") {
      renderTree(message.tree);
    }
  };
  socket.onclose = () => {
    if (state.code === code) {
      setStatus("Disconnected. Rejoin the room to continue sharing.");
    }
  };
}

function debounceSave(kind, value) {
  const timerKey = kind === "notepad" ? "notepadTimer" : "codeTimer";
  clearTimeout(state[timerKey]);
  state[timerKey] = setTimeout(async () => {
    const code = currentRoomCode();
    if (!code) return;
    try {
      await api(`/api/rooms/${encodeURIComponent(code)}/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      if (kind === "notepad") state.localNotepadEdit = false;
      if (kind === "code") state.localCodeEdit = false;
      setStatus("Saved.");
    } catch (error) {
      setStatus(error.message);
    }
  }, 350);
}

async function clearSection(kind) {
  const code = currentRoomCode();
  if (!code || !confirm(`Clear the ${kind === "code" ? "code area" : "notepad"} for everyone in this room?`)) return;
  await api(`/api/rooms/${encodeURIComponent(code)}/${kind}`, { method: "DELETE" });
  if (kind === "notepad") els.notepad.value = "";
  if (kind === "code") setCodeValue("");
}

async function clearUploads() {
  const code = currentRoomCode();
  if (!code || !confirm("Delete all uploads for everyone in this room?")) return;
  const result = await api(`/api/rooms/${encodeURIComponent(code)}/uploads`, { method: "DELETE" });
  renderTree(result.tree);
}

function folderSupportWarning() {
  const supportsFileSystemAccess = "showDirectoryPicker" in window;
  const supportsWebkitDirectory = "webkitdirectory" in document.createElement("input");
  if (!supportsFileSystemAccess && !supportsWebkitDirectory) {
    setWarning("Your browser does not support folder upload. You can still upload multiple files, or use Chrome/Edge for full folder sharing.");
  }
}

async function collectDroppedFiles(items) {
  const results = [];
  const entries = [...items]
    .map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry())
    .filter(Boolean);
  if (!entries.length) {
    return [...items].map((item) => item.getAsFile()).filter(Boolean).map((file) => ({ file, path: file.name }));
  }
  async function walk(entry, prefix = "") {
    if (entry.isFile) {
      const file = await new Promise((resolve) => entry.file(resolve));
      results.push({ file, path: `${prefix}${file.name}` });
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const batch = await new Promise((resolve) => reader.readEntries(resolve));
      for (const child of batch) {
        await walk(child, `${prefix}${entry.name}/`);
      }
    }
  }
  for (const entry of entries) {
    await walk(entry);
  }
  return results;
}

function pickerFiles(input) {
  return [...input.files].map((file) => ({
    file,
    path: file.webkitRelativePath || file.name,
  }));
}

async function chooseFolder() {
  if ("showDirectoryPicker" in window) {
    const handle = await window.showDirectoryPicker();
    const results = [];
    async function walk(directoryHandle, prefix) {
      for await (const [name, childHandle] of directoryHandle.entries()) {
        if (childHandle.kind === "file") {
          const file = await childHandle.getFile();
          results.push({ file, path: `${prefix}${name}` });
        } else if (childHandle.kind === "directory") {
          await walk(childHandle, `${prefix}${name}/`);
        }
      }
    }
    await walk(handle, `${handle.name}/`);
    await uploadCollected(results);
    return;
  }
  els.folderPicker.click();
}

async function uploadCollected(items) {
  const code = currentRoomCode();
  if (!code || !items.length) return;
  const form = new FormData();
  for (const item of items) {
    form.append("files", item.file, item.file.name);
    form.append("relative_paths", item.path);
  }
  els.uploadProgress.textContent = `Uploading ${items.length} item${items.length === 1 ? "" : "s"}...`;
  try {
    const result = await api(`/api/rooms/${encodeURIComponent(code)}/uploads`, {
      method: "POST",
      body: form,
    });
    renderTree(result.tree);
    els.uploadProgress.textContent = "Upload complete.";
  } catch (error) {
    els.uploadProgress.textContent = error.message;
  }
}

function renderTree(tree) {
  els.tree.innerHTML = "";
  if (!tree || !tree.children || tree.children.length === 0) {
    els.tree.textContent = "No uploads yet.";
    els.tree.classList.add("empty");
    return;
  }
  els.tree.classList.remove("empty");
  els.tree.appendChild(renderChildren(tree.children));
}

function renderChildren(children) {
  const ul = document.createElement("ul");
  for (const child of children) {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "tree-row";
    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = `${child.type === "folder" ? "Folder" : "File"} ${child.name}`;
    row.appendChild(name);
    const link = document.createElement("a");
    const code = currentRoomCode();
    if (!code) return ul;
    if (child.type === "folder") {
      link.href = `/api/rooms/${encodeURIComponent(code)}/folders/${child.path.split("/").map(encodeURIComponent).join("/")}/download`;
      link.textContent = "Download ZIP";
    } else {
      link.href = `/api/rooms/${encodeURIComponent(code)}/files/${encodeURIComponent(child.id)}/download`;
      link.textContent = "Download";
    }
    row.appendChild(link);
    li.appendChild(row);
    if (child.type === "folder") {
      li.appendChild(renderChildren(child.children));
    }
    ul.appendChild(li);
  }
  return ul;
}

async function copyText(value, button, successMessage) {
  const originalText = button.textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
    setStatus(successMessage);
  } catch (error) {
    setStatus("Could not copy to clipboard. Check browser permissions and try again.");
  } finally {
    setTimeout(() => {
      button.textContent = originalText;
    }, 1400);
  }
}

function setupEditorSplitter() {
  const minPanelWidth = 260;

  function setNotepadWidth(clientX) {
    const rect = els.editorGrid.getBoundingClientRect();
    const splitterWidth = els.editorSplitter.offsetWidth || 8;
    const availableWidth = rect.width - splitterWidth - 16;
    const nextWidth = Math.min(Math.max(clientX - rect.left, minPanelWidth), availableWidth - minPanelWidth);
    els.editorGrid.style.setProperty("--notepad-width", `${nextWidth}px`);
  }

  els.editorSplitter.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    els.editorSplitter.setPointerCapture(event.pointerId);
    els.editorGrid.classList.add("resizing");
  });
  els.editorSplitter.addEventListener("pointermove", (event) => {
    if (!els.editorSplitter.hasPointerCapture(event.pointerId)) return;
    setNotepadWidth(event.clientX);
  });
  els.editorSplitter.addEventListener("pointerup", (event) => {
    els.editorSplitter.releasePointerCapture(event.pointerId);
    els.editorGrid.classList.remove("resizing");
  });
  els.editorSplitter.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const current = parseFloat(getComputedStyle(els.editorGrid).getPropertyValue("--notepad-width")) || els.editorGrid.getBoundingClientRect().width / 2;
    const delta = event.key === "ArrowLeft" ? -32 : 32;
    setNotepadWidth(els.editorGrid.getBoundingClientRect().left + current + delta);
  });
}

els.createRoom.addEventListener("click", () => createRoom().catch((error) => setStatus(error.message)));
els.joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinRoom(els.roomInput.value).catch((error) => setStatus(error.message));
});
els.copyRoom.addEventListener("click", () => copyText(state.code || "", els.copyRoom, "Room code copied to clipboard."));
els.leaveRoom.addEventListener("click", () => showGate("You left the room. Server data remains until it expires or is cleared."));
els.copyCode.addEventListener("click", () => copyText(els.codeArea.value, els.copyCode, "Code copied to clipboard."));
els.clearNotepad.addEventListener("click", () => clearSection("notepad").catch((error) => setStatus(error.message)));
els.clearCode.addEventListener("click", () => clearSection("code").catch((error) => setStatus(error.message)));
els.clearUploads.addEventListener("click", () => clearUploads().catch((error) => setStatus(error.message)));
els.folderButton.addEventListener("click", () => chooseFolder().catch((error) => setStatus(error.message)));
els.notepad.addEventListener("input", () => {
  state.localNotepadEdit = true;
  debounceSave("notepad", els.notepad.value);
});
els.codeArea.addEventListener("input", () => {
  state.localCodeEdit = true;
  highlightCode(els.codeArea.value);
  debounceSave("code", els.codeArea.value);
});
els.codeArea.addEventListener("scroll", () => {
  els.codeHighlight.scrollTop = els.codeArea.scrollTop;
  els.codeHighlight.scrollLeft = els.codeArea.scrollLeft;
});
els.filePicker.addEventListener("change", () => uploadCollected(pickerFiles(els.filePicker)));
els.folderPicker.addEventListener("change", () => uploadCollected(pickerFiles(els.folderPicker)));
els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("dragging");
});
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragging"));
els.dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("dragging");
  const items = await collectDroppedFiles(event.dataTransfer.items);
  await uploadCollected(items);
});

folderSupportWarning();
setupEditorSplitter();
showGate();
