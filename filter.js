var Filter = function(name, regex, flags, replace) {
    this.name = name;
    this.source = regex;
    this.flags = flags;
    this.regex = new RegExp(this.source, this.flags);
    this.replace = replace;
    this.active = true;
}

Filter.prototype.pack = function() {
    return {
        name: this.name,
        source: this.source,
        flags: this.flags,
        replace: this.replace,
        active: this.active
    }
}

Filter.prototype.filter = function(text) {
    return text.replace(this.regex, this.replace);
}

exports.Filter = Filter;
