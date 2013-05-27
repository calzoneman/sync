var Database = require("../database");
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

// Test channel registration
assert(Database.registerChannel("test"));
assert(Database.deleteChannel("test"));
console.log("[PASS] Channel registration");

// Test channel ranks
Database.registerChannel("test");
assert(Database.setChannelRank("test", "a_user", 10));
assert(Database.getChannelRank("test", "a_user") == 10);
assert(Database.setChannelRank("test", "user_2", 4));
assert(Database.listChannelRanks("test").length == 2);
assert(Database.getChannelRank("test", ["a_user", "user_2"])+"" == [10, 4]+"");
console.log("[PASS] Channel ranks");

// Test library caching
assert(Database.addToLibrary("test", {
    id: "abc",
    seconds: 123,
    title: "Testing",
    type: "yt"
}));
assert(db.querySync("SELECT * FROM `chan_test_library` WHERE id='abc'").fetchAllSync().length > 0);
assert(Database.removeFromLibrary("test", "abc"));
assert(db.querySync("SELECT * FROM `chan_test_library` WHERE id='abc'").fetchAllSync().length == 0);
console.log("[PASS] Channel library");

db.closeSync();
process.exit(0);
