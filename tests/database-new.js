var Database = require("../database-new");
Database.setup(require("../config-testing"));
var assert = require("assert");
var db = Database.getConnection();
// Empty database
db.realQuerySync("SHOW TABLES;");
result = db.storeResultSync();
var tables = [];
var tmp = result.fetchAllSync({"asArray": true});
tmp.forEach(function(t) { tables.push(t[0]); });
db.querySync("DROP TABLE " + tables.join(", "));

Database.init();

// Test global bans
assert(!Database.checkGlobalBan("127.0.0.1"));
Database.globalBanIP("192.168.1.12", "test");
Database.globalBanIP("192.168.2", "test");
Database.globalBanIP("192.167", "test");
Database.refreshGlobalBans();
assert(Database.checkGlobalBan("192.168.1.12"));
assert(Database.checkGlobalBan("192.168.2.24"));
assert(Database.checkGlobalBan("192.167.1.15"));
Database.globalUnbanIP("192.168.1.12");
Database.globalUnbanIP("192.167");
Database.refreshGlobalBans();
assert(!Database.checkGlobalBan("192.168.1.12"));
assert(!Database.checkGlobalBan("192.167.5.54"));

console.log("[PASS] Global Bans");
process.exit(0);
