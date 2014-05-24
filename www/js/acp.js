(function () {
    var opts = {};
    if (location.protocol === "https:") {
        opts.secure = true;
    }
    window.socket = io.connect(IO_URL, opts);
    window.socket.on("connect", function () {
        window.socket.emit("initACP");
        window.socket.emit("acp-list-activechannels");
        readEventlog();
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

function readEventlog() {
    $.ajax(location.protocol + "//" + location.host + "/acp/eventlog").done(function (data) {
        handleEventLog(data);
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

function showChannelDetailModal(c) {
    var wrap = $("<div/>").addClass("modal fade").appendTo($("body"));
    var dialog = $("<div/>").addClass("modal-dialog").appendTo(wrap);
    var content = $("<div/>").addClass("modal-content").appendTo(dialog);
    var head = $("<div/>").addClass("modal-header").appendTo(content);
    $("<button/>").addClass("close")
        .attr("data-dismiss", "modal")
        .attr("data-hidden", "true")
        .html("&times;")
        .appendTo(head);
    $("<h4/>").addClass("modal-title").text(c.name).appendTo(head);

    var body = $("<div/>").addClass("modal-body").appendTo(content);

    var table = $("<table/>").addClass("table table-striped table-compact")
        .appendTo(body);
    var tr;

    tr = $("<tr/>").appendTo(table);
    $("<td/>").text("Page Title").appendTo(tr);
    $("<td/>").text(c.pagetitle).appendTo(tr);

    tr = $("<tr/>").appendTo(table);
    $("<td/>").text("Current Media").appendTo(tr);
    $("<a/>").attr("href", c.mediaLink).text(c.mediatitle).appendTo(
        $("<td/>").appendTo(tr)
    );

    tr = $("<tr/>").appendTo(table);
    $("<td/>").text("User Count").appendTo(tr);
    $("<td/>").text(c.usercount).appendTo(tr);

    tr = $("<tr/>").appendTo(table);
    $("<td/>").text("User List").appendTo(tr);
    $("<td/>").text(c.users.join(" ")).appendTo(tr);

    tr = $("<tr/>").appendTo(table);
    $("<td/>").text("Registered").appendTo(tr);
    $("<td/>").text(c.registered).appendTo(tr);

    tr = $("<tr/>").appendTo(table);
    $("<td/>").text("Public").appendTo(tr);
    $("<td/>").text(c.public).appendTo(tr);

    tr = $("<tr/>").appendTo(table);
    $("<td/>").text("ActiveLock Count").appendTo(tr);
    $("<td/>").text(c.activeLockCount).appendTo(tr);

    tr = $("<tr/>").appendTo(table);
    $("<td/>").text("Chat Filter Count").appendTo(tr);
    $("<td/>").text(c.chatFilterCount).appendTo(tr);

    tr = $("<tr/>").appendTo(table);
    $("<td/>").text("Emote Count").appendTo(tr);
    $("<td/>").text(c.emoteCount).appendTo(tr);

    $("<h3/>").text("Recent Chat").appendTo(body);
    $("<pre/>").text(c.chat.map(function (data) {
        var msg = "<" + data.username;
        if (data.addClass) {
            msg += "." + data.addClass;
        }
        msg += "> " + data.msg;

        msg = "[" + new Date(data.time).toTimeString().split(" ")[0] + "] " + msg;
        return msg;
    }).join("\n")).appendTo(body);

    wrap.on("hidden.bs.modal", function () {
        wrap.remove();
    });

    wrap.modal();
}

socket.on("acp-list-activechannels", function (channels) {
console.log(channels[0]);
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

    var count = 0;
    channels.forEach(function (c) {
        var tr = $("<tr/>").appendTo(tbl);
        var name = $("<td/>").appendTo(tr);
        $("<a/>").attr("href", "/r/" + c.name)
            .text(c.pagetitle + " (/r/" + c.name + ")")
            .appendTo(name);
        var usercount = $("<td/>").text(c.usercount).appendTo(tr);
        count += c.usercount;
        var nowplaying = $("<td/>").text(c.mediatitle).appendTo(tr);
        var registered = $("<td/>").text(c.registered).appendTo(tr);
        var public = $("<td/>").text(c.public).appendTo(tr);
        var controlOuter = $("<td/>").appendTo(tr);
        var controlInner = $("<div/>").addClass("btn-group").appendTo(controlOuter);
        $("<button/>").addClass("btn btn-default btn-xs")
            .html("<span class='glyphicon glyphicon-list-alt'></span>")//.text("Details")
            .attr("title", "Details")
            .appendTo(controlInner)
            .click(function () {
                showChannelDetailModal(c);
            });
        $("<button/>").addClass("btn btn-danger btn-xs")
            .html("<span class='glyphicon glyphicon-remove'></span>")//.text("Force Unload")
            .attr("title", "Unload")
            .appendTo(controlInner)
            .click(function () {
                if (confirm("Are you sure you want to unload /r/" + c.name + "?")) {
                    socket.emit("acp-force-unload", {
                        name: c.name
                    });
                }
            });
    });

    var total = $("<tr/>").appendTo(tbl);
    $("<td/>").html("<strong>Total</strong>").appendTo(total);
    $("<td/>").html("<strong>" + count + "</strong>").appendTo(total);
    $("<td/>").appendTo(total);
    $("<td/>").appendTo(total);
    $("<td/>").appendTo(total);
    $("<td/>").appendTo(total);
});

$("#acp-lchannels-refresh").click(function () {
    socket.emit("acp-list-activechannels");
});

/* Event log */

function getEventKey(line) {
    var left = line.indexOf("[", 1);
    var right = line.indexOf("]", left);
    return line.substring(left+1, right);
}

function handleEventLog(data) {
    data = data.split("\n").filter(function (ln) { return ln.indexOf("[") === 0; });
    var keys = {};
    data.forEach(function (ln) {
        keys[getEventKey(ln)] = true;
    });

    $("#acp-eventlog-text").data("lines", data);

    $("#acp-eventlog-filter").html("");
    for (var k in keys) {
        $("<option/>").attr("value", k)
            .text(k)
            .appendTo($("#acp-eventlog-filter"));
    }

    filterEventLog();
}

function filterEventLog() {
    var selected = $("#acp-eventlog-filter").val();
    var all = selected == null || selected.length === 0;
    var lines = $("#acp-eventlog-text").data("lines");
    var show = [];
    lines.forEach(function (ln) {
        if (all || selected.indexOf(getEventKey(ln)) !== -1) {
            show.push(ln);
        }
    });

    $("#acp-eventlog-text").text(show.join("\n"));
    $("#acp-eventlog-text").scrollTop($("#acp-eventlog-text").prop("scrollHeight"));
}

$("#acp-eventlog-filter").change(filterEventLog);
$("#acp-eventlog-refresh").click(readEventlog);

/* Stats */

$("a:contains('Stats')").click(function () {
    socket.emit("acp-list-stats");
});

socket.on("acp-list-stats", function (rows) {
    var labels = [];
    var ucounts = [];
    var ccounts = [];
    var mcounts = [];
    var lastdate = "";
    rows.forEach(function (r) {
        var d = new Date(parseInt(r.time));
        var t = "";
        if (d.toDateString() !== lastdate) {
            lastdate = d.toDateString();
            t = d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();
            t += " " + d.toTimeString().split(" ")[0];
        } else {
            t = d.toTimeString().split(" ")[0];
        }

        labels.push(t);
        ucounts.push(r.usercount);
        ccounts.push(r.chancount);
        mcounts.push(r.mem / 1048576);
    });

    var userdata = {
        labels: labels,
        datasets: [
            {
                fillColor: "rgba(151, 187, 205, 0.5)",
                strokeColor: "rgba(151, 187, 205, 1)",
                pointColor: "rgba(151, 187, 205, 1)",
                pointStrokeColor: "#fff",
                data: ucounts
            }
        ]
    };

    var channeldata = {
        labels: labels,
        datasets: [
            {
                fillColor: "rgba(151, 187, 205, 0.5)",
                strokeColor: "rgba(151, 187, 205, 1)",
                pointColor: "rgba(151, 187, 205, 1)",
                pointStrokeColor: "#fff",
                data: ccounts
            }
        ]
    };

    var memdata = {
        labels: labels,
        datasets: [
            {
                fillColor: "rgba(151, 187, 205, 0.5)",
                strokeColor: "rgba(151, 187, 205, 1)",
                pointColor: "rgba(151, 187, 205, 1)",
                pointStrokeColor: "#fff",
                data: mcounts
            }
        ]
    };
    
    new Chart($("#stat_users")[0].getContext("2d")).Line(userdata);
    new Chart($("#stat_channels")[0].getContext("2d")).Line(channeldata);
    new Chart($("#stat_mem")[0].getContext("2d")).Line(memdata);
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
