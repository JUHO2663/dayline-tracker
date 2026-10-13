#!/usr/bin/env node
// Fails the build if the app could send data off the device.
//
// 1. Every direct dependency must be in privacy-allowlist.json (reviewed in PRs).
// 2. App source must not use network APIs or reference remote URLs.
// 3. capacitor.config.ts must not point the app at a remote server.
//
// A line can opt out with a trailing `// privacy-check-ignore: <reason>` comment;
// reviewers should treat every such marker as a red flag.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const errors = [];

// 1. Dependencies
const pkg = JSON.parse(read('package.json'));
const allow = JSON.parse(read('privacy-allowlist.json')).packages;
for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (!(name in allow)) {
    errors.push(`package.json: "${name}" is not in privacy-allowlist.json`);
  }
}

// 2. Source scan
const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bRTCPeerConnection\b/, 'WebRTC'],
  [/\bCapacitorHttp\b/, 'CapacitorHttp'],
  [/\bdownloadFile\b/, 'Filesystem.downloadFile'],
  [/https?:\/\//, 'remote URL'],
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(tsx?|jsx?|mjs|css|html)$/.test(entry)) yield full;
  }
}

const files = [...walk(join(root, 'src')), join(root, 'index.html')];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('privacy-check-ignore')) return;
    for (const [pattern, label] of FORBIDDEN) {
      if (pattern.test(line)) {
        errors.push(`${relative(root, file)}:${i + 1}: uses ${label}`);
      }
    }
  });
}

// 3. Capacitor config
if (/\bserver\s*:\s*\{[^}]*\burl\s*:/s.test(read('capacitor.config.ts'))) {
  errors.push('capacitor.config.ts: server.url must not be set');
}

if (errors.length > 0) {
  console.error('Privacy check failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  console.error('\nSee CONTRIBUTING.md → "Privacy rules".');
  process.exit(1);
}
console.log(`Privacy check passed (${files.length} files, ${Object.keys(allow).length} allowed packages).`);
