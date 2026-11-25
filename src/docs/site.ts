// The docs site's pages: dist/docs/<slug>.html, plain static HTML with a contents list, in the app's
// colours, dark or light to match the reader's system. Everything is relative, so the site works
// at any path and offline.
import type { DocPage } from './render';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const SITE_CSS = `:root {
  color-scheme: dark;
  --bg: #282a36; --panel: #21222c; --heading: #f8f8f2; --text: #c9cad6; --muted: #999db2;
  --line: #44475a; --line-soft: #343746; --hover: rgba(68, 71, 90, 0.55);
  --accent: #bd93f9; --accent-strong: #d9c4fc; --accent-soft: rgba(189, 147, 249, 0.14); --link-line: rgba(189, 147, 249, 0.35);
  --code-bg: #191a21; --inline-code: #8be9fd; --inline-code-bg: #21222c;
  --tok-keyword: #82aaff; --tok-type: #ff79c6; --tok-builtin: #50fa7b; --tok-number: #bd93f9;
  --tok-comment: #6272a4; --tok-string: #f1fa8c; --tok-operator: #ff79c6; --tok-property: #ffb86c;
  --tok-function: #9ad4ff;
}
@media (prefers-color-scheme: light) {
  :root {
    color-scheme: light;
    --bg: #ffffff; --panel: #f8f8fb; --heading: #191a21; --text: #343746; --muted: #5c6079;
    --line: #dcdce4; --line-soft: #ebebf0; --hover: #f0f0f5;
    --accent: #7a4cc7; --accent-strong: #512f86; --accent-soft: rgba(122, 76, 199, 0.09); --link-line: rgba(122, 76, 199, 0.3);
    --code-bg: #f6f6f9; --inline-code: #0b6e99; --inline-code-bg: #f1f1f6;
    --tok-keyword: #2c4bbd; --tok-type: #b0337a; --tok-builtin: #1a7a35; --tok-number: #7a4cc7;
    --tok-comment: #6f7591; --tok-string: #8a6a00; --tok-operator: #b0337a; --tok-property: #a85a00;
    --tok-function: #0a7aa6;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-padding-top: 72px; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.7 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); text-decoration: none; }
main a {
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px;
  text-decoration-color: var(--link-line); transition: color 120ms, text-decoration-color 120ms;
}
main a:hover { color: var(--accent-strong); text-decoration-color: currentColor; }
header {
  position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 16px;
  height: 56px; padding: 0 20px; border-bottom: 1px solid var(--line-soft); background: var(--panel);
}
.brand { display: flex; align-items: center; gap: 10px; color: var(--heading); font-weight: 700; font-size: 17px; letter-spacing: -0.01em; }
.brand span { color: var(--muted); font-weight: 400; }
header .open {
  margin-left: auto; white-space: nowrap; font-size: 13px; font-weight: 600; padding: 6px 12px;
  border-radius: 6px; background: var(--accent-soft); transition: background-color 120ms;
}
header .open:hover { background: var(--hover); }
.layout { display: grid; grid-template-columns: 248px minmax(0, 1fr); max-width: 1200px; margin: 0 auto; }
nav {
  position: sticky; top: 56px; align-self: start; max-height: calc(100vh - 56px); overflow-y: auto;
  padding: 32px 16px 32px 20px; font-size: 14px; line-height: 1.4;
}
nav h2 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 10px 10px; }
nav ul { list-style: none; margin: 0; padding: 0; }
nav li + li { margin-top: 2px; }
nav li a { display: block; padding: 6px 10px; border-radius: 6px; color: var(--text); transition: background-color 120ms, color 120ms; }
nav li a:hover { background: var(--hover); color: var(--heading); }
nav li a[aria-current] { color: var(--accent); background: var(--accent-soft); font-weight: 600; }
main { padding: 36px 48px 96px; min-width: 0; max-width: 820px; }
h1, h2, h3 { color: var(--heading); position: relative; font-weight: 600; letter-spacing: -0.01em; }
h1 { font-size: 30px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 20px; }
h2 { font-size: 21px; line-height: 1.3; margin: 48px 0 12px; }
h3 { font-size: 16.5px; line-height: 1.35; margin: 32px 0 8px; }
p { margin: 0 0 14px; }
main > :first-child { margin-top: 0; }
.doc-anchor { margin-left: 8px; color: var(--muted); text-decoration: none; opacity: 0; font-weight: 400; transition: opacity 120ms; }
h2:hover .doc-anchor, h3:hover .doc-anchor, .doc-anchor:focus { opacity: 1; }
strong { color: var(--heading); font-weight: 600; }
ul, ol { margin: 0 0 14px; padding-left: 22px; }
li + li, li > ul, li > ol { margin-top: 6px; }
li::marker { color: var(--muted); }
ol > li::marker { font-variant-numeric: tabular-nums; font-size: 0.92em; }
.doc-entries {
  list-style: none; padding: 0; margin: 16px 0 24px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px;
}
.doc-entries > li {
  position: relative; margin: 0; padding: 14px 16px; border: 1px solid var(--line-soft); border-radius: 10px;
  background: var(--panel); transition: border-color 120ms, background-color 120ms;
}
.doc-entries > li:hover { border-color: var(--line); }
.doc-entries > li > a:first-child { font-weight: 600; text-decoration: none; }
.doc-entries > li:not(:has(ol)) > a:first-child::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
.doc-entry-note { margin-top: 2px; font-size: 13.5px; line-height: 1.5; color: var(--muted); }
.doc-entries > li:has(ol) { grid-column: 1 / -1; }
.doc-entries ol {
  list-style: none; counter-reset: lesson; padding: 0; margin: 12px 0 0; columns: 3 170px; column-gap: 16px; font-size: 14px;
}
.doc-entries ol li { counter-increment: lesson; margin: 0 0 4px; display: flex; align-items: baseline; gap: 10px; break-inside: avoid; }
.doc-entries ol li::before {
  content: counter(lesson); flex: none; width: 20px; height: 20px; line-height: 20px; text-align: center;
  border-radius: 50%; font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-soft);
  font-variant-numeric: tabular-nums;
}
.doc-entries ol a { padding: 3px 0; text-decoration: none; }
.doc-entries ol a:hover { text-decoration: underline; }
code, kbd, pre { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
:not(pre) > code {
  font-size: 0.86em; color: var(--inline-code); background: var(--inline-code-bg);
  padding: 0.1em 0.35em; border-radius: 4px; overflow-wrap: break-word;
}
code.ss-code { color: var(--heading); }
kbd {
  font-size: 0.8em; padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px;
  border-radius: 4px; background: var(--panel); color: var(--heading); white-space: nowrap;
}
.doc-code { position: relative; margin: 16px 0 20px; }
.doc-code pre {
  margin: 0; padding: 14px 16px; overflow-x: auto; background: var(--code-bg); border: 1px solid var(--line-soft);
  border-radius: 8px; font-size: 13px; line-height: 1.6;
}
.doc-copy {
  position: absolute; top: 8px; right: 8px; font: inherit; font-size: 12px; font-weight: 500; padding: 3px 10px;
  color: var(--muted); background: var(--panel); border: 1px solid var(--line-soft); border-radius: 6px; cursor: pointer;
  transition: opacity 120ms, color 120ms, border-color 120ms;
}
.doc-copy:hover { color: var(--heading); border-color: var(--line); }
@media (hover: hover) {
  .doc-copy { opacity: 0; }
  .doc-code:hover .doc-copy, .doc-copy:focus-visible { opacity: 1; }
}
table {
  display: block; overflow-x: auto; max-width: 100%; width: max-content; margin: 16px 0 20px;
  border-collapse: separate; border-spacing: 0; border: 1px solid var(--line-soft); border-radius: 8px;
  font-size: 14px; line-height: 1.5;
}
th, td { padding: 8px 14px; text-align: left; vertical-align: top; }
td { border-top: 1px solid var(--line-soft); }
th { background: var(--panel); color: var(--heading); font-weight: 600; font-size: 13px; }
img { max-width: 100%; height: auto; }
main img { border-radius: 8px; border: 1px solid var(--line-soft); }
.tok-keyword { color: var(--tok-keyword); } .tok-type { color: var(--tok-type); }
.tok-builtin { color: var(--tok-builtin); } .tok-atom, .tok-number { color: var(--tok-number); }
.tok-comment { color: var(--tok-comment); } .tok-string { color: var(--tok-string); }
.tok-operator { color: var(--tok-operator); } .tok-property { color: var(--tok-property); }
.tok-function { color: var(--tok-function); } .tok-parameter { color: var(--tok-property); font-style: italic; }
.tok-macro { color: var(--tok-number); } .tok-meta { color: var(--tok-operator); }
@media (max-width: 760px) {
  html { scroll-padding-top: 112px; }
  header { padding: 0 16px; gap: 8px; }
  .brand { font-size: 16px; gap: 8px; }
  header .open { padding: 5px 10px; font-size: 12.5px; }
  @media (max-width: 400px) { .brand span { display: none; } }
  .layout { display: block; }
  nav {
    position: sticky; top: 56px; z-index: 5; max-height: none; overflow: visible; padding: 8px 0;
    background: var(--bg); border-bottom: 1px solid var(--line-soft);
  }
  nav h2 { display: none; }
  nav ul { display: flex; gap: 4px; overflow-x: auto; padding: 0 16px; scrollbar-width: none; }
  nav li + li { margin-top: 0; }
  nav li a { white-space: nowrap; padding: 5px 12px; border-radius: 999px; font-size: 13px; }
  main { padding: 24px 16px 64px; }
  h1 { font-size: 26px; }
  h2 { font-size: 19px; margin-top: 40px; }
}
`;

