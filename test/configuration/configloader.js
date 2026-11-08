const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    loadConfig,
    loadConfigFile,
    loadFromToml,
    parseConfigFile,
    parseConfigText,
    resolveConfigFile
} = require('../../lib/configuration/configloader');

class DummyConfig {
    constructor(config) {
        this.config = config;
    }
}

describe('configloader', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cytube-configloader-'));

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('parses hjson configs', () => {
        const file = path.join(tmpDir, 'sample.hjson');
        fs.writeFileSync(file, '{\n  answer: 42\n  name: cytube\n}\n');
        const parsed = parseConfigFile(file);
        assert.deepStrictEqual(parsed, { answer: 42, name: 'cytube' });
        const conf = loadConfigFile(DummyConfig, file);
        assert.strictEqual(conf.config.answer, 42);
    });

    it('still parses deprecated toml configs', () => {
        const file = path.join(tmpDir, 'sample.toml');
        fs.writeFileSync(file, "answer = 7\nname = 'toml'\n");
        const parsed = parseConfigText(
            fs.readFileSync(file, 'utf8'),
            'toml',
            file
        );
        assert.strictEqual(parsed.answer, 7);
        assert.strictEqual(parsed.name, 'toml');
        const conf = loadFromToml(DummyConfig, file);
        assert.strictEqual(conf.config.name, 'toml');
    });

    it('prefers hjson over toml when resolving by basename', () => {
        const base = 'pref';
        fs.writeFileSync(path.join(tmpDir, `${base}.toml`), "v = 'toml'\n");
        fs.writeFileSync(path.join(tmpDir, `${base}.hjson`), "{\n  v: hjson\n}\n");
        const resolved = resolveConfigFile(tmpDir, base);
        assert.strictEqual(resolved.format, 'hjson');
        const conf = loadConfig(DummyConfig, tmpDir, base);
        assert.strictEqual(conf.config.v, 'hjson');
    });

    it('falls back to toml when hjson is absent', () => {
        const base = 'onlytoml';
        fs.writeFileSync(path.join(tmpDir, `${base}.toml`), "v = 'toml-only'\n");
        const conf = loadConfig(DummyConfig, tmpDir, base);
        assert.strictEqual(conf.config.v, 'toml-only');
    });

    it('throws ENOENT when neither format exists', () => {
        assert.throws(
            () => loadConfig(DummyConfig, tmpDir, 'missing-config'),
            err => err && err.code === 'ENOENT'
        );
    });

    it('loads the shipped example hjson configs', () => {
        const exampleDir = path.resolve(__dirname, '..', '..', 'conf', 'example');
        for (const name of ['camo', 'captcha', 'database', 'email', 'prometheus']) {
            const conf = loadConfig(DummyConfig, exampleDir, name);
            assert.ok(conf.config && typeof conf.config === 'object');
        }
    });
});
