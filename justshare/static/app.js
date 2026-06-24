const state = {
  code: null,
  socket: null,
  localNotepadEdit: false,
  localCodeEdit: false,
  codeLanguage: "auto",
  detectedCodeLanguage: "plain",
  notepadTimer: null,
  codeTimer: null,
  uploadsExpanded: false,
  selectedUploads: new Set(),
  uploadTask: null,
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
  shareRoom: $("shareRoom"),
  copyRoom: $("copyRoom"),
  leaveRoom: $("leaveRoom"),
  warning: $("warning"),
  status: $("status"),
  editorGrid: $("editorGrid"),
  editorSplitter: $("editorSplitter"),
  notepad: $("notepad"),
  codeArea: $("codeArea"),
  codeHighlight: $("codeHighlight"),
  codeLanguage: $("codeLanguage"),
  clearNotepad: $("clearNotepad"),
  clearCode: $("clearCode"),
  copyCode: $("copyCode"),
  clearUploads: $("clearUploads"),
  dropZone: $("dropZone"),
  filePicker: $("filePicker"),
  folderButton: $("folderButton"),
  folderPicker: $("folderPicker"),
  uploadProgress: $("uploadProgress"),
  uploadProgressText: $("uploadProgressText"),
  uploadProgressBar: $("uploadProgressBar"),
  cancelUpload: $("cancelUpload"),
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

function countMatches(value, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...value.matchAll(new RegExp(pattern.source, flags))].length;
}

function addLanguageScore(scores, language, value, rules) {
  for (const [pattern, weight] of rules) {
    scores[language] += countMatches(value, pattern) * weight;
  }
}

