var pug = require("pug");
var fs = require("fs");
var path = require("path");
var Config = require("../config");
var { createAsset } = require("./static-minify");
var templates = path.join(__dirname, "..", "..", "templates");
var wwwRoot = path.join(__dirname, "..", "..", "www");

const cache = new Map();
const LOGGER = require('@calzoneman/jsli')('web/pug');

const asset = createAsset({
    isMinifyEnabled: () => Config.get("http.minify"),
    wwwRoot: wwwRoot,
    existsSync: fs.existsSync,
    warn: (msg, ...args) => LOGGER.warn(msg, ...args)
});

/**
 * Merges locals with globals for pug rendering
 */
function merge(locals, res) {
    var dmPlayerId = Config.getProvidersConfig().getDailymotionPlayerId();
    var _locals = {
        siteTitle: Config.get("html-template.title"),
        siteDescription: Config.get("html-template.description"),
        csrfToken: typeof res.req.csrfToken === 'function' ? res.req.csrfToken() : '',
        baseUrl: getBaseUrl(res),
        channelPath: Config.get("channel-path"),
        asset: asset,
        // Player ID is required by Dailymotion (bare libs/player.js returns 403).
        // Default x8lr5 is their public docs example; set your own Studio Player ID in production.
        dailymotionLibraryUrl: "https://geo.dailymotion.com/libs/player/" +
            encodeURIComponent(dmPlayerId || "x8lr5") + ".js",
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
    clearCache: clearCache,
    asset: asset
};
