(function () {

    var defaults = {
        preLoadPage: function () { },
        postLoadPage: function () { },
        generator: function () { },
        itemsPerPage: 20,
        maxPages: 5
    };

    function P(items, opts) {
        this.items = items;
        this.opts = opts || {};
        for(var k in defaults)
            if(!this.opts[k])
                this.opts[k] = defaults[k];
        this.paginator = $("<ul/>").addClass("pagination");
        this.loadPage(0);
    }

    P.prototype.loadButtons = function (p) {
        var pages = parseInt(this.items.length / this.opts.itemsPerPage) + 1;
        var endcaps = pages > this.opts.maxPages;
        this.paginator.html("");
        if (this.items.length < this.opts.itemsPerPage) {
            this.paginator.css("margin-top", "0");
            return;
        }
        var ul = this.paginator;
        var s = p - parseInt(this.opts.maxPages / 2);
        s = s + this.opts.maxPages < pages ? s : pages - this.opts.maxPages;
        s = s < 0 ? 0 : s;
        if(endcaps) {
            let li = $("<li/>").appendTo(ul);
            $("<a/>").attr("href", "javascript:void(0)")
                .html("&laquo;")
                .on('click', function () {
                    this.loadPage(0);
                }.bind(this))
                .appendTo(li);

            if(p == 0)
                li.addClass("disabled");

            if(s > 0) {
                let sep = $("<li/>").addClass("disabled")
                    .appendTo(ul);
                $("<a/>").attr("href", "javascript:void(0)")
                    .html("&hellip;")
                    .appendTo(sep);
            }
        }
        for(var i = s; i < s + this.opts.maxPages && i < s + pages; i++) {
            (function (i) {
            let li = $("<li/>").appendTo(ul);
            if(i == p)
                li.addClass("active");
            $("<a/>").attr("href", "javascript:void(0)")
                .text(i + 1)
                .on('click', function () {
                    this.loadPage(i);
                }.bind(this))
                .appendTo(li);
            }.bind(this))(i);
        }
        if(endcaps) {
            if(s + this.opts.maxPages < pages) {
                let sep = $("<li/>").addClass("disabled")
                    .appendTo(ul);
                $("<a/>").attr("href", "javascript:void(0)")
                    .html("&hellip;")
                    .appendTo(sep);
            }

            let li = $("<li/>").appendTo(ul);
            $("<a/>").attr("href", "javascript:void(0)")
                .html("&raquo;")
                .on('click', function () {
                    this.loadPage(pages - 1);
                }.bind(this))
                .appendTo(li);

            if(p == pages - 1)
                li.addClass("disabled");
        }
    }

    P.prototype.loadPage = function (page) {
        this.opts.preLoadPage(page);
        this.loadButtons(page);
        var s = page * this.opts.itemsPerPage;
        var e = s + this.opts.itemsPerPage;
        if(e > this.items.length)
            e = this.items.length;
        for(var i = s; i < e; i++) {
            this.opts.generator(this.items[i], page, i);
        }
        this.opts.postLoadPage();
    }

    window.Paginate = function (items, opts) {
       var p = new P(items, opts);
       return p;
    };
})();

function NewPaginator(numItems, itemsPerPage, pageLoader) {
    this.numItems = numItems;
    this.itemsPerPage = itemsPerPage;
    this.elem = document.createElement("ul");
    this.elem.className = "pagination";
    this.btnBefore = 3;
    this.btnAfter = 3;
    this.pageLoader = pageLoader;
}

NewPaginator.prototype.makeButton = function (target, text) {
    var li = document.createElement("li");
    var btn = document.createElement("a");
    btn.href = "javascript:void(0)";
    btn.innerHTML = text;
    var _this = this;
    if (target !== null) {
        btn.onclick = function (event) {
            if (this.parentNode.className === "disabled") {
                event.preventDefault();
                return false;
            }
            _this.loadPage(target);
        };
    }

    li.appendChild(btn);
    return li;
};

NewPaginator.prototype.makeBreak = function () {
    var btn = this.makeButton(null, "&hellip;");
    btn.className = "disabled";
    return btn;
};

NewPaginator.prototype.loadButtons = function (page) {
    this.elem.innerHTML = "";

    var first = this.makeButton(0, "First");
    this.elem.appendChild(first);
    if (page === 0) {
        first.className = "disabled";
    }

    var prev = this.makeButton(page - 1, "&laquo;");
    this.elem.appendChild(prev);
    if (page === 0) {
        prev.className = "disabled";
    }

    if (page > this.btnBefore) {
        var sep = this.makeBreak();
        this.elem.appendChild(sep);
    }

    var numPages = Math.ceil(this.numItems / this.itemsPerPage);
    numPages = Math.max(numPages, 1);
    var numBtns = Math.min(this.btnBefore + this.btnAfter + 1, numPages);
    var start;
    if (page < this.btnBefore) {
        start = 0;
    } else if (page > numPages - this.btnAfter - 1) {
        start = numPages - numBtns;
    } else {
        start = page - this.btnBefore;
    }
    var end = start + numBtns;

    var _this = this;
    for (var i = start; i < end; i++) {
        (function (i) {
            var btn = _this.makeButton(i, String(i + 1));
            _this.elem.appendChild(btn);
            if (i === page) {
                btn.className = "disabled";
            }
        })(i);
    }

    if (page < numPages - this.btnAfter - 1) {
        var sep = this.makeBreak();
        this.elem.appendChild(sep);
    }

    var next = this.makeButton(page + 1, "&raquo;");
    this.elem.appendChild(next);
    if (page === numPages - 1) {
        next.className = "disabled";
    }

    var last = this.makeButton(numPages - 1, "Last");
    this.elem.appendChild(last);
    if (page === numPages - 1) {
        last.className = "disabled";
    }
};

NewPaginator.prototype.loadPage = function (page) {
    this.loadButtons(page);
    if (this.pageLoader) {
        this.pageLoader(page);
    }
};
