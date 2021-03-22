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
    let tag = $("iframe");
    if (tag.length !== 0) {
        return filterIframe(tag[0]);
    }

    throw new Error("Invalid embed.  Input must be an <iframe> tag");
}

function filterIframe(tag) {
    if (!/^https:/.test(tag.attribs.src)) {
        throw new Error("Invalid embed. Embed source must be HTTPS, plain HTTP is not supported.");
    }

    var meta = {
        embed: {
            tag: "iframe",
            src: tag.attribs.src
        }
    };

    return meta;
}

exports.filter = filter;
