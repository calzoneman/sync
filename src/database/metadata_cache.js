import { Summary } from 'prom-client';
import { createMySQLDuplicateKeyUpdate } from '../util/on-duplicate-key-update';

const Media = require('@cytube/mediaquery/lib/media');
const LOGGER = require('@calzoneman/jsli')('metadata-cache');

// TODO: these fullname-vs-shortcode hacks really need to be abolished
function mediaquery2cytube(type) {
    switch (type) {
        case 'youtube':
            return 'yt';
        default:
            throw new Error(`mediaquery2cytube: no mapping for ${type}`);
    }
}

function cytube2mediaquery(type) {
    switch (type) {
        case 'yt':
            return 'youtube';
        default:
            throw new Error(`cytube2mediaquery: no mapping for ${type}`);
    }
}

const cachedResultAge = new Summary({
    name: 'cytube_yt_cache_result_age_seconds',
    help: 'Age (in seconds) of cached record'
});

class MetadataCacheDB {
    constructor(db) {
        this.db = db;
    }

    async put(media) {
        media = new Media(media);
        media.type = mediaquery2cytube(media.type);
        return this.db.runTransaction(async tx => {
            let insert = tx.table('media_metadata_cache')
                .insert({
                    id: media.id,
                    type: media.type,
                    metadata: JSON.stringify(media),
                    updated_at: tx.raw('CURRENT_TIMESTAMP')
                });
            let update = tx.raw(createMySQLDuplicateKeyUpdate(
                ['metadata', 'updated_at']
            ));

            return tx.raw(insert.toString() + update.toString());
        });
    }

    async get(id, type) {
        return this.db.runTransaction(async tx => {
            let row = await tx.table('media_metadata_cache')
                .where({ id, type })
                .first();

            if (row === undefined || row === null) {
                return null;
            }

            try {
                let age = (Date.now() - row.updated_at.getTime())/1000;
                if (age > 0) {
                    cachedResultAge.observe(age);
                }
            } catch (error) {
                LOGGER.error('Failed to record cachedResultAge metric: %s', error.stack);
            }

            let metadata = JSON.parse(row.metadata);
            metadata.type = cytube2mediaquery(metadata.type);
            return new Media(metadata);
        });
    }
}

export { MetadataCacheDB };
