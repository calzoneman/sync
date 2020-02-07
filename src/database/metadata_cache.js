import { createMySQLDuplicateKeyUpdate } from '../util/on-duplicate-key-update';
const Switches = require('../switches');

const Media = require('cytube-mediaquery/lib/media');

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

class MetadataCacheDB {
    constructor(db) {
        this.db = db;
    }

    async put(media) {
        if (!Switches.isActive('ytCache')) return;

        media = new Media(media);
        media.type = mediaquery2cytube(media.type);
        return this.db.runTransaction(async tx => {
            let insert = tx.table('media_metadata_cache')
                .insert({
                    id: media.id,
                    type: media.type,
                    metadata: JSON.stringify(media)
                });
            let update = tx.raw(createMySQLDuplicateKeyUpdate(
                ['metadata']
            ));

            return tx.raw(insert.toString() + update.toString());
        });
    }

    async get(id, type) {
        if (!Switches.isActive('ytCache')) return null;

        return this.db.runTransaction(async tx => {
            let row = await tx.table('media_metadata_cache')
                .where({ id, type })
                .first();

            if (row === undefined || row === null) {
                return null;
            }

            let metadata = JSON.parse(row.metadata);
            metadata.type = cytube2mediaquery(metadata.type);
            return new Media(metadata);
        });
    }
}

export { MetadataCacheDB };
