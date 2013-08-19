var Config = require("./config.js");
var Database = require("./database.js");

var x = {};
Config.load(x, "cfg.json", function () {
    Database.setup(x.cfg);
    Database.init();
    var query;
    var db = Database.getConnection();


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
        query = "UPDATE `chan_" + chan + "_library` SET title=CONCAT(" + 
                "SUBSTRING(title FROM 0 FOR 97), '...') WHERE " +
                "LENGTH(title) > 100";
        console.log(query);
        res = db.querySync(query);
        if(!res) {
            console.log(db);
            console.log("failed to fix "+chan);
            return;
        }
    });
    db.closeSync();
});
