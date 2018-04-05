const LOGGER = require('@calzoneman/jsli')('GlobalBanDB');

class GlobalBanDB {
    constructor(db) {
        this.db = db;
    }

    listGlobalBans() {
        return this.db.runTransaction(tx => {
            return tx.table('global_bans').select();
        }).catch(error => {
            LOGGER.error('Failed to list global IP bans: %s', error.stack);
            throw error;
        });
    }

    addGlobalIPBan(ip, reason) {
        return this.db.runTransaction(tx => {
            return tx.table('global_bans')
                    .insert({ ip, reason })
                    .catch(error => {
                if (error.code === 'ER_DUP_ENTRY') {
                    return tx.table('global_bans')
                            .where({ ip })
                            .update({ reason });
                } else {
                    throw error;
                }
            });
        }).catch(error => {
            LOGGER.error('Failed to add global IP ban for IP %s: %s', ip, error.stack);
            throw error;
        });
    }

    removeGlobalIPBan(ip) {
        return this.db.runTransaction(tx => {
            return tx.table('global_bans')
                    .where({ ip })
                    .del();
        }).catch(error => {
            LOGGER.error('Failed to remove global IP ban for IP %s: %s', ip, error.stack);
            throw error;
        });
    }
}

export { GlobalBanDB };
