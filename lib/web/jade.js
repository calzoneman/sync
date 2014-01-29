var jade = require("jade");
var fs = require("fs");
var path = require("path");
var Config = require("../config");
var templates = path.join(__dirname, "..", "..", "themes", Config.get("html-template.theme"), "templates");

var cache = {};

/**
 * Merges locals with globals for jade rendering
 */
function merge(locals) {
    var _locals = {
        siteTitle: Config.get("html-template.title"),
        siteDescription: Config.get("html-template.description"),
        siteAuthor: "Calvin 'calzoneman' 'cyzon' Montgomery"
    };
    if (typeof locals !== "object") {
        return _locals;
    }
    for (var key in locals) {
        _locals[key] = locals[key];
    }
    return _locals;
}

/**
 * Renders and serves a jade template
 */
function sendJade(res, view, locals) {
    if (!(view in cache) || process.env["DEBUG"]) {
        var file = path.join(templates, view + ".jade");
        var fn = jade.compile(fs.readFileSync(file), {
            filename: file,
            pretty: true
        });
        cache[view] = fn;
    }
    var html = cache[view](merge(locals));
    res.send(html);
}

module.exports = {
    sendJade: sendJade
};
