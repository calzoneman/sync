import Promise from 'bluebird';
import { ChannelStateSizeError,
         ChannelDataNotFoundError } from '../errors';
import db from '../database';
import Logger from '../logger';

const SIZE_LIMIT = 1048576;
const QUERY_CHANNEL_ID_FOR_NAME = 'SELECT id FROM channels WHERE name = ?';
const QUERY_CHANNEL_DATA = 'SELECT `key`, `value` FROM channel_data WHERE channel_id = ?';
const QUERY_UPDATE_CHANNEL_DATA =
    'INSERT INTO channel_data VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = ?';

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

export class DatabaseStore {
    load(channelName) {
        return queryAsync(QUERY_CHANNEL_ID_FOR_NAME, [channelName]).then((rows) => {
            if (rows.length === 0) {
                throw new ChannelNotFoundError(`Channel does not exist: "${channelName}"`);
            }

            return queryAsync(QUERY_CHANNEL_DATA, [rows[0].id]);
        }).then(rows => {
            const data = {};
            for (const row of rows) {
                try {
                    data[row.key] = JSON.parse(row.value);
                } catch (e) {
                    Logger.errlog.log(`Channel data for channel "${channelName}", ` +
                            `key "${row.key}" is invalid: ${e}`);
                }
            }

            return data;
        });
    }

    save(channelName, data) {
        return queryAsync(QUERY_CHANNEL_ID_FOR_NAME, [channelName]).then((rows) => {
            if (rows.length === 0) {
                throw new ChannelNotFoundError(`Channel does not exist: "${channelName}"`);
            }

            let totalSize = 0;
            const id = rows[0].id;
            const substitutions = [];
            for (const key of Object.keys(data)) {
                const value = JSON.stringify(data[key]);
                totalSize += value.length;
                substitutions.push([
                    id,
                    key,
                    value,
                    value // Extra substitution var necessary for ON DUPLICATE KEY UPDATE
                ]);
            }

            if (totalSize > SIZE_LIMIT) {
                throw new ChannelStateSizeError('Channel state size is too large', {
                    limit: SIZE_LIMIT,
                    actual: totalSize
                });
            }

            return Promise.map(substitutions, entry => {
                return queryAsync(QUERY_UPDATE_CHANNEL_DATA, entry);
            });
        });
    }
}
