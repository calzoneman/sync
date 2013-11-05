/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*
    WARNING

    This file contains an XSS prevention module I wrote myself.  It has not
    been verified by any external agency, and due to the nature of XSS I cannot
    guarantee that it will filter correctly.  Feel free to send me bug reports
    and I will do my best to fix them, but use at your own risk.

*/

/* Prototype for a basic XML tag parser */
function TagParser(text) {
    this.text = text;
    this.i = 0;
    this.tag = this.parse();
}

/* Moves the position marker past any whitespace characters */
TagParser.prototype.skipWhitespace = function () {
    while (this.i < this.text.length && this.text[this.i].match(/\s/)) {
        this.i++;
    }
};

/* Reads a literal value matching the given regexp.  Defaults
   to /[^\s>]/; i.e. any string not containing whitespace or
   the end of tag character '>'
*/
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

/* If the character at the current position is a quote, read
   a string.  Otherwise, read a literal
*/
TagParser.prototype.readLiteralOrString = function (regexp) {
    if (this.text[this.i].match(/["']/)) {
        return this.readString();
    }
    return this.readLiteral(regexp);
};

/* Read a string delimited by the character at the current
   position.  For XML tags this means strings enclosed in
   " or '.  Treats \" as a literal '"' symbol and not a
   delimiter.
*/
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

/* Attempts to parse a tagname and attributes from an
   XML tag.
   NOTE: Does not actually parse a DOM node, only parses
   the tag between '<' and '>' because that's all I need
   to do XSS filtering, I don't care what's between a tag
   and its end tag (if it's another tag I handle that
   separately)
*/
TagParser.prototype.parse = function () {
    this.i = this.text.indexOf("<");
    // Not a tag
    if (this.i === -1) {
        return null;
    }

    this.i++;
    this.skipWhitespace();

    // First non-whitespace string after the opening '<' is the tag name
    var tname = this.readLiteral();

    var attrs = {};
    // Continue parsing attributes until the end of string is reached or
    // the end of tag is reached
    while (this.i < this.text.length && this.text[this.i] !== ">") {
        // Read any string not containing equals, possibly delimited by
        // " or '
        var key = this.readLiteralOrString(/[^\s=>]/);
        this.skipWhitespace();
        // It's possible for tags to have attributes with no value, where
        // the equals sign is not necessary
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

    // If end-of-string was not reached, consume the ending '>'
    if (this.i < this.text.length) {
        this.i++;
    }

    return {
        tagName: tname,
        attributes: attrs,
        text: this.text.substring(0, this.i) // Original text (for replacement)
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

/* Nasty attributes.  Anything starting with "on" is probably a javascript
   callback, and I hope you see why formaction is a bad idea.
*/
const badAttrs = new RegExp([
    "\\bon\\S*",
    "\\bformaction"
].join("|"), "i");

/* These are things commonly used in the values of HTML attributes of
   XSS injections.  Go ahead and strip them, they don't have any other
   use besides javascript
*/
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
        // No HTML tags in the string
        return str;
    }

    // Loop across all tag delimiters '<' in string, parse each one,
    // and replace the results with sanitized tags
    while (i !== -1) {
        var t = new TagParser(str.substring(i)).tag;
        if (t.tagName.replace("/", "").match(badTags)) {
            // Note: Important that I replace the tag with a nonempty value,
            // otherwise <scr<script>ipt> would possibly defeat the filter.
            str = str.replace(t.text, "[tag removed]");
            i = str.indexOf("<", i+1);
            continue;
        }
        for (var k in t.attributes) {
            // If it's an evil attribute, just nuke it entirely
            if (k.match(badAttrs)) {
                delete t.attributes[k];
            } else  {
                if (t.attributes[k].match(badAttrValues)) {
                    // As above, replacing with a nonempty string is important.
                    t.attributes[k] = t.attributes[k].replace(badAttrValues, "[removed]");
                }

                // Keys should not contain non-word characters.
                var k2 = k.replace(/[^\w]/g, "");
                if (k2 !== k) {
                    t.attributes[k2] = t.attributes[k];
                    delete t.attributes[k];
                }
            }
        }
        // Build the sanitized tag
        var fmt = "<" + t.tagName;
        for (var k in t.attributes) {
            if (k.trim().length > 0) {
                fmt += " " + k;
                if (t.attributes[k].trim().length > 0) {
                    fmt += '="' + t.attributes[k] + '"';
                }
            }
        }
        str = str.replace(t.text, fmt + ">");
        i = str.indexOf("<", i + fmt.length + 1);
    }

    return str;
}

/* WIP: Sanitize a string where HTML is prohibited */
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
    str = str.replace(/&#([0-9]{2,4});?/g, function (m, p1) {
        return String.fromCharCode(parseInt(p1));
    });
    str = str.replace(/&#x([0-9a-f]{2,4});?/ig, function (m, p1) {
        return String.fromCharCode(parseInt(p1, 16));
    });
    str = str.replace(/&lt;/g, "<")
             .replace(/&gt;/g, ">")
             .replace(/&quot;/g, "\"")
             .replace(/&amp;/g, "&");
    return str;
}

module.exports.sanitizeHTML = sanitizeHTML;
module.exports.sanitizeText = sanitizeText;
module.exports.decodeText = decodeText;
