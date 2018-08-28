import net from 'net';

const LOGGER = require('@calzoneman/jsli')('AliasesDB');

class AliasesDB {
    constructor(db) {
        this.db = db;
    }

    async addAlias(ip, name) {
        return this.db.runTransaction(async tx => {
            try {
                await tx.table('aliases')
                        .where({ ip, name })
                        .del();
                await tx.table('aliases')
                        .insert({ ip, name, time: Date.now() });
            } catch (error) {
                LOGGER.error('Failed to save alias: %s (ip=%s, name=%s)',
                        error.message, ip, name);
            }
        });
    }

    async getAliasesByIP(ip) {
        return this.db.runTransaction(async tx => {
            const query = tx.table('aliases');
            if (net.isIP(ip)) {
                query.where({ ip: ip });
            } else {
                const delimiter = /^[0-9]+\./.test(ip) ? '.' : ':';
                query.where('ip', 'LIKE', ip + delimiter + '%');
            }

            const rows = await query.select()
                    .distinct('name')
                    .orderBy('time', 'desc')
                    .limit(5);
            return rows.map(row => row.name);
        });
    }

    async getIPsByName(name) {
        return this.db.runTransaction(async tx => {
            const rows = await tx.table('aliases')
                    .select('ip')
                    .where({ name });
            return rows.map(row => row.ip);
        });
    }
}

export { AliasesDB };