// Copy buttons on code blocks, and on a phone, the page list scrolled to this page.
const SCRIPT = `var current = document.querySelector("nav [aria-current]");
if (current && current.parentElement.parentElement.scrollWidth > window.innerWidth) {
  current.parentElement.parentElement.scrollLeft = current.offsetLeft - 16;
}
document.addEventListener("click", function (event) {
  var button = event.target.closest && event.target.closest(".doc-copy");
  if (!button) return;
  var code = button.parentElement.querySelector("pre").innerText;
  // The clipboard is missing outside secure pages.
  Promise.resolve().then(function () { return navigator.clipboard.writeText(code); }).then(function () {
    button.textContent = "Copied";
    setTimeout(function () { button.textContent = "Copy"; }, 1200);
  }, function () {});
});`;

export function sitePage(page: DocPage, pages: readonly DocPage[]): string {
  const nav = pages.map((p) =>
    `<li><a href="${p.slug}.html"${p.slug === page.slug ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a></li>`)
    .join('\n');
  const title = page.slug === 'index' ? 'smoothstep.io documentation' : `${page.title} - smoothstep.io documentation`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="../favicon-32x32.png">
<link rel="stylesheet" href="docs.css">
</head>
<body>
<header>
  <a class="brand" href="index.html"><img src="../images/logo.svg" width="24" height="24" alt="">smoothstep.io <span>docs</span></a>
  <a class="open" href="../">Open smoothstep.io</a>
</header>
<div class="layout">
<nav aria-label="Pages"><h2>Pages</h2><ul>
${nav}
</ul></nav>
<main>
${page.html}
</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
