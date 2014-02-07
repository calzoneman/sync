(function () {
    var opts = {};
    if (location.protocol === "https:") {
        opts.secure = true;
    }
    window.socket = io.connect(IO_URL, opts);
    window.socket.on("connect", function () {
        window.socket.emit("initACP");
        window.socket.emit("acp-list-activechannels");
    });

    window.socket.on("errMessage", function (data) {
        alert(data.msg);
    });
})();

function addMenuItem(target, text) {
    var ul = $("#nav-acp-section ul");
    var li = $("<li/>").appendTo(ul);
    var a = $("<a/>").attr("href", "javascript:void(0)")
        .text(text)
        .appendTo(li)
        .click(function () {
            $(".acp-panel").hide();
            $(target).show();
        });
};

addMenuItem("#acp-logview", "Log Viewer");
addMenuItem("#acp-announcements", "Announcements");
addMenuItem("#acp-global-bans", "Global Bans");
addMenuItem("#acp-user-lookup", "Users");
addMenuItem("#acp-channel-lookup", "Channels");
addMenuItem("#acp-loaded-channels", "Active Channels");
addMenuItem("#acp-eventlog", "Event Log");
addMenuItem("#acp-stats", "Stats");

/* Log Viewer */
function readSyslog() {
    $.ajax(location.protocol + "//" + location.host + "/acp/syslog").done(function (data) {
        $("#acp-log").text(data);
        $("#acp-log").scrollTop($("#acp-log").prop("scrollHeight"));
    });
}

function readErrlog() {
    $.ajax(location.protocol + "//" + location.host + "/acp/errlog").done(function (data) {
        $("#acp-log").text(data);
        $("#acp-log").scrollTop($("#acp-log").prop("scrollHeight"));
    });
}

function readHttplog() {
    $.ajax(location.protocol + "//" + location.host + "/acp/httplog").done(function (data) {
        $("#acp-log").text(data);
        $("#acp-log").scrollTop($("#acp-log").prop("scrollHeight"));
    });
}

function readChanlog(name) {
    $.ajax(location.protocol + "//" + location.host + "/acp/chanlog/" + name).done(function (data) {
        $("#acp-log").text(data);
        $("#acp-log").scrollTop($("#acp-log").prop("scrollHeight"));
    });
}

$("#acp-syslog-btn").click(readSyslog);
$("#acp-errlog-btn").click(readErrlog);
$("#acp-httplog-btn").click(readHttplog);
$("#acp-chanlog-name").keyup(function (ev) {
    if (ev.keyCode === 13) {
        readChanlog($("#acp-chanlog-name").val());
    }
});

/* Announcements */
$("#acp-announce-submit").click(function () {
    socket.emit("acp-announce", {
        title: $("#acp-announce-title").val(),
        content: $("#acp-announce-content").val()
    });
});

socket.on("announcement", function (data) {
    $("#acp-announcements").find(".announcement").remove();

    var al = makeAlert(data.title, data.text)
        .removeClass("col-md-12")
        .addClass("announcement")
        .insertAfter($("#acp-announcements h3")[0]);

    al.find(".close").click(function () {
        socket.emit("acp-announce-clear");
    });

    $("#acp-announce-title").val(data.title);
    $("#acp-announce-content").val(data.text);
});

/* Global bans */
$("#acp-gban-submit").click(function () {
    socket.emit("acp-gban", {
        ip: $("#acp-gban-ip").val(),
        note: $("#acp-gban-note").val()
    });
});

socket.on("acp-gbanlist", function (bans) {
    var tbl = $("#acp-global-bans table");
    tbl.find("tbody").remove();

    bans.forEach(function (b) {
        var tr = $("<tr/>").appendTo(tbl);
        var td = $("<td/>").appendTo(tr);
        var del = $("<button/>").addClass("btn btn-xs btn-danger")
            .html("<span class='glyphicon glyphicon-trash'></span>")
            .click(function () {
                socket.emit("acp-gban-delete", b);
            })
            .appendTo(td);

        td = $("<td/>").appendTo(tr).html("<code>" + b.ip + "</code>");
        td = $("<td/>").appendTo(tr).text(b.note);
    });
});

