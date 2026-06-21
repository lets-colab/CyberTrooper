#!/usr/bin/env node
/**
 * verify.mjs — offline page verification harness for CyberTrooper.
 *
 * Loads each target HTML file into jsdom with the external libraries
 * (THREE, gsap, ScrollTrigger, Lenis) stubbed, executes the inline
 * scripts, and fails loudly on the bug classes that have actually
 * bitten this project:
 *   1. Inline script throws at runtime (null DOM ref halts, SyntaxError)
 *   2. Duplicate top-level const/let/var in an inline script
 *   3. getElementById/querySelector('#id') used unguarded but the id is missing
 *   4. href="#anchor" with no matching id
 *   5. fd.get('field') in a submit handler with no matching name= in a form
 *
 * Usage: node verify.mjs            (checks default targets)
 *        node verify.mjs file.html  (checks a specific file)
 * Exits non-zero if any check fails.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const targets = process.argv.slice(2);
const DEFAULT_TARGETS = ['index.html', 'season-kl/index.html'];
const files = (targets.length ? targets : DEFAULT_TARGETS)
  .map((f) => resolve(__dirname, f))
  .filter((f) => existsSync(f));

let totalFailures = 0;

function extractInlineScripts(html) {
  // inline <script> blocks only (those without a src= attribute)
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!/\bsrc\s*=/i.test(m[1])) scripts.push(m[2]);
  }
  return scripts;
}

function checkDuplicateTopLevel(js, fileLabel, fails) {
  // crude but effective: top-level declarations begin at column 0
  const names = {};
  const re = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(js)) !== null) {
    names[m[1]] = (names[m[1]] || 0) + 1;
  }
  const dupes = Object.entries(names).filter(([, c]) => c > 1).map(([n]) => n);
  if (dupes.length) {
    fails.push(`[duplicate-decl] ${fileLabel}: top-level declared >1x → ${dupes.join(', ')} (SyntaxError in a single <script>)`);
  }
}

function checkAnchors(document, fileLabel, fails) {
  const ids = new Set([...document.querySelectorAll('[id]')].map((e) => e.id));
  const anchors = [...document.querySelectorAll('a[href^="#"]')]
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && h.length > 1); // skip bare "#"
  const broken = [...new Set(anchors)].filter((h) => !ids.has(h.slice(1)));
  if (broken.length) {
    fails.push(`[broken-anchor] ${fileLabel}: href has no matching id → ${broken.join(', ')}`);
  }
}

function checkElementRefs(js, document, fileLabel, fails, warns) {
  const ids = new Set([...document.querySelectorAll('[id]')].map((e) => e.id));
  // getElementById('x')
  const idRefs = new Set();
  let m;
  const reId = /getElementById\(\s*['"]([\w-]+)['"]\s*\)/g;
  while ((m = reId.exec(js)) !== null) idRefs.add(m[1]);
  // querySelector('#x') / querySelectorAll('#x')
  const reQs = /querySelector(?:All)?\(\s*['"]#([\w-]+)['"]/g;
  while ((m = reQs.exec(js)) !== null) idRefs.add(m[1]);

  const missing = [...idRefs].filter((id) => !ids.has(id));
  if (missing.length) {
    // Non-fatal: a missing ref only crashes if dereferenced unguarded, and
    // the runtime [script-throw] check catches those. Report as a warning so
    // guarded/optional refs don't fail the build but stay visible.
    warns.push(`[missing-element] ${fileLabel}: script references id(s) not in DOM → ${missing.join(', ')}`);
  }
}

function checkFormFields(js, document, fileLabel, fails) {
  // collect fd.get('field') names
  const fields = new Set();
  let m;
  const re = /\.get\(\s*['"]([\w-]+)['"]\s*\)/g;
  while ((m = re.exec(js)) !== null) fields.add(m[1]);
  if (!fields.size) return;
  const names = new Set(
    [...document.querySelectorAll('[name]')].map((e) => e.getAttribute('name'))
  );
  const missing = [...fields].filter((f) => !names.has(f));
  if (missing.length) {
    fails.push(`[form-mismatch] ${fileLabel}: handler reads fd.get() field(s) with no matching name= → ${missing.join(', ')}`);
  }
}

// A universal proxy: any property access, call, or construction returns
// itself. Lets `new THREE.PerspectiveCamera().position.set(...)`,
// `gsap.timeline().to().to()`, `ctx.clearRect()` etc. all run without throwing.
function deepNoop() {
  const fn = function () { return p; };
  const p = new Proxy(fn, {
    get(t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
      if (prop === Symbol.iterator) return function* () {}; // empty iterable
      if (prop === 'then') return undefined; // never a thenable
      if (prop === 'length') return 0;
      return p;
    },
    apply() { return p; },
    construct() { return p; },
    set() { return true; },
    has() { return true; },
  });
  return p;
}

function makeStubs(window) {
  window.gsap = deepNoop();
  window.ScrollTrigger = deepNoop();
  window.Lenis = class { constructor() {} on() {} raf() {} destroy() {} };
  window.THREE = deepNoop();
  // jsdom has no canvas rendering context — stub it so 2D/WebGL paths run.
  if (window.HTMLCanvasElement) {
    window.HTMLCanvasElement.prototype.getContext = () => deepNoop();
  }
}

async function verifyFile(file) {
  const rel = file.replace(__dirname + '/', '');
  const html = readFileSync(file, 'utf8');
  const fails = [];
  const warns = [];

  // ---- static checks on raw inline scripts ----
  const inline = extractInlineScripts(html);
  inline.forEach((js) => checkDuplicateTopLevel(js, rel, fails));

  // ---- runtime: execute the page ----
  const vc = new VirtualConsole();
  const runtimeErrors = [];
  vc.on('jsdomError', (e) => runtimeErrors.push(e.message || String(e)));

  let dom;
  try {
    dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(window) {
        makeStubs(window);
        // requestAnimationFrame runs first (0ms), matching real browser
        // priority where rAF fires before IntersectionObserver callbacks.
        window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
        window.cancelAnimationFrame = (id) => clearTimeout(id);
        // IntersectionObserver fires ASYNCHRONOUSLY (after rAF), as in real
        // browsers — so code that inits in rAF (e.g. build()) runs before an
        // observer callback uses it. Firing sync here caused false positives.
        window.IntersectionObserver = class {
          constructor(cb) { this.cb = cb; }
          observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }], this), 15); }
          unobserve() {}
          disconnect() {}
        };
        if (!window.matchMedia) {
          window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
        }
      },
    });
  } catch (e) {
    fails.push(`[script-throw] ${rel}: page failed to construct → ${e.message}`);
    report(rel, fails, warns);
    return;
  }

  // allow rAF (0ms) then IntersectionObserver (15ms) callbacks to flush
  await new Promise((r) => setTimeout(r, 120));

  const { document } = dom.window;

  // jsdom surfaces uncaught inline-script errors as jsdomError
  runtimeErrors.forEach((msg) => {
    // ignore noise from stubbed WebGL/canvas (jsdom has no GL context)
    if (/getContext|WebGL|canvas/i.test(msg)) return;
    fails.push(`[script-throw] ${rel}: ${msg.split('\n')[0]}`);
  });

  // ---- static + DOM checks ----
  const allJs = inline.join('\n');
  checkAnchors(document, rel, fails);
  checkElementRefs(allJs, document, rel, fails, warns);
  checkFormFields(allJs, document, rel, fails);

  report(rel, fails, warns);
}

function report(rel, fails, warns = []) {
  if (fails.length) {
    totalFailures += fails.length;
    console.log(`\n❌ ${rel} — ${fails.length} blocking issue(s):`);
    fails.forEach((f) => console.log('   • ' + f));
  } else {
    console.log(`\n✅ ${rel} — all blocking checks passed`);
  }
  if (warns.length) {
    console.log(`   ⚠ ${warns.length} warning(s):`);
    warns.forEach((w) => console.log('     - ' + w));
  }
}

console.log('CyberTrooper verification harness');
console.log('=================================');
for (const f of files) {
  await verifyFile(f);
}
console.log('\n=================================');
if (totalFailures) {
  console.log(`RESULT: FAIL (${totalFailures} issue(s))`);
  process.exit(1);
} else {
  console.log('RESULT: PASS');
  process.exit(0);
}
