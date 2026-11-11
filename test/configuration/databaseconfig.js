const assert = require('assert');
const {
    DatabaseConfig
} = require('../../lib/configuration/databaseconfig');

describe('DatabaseConfig', () => {
    describe('#constructor', () => {
        it('applies defaults', () => {
            const config = new DatabaseConfig();
            assert.strictEqual(config.getServer(), 'localhost');
            assert.strictEqual(config.getPort(), 3306);
            assert.strictEqual(config.getDatabase(), 'cytube3');
            assert.strictEqual(config.getUser(), 'cytube3');
            assert.strictEqual(config.getPassword(), '');
            assert.strictEqual(config.getPoolSize(), 10);
        });

        it('accepts overrides', () => {
            const config = new DatabaseConfig({
                server: 'db.example',
                port: 3307,
                database: 'live',
                user: 'u',
                password: 'p',
                'pool-size': 5
            });
            assert.strictEqual(config.getServer(), 'db.example');
            assert.strictEqual(config.getPort(), 3307);
            assert.strictEqual(config.getDatabase(), 'live');
            assert.strictEqual(config.getUser(), 'u');
            assert.strictEqual(config.getPassword(), 'p');
            assert.strictEqual(config.getPoolSize(), 5);
        });

        it('rejects invalid pool-size', () => {
            assert.throws(
                () => new DatabaseConfig({ 'pool-size': 0 }),
                /pool-size/
            );
        });
    });

    describe('#toKnexConfig', () => {
        it('builds a TCP connection config', () => {
            const knexConfig = new DatabaseConfig({
                server: '127.0.0.1',
                port: 3307,
                database: 'db',
                user: 'user',
                password: 'secret',
                'pool-size': 3
            }).toKnexConfig();

            assert.strictEqual(knexConfig.client, 'mysql');
            assert.deepStrictEqual(knexConfig.connection, {
                host: '127.0.0.1',
                port: 3307,
                user: 'user',
                password: 'secret',
                database: 'db',
                multipleStatements: true,
                charset: 'utf8mb4'
            });
            assert.deepStrictEqual(knexConfig.pool, { min: 3, max: 3 });
        });

        it('builds a unix socket connection config', () => {
            const knexConfig = new DatabaseConfig({
                server: 'unix:/var/run/mysqld/mysqld.sock',
                database: 'db',
                user: 'user',
                password: 'secret'
            }).toKnexConfig();

            assert.strictEqual(
                knexConfig.connection.socketPath,
                '/var/run/mysqld/mysqld.sock'
            );
            assert.strictEqual(knexConfig.connection.host, undefined);
            assert.strictEqual(knexConfig.connection.port, undefined);
        });
    });
});
