import Promise from 'bluebird';
import { ChannelStateSizeError,
         ChannelNotFoundError } from '../errors';
import db from '../database';
import Logger from '../logger';

const SIZE_LIMIT = 1048576;
const QUERY_CHANNEL_ID_FOR_NAME = 'SELECT id FROM channels WHERE name = ?';
const QUERY_CHANNEL_DATA = 'SELECT `key`, `value` FROM channel_data WHERE channel_id = ?';

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
    load(channelName) {
        return queryAsync(QUERY_CHANNEL_ID_FOR_NAME, [channelName]).then((rows) => {
            if (rows.length === 0) {
                throw new ChannelNotFoundError(`Channel does not exist: "${channelName}"`);
            }

            return queryAsync(QUERY_CHANNEL_DATA, [rows[0].id]);
        }).then(rows => {
            const data = {};
            rows.forEach(row => {
                try {
                    data[row.key] = JSON.parse(row.value);
                } catch (e) {
                    Logger.errlog.log(`Channel data for channel "${channelName}", ` +
                            `key "${row.key}" is invalid: ${e}`);
                }
            });

            return data;
        });
    }

    save(channelName, data) {
        return queryAsync(QUERY_CHANNEL_ID_FOR_NAME, [channelName]).then((rows) => {
            if (rows.length === 0) {
                throw new ChannelNotFoundError(`Channel does not exist: "${channelName}"`);
            }

            let totalSize = 0;
            let rowCount = 0;
            const id = rows[0].id;
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

            if (totalSize > SIZE_LIMIT) {
                throw new ChannelStateSizeError('Channel state size is too large', {
                    limit: SIZE_LIMIT,
                    actual: totalSize
                });
            }

            return queryAsync(buildUpdateQuery(rowCount), substitutions);
        });
    }
}
