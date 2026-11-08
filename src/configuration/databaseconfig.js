const DEFAULTS = {
    server: 'localhost',
    port: 3306,
    database: 'cytube3',
    user: 'cytube3',
    password: '',
    'pool-size': 10
};

class DatabaseConfig {
    /**
     * @param {Object} [config] Flat mysql settings (from conf/database.hjson
     *   or the legacy config.yaml `mysql:` block)
     */
    constructor(config = {}) {
        this.config = Object.assign({}, DEFAULTS, config || {});
        this.validate();
    }

    validate() {
        if (typeof this.config.server !== 'string' || !this.config.server) {
            throw new Error("Database config key 'server' must be a non-empty string");
        }
        if (typeof this.config.database !== 'string' || !this.config.database) {
            throw new Error("Database config key 'database' must be a non-empty string");
        }
        if (typeof this.config.user !== 'string' || !this.config.user) {
            throw new Error("Database config key 'user' must be a non-empty string");
        }
        if (typeof this.config.password !== 'string') {
            throw new Error("Database config key 'password' must be a string");
        }

        const port = Number(this.config.port);
        if (!Number.isFinite(port) || port <= 0) {
            throw new Error("Database config key 'port' must be a positive number");
        }
        this.config.port = port;

        const poolSize = Number(this.config['pool-size']);
        if (!Number.isFinite(poolSize) || poolSize <= 0) {
            throw new Error("Database config key 'pool-size' must be a positive number");
        }
        this.config['pool-size'] = poolSize;
    }

    getServer() {
        return this.config.server;
    }

    getPort() {
        return this.config.port;
    }

    getDatabase() {
        return this.config.database;
    }

    getUser() {
        return this.config.user;
    }

    getPassword() {
        return this.config.password;
    }

    getPoolSize() {
        return this.config['pool-size'];
    }

    /**
     * Build a knex connection+pool config object for mysql.
     * @returns {{ client: string, connection: Object, pool: Object, debug: boolean }}
     */
    toKnexConfig() {
        const server = this.getServer();
        let connection;

        if (server.startsWith('unix:')) {
            connection = {
                socketPath: server.slice(5),
                user: this.getUser(),
                password: this.getPassword(),
                database: this.getDatabase(),
                multipleStatements: true, // Legacy thing
                charset: 'utf8mb4'
            };
        } else {
            connection = {
                host: server,
                port: this.getPort(),
                user: this.getUser(),
                password: this.getPassword(),
                database: this.getDatabase(),
                multipleStatements: true, // Legacy thing
                charset: 'utf8mb4'
            };
        }

        return {
            client: 'mysql',
            connection,
            pool: {
                min: this.getPoolSize(),
                max: this.getPoolSize()
            },
            debug: !!process.env.KNEX_DEBUG
        };
    }
}

export { DatabaseConfig, DEFAULTS as DATABASE_CONFIG_DEFAULTS };