/* User listing */
(function () {
    var doSearch = function () {
        if ($("#acp-ulookup-name").val().trim() === "") {
            if (!confirm("You are about to list the entire users table. " +
                         "This table might be very large and take a long " +
                         "time to query.  Continue?")) {
                return;
            }
        }
        socket.emit("acp-list-users", {
            name: $("#acp-ulookup-name").val()
        });
    };

    $("#acp-ulookup-btn").click(doSearch);
    $("#acp-ulookup-name").keyup(function (ev) {
        if (ev.keyCode === 13) {
            doSearch();
        }
    });
})();

socket.on("acp-list-users", function (users) {
    var tbl = $("#acp-user-lookup table");
    tbl.data("entries", users);
    var p = tbl.data("paginator");
    if (p) {
        p.paginator.remove();
    }

    var opts = {
        preLoadPage: function () {
            tbl.find("tbody").remove();
        },

        generator: function (u, page, index) {
            var tr = $("<tr/>").appendTo(tbl);
            tr.attr("title", u.name + " joined on " + new Date(u.time) + " from IP " + u.ip);
            $("<td/>").text(u.id).appendTo(tr);
            $("<td/>").text(u.name).appendTo(tr);
            var rank = $("<td/>").text(u.global_rank).appendTo(tr);
            $("<td/>").text(u.email).appendTo(tr);
            var reset = $("<td/>").appendTo(tr);

            // Rank editor
            rank.click(function () {
                if (rank.find(".rank-edit").length > 0) {
                    return;
                }

                var old = rank.text();
                rank.text("");

                var editor = $("<input/>").addClass("rank-edit form-control")
                    .attr("type", "text")
                    .attr("placeholder", old)
                    .appendTo(rank)
                    .focus();

                var save = function () {
                    var newrank = editor.val();
                    if (newrank.trim() === "") {
                        newrank = old;
                    }

                    rank.text(old);
                    if (newrank === old) {
                        return;
                    }

                    socket.emit("acp-set-rank", {
                        name: u.name,
                        rank: parseInt(newrank)
                    });

                };

                editor.blur(save);
                editor.keydown(function (ev) {
                    if (ev.keyCode === 13) {
                        save();
                    }
                });
            });

            // Password reset
            $("<button/>").addClass("btn btn-xs btn-danger")
                .text("Reset password")
                .click(function () {
                    if (!confirm("Really reset password for " + u.name + "?")) {
                        return;
                    }
                    socket.emit("acp-reset-password", {
                        name: u.name,
                        email: u.email
                    });
                }).appendTo(reset);
        }
    };

    p = Paginate(users, opts);
    p.paginator.css("margin-top", "20px");
    p.paginator.insertBefore(tbl);
    tbl.data("paginator", p);
});

socket.on("acp-set-rank", function (data) {
    var table = $("#acp-user-lookup table");
    var p = table.data("paginator");
    var e = table.data("entries");
    if (e) {
        for (var i = 0; i < e.length; i++) {
            if (e[i].name === data.name) {
                e[i].rank = data.rank;
                break;
            }

        }
        if (p) {
            p.items = e;
        }
    }

    table.find("td:contains('" + data.name + "')")
        .parent()
        .children()[2]
        .innerHTML = data.rank;
});

/* Channel listing */
(function () {
    var doSearch = function () {
        if ($("#acp-clookup-value").val().trim() === "") {
            if (!confirm("You are about to list the entire channels table. " +
                         "This table might be very large and take a long " +
                         "time to query.  Continue?")) {
                return;
            }
        }
        socket.emit("acp-list-channels", {
            field: $("#acp-clookup-field").val(),
            value: $("#acp-clookup-value").val()
        });
    };

    $("#acp-clookup-submit").click(doSearch);
    $("#acp-clookup-value").keyup(function (ev) {
        if (ev.keyCode === 13) {
            doSearch();
        }
    });
})();

