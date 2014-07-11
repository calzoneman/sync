var gi = require('./lib/get-info');
var gp = gi.Getters.gp;

var link = process.argv[2];
var id = link.replace(/https:\/\/plus\.google\.com\/photos\/(\d+)\/albums\/(\d+)\/(\d+)/, "$1_$2_$3");

gp(id, function (err, data) {
    if (err) console.error(err)
    else console.log(data);
    process.exit(0);
});
