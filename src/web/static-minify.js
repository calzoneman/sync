/**
 * Shared rules for build-time static minification and the pug asset() helper.
 */
import fs from 'fs';
import path from 'path';

export const SKIP_DIR_RE =
    /(^|\/)(\.git|node_modules|cache|build|.*\.bak.*|octopus\.bak[^/]*)(\/|$)/i;
export const SKIP_FILE_RE =
    /\.(min\.(js|css)|user\.js|meta\.js|wasm|map|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|ico)$/i;
export const WORKER_RE = /subtitles-octopus-worker/i;

/**
 * @param {string} relPosix path relative to www/, posix separators
 * @returns {boolean}
 */
export function shouldSkip(relPosix) {
    if (SKIP_DIR_RE.test(relPosix)) return true;
    if (SKIP_FILE_RE.test(relPosix)) return true;
    if (WORKER_RE.test(path.basename(relPosix))) return true;
    return false;
}

/**
 * Create an asset URL mapper.
 * @param {object} opts
 * @param {() => boolean} opts.isMinifyEnabled
 * @param {string} opts.wwwRoot absolute path to www/
 * @param {(p: string) => boolean} [opts.existsSync]
 * @param {(msg: string, ...args: any[]) => void} [opts.warn]
 */
export function createAsset(opts) {
    const existsSync = opts.existsSync || fs.existsSync;
    let warnedMissingBuild = false;

    return function asset(urlPath) {
        if (!opts.isMinifyEnabled()) {
            return urlPath;
        }
        if (typeof urlPath !== 'string' || urlPath[0] !== '/') {
            return urlPath;
        }
        const builtRel = path.join('build', urlPath.slice(1));
        const builtAbs = path.join(opts.wwwRoot, builtRel);
        if (existsSync(builtAbs)) {
            return '/build/' + urlPath.slice(1);
        }
        if (!warnedMissingBuild && opts.warn) {
            warnedMissingBuild = true;
            opts.warn(
                'http.minify is enabled but %s is missing; ' +
                'run `npm run build-minify`. Serving unminified assets.',
                builtRel
            );
        }
        return urlPath;
    };
}
