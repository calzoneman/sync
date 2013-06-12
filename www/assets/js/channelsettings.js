(function() {

    $("#channelsettingswrap div").each(function() {
        $(this).hide();
    });

    function clickHandler(selector, div) {
        $(selector).click(function() {
            $("#channelsettings_nav li").each(function() {
                $(this).removeClass("active");
            });
            $(selector).parent().addClass("active");

            $("#channelsettingswrap div").each(function() {
                $(this).hide();
            });
            $(div).show();
        });
    }

    clickHandler("#show_optedit", "#optedit");
    clickHandler("#show_permedit", "#permedit");
    clickHandler("#show_motdedit", "#motdedit");
})();
