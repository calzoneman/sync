import fs from 'fs';
import path from 'path';
import Promise from 'bluebird';
import { InvalidRequestError } from '../errors';

const unlinkAsync = Promise.promisify(fs.unlink);

class ChannelDB {
    constructor(db) {
        this.db = db;
    }

    getByName(name) {
        return this.db.runTransaction(async tx => {
            const channel = await tx.table('channels')
                    .where({ name })
                    .first();

            if (!channel) return null;

            return this.mapChannel(channel);
        });
    }

    listByOwner(owner) {
        return this.db.runTransaction(async tx => {
            const rows = await tx.table('channels')
                    .where({ owner })
                    .select();

            return rows.map(row => this.mapChannel(row));
        });
    }

    insert(params) {
        const { name, owner } = params;

        return this.db.runTransaction(async tx => {
            const existing = await tx.table('channels')
                    .where({ name })
                    .forUpdate()
                    .first();

            if (existing) {
                throw new InvalidRequestError(
                    `Channel "${name}" is already registered.`
                );
            }

            await tx.table('channels')
                    .insert({
                        name,
                        owner,
                        time: Date.now(), // Old column, does not use datetime type
                        last_loaded: new Date(),
                        owner_last_seen: new Date()
                    });

            await tx.table('channel_ranks')
                    .insert({
                        name: owner,
                        rank: 5,
                        channel: name
                    });
        });
    }

    // TODO: should this be a soft-delete?
    deleteByName(name) {
        return this.db.runTransaction(async tx => {
            const channel = await tx.table('channels')
                    .where({ name })
                    .forUpdate()
                    .first();

            if (!channel) return;

            await tx.table('channel_ranks').where({ channel: name }).del();
            await tx.table('channel_bans').where({ channel: name }).del();
            await tx.table('channel_libraries').where({ channel: name }).del();
            await tx.table('channel_data').where({ channel_id: channel.id }).del();
            await tx.table('channels').where({ name }).del();

            // TODO: deprecate and remove flatfile chandumps
            const chandump = path.resolve(__dirname, '..', '..', 'chandump', name);

            try {
                await unlinkAsync(chandump);
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        });
    }

    mapChannel(channel) {
        // TODO: fix to datetime column?
        channel.time = new Date(channel.time);
        return channel;
    }
}

export { ChannelDB };
