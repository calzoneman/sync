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
        csrfToken: typeof res.req.csrfToken === 'function' ? res.req.csrfToken() : '',
        baseUrl: getBaseUrl(res),
        channelPath: Config.get("channel-path"),
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
    locals.loggedIn = nvl(locals.loggedIn, res.locals.loggedIn);
    locals.loginName = nvl(locals.loginName, res.locals.loginName);
    locals.superadmin = nvl(locals.superadmin, res.locals.superadmin);

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

function nvl(a, b) {
    if (typeof a === 'undefined') return b;
    return a;
}

module.exports = {
    sendPug: sendPug
};
