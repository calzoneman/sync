import toml from 'toml';
import fs from 'fs';

/** @module cytube-common/configuration/configloader */

/**
 * Load a toml file and pass the results to a configuration
 * constructor.
 *
 * @param {function} constructor Constructor to call with the loaded data
 * @param {string} filename Path to the toml file to load
 * @returns {Object} Configuration object constructed from the provided constructor
 * @throws {SyntaxError} Errors propagated from toml.parse()
 */
export function loadFromToml(constructor, filename) {
    const rawContents = fs.readFileSync(filename).toString('utf8');
    const configData = toml.parse(rawContents);
    return new (constructor)(configData);
}
