/**
 * web/jade.js - Provides functionality for rendering/serving jade templates
 *
 * @author Calvin Montgomery <cyzon@cyzon.us>
 */

var jade = require('jade');
var fs = require('fs');
var path = require('path');
var templates = path.join(__dirname, '..', '..', 'templates');

var cache = {};

/**
 * Merges locals with globals for jade rendering
 *
 * @param {Object} locals - The locals to merge
 * @return {Object} an object containing globals and locals
 */
function merge(locals) {
    var _locals = {
        siteTitle: 'CyTube Beta',
        siteDescription: 'Free, open source synchtube',
        siteAuthor: 'Calvin "calzoneman" "cyzon" Montgomery'
    };
    if (typeof locals !== 'object') {
        return _locals;
    }
    for (var key in locals) {
        _locals[key] = locals[key];
    }
    return _locals;
}

/**
 * Renders and serves a jade template
 *
 * @param res - The HTTP response
 * @param view - The view to render
 * @param locals - The locals to pass to the renderer
 */
function sendJade(res, view, locals) {
    if (!(view in cache) || process.env['DEBUG']) {
        var file = path.join(templates, view + '.jade');
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
