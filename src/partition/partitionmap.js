import crypto from 'crypto';
import fs from 'fs';
import toml from 'toml';

function sha256(input) {
    var hash = crypto.createHash('sha256');
    hash.update(input);
    return hash.digest('base64');
}

class PartitionMap {
    /**
     * @param {Map<string, object>} partitions Map of node ids to io configs
     * @param {Array<string>} pool List of available nodes
     * @param {Map<string, string>} overrides Overrides for node assignment
     */
    constructor(partitions, pool, overrides) {
        this.partitions = partitions;
        this.pool = pool;
        this.overrides = overrides || {};
        this._hash = sha256(JSON.stringify(this.partitions)
                 + JSON.stringify(this.pool)
                 + JSON.stringify(this.overrides));
    }

    getHash() {
        return this._hash;
    }

    getPartitions() {
        return this.partitions;
    }

    getPool() {
        return this.pool;
    }

    getOverrides() {
        return this.overrides;
    }

    toJSON() {
        return {
            partitions: this.partitions,
            pool: this.pool,
            overrides: this.overrides,
            hash: this._hash
        };
    }

    static fromJSON(json) {
        return new PartitionMap(json.partitions, json.pool, json.overrides);
    }

    static fromFile(filename) {
        const rawData = fs.readFileSync(filename).toString('utf8');
        const parsed = toml.parse(rawData);

        return PartitionMap.fromJSON(parsed);
    }

    static empty() {
        return new PartitionMap({}, [], {});
    }
}

export { PartitionMap };
