const testConfig = require('./config').testConfig;
const Database = require('../../lib/database').Database;

exports.testDB = new Database(testConfig.knexConfig);
