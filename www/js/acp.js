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
