var Config = require("./config.js");
var Database = require("./database.js");

Config.DEBUG = true;
Database.setup(Config);
Database.init();
var query;
var db = Database.getConnection();

// Check for already existing
query = "SELECT email FROM registrations WHERE 1";
if(!db.querySync(query)) {
    query = "ALTER TABLE registrations ADD email VARCHAR(255) NOT NULL";
    var res = db.querySync(query);
    if(!res) {
        console.log(db);
        console.log("Update failed!");
    }
}
db.closeSync();
process.exit(0);
