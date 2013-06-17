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

    clickHandler("#show_optedit", "#optedit");
    clickHandler("#show_permedit", "#permedit");
    clickHandler("#show_motdedit", "#motdedit");
    clickHandler("#show_filteredit", "#filteredit");
    clickHandler("#show_cssedit", "#cssedit");
    clickHandler("#show_jsedit", "#jsedit");

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
            /* TODO Deprecate this in favour of per-filter toggle */
            enable_link_regex: $("#opt_enable_link_regex").prop("checked")
        });
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
})();
