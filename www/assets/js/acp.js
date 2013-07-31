var BASE = WEB_URL + "/api/json/";
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
    loadPage(tbl, 0);
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
    $("#actionlog tbody").remove();
    var actions = $("#actionlog_filter").val();
    var sfield = $("#actionlog_sfield").val();
    var sval = $("#actionlog_search").val().toLowerCase();
    var sort = $("#actionlog_sort").val();
    var desc = $("#actionlog_sortorder").val() === "true";
    tbl.data("sort_desc", desc);
    tbl.data("sortby", sort);
    var entries = [];
    tbl.data("allentries").forEach(function(e) {
        if(actions.indexOf(e.action) == -1)
            return;
        entries.push(e);
    });
    entries = entries.filter(function (item, i, arr) {
        var f = item[sfield];
        if(sfield === "time")
            f = new Date(f).toString().toLowerCase();
        return f.indexOf(sval) > -1;
    });
    $("#actionlog_pagination").remove();
    if(entries.length > 20) {
        var pag = $("<div/>").addClass("pagination")
            .attr("id", "actionlog_pagination")
            .insertAfter($("#actionlog table"));
        var btns = $("<ul/>").appendTo(pag);
        for(var i = 0; i < entries.length / 20; i++) {
            var li = $("<li/>").appendTo(btns);
            (function(i) {
            $("<a/>").attr("href", "javascript:void(0)")
                .text(i+1)
                .click(function() {
                    loadPage(tbl, i);
                })
                .appendTo(li);
            })(i);
        }
        tbl.data("pagination", pag);
    }

    $("#actionlog table").data("entries", entries);
    loadPage($("#actionlog table"), 0);
});
$("#actionlog_clear").click(function() {
    socket.emit("acp-actionlog-clear", $("#actionlog_filter").val());
    socket.emit("acp-actionlog-list");
    getActionLog();
});
$("#actionlog_refresh").click(function() {
    socket.emit("acp-actionlog-list");
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
    $.ajax(WEB_URL+"/api/plain/readlog?type=sys&"+AUTH).done(function(data) {
        $("#log").text(data);
    });
}
$("#syslog").click(getSyslog);
function getErrlog() {
    $.ajax(WEB_URL+"/api/plain/readlog?type=err&"+AUTH).done(function(data) {
        $("#log").text(data);
    });
}
$("#errlog").click(getErrlog);
function getActionLog() {
    var types = "&actions=" + $("#actionlog_filter").val().join(",");
    $.getJSON(WEB_URL+"/api/json/readactionlog?"+AUTH+types+"&callback=?").done(function(entries) {
        var tbl = $("#actionlog table");
        $("#actionlog tbody").remove();
        $("#actionlog_pagination").remove();
        if(entries.length > 20) {
            var pag = $("<div/>").addClass("pagination")
                .attr("id", "actionlog_pagination")
                .insertAfter($("#actionlog table"));
            var btns = $("<ul/>").appendTo(pag);
            for(var i = 0; i < entries.length / 20; i++) {
                var li = $("<li/>").appendTo(btns);
                (function(i) {
                $("<a/>").attr("href", "javascript:void(0)")
                    .text(i+1)
                    .click(function() {
                        loadPage(tbl, i);
                    })
                    .appendTo(li);
                })(i);
            }
            tbl.data("pagination", pag);
        }

        entries.forEach(function (e) {
            e.time = parseInt(e.time);
        });
        var tbl = $("#actionlog table");
        tbl.data("sortby", "time");
        tbl.data("sort_desc", true);
        tbl.data("entries", entries);
        tbl.data("allentries", entries);
        tbl.data("generator", function(e) {
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
        });
        loadPage($("#actionlog table"), 0);
    });
}
function getChanlog() {
    var chan = $("#channame").val();
    $.ajax(WEB_URL+"/api/plain/readlog?type=channel&channel="+chan+"&"+AUTH).done(function(data) {
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

function loadPage(tbl, page) {
    var sort_field = tbl.data("sortby");
    var sort_desc = tbl.data("sort_desc");
    var generator = tbl.data("generator");
    var pag = tbl.data("pagination");
    if(pag) {
        pag.find("li").each(function() {
            $(this).removeClass("active");
        });
        $(pag.find("li")[page]).addClass("active");
    }
    var e = tbl.data("entries");

    tbl.find("tbody").remove();

    if(sort_field) {
        e.sort(function(a, b) {
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

    for(var i = page * 20; i < page * 20 + 20 && i < e.length; i++) {
        generator(e[i]);
    }
}

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
        if(data.length > 20) {
            var pag = $("<div/>").addClass("pagination")
                .attr("id", "userlookup_pagination")
                .insertAfter($("#userlookup table"));
            var btns = $("<ul/>").appendTo(pag);
            for(var i = 0; i < data.length / 20; i++) {
                var li = $("<li/>").appendTo(btns);
                (function(i) {
                $("<a/>").attr("href", "javascript:void(0)")
                    .text(i+1)
                    .click(function() {
                        loadPage(tbl, i);
                    })
                    .appendTo(li);
                })(i);
            }
            tbl.data("pagination", pag);
        }
        tbl.data("entries", data);
        tbl.data("sortby", "uname");
        tbl.data("sort_desc", false);
        tbl.data("generator", function(u) {
            var tr = $("<tr/>").appendTo($("#userlookup table"));
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
        });
        loadPage($("#userlookup table"), 0);
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
            alert("Password reset successful.  Reset hash: " + data.hash);
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

/* cookie util */

function createCookie(name,value,days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime()+(days*24*60*60*1000));
        var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    document.cookie = name+"="+value+expires+"; path=/";
}

function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(";");
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==" ") c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name,"",-1);
}
