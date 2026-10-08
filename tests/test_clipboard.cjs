const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../justshare/static/app.js"), "utf8");
const handler = source.slice(source.indexOf("function handleUploadPaste("), source.indexOf("async function uploadCollected("));

function setup({ room = "red-yes-fly", busy = false, editable = false, files = [] } = {}) {
  const uploads = [];
  const statuses = [];
  const context = vm.createContext({
    state: { code: room, uploadTask: busy ? {} : null },
    File,
    uploadCollected: (items) => uploads.push(items),
    setStatus: (message) => statuses.push(message),
  });
  vm.runInContext(handler, context);
  const event = {
    target: { closest: () => editable },
    clipboardData: { files },
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  return { context, event, uploads, statuses };
}

test("pasted screenshots retain image bytes and get distinct upload filenames", async () => {
  const screenshot = new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" });
  const { context, event, uploads } = setup({ files: [screenshot] });
  context.handleUploadPaste(event);
  context.handleUploadPaste({ ...event, defaultPrevented: false });
  assert.equal(uploads.length, 2);
  const first = uploads[0][0];
  assert.match(first.path, /^screenshot-\d+-[a-z0-9]+\.png$/);
  assert.equal(first.path, first.file.name);
  assert.notEqual(first.path, uploads[1][0].path);
  assert.equal(first.file.type, "image/png");
  assert.deepEqual(new Uint8Array(await first.file.arrayBuffer()), new Uint8Array(await screenshot.arrayBuffer()));
  assert.equal(event.defaultPrevented, true);
});

test("text pastes, editor pastes, and pastes without a room are left alone", () => {
  const screenshot = new File(["image"], "image.png", { type: "image/png" });
  for (const options of [{}, { editable: true, files: [screenshot] }, { room: null, files: [screenshot] }]) {
    const { context, event, uploads } = setup(options);
    context.handleUploadPaste(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(uploads.length, 0);
  }
});

test("pasting during another upload shows feedback without starting a second upload", () => {
  const { context, event, uploads, statuses } = setup({ busy: true, files: [new File(["image"], "image.png", { type: "image/png" })] });
  context.handleUploadPaste(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(uploads.length, 0);
  assert.match(statuses[0], /upload is already running/);
});

test("non-image clipboard files keep their names", () => {
  const file = new File(["notes"], "notes.txt", { type: "text/plain" });
  const { context, event, uploads } = setup({ files: [file] });
  context.handleUploadPaste(event);
  assert.equal(uploads[0][0].file, file);
  assert.equal(uploads[0][0].path, "notes.txt");
});
