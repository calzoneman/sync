var starHeightSafe = require("safe-regex");
var parse = require("ret");

module.exports = function (re) {
    if (re.source) {
        re = re.source;
    }

    if (!starHeightSafe(re)) {
        return false;
    }

    var node = parse(re);
    console.log(require('util').inspect(node.stack));
    console.log(parse.types);
    return true;
};
