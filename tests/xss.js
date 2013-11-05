var sanitize = require('../lib/xss');
var sanitizeHTML = sanitize.sanitizeHTML;
var sanitizeText = sanitize.sanitizeText;
var decodeText = sanitize.decodeText;
var assert = require('assert');
var failed = 0;

function doTest(s, src, expected) {
    try {
        assert(s(src) === expected);
    } catch (e) {
        failed++;
        console.log("Expected '" + expected + "'");
        console.log("Got      '" + s(src) + "'");
    }
}

function testSanitizeHTML() {
    doTest(sanitizeHTML, "<  script src   =  bad.js>blah</script>", "[tag removed]blah[tag removed]");

    doTest(sanitizeHTML, "< img src=asdf onerror='alert(\"xss\")'>", "<img src=\"asdf\">");

    doTest(sanitizeHTML, "<a href='javascript:alert(document.cookie)'>", "<a href=\"[removed]:[removed]([removed])\">");

    doTest(sanitizeHTML, "<a ", "<a>");

    doTest(sanitizeHTML, "<img src=\"<a href=\"javascript:void(0)\">>", "<img src=\"<a href=\" javascriptvoid0>>");
}

function testSanitizeText() {
    doTest(sanitizeText, "<a href=\"#\" onerror=\"javascript:alert('xss')\">", "&lt;a href=&quot;#&quot; onerror=&quot;javascript:alert&#40;&#39;xss&#39;&#41;&quot;&gt;");
    doTest(sanitizeText, "&lt;&gt;&amp;&quot;&ccedil;&#x09", "&amp;lt;&amp;gt;&amp;amp;&amp;quot;&amp;ccedil;&amp;#x09");
}

function testDecode() {
    doTest(decodeText, "&lt;a href=&quot;#&quot; onerror=&quot;javascript:alert&#40;&#39;xss&#39;&#41;&quot;&gt;", "<a href=\"#\" onerror=\"javascript:alert('xss')\">");
    doTest(decodeText, "&amp;lt;&amp;gt;&amp;amp;&amp;quot;&amp;ccedil;&amp;#x09", "&lt;&gt;&amp;&quot;&ccedil;&#x09");
}

testSanitizeHTML();
testSanitizeText();
testDecode();
if (!failed)
    console.log("Tests passed.");
else
    console.log(""+failed, "tests failed");
