#!/usr/bin/env node
/**
 * Build-time minify for www JS/CSS.
 *
 * Writes minified copies under www/build/ mirroring source paths
 * (e.g. www/js/player.js → www/build/js/player.js).
 *
 * Usage: npm run build-minify
 */
'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const OUT = path.join(WWW, 'build');

// Prefer compiled lib/; fall back to running via babel isn't needed in prod.
let shouldSkip;
let SKIP_DIR_RE;
try {
    ({ shouldSkip, SKIP_DIR_RE } = require('../lib/web/static-minify'));
} catch (err) {
    console.error(
        'Failed to load lib/web/static-minify.js — run `npm run build-server` first.\n',
        err.message
    );
    process.exit(1);
}

function walk(dir, base, out) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name);
        const rel = path.relative(base, abs).split(path.sep).join('/');
        if (ent.isDirectory()) {
            if (SKIP_DIR_RE.test(rel + '/')) continue;
            walk(abs, base, out);
            continue;
        }
        if (!/\.(js|css)$/i.test(ent.name)) continue;
        if (shouldSkip(rel)) continue;
        out.push(rel);
    }
}

function collectEntries(wwwRoot) {
    const root = wwwRoot || WWW;
    const entries = [];
    for (const sub of ['js', 'css']) {
        const dir = path.join(root, sub);
        if (fs.existsSync(dir)) walk(dir, root, entries);
    }
    return entries.sort();
}

async function minifyOne(rel) {
    const src = path.join(WWW, rel);
    const dest = path.join(OUT, rel);

    fs.mkdirSync(path.dirname(dest), { recursive: true });

    await esbuild.build({
        entryPoints: [src],
        outfile: dest,
        minify: true,
        bundle: false,
        logLevel: 'warning',
        loader: rel.endsWith('.css') ? { '.css': 'css' } : undefined,
        allowOverwrite: true
    });

    const before = fs.statSync(src).size;
    const after = fs.statSync(dest).size;
    const pct = before ? Math.round(100 * (1 - after / before)) : 0;
    console.log(`${rel}: ${before} → ${after} bytes (−${pct}%)`);
}

async function main() {
    if (!fs.existsSync(path.join(ROOT, 'node_modules', 'esbuild'))) {
        console.error('esbuild is not installed; run npm install');
        process.exit(1);
    }

    fs.mkdirSync(OUT, { recursive: true });
    const entries = collectEntries();
    if (entries.length === 0) {
        console.error('No JS/CSS entries found under www/{js,css}');
        process.exit(1);
    }

    console.log(`Minifying ${entries.length} files → www/build/`);
    for (const rel of entries) {
        await minifyOne(rel);
    }
    console.log('Done.');
}

module.exports = {
    collectEntries,
    shouldSkip
};

if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
