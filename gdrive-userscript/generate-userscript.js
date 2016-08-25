var fs = require('fs');
var path = require('path');

var sitename = process.argv[2];
var includes = process.argv.slice(3).map(function (include) {
    return '// @include ' + include;
}).join('\n');

var lines = String(fs.readFileSync(
        path.resolve(__dirname, 'cytube-google-drive.user.js'))).split('\n');
lines.forEach(function (line) {
    if (line.match(/\{INCLUDE_BLOCK\}/)) {
        console.log(includes);
    } else if (line.match(/\{SITENAME\}/)) {
        console.log(line.replace(/\{SITENAME\}/, sitename));
    } else {
        console.log(line);
    }
});
