var AUTH = "";
var NO_WEBSOCKETS = false;

/* init socket connection */
$.getScript(IO_URL+"/socket.io/socket.io.js", function() {
    try {
        if(NO_WEBSOCKETS) {
            var i = io.transports.indexOf("websocket");
            if(i >= 0)
                io.transports.splice(i, 1);
        }
        socket = io.connect(IO_URL);
        setupCallbacks();
    }
    catch(e) {
        Callbacks.disconnect();
    }
});
$("#login").click(showLoginMenu);
$("#logout").click(function() {
    eraseCookie("cytube_uname");
    eraseCookie("cytube_session");
    document.location.reload(true);
});

$("#panels .span12").each(function() {
    $(this).hide();
});

function menuHandler(liselect, panelselect) {
    $(liselect).click(function() {
        $("#panels .span12").each(function() {
            $(this).hide();
        });
        $(panelselect).show();
        $("#menudd_title").text($(liselect).text());
    });
}

menuHandler("#show_logview", "#logview");
menuHandler("#show_announce", "#announcepanel");
menuHandler("#show_gbans", "#gbanpanel");
menuHandler("#show_userlookup", "#userlookup");
function tableResort(tbl, sortby) {
    if(tbl.data("sortby") == sortby)
        tbl.data("sort_desc", !tbl.data("sort_desc"));
    else
        tbl.data("sortby", sortby)
    var sort_field = tbl.data("sortby");
    var sort_desc = tbl.data("sort_desc");
    var p = tbl.data("paginator");

    if(sort_field) {
        p.items.sort(function(a, b) {
            var x = a[sort_field];
            if(typeof x == "string")
                x = x.toLowerCase();
            var y = b[sort_field];
            if(typeof y == "string")
                y = y.toLowerCase();
            var z = x == y ? 0 : (x < y ? -1 : 1);
            if(sort_desc)
                z = -z;
            return z;
        });
    }
    p.loadPage(0);
}
$("#userlookup_uid").click(function() {
    tableResort($("#userlookup table"), "id");
});
$("#userlookup_uname").click(function() {
    tableResort($("#userlookup table"), "uname");
});
$("#userlookup_rank").click(function() {
    tableResort($("#userlookup table"), "global_rank");
});
$("#userlookup_email").click(function() {
    tableResort($("#userlookup table"), "email");
});

menuHandler("#show_chanlookup", "#chanlookup");
$("#chanlookup_id").click(function() {
    tableResort($("#chanlookup table"), "id");
});
$("#chanlookup_name").click(function() {
    tableResort($("#chanlookup table"), "name");
});
$("#chanlookup_owner").click(function() {
    tableResort($("#chanlookup table"), "owner");
});

menuHandler("#show_chanloaded", "#channellist");
$("#show_chanloaded").click(function() {
    socket.emit("acp-list-loaded");
});
$("#listloaded_refresh").click(function() {
    socket.emit("acp-list-loaded");
});
menuHandler("#show_actionlog", "#actionlog");
$("#show_actionlog").click(function () {
    socket.emit("acp-actionlog-list");
});
$("#actionlog_filter").click(getActionLog);
$("#actionlog_searchbtn").click(function() {
    var tbl = $("#actionlog table");
    var sfield = $("#actionlog_sfield").val();
    var sval = $("#actionlog_search").val().toLowerCase();
    var sort = $("#actionlog_sort").val();
    var desc = $("#actionlog_sortorder").val() === "true";
    tbl.data("sort_desc", desc);
    tbl.data("sortby", sort);
    var entries = tbl.data("allentries");
    entries = entries.filter(function (item, i, arr) {
        var f = item[sfield];
        if(sfield === "time")
            f = new Date(f).toString().toLowerCase();
        return f.indexOf(sval) > -1;
    });
    tbl.data("entries", entries);
    var p = tbl.data("paginator");
    p.items = entries;
    tableResort(tbl);
});
$("#actionlog_clear").click(function() {
    socket.emit("acp-actionlog-clear", $("#actionlog_filter").val());
    socket.emit("acp-actionlog-list");
    getActionLog();
});
$("#actionlog_refresh").click(function() {
    getActionLog();
});
$("#actionlog_ip").click(function() {
    tableResort($("#actionlog table"), "ip");
});
$("#actionlog_name").click(function() {
    tableResort($("#actionlog table"), "name");
});
$("#actionlog_action").click(function() {
    tableResort($("#actionlog table"), "action");
});
$("#actionlog_time").click(function() {
    tableResort($("#actionlog table"), "time");
});