function detectLanguage(value) {
  const trimmed = value.trim();
  if (!trimmed) return "plain";
  if (/^({[\s\S]*}|\[[\s\S]*\])$/.test(trimmed)) return "json";
  const scores = {
    markup: 0,
    markdown: 0,
    latex: 0,
    typst: 0,
    python: 0,
    javascript: 0,
    css: 0,
    rust: 0,
    c: 0,
    cpp: 0,
    matlab: 0,
    bash: 0,
    yaml: 0,
  };

  addLanguageScore(scores, "markdown", trimmed, [
    [/^#{1,6}\s+\S/gm, 4],
    [/```/g, 4],
    [/^\s*[-*+]\s+\S/gm, 1],
    [/^\s*\d+\.\s+\S/gm, 1],
    [/^\s*>\s+\S/gm, 2],
    [/^\s*\|.+\|/gm, 2],
    [/\[[^\]\n]+\]\([^)]+\)/g, 2],
  ]);
  addLanguageScore(scores, "markup", trimmed, [
    [/<\/?[a-z][\w:-]*(?:\s+[^>]*)?>/gi, 5],
    [/<!doctype\s+html/i, 6],
    [/<!--[\s\S]*?-->/g, 2],
  ]);
  addLanguageScore(scores, "latex", trimmed, [
    [/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/g, 10],
    [/\\(?:begin|end)\{(?:document|equation|align|figure|table|itemize|enumerate|tabular)\}/g, 6],
    [/\\(?:section|subsection|chapter|paragraph|caption|label|ref|cite|usepackage|textbf|emph)\b/g, 3],
    [/\$(?:\\.|[^$\n])+\$/g, 2],
    [/^\s*%.*$/gm, 1],
  ]);
  addLanguageScore(scores, "typst", trimmed, [
    [/^\s*#(?:set|show|let|import|include)\b/gm, 7],
    [/#(?:figure|table|image|bibliography|outline|align|grid|rect|circle|text|page)\s*\(/g, 4],
    [/^\s*=\s+\S/gm, 4],
    [/\$(?:\\.|[^$\n])+\$/g, 2],
    [/\/\/.*$/gm, 1],
  ]);
  addLanguageScore(scores, "bash", trimmed, [
    [/^#!.*\b(?:bash|sh|zsh)\b/gm, 8],
    [/^\s*(?:sudo\s+)?(?:cd|ls|cp|mv|rm|mkdir|touch|grep|find|curl|wget|git|docker|npm|pip|python|py|ssh|scp)\b/gm, 3],
    [/^\s*(?:if|then|elif|else|fi|case|esac|for|while|do|done)\b/gm, 2],
    [/\$\{?[\w@#?$!-]+\}?/g, 1],
  ]);
  addLanguageScore(scores, "matlab", trimmed, [
    [/^\s*%%?/gm, 4],
    [/^\s*function\b/gm, 6],
    [/^\s*end\s*$/gm, 3],
    [/^\s*(?:classdef|properties|methods)\b/gm, 4],
    [/\b(?:disp|fprintf|plot|zeros|ones|linspace|length|numel|squeeze|imagesc|xlabel|ylabel|colorbar|caxis|mat2str)\s*\(/g, 2],
    [/%.*$/gm, 1],
  ]);
  addLanguageScore(scores, "rust", trimmed, [
    [/^\s*(?:pub\s+)?fn\s+\w+/gm, 6],
    [/\b(?:let\s+mut|impl|trait|enum|struct|crate|mod|match|Result|Option|Some|None|Ok|Err)\b/g, 3],
    [/\bprintln!\s*\(/g, 4],
    [/\b[a-zA-Z_]\w*::[a-zA-Z_]\w*/g, 2],
  ]);
  addLanguageScore(scores, "cpp", trimmed, [
    [/#include\s*"[^"]+\.(?:hpp|hh|hxx)"/g, 7],
    [/#include\s*<(?:iostream|vector|string|map|memory|algorithm|cmath|cstdint|stdexcept)>/g, 5],
    [/\b(?:std::|using\s+namespace\s+std|cout\s*<<|cin\s*>>|template\s*<|namespace\s+\w+)\b/g, 5],
    [/\bclass\s+\w+/g, 3],
    [/\b(?:bool|nullptr|constexpr|typename|virtual|public|private|protected)\b/g, 2],
  ]);
  addLanguageScore(scores, "c", trimmed, [
    [/#include\s*<[\w.]+>/g, 4],
    [/\b(?:int|char|float|double|void|long|short|unsigned|signed)\b[\s\w,*]*\([^)]*\)\s*\{/g, 4],
    [/\b(?:printf|scanf|malloc|free|sizeof|typedef|struct|enum)\b/g, 2],
    [/\/\*[\s\S]*?\*\//g, 1],
  ]);
  addLanguageScore(scores, "yaml", trimmed, [
    [/^---\s*$/gm, 4],
    [/^\s{0,6}[\w.-]+\s*:\s*(?:$|[^{};()[\]])/gm, 2],
    [/^\s*-\s+[\w.-]+\s*:/gm, 3],
  ]);
  addLanguageScore(scores, "python", trimmed, [
    [/^#!.*\bpython/gm, 8],
    [/^\s*(?:from\s+[\w.]+\s+import|import\s+[\w.]+)/gm, 5],
    [/^\s*(?:def|class)\s+\w+/gm, 5],
    [/@dataclass\b/g, 4],
    [/\bself\b/g, 2],
    [/\b(?:elif|except|finally|lambda|yield|None|True|False)\b/g, 2],
    [/^\s*#.*$/gm, 1],
  ]);
  addLanguageScore(scores, "javascript", trimmed, [
    [/\b(?:function|const|let|var|return|async|await|class)\b/g, 2],
    [/=>/g, 3],
    [/\b(?:document|window|console)\./g, 3],
  ]);
  addLanguageScore(scores, "css", trimmed, [
    [/[.#][\w-]+\s*\{/g, 4],
    [/\b(?:color|display|margin|padding|grid|flex|border|background|font-size)\s*:/g, 3],
    [/@media\b/g, 3],
  ]);

  if (scores.cpp >= 7 && scores.c > 0) scores.cpp = Math.max(scores.cpp, scores.c + 1);
  else if (scores.cpp >= 5 && scores.c > 0) scores.cpp += Math.min(scores.c, 8);
  if (scores.python >= 6) scores.yaml = Math.max(0, scores.yaml - 4);
  if (scores.matlab >= 6) scores.bash = Math.max(0, scores.bash - 4);
  if (scores.c + scores.cpp > 0) scores.markup = Math.max(0, scores.markup - 6);
  if (scores.latex >= 6) scores.markdown = Math.max(0, scores.markdown - 4);
  if (scores.typst >= 7) scores.markdown = Math.max(0, scores.markdown - 4);

  const [language, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return score >= 3 ? language : "plain";
}

function languageLabel(language) {
  return ({
    plain: "Plain text",
    json: "JSON",
    markup: "HTML / XML",
    markdown: "Markdown",
    latex: "LaTeX",
    typst: "Typst",
    python: "Python",
    javascript: "JavaScript",
    css: "CSS",
    rust: "Rust",
    c: "C",
    cpp: "C++",
    matlab: "MATLAB",
    bash: "Bash",
    yaml: "YAML",
  })[language] || language;
}

function updateLanguagePicker() {
  const detected = languageLabel(state.detectedCodeLanguage);
  const auto = [...els.codeLanguage.options].find((option) => option.value === "auto");
  if (auto) auto.textContent = `Auto (${detected})`;
  els.codeLanguage.value = state.codeLanguage;
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
  state.detectedCodeLanguage = detectLanguage(value);
  const language = state.codeLanguage === "auto" ? state.detectedCodeLanguage : state.codeLanguage;
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
  } else if (value && language === "markdown") {
    html = renderTokens(value, /```[\s\S]*?```|`[^`\n]+`|^\s{0,3}#{1,6}\s.+$|^\s{0,3}>\s.+$|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^)]+\)/gm, (match) => {
      if (match[0].startsWith("```") || match[0].startsWith("`")) return "tok-string";
      if (/^\s{0,3}#/.test(match[0])) return "tok-keyword";
      if (/^\s{0,3}>/.test(match[0])) return "tok-comment";
      if (match[0].startsWith("[")) return "tok-attr";
      return "tok-keyword";
    });
  } else if (value && language === "latex") {
    html = renderTokens(value, /%.*$|\\[a-zA-Z]+[*]?|\\.|(?:\{|\})|\$(?:\\.|[^$\n])+\$/gm, (match) => {
      if (match[0].startsWith("%")) return "tok-comment";
      if (match[0].startsWith("$")) return "tok-string";
      if (match[0].startsWith("\\")) return "tok-keyword";
      return "tok-attr";
    });
  } else if (value && language === "typst") {
    html = renderTokens(value, /\/\/.*$|"(?:\\.|[^"\\])*"|`[^`\n]+`|\$(?:\\.|[^$\n])+\$|^\s*=+\s.+$|#[a-zA-Z_][\w-]*|#[\[{(]?|(?:\{|\}|\[|\])/gm, (match) => {
      if (match[0].startsWith("//")) return "tok-comment";
      if (/^["`$]/.test(match[0])) return "tok-string";
      if (/^\s*=/.test(match[0]) || match[0].startsWith("#")) return "tok-keyword";
      return "tok-attr";
    });
  } else if (value && language === "yaml") {
    html = renderTokens(value, /#.*$|^\s*-\s+|^\s*[\w.-]+(?=\s*:)|:\s*[^#\n]+/gm, (match) => {
      if (match[0].startsWith("#")) return "tok-comment";
      if (/^\s*-/.test(match[0])) return "tok-keyword";
      if (/^[\s\w.-]+$/.test(match[0])) return "tok-attr";
      return "tok-string";
    });
  } else if (value && language === "matlab") {
    html = renderTokens(value, /%.*$|"(?:\\.|[^"\\])*"|'(?:''|[^'\n])*'|\b\d+(?:\.\d+)?\b|\b(?:break|case|catch|classdef|continue|else|elseif|end|for|function|global|if|otherwise|parfor|persistent|return|switch|try|while|methods|properties)\b/gm, (match) => {
      if (match[0].startsWith("%")) return "tok-comment";
      if (/^["']/.test(match[0])) return "tok-string";
      if (/^\d/.test(match[0])) return "tok-number";
      return "tok-keyword";
    });
  } else if (value) {
    const keywordPattern = {
      bash: /\b(?:alias|case|cd|do|done|echo|elif|else|esac|export|fi|for|function|if|in|local|read|return|set|shift|then|unset|while)\b/,
      c: /\b(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while)\b/,
      cpp: /\b(?:alignas|auto|bool|break|case|catch|char|class|const|constexpr|continue|default|delete|do|double|else|enum|explicit|false|float|for|if|inline|int|long|namespace|new|nullptr|private|protected|public|return|short|sizeof|static|struct|switch|template|this|throw|true|try|typename|using|virtual|void|while)\b/,
      rust: /\b(?:as|async|await|break|const|continue|crate|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while)\b/,
    }[language] || /\b(async|await|break|case|class|const|def|elif|else|except|finally|for|from|function|if|import|in|let|new|null|return|self|try|var|while|true|false|None|pass)\b/;
    html = renderTokens(value, /\/\*[\s\S]*?\*\/|\/\/.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b0x[\da-fA-F]+\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w]*!?(?=\s*\()|\b[A-Za-z_][\w]*\b/g, (match) => {
      if (/^(\/\*|\/\/|#)/.test(match[0])) return "tok-comment";
      if (/^["'`]/.test(match[0])) return "tok-string";
      if (/^(0x|\d)/i.test(match[0])) return "tok-number";
      if (keywordPattern.test(match[0])) return "tok-keyword";
      if (/\($/.test(value.slice(match.index + match[0].length, match.index + match[0].length + 1))) return "tok-attr";
      return "";
    });
  }

  els.codeHighlight.innerHTML = html;
  els.codeHighlight.dataset.language = language === "plain" ? "" : language;
  updateLanguagePicker();
}

function setCodeValue(value) {
  els.codeArea.value = value;
  highlightCode(value);
}

function setEnabled(enabled) {
  for (const el of [els.notepad, els.codeArea, els.codeLanguage, els.clearNotepad, els.clearCode, els.copyCode, els.clearUploads, els.filePicker, els.folderButton, els.folderPicker]) {
    el.disabled = !enabled;
  }
  setUploadControlsBusy(Boolean(state.uploadTask));
}

function showWorkspace() {
  els.roomGate.classList.add("hidden");
  els.workspace.classList.remove("hidden");
  setEnabled(true);
}

function showGate(message = "Create a room or join one to start sharing.") {
  state.code = null;
  state.codeLanguage = "auto";
  state.detectedCodeLanguage = "plain";
  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }
  clearTimeout(state.notepadTimer);
  clearTimeout(state.codeTimer);
  cancelActiveUpload();
  state.localNotepadEdit = false;
  state.localCodeEdit = false;
  els.roomCode.textContent = "not connected";
  els.roomBanner.classList.add("hidden");
  els.notepad.value = "";
  setCodeValue("");
  resetUploadProgress();
  renderTree(null);
  setEnabled(false);
  els.workspace.classList.add("hidden");
  els.roomGate.classList.remove("hidden");
  setStatus(message);
}

function setUploadControlsBusy(busy) {
  for (const el of [els.filePicker, els.folderButton, els.folderPicker]) {
    el.disabled = busy || !state.code;
  }
  els.dropZone.setAttribute("aria-disabled", busy ? "true" : "false");
}

function beginUploadTask(message) {
  if (state.uploadTask) {
    setStatus("An upload is already running. Stop it before starting another one.");
    return null;
  }
  const task = { cancelled: false, xhr: null };
  state.uploadTask = task;
  setUploadControlsBusy(true);
  els.uploadProgress.classList.remove("hidden");
  els.cancelUpload.disabled = false;
  updateUploadProgress({ text: message, indeterminate: true });
  return task;
}

function completeUploadTask(task, message, value = 100) {
  if (state.uploadTask !== task) return;
  state.uploadTask = null;
  els.cancelUpload.disabled = true;
  clearUploadPickers();
  setUploadControlsBusy(false);
  updateUploadProgress({ text: message, value });
}

function clearUploadPickers() {
  els.filePicker.value = "";
  els.folderPicker.value = "";
}

function resetUploadProgress() {
  els.uploadProgress.classList.add("hidden");
  els.uploadProgressText.textContent = "";
  els.uploadProgressBar.value = 0;
  els.uploadProgressBar.removeAttribute("value");
  els.cancelUpload.disabled = true;
  clearUploadPickers();
}

function updateUploadProgress({ text, loaded = 0, total = 0, value = null, indeterminate = false }) {
  if (text) els.uploadProgressText.textContent = text;
  if (indeterminate || !total && value === null) {
    els.uploadProgressBar.removeAttribute("value");
    return;
  }
  const percent = value === null ? Math.min(100, Math.round((loaded / total) * 100)) : value;
  els.uploadProgressBar.value = percent;
}

function cancelActiveUpload() {
  const task = state.uploadTask;
  if (!task) return;
  task.cancelled = true;
  clearUploadPickers();
  if (task.xhr) task.xhr.abort();
  updateUploadProgress({ text: "Stopping upload...", indeterminate: true });
}

function assertUploadActive(task) {
  if (task && task.cancelled) {
    throw new DOMException("Upload stopped.", "AbortError");
  }
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

function roomShareUrl(code = state.code) {
  const normalized = String(code || "").trim();
  if (!normalized) return "";
  const url = new URL("/", window.location.origin);
  url.searchParams.set("room", normalized);
  return url.toString();
}

function setRoomUrl(code) {
  if (!window.history || !window.history.replaceState) return;
  const url = new URL(window.location.href);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  if (code) {
    url.searchParams.set("room", code);
  }
  window.history.replaceState({}, "", url.toString());
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
  setRoomUrl(roomCode);
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

async function collectDroppedFiles(items, task) {
  const results = [];
  const entries = [...items]
    .map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry())
    .filter(Boolean);
  if (!entries.length) {
    assertUploadActive(task);
    return [...items].map((item) => item.getAsFile()).filter(Boolean).map((file) => ({ file, path: file.name }));
  }
  async function walk(entry, prefix = "") {
    assertUploadActive(task);
    if (entry.isFile) {
      const file = await new Promise((resolve) => entry.file(resolve));
      results.push({ file, path: `${prefix}${file.name}` });
      if (results.length % 50 === 0) {
        updateUploadProgress({ text: `Preparing ${results.length} files...`, indeterminate: true });
      }
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      while (true) {
        const batch = await new Promise((resolve) => reader.readEntries(resolve));
        if (!batch.length) break;
        for (const child of batch) {
          await walk(child, `${prefix}${entry.name}/`);
        }
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
    const task = beginUploadTask(`Preparing ${handle.name}...`);
    if (!task) return;
    const results = [];
    async function walk(directoryHandle, prefix) {
      assertUploadActive(task);
      for await (const [name, childHandle] of directoryHandle.entries()) {
        assertUploadActive(task);
        if (childHandle.kind === "file") {
          const file = await childHandle.getFile();
          results.push({ file, path: `${prefix}${name}` });
          if (results.length % 50 === 0) {
            updateUploadProgress({ text: `Preparing ${results.length} files...`, indeterminate: true });
          }
        } else if (childHandle.kind === "directory") {
          await walk(childHandle, `${prefix}${name}/`);
        }
      }
    }
    try {
      await walk(handle, `${handle.name}/`);
      await uploadCollected(results, task);
    } catch (error) {
      handleUploadError(task, error);
    }
    return;
  }
  els.folderPicker.value = "";
  els.folderPicker.click();
}

function uploadFormWithProgress(url, form, task, itemCount, totalSize) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    task.xhr = xhr;
    xhr.open("POST", url);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const detail = `${formatBytes(event.loaded)} of ${formatBytes(event.total)}`;
        updateUploadProgress({ text: `Uploading ${itemCount} item${itemCount === 1 ? "" : "s"} (${detail})...`, loaded: event.loaded, total: event.total });
      } else {
        updateUploadProgress({ text: `Uploading ${itemCount} item${itemCount === 1 ? "" : "s"} (${formatBytes(totalSize)})...`, indeterminate: true });
      }
    });

    xhr.addEventListener("load", () => {
      task.xhr = null;
      let body = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch (error) {
        body = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
        return;
      }
      reject(new Error(body.detail || `Request failed: ${xhr.status}`));
    });
    xhr.addEventListener("error", () => {
      task.xhr = null;
      reject(new Error("Upload failed. Check the server connection and try again."));
    });
    xhr.addEventListener("abort", () => {
      task.xhr = null;
      reject(new DOMException("Upload stopped.", "AbortError"));
    });

    xhr.send(form);
  });
}

function handleUploadError(task, error) {
  const stopped = error.name === "AbortError" || task.cancelled;
  if (stopped && state.uploadTask === task) {
    state.uploadTask = null;
    task.xhr = null;
    resetUploadProgress();
    setUploadControlsBusy(false);
    setStatus("Upload stopped.");
    return;
  }
  completeUploadTask(task, error.message, Number(els.uploadProgressBar.value || 0));
}

async function uploadCollected(items, existingTask = null) {
  const code = currentRoomCode();
  if (!code) {
    if (existingTask) completeUploadTask(existingTask, "Upload stopped.", 0);
    return;
  }
  const task = existingTask || beginUploadTask(`Preparing ${items.length} item${items.length === 1 ? "" : "s"}...`);
  if (!task) return;
  if (!items.length) {
    completeUploadTask(task, "No files found to upload.", 0);
    return;
  }
  try {
    assertUploadActive(task);
    const form = new FormData();
    const totalSize = items.reduce((sum, item) => sum + Number(item.file.size || 0), 0);
    for (const item of items) {
      assertUploadActive(task);
      form.append("files", item.file, item.file.name);
      form.append("relative_paths", item.path);
    }
    updateUploadProgress({ text: `Uploading ${items.length} item${items.length === 1 ? "" : "s"} (${formatBytes(totalSize)})...`, value: 0 });
    const result = await uploadFormWithProgress(`/api/rooms/${encodeURIComponent(code)}/uploads`, form, task, items.length, totalSize);
    renderTree(result.tree);
    completeUploadTask(task, "Upload complete.", 100);
  } catch (error) {
    handleUploadError(task, error);
  }
}

function renderTree(tree) {
  els.tree.innerHTML = "";
  if (!tree || !tree.children || tree.children.length === 0) {
    els.tree.textContent = "No uploads yet.";
    els.tree.classList.add("empty");
    state.uploadsExpanded = false;
    state.selectedUploads.clear();
    return;
  }
  els.tree.classList.remove("empty");
  const code = currentRoomCode();
  if (!code) return;

  const items = tree.children.map((child) => ({ ...child, depth: 0 }));
  const validKeys = new Set(items.map((item) => selectionKey(item)));
  state.selectedUploads = new Set([...state.selectedUploads].filter((key) => validKeys.has(key)));

  if (state.uploadsExpanded) {
    els.tree.appendChild(renderExpandedUploads(tree, items, code));
  } else {
    els.tree.appendChild(renderCollapsedUploads(tree, items, code));
  }
}

function flattenUploads(children, depth = 0) {
  const items = [];
  for (const child of children) {
    items.push({ ...child, depth });
    if (child.type === "folder") {
      items.push(...flattenUploads(child.children, depth + 1));
    }
  }
  return items;
}

function summarizeUploads(items) {
  const files = items.filter((item) => item.type === "file");
  const folders = items.filter((item) => item.type === "folder");
  const totalSize = items.reduce((sum, item) => sum + itemTotalSize(item), 0);
  return { files, folders, totalSize };
}

function itemTotalSize(item) {
  if (item.type === "file") return Number(item.size || 0);
  return flattenUploads(item.children || [])
    .filter((child) => child.type === "file")
    .reduce((sum, file) => sum + Number(file.size || 0), 0);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = units.shift();
  while (size >= 1024 && units.length) {
    size /= 1024;
    unit = units.shift();
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

function selectionKey(item) {
  return `${item.type}:${item.type === "file" ? item.id : item.path}`;
}

function itemDownloadUrl(item, code) {
  if (item.type === "folder") {
    return `/api/rooms/${encodeURIComponent(code)}/folders/${item.path.split("/").map(encodeURIComponent).join("/")}/download`;
  }
  return `/api/rooms/${encodeURIComponent(code)}/files/${encodeURIComponent(item.id)}/download`;
}

function selectionDownloadUrl(code) {
  const params = new URLSearchParams();
  for (const key of state.selectedUploads) {
    const [type, value] = key.split(/:(.*)/s);
    params.append(type === "file" ? "file_id" : "folder_path", value);
  }
  return `/api/rooms/${encodeURIComponent(code)}/selection/download?${params.toString()}`;
}

function previewUploadTitle(value, maxLength = 34) {
  const title = String(value || "");
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1)}...`;
}

function renderCollapsedUploads(tree, items, code) {
  const { files, folders, totalSize } = summarizeUploads(items);
  const shell = document.createElement("div");
  shell.className = "upload-stack-shell";

  const stack = document.createElement("button");
  stack.type = "button";
  stack.className = "upload-stack";
  stack.setAttribute("aria-label", "Expand uploaded files");
  stack.addEventListener("click", () => {
    state.uploadsExpanded = true;
    renderTree(tree);
  });

  const previewItems = items.slice(0, 8);
  previewItems.forEach((item, index) => {
    const card = document.createElement("span");
    card.className = `upload-stack-card ${item.type}`;
    card.style.setProperty("--i", index);
    card.appendChild(createUploadIcon(item, "stack"));
    stack.appendChild(card);
  });
  const folderBadge = document.createElement("span");
  folderBadge.className = "upload-stack-badge folder-count";
  folderBadge.textContent = String(folders.length);
  folderBadge.setAttribute("aria-label", `${folders.length} folders`);
  const fileBadge = document.createElement("span");
  fileBadge.className = "upload-stack-badge file-count";
  fileBadge.textContent = String(files.length);
  fileBadge.setAttribute("aria-label", `${files.length} files`);
  stack.append(folderBadge, fileBadge);

  const details = document.createElement("div");
  details.className = "upload-stack-details";
  details.innerHTML = `
    <strong>${folders.length} folder${folders.length === 1 ? "" : "s"}, ${files.length} file${files.length === 1 ? "" : "s"} ready</strong>
    <span>Total size ${formatBytes(totalSize)}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "upload-stack-actions";
  const downloadAll = document.createElement("a");
  downloadAll.className = "button-like secondary-link";
  downloadAll.href = `/api/rooms/${encodeURIComponent(code)}/uploads/download`;
  downloadAll.textContent = "Download all";
  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "ghost";
  expand.textContent = "Expand stack";
  expand.addEventListener("click", () => {
    state.uploadsExpanded = true;
    renderTree(tree);
  });
  actions.append(downloadAll, expand);
  details.appendChild(actions);
  shell.append(stack, details);
  return shell;
}

function renderExpandedUploads(tree, items, code) {
  const { files, folders, totalSize } = summarizeUploads(items);
  const wrapper = document.createElement("div");
  wrapper.className = items.length > 24 ? "upload-browser compact" : "upload-browser fan";

  const toolbar = document.createElement("div");
  toolbar.className = "upload-browser-toolbar";
  const summary = document.createElement("span");
  summary.textContent = `${files.length} file${files.length === 1 ? "" : "s"} - ${folders.length} folder${folders.length === 1 ? "" : "s"} - ${formatBytes(totalSize)}`;
  const selected = document.createElement("a");
  selected.className = "button-like secondary-link";
  selected.textContent = state.selectedUploads.size ? `Download selected (${state.selectedUploads.size})` : "Select items";
  selected.setAttribute("aria-disabled", state.selectedUploads.size ? "false" : "true");
  if (state.selectedUploads.size) selected.href = selectionDownloadUrl(code);
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "ghost";
  collapse.textContent = "Collapse";
  collapse.addEventListener("click", () => {
    state.uploadsExpanded = false;
    state.selectedUploads.clear();
    renderTree(tree);
  });
  toolbar.append(summary, selected, collapse);

  const surface = document.createElement("div");
  surface.className = "upload-items";
  items.forEach((item, index) => {
    const card = document.createElement("label");
    card.className = `upload-item ${item.type}`;
    const fullTitle = item.path || item.name;
    card.title = fullTitle;
    card.style.setProperty("--angle", `${(index - (items.length - 1) / 2) * Math.min(7, 120 / Math.max(items.length, 1))}deg`);
    card.style.setProperty("--offset", `${Math.min(index, 12) * 8}px`);
    card.style.setProperty("--depth", item.depth);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedUploads.has(selectionKey(item));
    checkbox.addEventListener("change", () => {
      const key = selectionKey(item);
      if (checkbox.checked) state.selectedUploads.add(key);
      else state.selectedUploads.delete(key);
      renderTree(tree);
    });

    const icon = createUploadIcon(item, "item");
    const name = document.createElement("span");
    name.className = "upload-item-name";
    name.textContent = previewUploadTitle(fullTitle);
    name.title = fullTitle;
    const meta = document.createElement("span");
    meta.className = "upload-item-meta";
    meta.textContent = item.type === "folder" ? formatFolderMeta(item) : formatBytes(item.size);
    const link = document.createElement("a");
    link.href = itemDownloadUrl(item, code);
    link.textContent = item.type === "folder" ? "Download Zip" : "Download";
    link.addEventListener("click", (event) => event.stopPropagation());

    card.append(checkbox, icon, name, meta, link);
    surface.appendChild(card);
  });

  wrapper.append(toolbar, surface);
  return wrapper;
}

function fileExtension(name) {
  const extension = String(name || "").split(".").pop();
  if (!extension || extension === name) return "FILE";
  return extension.slice(0, 4).toUpperCase();
}

function createUploadIcon(item, size) {
  const icon = document.createElement("span");
  icon.className = `upload-icon ${item.type} ${size}`;
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = item.type === "folder" ? "DIR" : fileExtension(item.name);
  icon.appendChild(label);
  return icon;
}

function countFolderFiles(folder) {
  return flattenUploads(folder.children || []).filter((item) => item.type === "file").length;
}

function countFolderFolders(folder) {
  return flattenUploads(folder.children || []).filter((item) => item.type === "folder").length;
}

function formatFolderMeta(folder) {
  const folders = countFolderFolders(folder);
  const files = countFolderFiles(folder);
  const parts = [];
  if (folders) parts.push(`${folders} subfolder${folders === 1 ? "" : "s"}`);
  parts.push(`${files} file${files === 1 ? "" : "s"}`);
  parts.push(formatBytes(itemTotalSize(folder)));
  return parts.join(" - ");
}

async function writeClipboard(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command was rejected.");
    }
  } finally {
    textarea.remove();
  }
}

