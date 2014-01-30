(function () {
    var opts = {};
    if (location.protocol === "https:") {
        opts.secure = true;
    }
    window.socket = io.connect(IO_URL, opts);
    window.socket.on("connect", function () {
        window.socket.emit("initACP");
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
            $(".col-md-12").hide();
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
            tr.attr("title", u.name + " joined on " + new Date(u.time) + " from " + u.ip);
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
                        name: u.uname,
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
                        name: u.uname,
                        email: u.email
                    });
                }).appendTo(reset);
        }
    };

    p = Paginate(users, opts);
    p.paginator.insertBefore(tbl);
    tbl.data("paginator", p);
});