menuHandler("#show_stats", "#stats");
$("#show_stats").click(function () {
    socket.emit("acp-view-stats");
});

function reverseLog() {
    $("#log").text($("#log").text().split("\n").reverse().join("\n"));
}

$("#log_reverse").click(reverseLog);

function getSyslog() {
    $.ajax(WEB_URL+"/api/logging/syslog?"+AUTH).done(function(data) {
        $("#log").text(data);
    });
}
$("#syslog").click(getSyslog);
function getErrlog() {
    $.ajax(WEB_URL+"/api/logging/errorlog?"+AUTH).done(function(data) {
        $("#log").text(data);
    });
}
$("#errlog").click(getErrlog);
function getActionLog() {
    var types = "&actions=" + $("#actionlog_filter").val().join(",");
    $.getJSON(WEB_URL+"/api/logging/actionlog?"+AUTH+types+"&callback=?")
        .done(function(entries) {
        var tbl = $("#actionlog table");
        entries.forEach(function (e) {
            e.time = parseInt(e.time);
        });
        var p = tbl.data("paginator");
        if(p) {
            p.items = entries;
        }
        else {
            var opts = {
                preLoadPage: function () {
                    $("#actionlog tbody").remove();
                },
                generator: function (e, page, index) {
                    var tr = $("<tr/>").appendTo($("#actionlog table"));
                    var rem = $("<td/>").appendTo(tr);
                    $("<button/>").addClass("btn btn-mini btn-danger")
                        .html("<i class='icon-trash'></i>")
                        .appendTo(rem)
                        .click(function () {
                            socket.emit("acp-actionlog-clear-one", e);
                            tr.hide("blind", function () {
                                tr.remove();
                                getActionLog();
                            });
                        });
                    $("<td/>").text(e.ip).appendTo(tr);
                    $("<td/>").text(e.name).appendTo(tr);
                    $("<td/>").text(e.action).appendTo(tr);
                    $("<td/>").text(e.args).appendTo(tr);
                    $("<td/>").text(new Date(e.time).toString()).appendTo(tr);
                }
            };
            p = Paginate(entries, opts);
            p.paginator.insertBefore($("#actionlog table"));
            tbl.data("paginator", p);
        }

        tbl.data("sortby", "time");
        tbl.data("sort_desc", true);
        tbl.data("entries", entries);
        tbl.data("allentries", entries);
        tableResort(tbl);
    });
}
function getChanlog() {
    var chan = $("#channame").val();
    $.ajax(WEB_URL+"/api/logging/channels/"+chan+"?"+AUTH)
        .done(function(data) {
        $("#log").text(data);
    });
}
$("#chanlog").click(getChanlog);
$("#channame").keydown(function(ev) {
    if(ev.keyCode == 13) {
        getChanlog();
    }
});

$("#announce_submit").click(function() {
    socket.emit("acp-announce", {
        title: $("#announce_title").val(),
        text: $("#announce_text").val()
    });
    $("#announce_title").val(""),
    $("#announce_text").val("")
});

$("#gban_submit").click(function() {
    socket.emit("acp-global-ban", {
        ip: $("#gban_ip").val(),
        note: $("#gban_note").val()
    });

    $("#gban_ip").val("");
    $("#gban_note").val("");
});

$("#userlookup_submit").click(function() {
    socket.emit("acp-lookup-user", $("#userlookup_name").val());
});

$("#chanlookup_submit").click(function () {
    socket.emit("acp-lookup-channel", {
        field: $("#chanlookup_field").val(),
        value: $("#chanlookup_value").val()
    });
});

