import { InvalidRequestError } from '../errors';

const LOGGER = require('@calzoneman/jsli')('AccountDB');

class AccountDB {
    constructor(db) {
        this.db = db;
    }

    getByName(name) {
        return this.db.runTransaction(async tx => {
            const user = await tx.table('users').where({ name }).first();

            if (!user) return null;

            return this.mapUser(user);
        });
    }

    updateByName(name, changedFields) {
        return this.db.runTransaction(async tx => {
            if (changedFields.profile) {
                changedFields.profile = JSON.stringify(changedFields.profile);
            }

            const rowsUpdated = await tx.table('users')
                    .update(changedFields)
                    .where({ name });

            if (rowsUpdated === 0) {
                throw new InvalidRequestError(
                    `Cannot update: name "${name}" does not exist`
                );
            }
        });
    }

    mapUser(user) {
        // Backwards compatibility
        // Maybe worth backfilling one day to be done with it?
        try {
            let profile;

            if (!user.profile) {
                profile = { image: '', text: '' };
            } else {
                profile = JSON.parse(user.profile);
            }

            if (!profile.image) profile.image = '';
            if (!profile.text) profile.text = '';

            user.profile = profile;
        } catch (error) {
            // TODO: backfill erroneous records and remove this check
            LOGGER.warn('Invalid profile "%s": %s', user.profile, error);
            user.profile = { image: '', text: '' };
        }

        user.time = new Date(user.time);

        return user;
    }
}

export { AccountDB };