async function copyText(value, button, successMessage, failureMessage = "Could not copy to clipboard. Check browser permissions and try again.") {
  const originalText = button.textContent;
  try {
    await writeClipboard(value);
    button.textContent = "Copied";
    setStatus(successMessage);
  } catch (error) {
    setStatus(failureMessage);
  } finally {
    setTimeout(() => {
      button.textContent = originalText;
    }, 1400);
  }
}

async function shareRoom() {
  const code = currentRoomCode();
  if (!code) return;
  const url = roomShareUrl(code);
  await copyText(url, els.shareRoom, `Share link copied: ${url}`, `Copy failed. Share this link manually: ${url}`);
}

function initialSharedRoomCode() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("room") || params.get("code") || "").trim();
}

function boot() {
  const sharedRoom = initialSharedRoomCode();
  if (!sharedRoom) {
    showGate();
    return;
  }
  els.roomInput.value = sharedRoom;
  showGate("Joining shared room...");
  joinRoom(sharedRoom).catch((error) => {
    showGate(error.message);
  });
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
els.shareRoom.addEventListener("click", () => shareRoom().catch((error) => setStatus(error.message)));
els.copyRoom.addEventListener("click", () => copyText(state.code || "", els.copyRoom, "Room code copied to clipboard."));
els.leaveRoom.addEventListener("click", () => {
  setRoomUrl("");
  showGate("You left the room. Server data remains until it expires or is cleared.");
});
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
els.codeLanguage.addEventListener("change", () => {
  state.codeLanguage = els.codeLanguage.value;
  highlightCode(els.codeArea.value);
});
els.codeArea.addEventListener("scroll", () => {
  els.codeHighlight.scrollTop = els.codeArea.scrollTop;
  els.codeHighlight.scrollLeft = els.codeArea.scrollLeft;
});
els.filePicker.addEventListener("click", () => {
  els.filePicker.value = "";
});
els.filePicker.addEventListener("change", () => uploadCollected(pickerFiles(els.filePicker)));
els.folderPicker.addEventListener("change", () => uploadCollected(pickerFiles(els.folderPicker)));
els.cancelUpload.addEventListener("click", cancelActiveUpload);
els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (state.uploadTask) return;
  els.dropZone.classList.add("dragging");
});
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragging"));
els.dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("dragging");
  if (state.uploadTask) {
    setStatus("An upload is already running. Stop it before starting another one.");
    return;
  }
  const task = beginUploadTask("Preparing dropped items...");
  if (!task) return;
  try {
    const items = await collectDroppedFiles(event.dataTransfer.items, task);
    await uploadCollected(items, task);
  } catch (error) {
    handleUploadError(task, error);
  }
});

folderSupportWarning();
setupEditorSplitter();
boot();