socket.on("acp-list-channels", function (channels) {
    var tbl = $("#acp-channel-lookup table");
    tbl.data("entries", channels);
    var p = tbl.data("paginator");
    if (p) {
        p.paginator.remove();
    }

    var opts = {
        preLoadPage: function () {
            tbl.find("tbody").remove();
        },

        generator: function (c, page, index) {
            var tr = $("<tr/>").appendTo(tbl);
            tr.attr("title", c.name + " was registered on " + new Date(c.time));
            $("<td/>").text(c.id).appendTo(tr);
            $("<td/>").text(c.name).appendTo(tr);
            $("<td/>").text(c.owner).appendTo(tr);
            var remove = $("<td/>").appendTo(tr);

            // Drop channel
            $("<button/>").addClass("btn btn-xs btn-danger")
                .text("Delete channel")
                .click(function () {
                    if (!confirm("Really delete " + c.owner + "/" + c.name + "?")) {
                        return;
                    }
                    socket.emit("acp-delete-channel", {
                        name: c.name,
                    });
                }).appendTo(remove);
        }
    };

    p = Paginate(channels, opts);
    p.paginator.css("margin-top", "20px");
    p.paginator.insertBefore(tbl);
    tbl.data("paginator", p);
});

socket.on("acp-delete-channel", function (data) {
    var table = $("#acp-channel-lookup table");
    var p = table.data("paginator");
    var e = table.data("entries");
    var found = -1;
    if (e) {
        for (var i = 0; i < e.length; i++) {
            if (e[i].name === data.name) {
                found = i;
                break;
            }

        }

        if (found > 0) {
            e.splice(found, 1);
        }

        if (p) {
            p.items = e;
        }
    }

    table.find("td:contains('" + data.name + "')")
        .parent()
        .remove();
});

/* Active channels */
socket.on("acp-list-activechannels", function (channels) {
    var tbl = $("#acp-loaded-channels table");
    tbl.find("tbody").remove();

    channels.sort(function (a, b) {
        if (a.usercount === b.usercount) {
            var x = a.name.toLowerCase();
            var y = b.name.toLowerCase();
            return x === y ? 0 : (x > y ? 1 : -1);
        }

        return a.usercount > b.usercount ? -1 : 1;
    });

    channels.forEach(function (c) {
        var tr = $("<tr/>").appendTo(tbl);
        var name = $("<td/>").appendTo(tr);
        $("<a/>").attr("href", "/r/" + c.name)
            .text(c.pagetitle + " (/r/" + c.name + ")")
            .appendTo(name);
        var usercount = $("<td/>").text(c.usercount).appendTo(tr);
        var nowplaying = $("<td/>").text(c.mediatitle).appendTo(tr);
        var registered = $("<td/>").text(c.registered).appendTo(tr);
        var public = $("<td/>").text(c.public).appendTo(tr);
        var unload = $("<td/>").appendTo(tr);
        $("<button/>").addClass("btn btn-danger btn-xs").text("Force Unload")
            .appendTo(unload)
            .click(function () {
                if (confirm("Are you sure you want to unload /r/" + c.name + "?")) {
                    socket.emit("acp-force-unload", {
                        name: c.name
                    });
                }
            });
    });
});

$("#acp-lchannels-refresh").click(function () {
    socket.emit("acp-list-activechannels");
});

/* Initialize keyed table sorts */
$("table").each(function () {
    var table = $(this);
    var sortable = table.find("th.sort");
    sortable.each(function () {
        var th = $(this);
        th.click(function () {
            var p = table.data("paginator");
            if (!p) {
                return;
            }
            var key = th.attr("data-key");
            if (!key) {
                return;
            }
            var asc = -th.attr("data-sort-direction") || -1;
            th.attr("data-sort-direction", asc);
            var entries = table.data("entries") || [];
            entries.sort(function (a, b) {
                return a[key] === b[key] ? 0 : asc*(a[key] > b[key] ? 1 : -1);
            });
            table.data("entries", entries);
            p.items = entries;
            p.loadPage(0);
        });
    });
});
