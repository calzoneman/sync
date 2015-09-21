var sanitizeHTML = require("sanitize-html");

// These tags are allowed in addition to the defaults
// See https://github.com/punkave/sanitize-html
const ALLOWED_TAGS = [
    "button",
    "center",
    "details",
    "font",
    "h1",
    "h2",
    "img",
    "marquee", // It pains me to do this, but a lot of people use it...
    "s",
    "section",
    "span",
    "summary"
];

const ALLOWED_ATTRIBUTES = [
    "id",
    "aria-*",
    "border",
    "class",
    "color",
    "data-*",
    "height",
    "role",
    "style",
    "title",
    "valign",
    "width"
];

const ALLOWED_SCHEMES = [
    "mumble"
];

var ATTRIBUTE_MAP = {
    a: ["href", "name", "target"],
    font: ["size"],
    img: ["src"],
    marquee: ["behavior", "behaviour", "direction", "scrollamount"],
    table: ["cellpadding", "cellspacing"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"]
}

for (var key in ATTRIBUTE_MAP) {
    ALLOWED_ATTRIBUTES.forEach(function (attr) {
        ATTRIBUTE_MAP[key].push(attr);
    });
}

sanitizeHTML.defaults.allowedTags.concat(ALLOWED_TAGS).forEach(function (tag) {
    if (!(tag in ATTRIBUTE_MAP)) {
        ATTRIBUTE_MAP[tag] = ALLOWED_ATTRIBUTES;
    }
});

const SETTINGS = {
    allowedSchemes: sanitizeHTML.defaults.allowedSchemes.concat(ALLOWED_SCHEMES),
    allowedTags: sanitizeHTML.defaults.allowedTags.concat(ALLOWED_TAGS),
    allowedAttributes: ATTRIBUTE_MAP
};

function sanitizeText(str) {
    str = str.replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#39;")
             .replace(/\(/g, "&#40;")
             .replace(/\)/g, "&#41;");
    return str;
}

function decodeText(str) {
    str = str.replace(/&#([0-9]{2,7});?/g, function (m, p1) {
        return String.fromCharCode(parseInt(p1));
    });
    str = str.replace(/&#x([0-9a-f]{2,7});?/ig, function (m, p1) {
        return String.fromCharCode(parseInt(p1, 16));
    });
    str = str.replace(/&lt;/g, "<")
             .replace(/&gt;/g, ">")
             .replace(/&quot;/g, "\"")
             .replace(/&amp;/g, "&");
    return str;
}

module.exports.sanitizeHTML = function (html) {
    return sanitizeHTML(html, SETTINGS);
};

module.exports.sanitizeText = sanitizeText;
module.exports.decodeText = decodeText;
