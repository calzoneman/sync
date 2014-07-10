var gi = require('./lib/get-info');
var gd = gi.Getters.gd;

gd(process.argv[2], function (err, data) {
    if (err) console.error(err)
    else console.log(data.meta.params.map(function (p) { return decodeURIComponent(p.value); }));
    process.exit(0);
});
