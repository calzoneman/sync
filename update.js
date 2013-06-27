var Config = require("./config.js");
var Database = require("./database.js");

//Config.DEBUG = true;
Database.setup(Config);
Database.init();
var query;
var db = Database.getConnection();

// Check for already existing
query = "SELECT owner FROM channels WHERE 1";
if(!db.querySync(query)) {
    query = "ALTER TABLE channels ADD owner VARCHAR(20) NOT NULL";
    var res = db.querySync(query);
    if(!res) {
        console.log(db);
        console.log("Update failed!");
    }
    else {
        populateChannelOwners();
    }
}
db.closeSync();
process.exit(0);

function populateChannelOwners() {
    query = "SELECT * FROM channels WHERE 1";
    var res = db.querySync(query);
    if(!res) {
        console.log(db);
        console.log("Update failed!");
        return;
    }

    var channels = res.fetchAllSync();
    channels.forEach(function(chan) {
        chan = chan.name;
        console.log("Fixing " + chan);
        query = "SELECT name FROM `chan_"+chan+"_ranks` WHERE rank>=10 ORDER BY rank";
        res = db.querySync(query);
        if(!res) {
            console.log(db);
            console.log("Update failed!");
            return;
        }

        var results = res.fetchAllSync();
        if(results.length == 0) {
            console.log("bad channel: " + chan);
            return;
        }
        var owner = results[0].name;
        query = "UPDATE channels SET owner='"+owner+"' WHERE name='"+chan+"'";
        console.log("setting owner=" + owner + " for /r/" + chan);
        res = db.querySync(query);
        if(!res) {
            console.log(db);
            console.log("Update failed!");
            return;
        }
    });
}
