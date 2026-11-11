import { PartitionModule } from './partitionmodule';
import { PartitionMap } from './partitionmap';
import fs from 'fs';
import path from 'path';
import hjson from 'hjson';

/* eslint no-console: off */

const partitionModule = new PartitionModule();
partitionModule.cliMode = true;

function formatAsToml(map) {
    var out = 'pool = [\n';
    map.getPool().forEach((poolEntry, i) => {
        out += `    '${poolEntry}'`;
        if (i < map.getPool().length - 1) {
            out += ',';
        }

        out += '\n';
    });
    out += ']\n\n';

    const partitions = map.getPartitions();
    Object.keys(partitions).forEach(identity => {
        partitions[identity].servers.forEach(serverDef => {
            out += `[[partitions.${identity}.servers]]\n`;
            out += `url = '${serverDef.url}'\n`;
            out += `secure = ${serverDef.secure}\n`;
            out += '\n';
        });
    });

    out += '[overrides]\n';
    const overrides = map.getOverrides();
    Object.keys(overrides).forEach(channel => {
        out += `${channel} = '${overrides[channel]}'\n`;
    });

    return out;
}

function formatAsHjson(map) {
    return hjson.stringify({
        pool: map.getPool(),
        partitions: map.getPartitions(),
        overrides: map.getOverrides()
    }, {
        bracesSameLine: true,
        quotes: 'strings',
        space: 2,
        separator: true
    }) + '\n';
}

function savePartitionMap(filename) {
    const reloader = partitionModule.getPartitionMapReloader();
    reloader.once('partitionMapChange', map => {
        const ext = path.extname(filename).toLowerCase();
        let contents;

        if (ext === '.toml') {
            console.warn(
                'Warning: writing deprecated TOML partition map. Prefer .hjson; ' +
                'TOML support will be removed in a future release.'
            );
            contents = formatAsToml(map);
        } else {
            contents = formatAsHjson(map);
        }

        fs.writeFileSync(filename, contents);
        console.log(`Wrote partition map to ${filename}`);
        process.exit(0);
    });
}

function loadPartitionMap(filename) {
    var newMap;

    try {
        newMap = PartitionMap.fromFile(filename);
    } catch (error) {
        console.error(`Failed to load partition map from ${filename}: ${error}`);
        console.error(error.stack);
        process.exit(1);
    }

    const client = partitionModule.getRedisClientProvider().get();
    const config = partitionModule.partitionConfig;
    client.once('ready', () => {
        client.multi()
                .set(config.getPartitionMapKey(), JSON.stringify(newMap))
                .publish(config.getPublishChannel(), new Date().toISOString())
                .execAsync()
                .then(result => {
            console.log(`Result: ${result}`);
            console.log(`Published new partition map from ${filename}`);
            process.exit(0);
        }).catch(error => {
            console.error(`Failed to publish partition map: ${error}`);
            console.error(error.stack);
            process.exit(1);
        });
    });
}

if (process.argv[2] === 'save') {
    savePartitionMap(process.argv[3]);
} else if (process.argv[2] === 'load') {
    loadPartitionMap(process.argv[3]);
} else {
    console.error('Usage: ' + process.argv[0] + ' ' + process.argv[1] + ' <load|save> <filename>');
    console.error('  "save" downloads the partition map and saves it to the specified file');
    console.error('  "load" loads the partition map from the specified file and publishes it');
    console.error('  Prefer .hjson; .toml is deprecated and will be removed later');
    process.exit(1);
}
