const { loadConfig } = require('../../lib/configuration/configloader');
const path = require('path');

class IntegrationTestConfig {
    constructor(config) {
        this.config = config;
    }

    get knexConfig() {
        return this.config.database;
    }
}

exports.testConfig = loadConfig(
    IntegrationTestConfig,
    path.resolve(__dirname, '..', '..', 'conf'),
    'integration-test'
);
