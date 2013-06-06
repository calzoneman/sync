/* Generalized show/hide function */
function generateToggle(chevron, div) {
    $(chevron).click(function() {
        if($(div).css("display") == "none") {
            $(div).show();
            $(chevron+" i").removeClass("icon-chevron-down")
                .addClass("icon-chevron-up");
        }
        else {
            $(div).hide();
            $(chevron+" i").removeClass("icon-chevron-up")
                .addClass("icon-chevron-down");
        }
    });
}


generateToggle("#usercountwrap", "#userlist");
generateToggle("#librarytoggle", "#librarywrap");
generateToggle("#userpltoggle", "#userplaylistwrap");
generateToggle("#playlisttoggle", "#playlist_controls");
