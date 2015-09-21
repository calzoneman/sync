var cheerio = require("cheerio");
var crypto = require("crypto");
var Media = require("./media");

function sha256(input) {
    var hash = crypto.createHash("sha256");
    hash.update(input);
    return hash.digest("base64");
}

function filter(input) {
    var $ = cheerio.load(input, {
        lowerCaseTags: true,
        lowerCaseAttributeNames: true
    });
    var meta = getMeta($);
    var id = "cu:" + sha256(input);

    return new Media(id, "Custom Media", "--:--", "cu", meta);
}

function getMeta($) {
    var tag = $("embed");
    if (tag.length !== 0) {
        return filterEmbed(tag[0]);
    }
    tag = $("object");
    if (tag.length !== 0) {
        return filterObject(tag[0]);
    }
    tag = $("iframe");
    if (tag.length !== 0) {
        return filterIframe(tag[0]);
    }

    throw new Error("Invalid embed.  Input must be an <iframe>, <object>, or " +
                    "<embed> tag.");
}

const ALLOWED_PARAMS = /^(flashvars|bgcolor|movie)$/i;
function filterEmbed(tag) {
    if (tag.attribs.type && tag.attribs.type !== "application/x-shockwave-flash") {
        throw new Error("Invalid embed. Only type 'application/x-shockwave-flash' " +
                        "is allowed for <embed> tags.");
    }

    var meta = {
        embed: {
            tag: "object",
            src: tag.attribs.src,
            params: {}
        }
    }

    for (var key in tag.attribs) {
        if (ALLOWED_PARAMS.test(key)) {
            meta.embed.params[key] = tag.attribs[key];
        }
    }

    return meta;
}

function filterObject(tag) {
    if (tag.attribs.type && tag.attribs.type !== "application/x-shockwave-flash") {
        throw new Error("Invalid embed. Only type 'application/x-shockwave-flash' " +
                        "is allowed for <object> tags.");
    }

    var meta = {
        embed: {
            tag: "object",
            src: tag.attribs.data,
            params: {}
        }
    };

    tag.children.forEach(function (child) {
        if (child.name !== "param") return;
        if (!ALLOWED_PARAMS.test(child.attribs.name)) return;

        meta.embed.params[child.attribs.name] = child.attribs.value;
    });

    return meta;
}

function filterIframe(tag) {
    var meta = {
        embed: {
            tag: "iframe",
            src: tag.attribs.src
        }
    };

    return meta;
}

exports.filter = filter;
