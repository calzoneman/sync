var jade = require("jade");
var fs = require("fs");
var path = require("path");
var Config = require("../config");
var templates = path.join(__dirname, "..", "..", "templates");
var cache = {};

/**
 * Merges locals with globals for jade rendering
 */
function merge(locals, res) {
    var _locals = {
        siteTitle: Config.get("html-template.title"),
        siteDescription: Config.get("html-template.description"),
        siteAuthor: "Calvin 'calzoneman' 'cyzon' Montgomery",
        loginDomain: Config.get("https.enabled") ? Config.get("https.full-address")
                                                 : Config.get("http.full-address"),
        csrfToken: res.req.csrfToken(),
        baseUrl: getBaseUrl(res)
    };
    if (typeof locals !== "object") {
        return _locals;
    }
    for (var key in locals) {
        _locals[key] = locals[key];
    }
    return _locals;
}

function getBaseUrl(res) {
    var req = res.req;
    var proto;
    if (["http", "https"].indexOf(req.header("x-forwarded-proto")) >= 0) {
        proto = req.header("x-forwarded-proto");
    } else {
        proto = req.protocol;
    }

    return proto + "://" + req.header("host");
}

/**
 * Renders and serves a jade template
 */
function sendJade(res, view, locals) {
    locals.loggedIn = locals.loggedIn || !!res.user;
    locals.loginName = locals.loginName || res.user ? res.user.name : false;
    if (!(view in cache) || Config.get("debug")) {
        var file = path.join(templates, view + ".jade");
        var fn = jade.compile(fs.readFileSync(file), {
            filename: file,
            pretty: !Config.get("http.minify")
        });
        cache[view] = fn;
    }
    var html = cache[view](merge(locals, res));
    res.send(html);
}

module.exports = {
    sendJade: sendJade
};
