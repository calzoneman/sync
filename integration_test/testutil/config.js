const loadFromToml = require('../../lib/configuration/configloader').loadFromToml;
const path = require('path');

class IntegrationTestConfig {
    constructor(config) {
        this.config = config;
    }

    get knexConfig() {
        return this.config.database;
    }
}

exports.testConfig = loadFromToml(IntegrationTestConfig, path.resolve(__dirname, '..', '..', 'conf', 'integration-test.toml'));
