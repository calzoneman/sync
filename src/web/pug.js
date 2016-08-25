var pug = require("pug");
var fs = require("fs");
var path = require("path");
var Config = require("../config");
var templates = path.join(__dirname, "..", "..", "templates");
var cache = {};

/**
 * Merges locals with globals for pug rendering
 */
function merge(locals, res) {
    var _locals = {
        siteTitle: Config.get("html-template.title"),
        siteDescription: Config.get("html-template.description"),
        siteAuthor: "Calvin 'calzoneman' 'cyzon' Montgomery",
        loginDomain: Config.get("https.enabled") ? Config.get("https.full-address")
                                                 : Config.get("http.full-address"),
        csrfToken: typeof res.req.csrfToken === 'function' ? res.req.csrfToken() : '',
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
    return req.realProtocol + "://" + req.header("host");
}

/**
 * Renders and serves a pug template
 */
function sendPug(res, view, locals) {
    if (!locals) {
        locals = {};
    }
    locals.loggedIn = locals.loggedIn || !!res.user;
    locals.loginName = locals.loginName || res.user ? res.user.name : false;
    locals.superadmin = locals.superadmin || res.user ? res.user.global_rank >= 255 : false;
    if (!(view in cache) || Config.get("debug")) {
        var file = path.join(templates, view + ".pug");
        var fn = pug.compile(fs.readFileSync(file), {
            filename: file,
            pretty: !Config.get("http.minify")
        });
        cache[view] = fn;
    }
    var html = cache[view](merge(locals, res));
    res.send(html);
}

module.exports = {
    sendPug: sendPug
};
