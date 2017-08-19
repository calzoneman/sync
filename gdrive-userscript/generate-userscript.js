var fs = require('fs');
var path = require('path');

var sitename = process.argv[2];
var includes = process.argv.slice(3).map(function (include) {
    return '// @include ' + include;
}).join('\n');

var lines = String(fs.readFileSync(
        path.resolve(__dirname, 'cytube-google-drive.user.js'))).split('\n');

var userscriptOutput = '';
var metaOutput = '';
lines.forEach(function (line) {
    if (line.match(/\{INCLUDE_BLOCK\}/)) {
        userscriptOutput += includes + '\n';
    } else if (line.match(/\{SITENAME\}/)) {
        line = line.replace(/\{SITENAME\}/, sitename) + '\n';
        userscriptOutput += line;
        metaOutput += line;
    } else {
        if (line.match(/==\/?UserScript|@name|@version/)) {
            metaOutput += line + '\n';
        }

        userscriptOutput += line + '\n';
    }
});

fs.writeFileSync(
    path.join(__dirname, '..', 'www', 'js', 'cytube-google-drive.user.js'),
    userscriptOutput
);
fs.writeFileSync(
    path.join(__dirname, '..', 'www', 'js', 'cytube-google-drive.meta.js'),
    metaOutput
);
