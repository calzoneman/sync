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
})();
