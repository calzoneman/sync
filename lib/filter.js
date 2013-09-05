/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Filter = function(name, regex, flags, replace) {
    this.name = name;
    this.source = regex;
    this.flags = flags;
    this.regex = new RegExp(this.source, this.flags);
    this.replace = replace;
    this.active = true;
    this.filterlinks = false;
}

Filter.prototype.pack = function() {
    return {
        name: this.name,
        source: this.source,
        flags: this.flags,
        replace: this.replace,
        active: this.active,
        filterlinks: this.filterlinks
    }
}

Filter.prototype.filter = function(text) {
    return text.replace(this.regex, this.replace);
}

exports.Filter = Filter;
