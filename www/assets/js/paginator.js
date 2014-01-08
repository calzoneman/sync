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
            var li = $("<li/>").appendTo(ul);
            $("<a/>").attr("href", "javascript:void(0)")
                .html("&laquo;")
                .click(function () {
                    this.loadPage(0);
                }.bind(this))
                .appendTo(li);

            if(p == 0)
                li.addClass("disabled");

            if(s > 0) {
                var sep = $("<li/>").addClass("disabled")
                    .appendTo(ul);
                $("<a/>").attr("href", "javascript:void(0)")
                    .html("&hellip;")
                    .appendTo(sep);
            }
        }
        for(var i = s; i < s + this.opts.maxPages && i < s + pages; i++) {
            (function (i) {
            var li = $("<li/>").appendTo(ul);
            if(i == p)
                li.addClass("active");
            $("<a/>").attr("href", "javascript:void(0)")
                .text(i + 1)
                .click(function () {
                    this.loadPage(i);
                }.bind(this))
                .appendTo(li);
            }.bind(this))(i);
        }
        if(endcaps) {
            if(s + this.opts.maxPages < pages) {
                var sep = $("<li/>").addClass("disabled")
                    .appendTo(ul);
                $("<a/>").attr("href", "javascript:void(0)")
                    .html("&hellip;")
                    .appendTo(sep);
            }

            var li = $("<li/>").appendTo(ul);
            $("<a/>").attr("href", "javascript:void(0)")
                .html("&raquo;")
                .click(function () {
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