function setupCallbacks() {
    socket.on("connect", function() {
        if(NAME && SESSION) {
            socket.emit("login", {
                name: NAME,
                session: SESSION
            });
        }
    });
    socket.on("login", function(data) {
        if(!data.success) {
            if(data.error != "Invalid session") {
                alert(data.error);
            }
        }
        else {
            $("#welcome").text("Logged in as " + data.name);
            $("#loginform").css("display", "none");
            $("#logoutform").css("display", "");
            $("#loggedin").css("display", "");
            SESSION = data.session || "";
            CLIENT.name = data.name;
            CLIENT.logged_in = true;
            socket.emit("acp-init");
            if(SESSION) {
                AUTH = "name=" + encodeURIComponent(CLIENT.name)
                     + "&session=" + SESSION;
                createCookie("cytube_uname", CLIENT.name, 7);
                createCookie("cytube_session", SESSION, 7);
            }
        }
    });

    socket.on("rank", function(data) {
        CLIENT.rank = data;
    });

    socket.on("announcement", function(data) {
        var al = makeAlert(data.title, data.text)
            .insertAfter($("#announce_current_h3"));
        al.find(".close").click(function() {
            socket.emit("acp-announce-clear");
        });
    });

    socket.on("acp-global-banlist", function(data) {
        $("#gbanpanel tbody").remove();
        for(var ip in data) {
            var tr = $("<tr/>").appendTo($("#gbanpanel table"));
            (function(ip, note) {
            $("<button/>").addClass("btn btn-mini btn-danger")
                .html("<i class='icon-trash'></i>")
                .appendTo($("<td/>").appendTo(tr))
                .click(function() {
                    socket.emit("acp-global-unban", ip);
                });
            $("<td/>").html("<code>"+ip+"</code>").appendTo(tr);
            $("<td/>").text(note).appendTo(tr);
            })(ip, data[ip]);
        }
    });

    socket.on("acp-userdata", function(data) {
        var tbl = $("#userlookup table");
        var p = tbl.data("paginator");
        if(p) {
            p.items = data;
        }
        else {
            var opts = {
                preLoadPage: function () {
                    tbl.find("tbody").remove();
                },
                generator: function (u, page, index) {
                    var tr = $("<tr/>").appendTo(tbl);
                    $("<td/>").text(u.id).appendTo(tr);
                    $("<td/>").text(u.uname).appendTo(tr);
                    var rank = $("<td/>").text(u.global_rank).appendTo(tr);
                    $("<td/>").text(u.email).appendTo(tr);
                    $("<button/>").addClass("btn btn-mini")
                        .text("Reset password")
                        .appendTo($("<td/>").appendTo(tr))
                        .click(function() {
                            var reset = confirm("Really reset password?");
                            if(reset) {
                                socket.emit("acp-reset-password", {
                                    name: u.uname,
                                    email: u.email
                                });
                            }
                        });
                    rank.click(function() {
                        if(this.find(".rank-edit").length > 0)
                            return;
                        var r = this.text();
                        this.text("");
                        var edit = $("<input/>").attr("type", "text")
                            .attr("placeholder", r)
                            .addClass("rank-edit")
                            .appendTo(this)
                            .focus();

                        function save() {
                            var r = this.val();
                            var r2 = r;
                            if(r.trim() == "")
                                r = this.attr("placeholder");
                            this.parent().text(this.attr("placeholder"));
                            socket.emit("acp-set-rank", {
                                name: u.uname,
                                rank: parseInt(r)
                            });
                        }
                        edit.blur(save.bind(edit));
                        edit.keydown(function(ev) {
                            if(ev.keyCode == 13)
                                save.bind(edit)();
                        });
                    }.bind(rank));
                }
            };
            p = Paginate(data, opts);
            p.paginator.insertBefore(tbl);
            tbl.data("paginator", p);
        }
        tbl.data("sortby", "uname");
        tbl.data("sort_desc", false);
        tableResort(tbl);
    });

    socket.on("acp-set-rank", function(data) {
        $("#userlookup tr").each(function() {
            if($($(this).children()[1]).text() == data.name)
                $($(this).children()[2]).text(data.rank);
        });
    });

    socket.on("acp-reset-password", function(data) {
        if(!data.success)
            alert(data.error);
        else
            alert("Password reset successful.  Reset hash: /reset.html?" + data.hash);
    });

    socket.on("acp-channeldata", function(data) {
        var tbl = $("#chanlookup table");
        var p = tbl.data("paginator");
        if(p) {
            p.items = data;
        }
        else {
            var opts = {
                preLoadPage: function () {
                    tbl.find("tbody").remove();
                },
                generator: function (u, page, index) {
                    var tr = $("<tr/>").appendTo(tbl);
                    $("<td/>").text(u.id).appendTo(tr);
                    $("<td/>").text(u.name).appendTo(tr);
                    $("<td/>").text(u.owner).appendTo(tr);
                }
            };
            p = Paginate(data, opts);
            p.paginator.insertBefore(tbl);
            tbl.data("paginator", p);
        }
        tbl.data("sortby", "id");
        tbl.data("sort_desc", false);
        tableResort(tbl);
    });

    socket.on("acp-list-loaded", function(data) {
        $("#channellist tbody").remove();
        data.sort(function(a, b) {
            if(a.usercount == b.usercount) {
                var x = a.name, y = b.name;
                return x == y ? 0 : (x < y ? -1 : 1);
            }
            return a.usercount < b.usercount ? 1 : -1;
        });
        var total = 0;
        data.forEach(function(c) {
            total += c.usercount;
            var tr = $("<tr/>").appendTo($("#channellist table"));
            $("<td/>").text(c.title + " (" + c.name + ")").appendTo(tr);
            $("<td/>").text(c.usercount).appendTo(tr);
            $("<td/>").text(c.mediatitle).appendTo(tr);
            $("<td/>").text(c.registered ? "Yes" : "No").appendTo(tr);
            $("<td/>").text(c.is_public ? "Yes" : "No").appendTo(tr);
            $("<button/>").addClass("btn btn-danger btn-mini")
                .text("Force Unload")
                .appendTo($("<td/>").appendTo(tr))
                .click(function() {
                    var go = confirm("Really force unload?");
                    if(go) {
                        socket.emit("acp-channel-unload", {
                            name: c.name,
                            save: true
                        });
                        socket.emit("acp-list-loaded");
                    }
                });
        });

        var tr = $("<tr/>").appendTo($("#channellist table"));
        $("<td/>").text("Total").appendTo(tr);
        $("<td/>").text(total).appendTo(tr);
        $("<td/>").appendTo(tr);
        $("<td/>").appendTo(tr);
        $("<td/>").appendTo(tr);
        $("<td/>").appendTo(tr);
    });

    socket.on("acp-view-stats", function (stats) {
        var labels = [];
        var ucounts = [];
        var ccounts = [];
        var mcounts = [];
        var lastdate = "";
        stats.forEach(function (s) {
            var d = new Date(parseInt(s.time));
            var t = "";
            if(d.toDateString() !== lastdate) {
                lastdate = d.toDateString();
                t = d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();
                t += " " + d.toTimeString().split(" ")[0];
            }
            else {
                t = d.toTimeString().split(" ")[0];
            }
            labels.push(t);
            ucounts.push(s.usercount);
            ccounts.push(s.chancount);
            mcounts.push(s.mem / 1000000);
        });

        var user_data = {
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

        var chan_data = {
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

        var mem_data = {
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

        new Chart($("#stat_users")[0].getContext("2d")).Line(user_data);
        new Chart($("#stat_channels")[0].getContext("2d")).Line(chan_data);
        new Chart($("#stat_mem")[0].getContext("2d")).Line(mem_data);
    });

    socket.on("acp-actionlog-list", function (alist) {
        $("#actionlog_filter").html("");
        alist.sort(function(a, b) {
            return a == b ? 0 : (a < b ? -1 : 1);
        });
        alist.forEach(function(a) {
            $("<option/>").text(a).val(a).appendTo($("#actionlog_filter"));
        });
    });
}
