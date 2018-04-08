import fs from 'fs';

const logger = require('@calzoneman/jsli')('redis/lualoader');
const CACHE = {};
const EVALSHA_CACHE = {};

export function loadLuaScript(filename) {
    if (CACHE.hasOwnProperty(filename)) {
        return CACHE[filename];
    }

    CACHE[filename] = fs.readFileSync(filename).toString('utf8');
    return CACHE[filename];
}

function loadAndExecuteScript(redisClient, filename, args) {
    return redisClient.scriptAsync('load', loadLuaScript(filename))
            .then(sha => {
        EVALSHA_CACHE[filename] = sha;
        logger.debug(`Cached ${filename} as ${sha}`);
        return runEvalSha(redisClient, filename, args);
    });
}

function runEvalSha(redisClient, filename, args) {
    const evalInput = args.slice();
    evalInput.unshift(EVALSHA_CACHE[filename]);
    return redisClient.evalshaAsync.apply(redisClient, evalInput);
}

export function runLuaScript(redisClient, filename, args) {
    if (EVALSHA_CACHE.hasOwnProperty(filename)) {
        return runEvalSha(redisClient, filename, args).catch(error => {
            if (error.code === 'NOSCRIPT') {
                logger.warn(`Got NOSCRIPT error for ${filename}, reloading script`);
                return loadAndExecuteScript(redisClient, filename, args);
            } else {
                throw error;
            }
        });
    } else {
        return loadAndExecuteScript(redisClient, filename, args);
    }
}
