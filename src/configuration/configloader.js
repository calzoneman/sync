import hjson from 'hjson';
import toml from 'toml';
import fs from 'fs';
import path from 'path';

/** @module cytube-common/configuration/configloader */

const LOGGER = require('@calzoneman/jsli')('configloader');

const TOML_DEPRECATION =
    'TOML config support is deprecated and will be removed in a future release. ' +
    'Convert this file to HJSON (.hjson).';

/**
 * Parse config file contents by format.
 *
 * @param {string} rawContents
 * @param {string} format 'hjson' | 'toml' | '.hjson' | '.toml'
 * @param {string} [filename] Path used in deprecation warnings
 * @returns {Object}
 */
export function parseConfigText(rawContents, format, filename) {
    const normalized = String(format || '').replace(/^\./, '').toLowerCase();

    if (normalized === 'hjson') {
        return hjson.parse(rawContents);
    }

    if (normalized === 'toml') {
        LOGGER.warn(
            '%s%s',
            filename ? `${filename}: ` : '',
            TOML_DEPRECATION
        );
        return toml.parse(rawContents);
    }

    throw new Error(`Unsupported config format: ${format}`);
}

/**
 * Parse a config file on disk. Format is taken from the file extension.
 *
 * @param {string} filename
 * @returns {Object}
 */
export function parseConfigFile(filename) {
    const rawContents = fs.readFileSync(filename).toString('utf8');
    return parseConfigText(rawContents, path.extname(filename), filename);
}

/**
 * Resolve a config basename under dir, preferring .hjson over deprecated .toml.
 *
 * @param {string} dir
 * @param {string} basename e.g. 'email' (no extension)
 * @returns {{ path: string, format: 'hjson'|'toml' } | null}
 */
export function resolveConfigFile(dir, basename) {
    const hjsonPath = path.join(dir, `${basename}.hjson`);
    if (fs.existsSync(hjsonPath)) {
        return { path: hjsonPath, format: 'hjson' };
    }

    const tomlPath = path.join(dir, `${basename}.toml`);
    if (fs.existsSync(tomlPath)) {
        return { path: tomlPath, format: 'toml' };
    }

    return null;
}

/**
 * Load a config file and pass the results to a configuration constructor.
 *
 * @param {function} constructor
 * @param {string} filename Absolute or relative path including extension
 * @returns {Object}
 */
export function loadConfigFile(constructor, filename) {
    return new (constructor)(parseConfigFile(filename));
}

/**
 * Load conf/<basename>.hjson, falling back to deprecated conf/<basename>.toml.
 *
 * @param {function} constructor
 * @param {string} dir Directory containing the config file
 * @param {string} basename Name without extension (e.g. 'camo')
 * @returns {Object}
 * @throws {Error} with code ENOENT when neither file exists
 */
export function loadConfig(constructor, dir, basename) {
    const resolved = resolveConfigFile(dir, basename);
    if (resolved === null) {
        const error = new Error(
            `ENOENT: no such file or directory, open '${path.join(dir, basename)}.hjson'`
        );
        error.code = 'ENOENT';
        throw error;
    }

    return loadConfigFile(constructor, resolved.path);
}

/**
 * Load a toml file and pass the results to a configuration constructor.
 *
 * @deprecated Use {@link loadConfig} / {@link loadConfigFile} with .hjson.
 *   TOML support will be removed in a future release.
 * @param {function} constructor Constructor to call with the loaded data
 * @param {string} filename Path to the toml file to load
 * @returns {Object} Configuration object constructed from the provided constructor
 * @throws {SyntaxError} Errors propagated from toml.parse()
 */
export function loadFromToml(constructor, filename) {
    return loadConfigFile(constructor, filename);
}
