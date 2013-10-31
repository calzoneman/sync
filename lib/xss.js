function TagParser(text) {
    this.text = text;
    this.i = 0;
    this.tag = this.parse();
}

TagParser.prototype.skipWhitespace = function () {
    while (this.i < this.text.length && this.text[this.i].match(/\s/)) {
        this.i++;
    }
};

TagParser.prototype.readLiteral = function (regexp) {
    if (regexp === void 0) {
        regexp = /[^\s>]/;
    }
    var str = "";
    while (this.i < this.text.length && this.text[this.i].match(regexp)) {
        str += this.text[this.i];
        this.i++;
    }
    return str;
};

TagParser.prototype.readLiteralOrString = function (regexp) {
    if (this.text[this.i].match(/["']/)) {
        return this.readString();
    }
    return this.readLiteral(regexp);
};

TagParser.prototype.readString = function () {
    var delim = this.text[this.i++];

    var str = "";
    while (this.i < this.text.length && this.text[this.i] !== delim) {
        if (this.text[this.i] === "\\" && this.text[this.i+1] === delim) {
            str += this.text[this.i+1];
            this.i++;
        } else {
            str += this.text[this.i];
        }
        this.i++;
    }
    this.i++;
    return str;
};

TagParser.prototype.parse = function () {
    this.i = this.text.indexOf("<");
    if (this.i === -1) {
        return null;
    }

    this.i++;
    this.skipWhitespace();

    var tname = this.readLiteral();

    // Attributes
    var attrs = {};
    while (this.i < this.text.length && this.text[this.i] !== ">") {
        var key = this.readLiteralOrString(/[^\s=>]/);
        this.skipWhitespace();
        if (this.text[this.i] !== "=") {
            if (key.trim().length > 0) {
                attrs[key] = "";
            }
            continue;
        }

        this.i++;
        this.skipWhitespace();
        var value = this.readLiteralOrString();
        if (key.trim().length > 0) {
            attrs[key] = value;
        }
        this.skipWhitespace();
    }

    if (this.i < this.text.length) {
        this.i++;
    }

    return {
        tagName: tname,
        attributes: attrs,
        text: this.text.substring(0, this.i)
    };
};

/* Some of these may not even be HTML tags, I borrowed them from the
   [now deprecated] XSS module of node-validator
*/
const badTags = new RegExp([
    "alert",
    "applet",
    "audio",
    "basefont",
    "base",
    "behavior",
    "bgsound",
    "blink",
    "body",
    "embed",
    "expression",
    "form",
    "frameset",
    "frame",
    "head",
    "html",
    "ilayer",
    "iframe",
    "input",
    "layer",
    "link",
    "meta",
    "object",
    "style",
    "script",
    "textarea",
    "title",
    "video",
    "xml",
    "xss"
].join("|"), "i");

const badAttrs = new RegExp([
    "\\bon\\S*",
    "\\bformaction"
].join("|"), "i");

const badAttrValues = new RegExp([
    "alert",
    "document.cookie",
    "expression",
    "javascript",
    "location",
    "window"
].join("|"), "ig");

function sanitizeHTML(str) {
    var i = str.indexOf("<");
    if (i === -1) {
        // No HTML tags
        return str;
    }

    while (i !== -1) {
        var t = new TagParser(str.substring(i)).tag;
        if (t.tagName.replace("/", "").match(badTags)) {
            str = str.replace(t.text, "[tag removed]");
            i = str.indexOf("<", i+1);
            continue;
        }
        for (var k in t.attributes) {
            if (k.match(badAttrs)) {
                delete t.attributes[k];
            } else  {
                if (t.attributes[k].match(badAttrValues)) {
                    t.attributes[k] = t.attributes[k].replace(badAttrValues, "[removed]");
                }

                var k2 = k.replace(/[^\w]/g, "");
                if (k2 !== k) {
                    t.attributes[k2] = t.attributes[k];
                    delete t.attributes[k];
                }
            }
        }
        var fmt = "<" + t.tagName;
        for (var k in t.attributes) {
            fmt += " " + k + '="' + t.attributes[k] + '"';
        }
        str = str.replace(t.text, fmt + ">");
        i = str.indexOf("<", i + fmt.length + 1);
    }

    return str;
}

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

module.exports.sanitizeHTML = sanitizeHTML;
