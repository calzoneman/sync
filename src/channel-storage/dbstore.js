import Promise from 'bluebird';
import { ChannelStateSizeError } from '../errors';
import db from '../database';
import { Counter } from 'prom-client';

const LOGGER = require('@calzoneman/jsli')('dbstore');
const SIZE_LIMIT = 1048576;
const QUERY_CHANNEL_DATA = 'SELECT `key`, `value` FROM channel_data WHERE channel_id = ?';
const loadRowcount = new Counter({
    name: 'cytube_channel_db_load_rows_total',
    help: 'Total rows loaded from the channel_data table'
});
const loadCharcount = new Counter({
    name: 'cytube_channel_db_load_chars_total',
    help: 'Total characters (JSON length) loaded from the channel_data table'
});
const saveRowcount = new Counter({
    name: 'cytube_channel_db_save_rows_total',
    help: 'Total rows saved in the channel_data table'
});
const saveCharcount = new Counter({
    name: 'cytube_channel_db_save_chars_total',
    help: 'Total characters (JSON length) saved in the channel_data table'
});

function queryAsync(query, substitutions) {
    return new Promise((resolve, reject) => {
        db.query(query, substitutions, (err, res) => {
            if (err) {
                if (!(err instanceof Error)) {
                    err = new Error(err);
                }
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

function buildUpdateQuery(numEntries) {
    const values = [];
    for (let i = 0; i < numEntries; i++) {
        values.push('(?, ?, ?)');
    }

    return `INSERT INTO channel_data VALUES ${values.join(', ')} ` +
           'ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)';
}

export class DatabaseStore {
    load(id, channelName) {
        if (!id || id === 0) {
            return Promise.reject(new Error(`Cannot load state for [${channelName}]: ` +
                                            `id was passed as [${id}]`));
        }

        return queryAsync(QUERY_CHANNEL_DATA, [id]).then(rows => {
            loadRowcount.inc(rows.length);

            const data = {};
            rows.forEach(row => {
                try {
                    data[row.key] = JSON.parse(row.value);
                    loadCharcount.inc(row.value.length);
                } catch (e) {
                    LOGGER.error(`Channel data for channel "${channelName}", ` +
                            `key "${row.key}" is invalid: ${e}`);
                }
            });

            return data;
        });
    }

    async save(id, channelName, data) {
        if (!id || id === 0) {
            throw new Error(
                `Cannot save state for [${channelName}]: ` +
                `id was passed as [${id}]`
            );
        }

        let totalSize = 0;
        let rowCount = 0;
        const substitutions = [];

        for (const key in data) {
            if (typeof data[key] === 'undefined') {
                continue;
            }

            rowCount++;

            const value = JSON.stringify(data[key]);
            totalSize += value.length;

            substitutions.push(id);
            substitutions.push(key);
            substitutions.push(value);
        }

        if (rowCount === 0) {
            return;
        }

        if (totalSize > SIZE_LIMIT) {
            throw new ChannelStateSizeError(
                'Channel state size is too large',
                {
                    limit: SIZE_LIMIT,
                    actual: totalSize
                }
            );
        }

        saveRowcount.inc(rowCount);
        saveCharcount.inc(totalSize);

        return await queryAsync(buildUpdateQuery(rowCount), substitutions);
    }
}
