(function() {

    $("#channelsettingswrap div.span12").each(function() {
        $(this).hide();
    });

    function clickHandler(selector, div) {
        $(selector).click(function() {
            $("#csdropdown_title").text($(selector).text());
            $("#channelsettingswrap div.span12").each(function() {
                $(this).hide();
            });
            $(div).show();
        });
    }

    $("#hide_settings").click(function() {
        $("#csdropdown_title").text("Moderation Menu");
        $("#channelsettingswrap div.span12").each(function() {
            $(this).hide();
        });
    });

    clickHandler("#show_optedit", "#optedit");
    $("#optedit input[type='text']").keydown(function(ev) {
        return ev.keyCode != 13;
    });
    clickHandler("#show_permedit", "#permedit");
    clickHandler("#show_motdedit", "#motdedit");
    clickHandler("#show_filteredit", "#filteredit");
    $("#show_filteredit").click(function() {
        socket.emit("requestChatFilters");
    });
    clickHandler("#show_cssedit", "#cssedit");
    clickHandler("#show_jsedit", "#jsedit");
    clickHandler("#show_banlist", "#banlist");
    $("#show_banlist").click(function() {
        socket.emit("requestBanlist");
    });
    clickHandler("#show_loginhistory", "#loginhistory");
    $("#show_loginhistory").click(function() {
        socket.emit("requestLoginHistory");
    });
    clickHandler("#show_channelranks", "#channelranks");
    $("#show_channelranks").click(function() {
        socket.emit("requestChannelRanks");
    });

    genPermissionsEditor();

    $("#chanopts_submit").click(function() {
        socket.emit("setOptions", {
            allow_voteskip: $("#opt_allow_voteskip").prop("checked"),
            voteskip_ratio: parseFloat($("#opt_voteskip_ratio").val()),
            pagetitle: $("#opt_pagetitle").val() || CHANNEL.name,
            externalcss: $("#opt_externalcss").val(),
            externaljs: $("#opt_externaljs").val(),
            chat_antiflood: $("#opt_chat_antiflood").prop("checked"),
            show_public: $("#opt_show_public").prop("checked"),
            enable_link_regex: $("#opt_enable_link_regex").prop("checked")
        });
    });

    $("#chanopts_unregister").click(function() {
        var res = confirm("You are about to unregister your channel.  This will PERMANENTLY delete your channel data, including ranks, bans, and library videos.  This cannot be undone.  Are you sure you want to continue?");
        if(res) {
            socket.emit("unregisterChannel");
        }
    });

    $("#save_motd").click(function() {
        socket.emit("setMotd", {
            motd: $("#motdtext").val()
        });
    });
    $("#csstext").keydown(function(ev) {
        if(ev.keyCode == 9) {
            $("#csstext").text($("#csstext").val() + "    ");
            ev.preventDefault();
            return false;
        }
    });
    $("#save_css").click(function() {
        socket.emit("setChannelCSS", {
            css: $("#csstext").val()
        });
    });
    $("#jstext").keydown(function(ev) {
        if(ev.keyCode == 9) {
            $("#jstext").text($("#jstext").val() + "    ");
            ev.preventDefault();
            return false;
        }
    });
    $("#save_js").click(function() {
        socket.emit("setChannelJS", {
            js: $("#jstext").val()
        });
    });

    $("#newfilter_submit").click(function() {
        var re = $("#newfilter_regex").val();
        if(re === "") {
            makeAlert("Invalid Regex", e, "alert-error")
                .insertAfter($("#filteredit form"));
            return;
        }
        var flags = $("#newfilter_flags").val();
        try {
            new RegExp(re, flags);
        }
        catch(e) {
            makeAlert("Invalid Regex", e, "alert-error")
                .insertAfter($("#filteredit form"));
            return;
        }

        socket.emit("updateFilter", {
            name: $("#newfilter_name").val(),
            source: re,
            flags: flags,
            replace: $("#newfilter_replace").val(),
            filterlinks: $("#newfilter_filterlinks").prop("checked"),
            active: true
        });

        $("#newfilter_name").val("");
        $("#newfilter_regex").val("");
        $("#newfilter_flags").val("g");
        $("#newfilter_replace").val("");
    });
})();
