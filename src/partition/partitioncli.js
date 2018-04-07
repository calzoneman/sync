import { PartitionModule } from './partitionmodule';
import { PartitionMap } from './partitionmap';
import fs from 'fs';

/* eslint no-console: off */

const partitionModule = new PartitionModule();
partitionModule.cliMode = true;

function savePartitionMap(filename) {
    const reloader = partitionModule.getPartitionMapReloader();
    reloader.once('partitionMapChange', map => {
        var toml = 'pool = [\n';
        map.getPool().forEach((poolEntry, i) => {
            toml += `    '${poolEntry}'`;
            if (i < map.getPool().length - 1) {
                toml += ',';
            }

            toml += '\n';
        });
        toml += ']\n\n';

        const partitions = map.getPartitions();
        Object.keys(partitions).forEach(identity => {
            partitions[identity].servers.forEach(serverDef => {
                toml += `[[partitions.${identity}.servers]]\n`;
                toml += `url = '${serverDef.url}'\n`;
                toml += `secure = ${serverDef.secure}\n`;
                toml += '\n';
            });
        });

        toml += '[overrides]\n';
        const overrides = map.getOverrides();
        Object.keys(overrides).forEach(channel => {
            toml += `${channel} = '${overrides[channel]}'\n`;
        });

        fs.writeFileSync(filename, toml);
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
    process.exit(1);
}
