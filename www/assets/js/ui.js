/* Usercount show/hide */
$("#userlisttoggle").click(function() {
    if($("#userlist").css("display") == "none") {
        $("#userlist").show();
        $("#userlisttoggle").removeClass("icon-chevron-down")
            .addClass("icon-chevron-up");
    }
    else {
        $("#userlist").hide();
        $("#userlisttoggle").removeClass("icon-chevron-up")
            .addClass("icon-chevron-down");
    }
});

/* Library search show/hide */

$("#librarytoggle").click(function() {
    if($("#librarywrap").css("display") == "none") {
        $("#librarywrap").show();
        $("#librarytoggle i").removeClass("icon-chevron-down")
            .addClass("icon-chevron-up");
    }
    else {
        $("#librarywrap").hide();
        $("#librarytoggle i").removeClass("icon-chevron-up")
            .addClass("icon-chevron-down");
    }
});

/* User playlist show/hide */

$("#userpltoggle").click(function() {
    if($("#userplaylistwrap").css("display") == "none") {
        $("#userplaylistwrap").show();
        $("#userpltoggle i").removeClass("icon-chevron-down")
            .addClass("icon-chevron-up");
    }
    else {
        $("#userplaylistwrap").hide();
        $("#userpltoggle i").removeClass("icon-chevron-up")
            .addClass("icon-chevron-down");
    }
});

/* Playlist controls show/hide */

$("#playlisttoggle").click(function() {
    if($("#playlist_controls").css("display") == "none") {
        $("#playlist_controls").show();
        $("#playlisttoggle i").removeClass("icon-chevron-down")
            .addClass("icon-chevron-up");
    }
    else {
        $("#playlist_controls").hide();
        $("#playlisttoggle i").removeClass("icon-chevron-up")
            .addClass("icon-chevron-down");
    }
});
