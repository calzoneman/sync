var pug = require("pug");
var fs = require("fs");
var path = require("path");
var Config = require("../config");
var templates = path.join(__dirname, "..", "..", "templates");

const cache = new Map();
const LOGGER = require('@calzoneman/jsli')('web/pug');

/**
 * Merges locals with globals for pug rendering
 */
function merge(locals, res) {
    var _locals = {
        siteTitle: Config.get("html-template.title"),
        siteDescription: Config.get("html-template.description"),
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

    let renderFn = cache.get(view);

    if (!renderFn || Config.get("debug")) {
        LOGGER.debug("Loading template %s", view);

        var file = path.join(templates, view + ".pug");
        renderFn = pug.compile(fs.readFileSync(file), {
            filename: file,
            pretty: !Config.get("http.minify")
        });

        cache.set(view, renderFn);
    }

    res.send(renderFn(merge(locals, res)));
}

function nvl(a, b) {
    if (typeof a === 'undefined') return b;
    return a;
}

function clearCache() {
    let removed = 0;

    for (const key of cache.keys()) {
        cache.delete(key);
        removed++;
    }

    LOGGER.info('Removed %d compiled templates from the cache', removed);
}

module.exports = {
    sendPug: sendPug,
    clearCache: clearCache
};
