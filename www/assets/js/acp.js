var BASE = WEB_URL + "/api/json/";
var AUTH = "";

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
menuHandler("#show_chanloaded", "#channellist");
$("#show_chanloaded").click(function() {
    socket.emit("acp-list-loaded");
});
$("#listloaded_refresh").click(function() {
    socket.emit("acp-list-loaded");
});

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
                AUTH = "name=" + CLIENT.name + "&session=" + SESSION;
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
        data = data.sort(function(a, b) {
            var x = a.uname.toLowerCase();
            var y = b.uname.toLowerCase();
            return x == y ? 0 : (x < y ? -1 : 1);
        });

        $("#userlookup tbody").remove();
        for(var i = 0; i < data.length; i++) {
            var u = data[i];
            var tr = $("<tr/>").appendTo($("#userlookup table"));
            $("<td/>").text(u.id).appendTo(tr);
            $("<td/>").text(u.uname).appendTo(tr);
            var rank = $("<td/>").text(u.global_rank).appendTo(tr);
            $("<td/>").text(u.email).appendTo(tr);
            (function(name, email) {
            $("<button/>").addClass("btn btn-mini")
                .text("Reset password")
                .appendTo($("<td/>").appendTo(tr))
                .click(function() {
                    var reset = confirm("Really reset password?");
                    if(reset) {
                        socket.emit("acp-reset-password", {
                            name: name,
                            email: email
                        });
                    }
                });
            })(u.uname, u.email);
            (function(u) {
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
            })(u);
        }
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
