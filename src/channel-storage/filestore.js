import * as Promise from 'bluebird';
import { stat } from 'fs';
import * as fs from 'graceful-fs';
import path from 'path';
import { ChannelStateSizeError } from '../errors';

const readFileAsync = Promise.promisify(fs.readFile);
const writeFileAsync = Promise.promisify(fs.writeFile);
const readdirAsync = Promise.promisify(fs.readdir);
const statAsync = Promise.promisify(stat);
const SIZE_LIMIT = 1048576;
const CHANDUMP_DIR = path.resolve(__dirname, '..', '..', 'chandump');

export class FileStore {
    filenameForChannel(channelName) {
        return path.join(CHANDUMP_DIR, channelName);
    }

    load(channelName) {
        const filename = this.filenameForChannel(channelName);
        return statAsync(filename).then(stats => {
            if (stats.size > SIZE_LIMIT) {
                throw new ChannelStateSizeError('Channel state file is too large', {
                    limit: SIZE_LIMIT,
                    actual: stats.size
                });
            } else {
                return readFileAsync(filename);
            }
        }).then(fileContents => {
            try {
                return JSON.parse(fileContents);
            } catch (e) {
                throw new Error('Channel state file is not valid JSON: ' + e);
            }
        });
    }

    save(channelName, data) {
        const filename = this.filenameForChannel(channelName);
        const fileContents = new Buffer(JSON.stringify(data), 'utf8');
        if (fileContents.length > SIZE_LIMIT) {
            return Promise.reject(new ChannelStateSizeError(
                    'Channel state size is too large', {
                        limit: SIZE_LIMIT,
                        actual: fileContents.length
                    }));
        }

        return writeFileAsync(filename, fileContents);
    }

    listChannels() {
        return readdirAsync(CHANDUMP_DIR);
    }
}
