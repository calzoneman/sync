import { createMySQLDuplicateKeyUpdate } from '../util/on-duplicate-key-update';

const ONE_DAY = 24 * 60 * 60 * 1000;

class PasswordResetDB {
    constructor(db) {
        this.db = db;
    }

    insert(params) {
        if (!params || typeof params !== 'object') {
            return Promise.reject(new Error('password reset params must be an object'));
        }

        const { ip = '', name, email = '', hash, expire } = params;
        if (!name || typeof name !== 'string') {
            return Promise.reject(new Error('password reset requires a name'));
        }
        if (!hash || typeof hash !== 'string') {
            return Promise.reject(new Error('password reset requires a hash'));
        }
        if (typeof expire !== 'number' || !Number.isFinite(expire)) {
            return Promise.reject(new Error('password reset requires a numeric expire'));
        }

        const row = { ip, name, email, hash, expire };

        return this.db.runTransaction(tx => {
            const insert = tx.table('password_reset').insert(row);
            // MySQL-specific upsert; other DBMS would need a different strategy.
            const update = tx.raw(createMySQLDuplicateKeyUpdate(
                ['ip', 'hash', 'email', 'expire']
            ));

            return tx.raw(insert.toString() + update.toString());
        });
    }

    get(hash) {
        return this.db.runTransaction(tx => {
            return tx.table('password_reset').where({ hash }).select()
                    .then(rows => {
                if (rows.length === 0) {
                    throw new Error(`No password reset found for hash ${hash}`);
                }

                return rows[0];
            });
        });
    }

    delete(hash) {
        return this.db.runTransaction(tx => {
            return tx.table('password_reset').where({ hash }).del();
        });
    }

    cleanup(threshold = ONE_DAY) {
        return this.db.runTransaction(tx => {
            return tx.table('password_reset')
                    .where('expire', '<', Date.now() - threshold)
                    .del();
        });
    }
}

export { PasswordResetDB };
