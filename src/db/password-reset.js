import { createMySQLDuplicateKeyUpdate } from '../util/on-duplicate-key-update';

const ONE_DAY = 24 * 60 * 60 * 1000;

class PasswordResetDB {
    constructor(db) {
        this.db = db;
    }

    insert(params) {
        // TODO: validate params?
        return this.db.runTransaction(tx => {
            const insert = tx.table('password_reset').insert(params);
            // TODO: Support other DBMS besides MySQL
            // Annoyingly, upsert/on duplicate key update are non-standard
            // Alternatively, maybe this table shouldn't be an upsert table?
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
