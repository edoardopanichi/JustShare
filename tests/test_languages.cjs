const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../justshare/static/app.js"), "utf8");
const context = vm.createContext({
  state: { codeLanguage: "auto" },
  els: { codeHighlight: { innerHTML: "", dataset: {} }, codeLanguage: { options: [{ value: "auto" }] } },
});
vm.runInContext(source.slice(source.indexOf("function escapeHtml("), source.indexOf("function setCodeValue(")), context);

const examples = {
  "program declarations": "PROGRAM Main\nVAR\n enabled : BOOL;\n speed : REAL := 3.0;\nEND_VAR\nspeed := speed + 1;\nEND_PROGRAM",
  "lowercase function block": "function_block counter\nvar_input\n enable : bool;\nend_var\nif enable then\n count := count + 1;\nend_if;\nend_function_block",
  "typed function": "FUNCTION Add : DINT\nVAR_INPUT\n a, b : DINT;\nEND_VAR\nAdd := a + b;\nEND_FUNCTION",
  "declarations alone": "motorSpeed : REAL;\nready : BOOL;",
  "assignment alone": "motor.speed := 12.5;",
  "indexed assignment": "buffer[index] := WORD#16#FF;",
  "function block call": "timer(IN := enabled, PT := T#250ms);\nresult := timer.Q;",
  "case statement": "CASE state OF\n0: state := 1;\n1: state := 2;\nEND_CASE;",
  "for loop": "FOR i := 0 TO 9 DO\n values[i] := i;\nEND_FOR;",
  "while loop": "WHILE enabled DO\n counter := counter + 1;\nEND_WHILE;",
  "repeat loop": "REPEAT\n count := count - 1;\nUNTIL count = 0\nEND_REPEAT;",
  "array and structure types": "TYPE Sample : STRUCT\n values : ARRAY[0..9] OF REAL;\nEND_STRUCT\nEND_TYPE",
  "time literal": "timeout := TIME#2s;",
};
for (const [name, value] of Object.entries(examples)) {
  test(`detect ST: ${name}`, () => assert.equal(context.detectLanguage(value), "st"));
}

test("detect the supplied XTUGGER_APP snippet", () => {
  const snippet = fs.readFileSync(path.join(__dirname, "fixtures/xtugger.st"), "utf8");
  assert.equal(context.detectLanguage(snippet), "st");
  context.highlightCode(snippet);
  assert.equal(context.els.codeHighlight.dataset.language, "st");
  assert.equal(context.els.codeLanguage.options[0].textContent, "Auto (Structured Text (ST))");
});

const otherLanguages = [
  ["javascript", "function greet() { console.log('hello'); return null; }"],
  ["javascript", "const value = 42;\nconsole.log(value);"],
  ["python", "def main():\n    value: int = 1\n    return True"],
  ["python", "if (value := read()):\n    print(value)\nimport sys"],
  ["yaml", "motor:\n  speed: 12\n  enabled: true"],
  ["matlab", "function y = square(x)\ny = x.^2;\nend"],
  ["c", "#include <stdio.h>\nint main() { printf(\"ok\"); return 0; }"],
  ["cpp", "#include <iostream>\nint main() { std::cout << \"ok\"; }"],
  ["rust", "fn main() { println!(\"ok\"); }"],
  ["plain", "The program controls the motor speed."],
  ["plain", "(* PROGRAM Example END_VAR *)"],
];
for (const [expected, value] of otherLanguages) {
  test(`keep ${expected}: ${value.split("\n")[0]}`, () => assert.equal(context.detectLanguage(value), expected));
}

test("highlight ST comments, strings, keywords, literals, and calls safely", () => {
  context.state.codeLanguage = "st";
  context.highlightCode("(* IF TRUE THEN *)\n// note\nif enabled then\nmessage := '<tag> $'quoted$'';\nmask := WORD#16#FF;\ndelay := T#250ms;\nvalue := 1.25E-3;\ncontroller (IN := TRUE);\nend_if;");
  const html = context.els.codeHighlight.innerHTML;
  assert.ok(html.includes('<span class="tok-comment">(* IF TRUE THEN *)</span>'));
  assert.ok(html.includes('<span class="tok-comment">// note</span>'));
  assert.ok(html.includes('<span class="tok-keyword">if</span>'));
  assert.ok(html.includes('<span class="tok-keyword">end_if</span>'));
  assert.ok(html.includes('<span class="tok-number">WORD#16#FF</span>'));
  assert.ok(html.includes('<span class="tok-number">T#250ms</span>'));
  assert.ok(html.includes('<span class="tok-number">1.25E-3</span>'));
  assert.ok(html.includes('<span class="tok-attr">controller</span>'));
  assert.ok(html.includes('class="tok-string"'));
  assert.ok(html.includes('&lt;tag&gt;'));
  assert.ok(!html.includes('<tag>'));
  context.state.codeLanguage = "auto";
});

test("manual language selection overrides automatic detection", () => {
  context.state.codeLanguage = "st";
  context.highlightCode("custom_identifier");
  assert.equal(context.els.codeHighlight.dataset.language, "st");
  context.state.codeLanguage = "plain";
  context.highlightCode(examples["program declarations"]);
  assert.equal(context.els.codeHighlight.dataset.language, "");
  context.state.codeLanguage = "auto";
});
