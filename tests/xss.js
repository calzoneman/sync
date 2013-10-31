var sanitize = require('../lib/xss').sanitizeHTML;
var assert = require('assert');

function basicTest() {
    assert(sanitize("<  script src   =  bad.js>blah</script>") ===
                    "[tag removed]blah[tag removed]");

    assert(sanitize("< img src=asdf onerror='alert(\"xss\")'>") ===
                    "<img src=\"asdf\">");

    assert(sanitize("<a href='javascript:alert(document.cookie)'>") === 
                    "<a href=\":()\">");

    assert(sanitize("<a ") === "<a>");

    assert(sanitize("<img src=\"<a href=\"javascript:void(0)\">>") ===
                    "<img src=\"<a href=\" javascriptvoid0=\"\">>");
}

basicTest();
console.log("Tests passed.");
