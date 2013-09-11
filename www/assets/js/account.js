/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*
    So, it turns out that $.post causes Firefox to use a GET request
    on cross-site requests.  What the hell?  I'd understand if they just
    made it error instead, but why give me chicken tenders if I ordered a
    cheeseburger and act like everything's peachy?
*/
function postJSON(url, data, callback) {
    $.ajax(url, {
        method: "POST",
        crossDomain: true,
        data: data,
        success: function (data) {
            try {
                data = data.substring(data.indexOf("{"));
                data = data.substring(0, data.lastIndexOf("}") + 1);
                data = JSON.parse(data);
                callback(data);
            } catch(e) {
                return;
            }
        },
        dataType: "text"
    });
}

var uname = readCookie("cytube_uname") || "";
var session = readCookie("cytube_session") || "";
var loggedin = false;

if(uname && session) {
    var data = {
        name: uname,
        session: session
    };
    postJSON(WEB_URL + "/api/login?callback=?", data, function (data) {
        console.log(data);
        if(data.success)
            onLogin();
    });
}

function onLogin() {
    $("#cpwusername").val(uname);
    $("#ceusername").val(uname);
    $("#accountnav li")[0].innerHTML = "Logged in as " + uname;
    $("#register").hide();
    loggedin = true;
    $("#login").text("Logout");
    createCookie("cytube_uname", uname, 7);
    createCookie("cytube_session", session, 7);
}

function makeTabCallback(tabid, paneid) {
    return function() {
        $("#accountnav li").each(function() {
            $(this).removeClass("active");
        });

        $(tabid).parent().addClass("active");
        $(".span7").each(function() {
            $(this).css("display", "none");
        });
        $(paneid).css("display", "");
    };
}

$("#register").click(makeTabCallback("#register", "#registerpane"));
$("#pwchange").click(makeTabCallback("#pwchange", "#changepwpane"));
$("#pwreset").click(makeTabCallback("#pwreset", "#pwresetpane"));
$("#email").click(makeTabCallback("#email", "#changeemailpane"));
$("#profile").click(makeTabCallback("#profile", "#profilepane"));
$("#profile").click(function() {
    if(uname != "") {
        $.getJSON(WEB_URL+"/api/users/"+uname+"/profile?callback=?",
            function (data) {
            if(data.success) {
                $("#profiletext").val(data.profile_text);
                $("#profileimg").val(data.profile_image);
            }
            else {
                $("<div/>").addClass("alert alert-error")
                    .text("Failed to retrieve profile: " + data.error)
                    .insertBefore($("#profilepane form"));
            }
        });
    }
});
$("#channels").click(makeTabCallback("#channels", "#channelspane"));
$("#channels").click(function () {
    if(!loggedin) {
        var error = $("<div/>").addClass("alert alert-error")
            .text("You must be logged in to view this page")
            .insertBefore($("#channellist"));
        $("<button/>").addClass("close pull-right").click(function () {
            error.remove();
        }).html("&times;").prependTo(error);
        return;
    }

    var auth = "name=" + encodeURIComponent(uname) + "&session=" +
               encodeURIComponent(session);
    $.getJSON(WEB_URL+"/api/account/mychannels?"+auth+"&callback=?",
        function (data) {
        $("#channellist tbody").remove();
        data.channels.forEach(function (chan) {
            var tr = $("<tr/>").appendTo($("#channellist"));
            var td = $("<td/>").appendTo(tr);
            $("<a/>").attr("href", "./r/" + chan.name)
                .attr("target", "_blank")
                .text(chan.name)
                .appendTo(td);
        });
    });
});



$("#registerbtn").click(function() {
    $("#registerpane").find(".alert-error").remove();
    $("#registerpane").find(".error").removeClass("error");
    var name = $("#regusername").val();
    var pw = $("#regpw").val();
    var pwc = $("#regpwconfirm").val();

    var err = false;
    if(!name.match(/^[a-z0-9_]{1,20}$/i)) {
        $("<div/>").addClass("alert alert-error")
            .text("Usernames must be 1-20 characters long and contain only a-z, 0-9, and underscores")
            .insertAfter($("#regusername").parent().parent());
        err = true;
    }

    if(pw == "") {
        $("<div/>").addClass("alert alert-error")
            .text("Password must not be blank")
            .insertAfter($("#regpw").parent().parent());
        $("#regpw").parent().parent().addClass("error");
        err = true;
    }

    if(pw != pwc) {
        $("<div/>").addClass("alert alert-error")
            .text("Passwords do not match")
            .insertAfter($("#regpwconfirm").parent().parent());
        $("#regpwconfirm").parent().parent().addClass("error");
        err = true;
    }

    if(err) {
        return;
    }

    // Input valid, try registering
    var data = {
        name: name,
        pw: pw
    };
    
    postJSON(WEB_URL + "/api/register?callback=?", data, function (data) {
        if(data.success) {
            uname = name;
            session = data.session;
            onLogin();
            $("<div/>").addClass("alert alert-success")
                .text("Registration successful")
                .insertBefore($("#registerpane form"));
            $("#regpw").val("");
            $("#regusername").val("");
        }
        else {
            $("<div/>").addClass("alert alert-error")
                .text(data.error)
                .insertBefore($("#registerpane form"));
        }
    });
});

$("#loginbtn").click(function() {
    $("#loginpane").find(".alert-error").remove();
    $("#loginpane").find(".alert-success").remove();

    if($("#loginpw").val() == "") {
        $("<div/>").addClass("alert alert-error")
            .text("Please provide a password")
            .insertAfter($("#loginpw").parent().parent());
        $("#loginpw").parent().parent().addClass("error");
        return;
    }
    uname = $("#loginusername").val();
    var data = {
        name: uname,
        pw: $("#loginpw").val()
    };

    postJSON(WEB_URL+"/api/login?callback=?", data, function(data) {
        if(data.success) {
            session = data.session;
            onLogin();
            $("<div/>").addClass("alert alert-success")
                .text("Login successful")
                .insertBefore($("#loginpane form"));
            $("#loginpw").val("");
            $("#loginusername").val("");
        }
        else {
            $("<div/>").addClass("alert alert-error")
                .text(data.error)
                .insertBefore($("#loginpane form"));
        }
    });
});

$("#cpwbtn").click(function() {
    $("#changepwpane").find(".alert-error").remove();
    $("#changepwpane").find(".alert-success").remove();
    $("#changepwpane").find(".error").removeClass("error");
    var name = $("#cpwusername").val();
    var oldpw = $("#cpwoldpw").val();
    var newpw = $("#cpwnewpw").val();
    var newpwc = $("#cpwconfirm").val();

    var err = false;
    if(oldpw == "") {
        $("<div/>").addClass("alert alert-error")
            .text("Password must not be empty")
            .insertAfter($("#cpwoldpw").parent().parent());
        $("#cpwoldpw").parent().parent().addClass("error");
        err = true;
    }

    if(newpw == "") {
        $("<div/>").addClass("alert alert-error")
            .text("Password must not be empty")
            .insertAfter($("#cpwnewpw").parent().parent());
        $("#cpwnewpw").parent().parent().addClass("error");
        err = true;
    }

    if(newpw != newpwc) {
        $("<div/>").addClass("alert alert-error")
            .text("Passwords do not match")
            .insertAfter($("#cpwconfirm").parent().parent());
        $("#cpwconfirm").parent().parent().addClass("error");
        err = true;
    }

    if(err) {
        return;
    }

    // Input valid, try changing password
    var data = {
        name: name,
        oldpw: oldpw,
        newpw: newpw
    };
    postJSON(WEB_URL + "/api/account/passwordchange?callback=?", data,
        function (data) {
        if(data.success) {
            $("<div/>").addClass("alert alert-success")
                .text("Password changed.")
                .insertBefore($("#changepwpane form"));
            uname = name;
            session = data.session;
            onLogin();
        }
        else {
            $("<div/>").addClass("alert alert-error")
                .text(data.error)
                .insertBefore($("#changepwpane form"));
        }
    });
});

$("#cebtn").click(function() {
    $("#changeemailpane").find(".alert-error").remove();
    $("#changeemailpane").find(".alert-success").remove();
    var name = $("#ceusername").val();
    var pw = $("#cepw").val();
    var email = $("#ceemail").val();
    if(pw == "") {
        $("<div/>").addClass("alert alert-error")
            .text("Please provide a password")
            .insertAfter($("#cepw").parent().parent());
        $("#cepw").parent().parent().addClass("error");
        return;
    }

    if(!email.match(/^[\w_\.]+@[\w_\.]+[a-zA-Z]+$/)) {
        $("<div/>").addClass("alert alert-error")
            .text("Invalid email")
            .insertAfter($("#ceemail").parent().parent());
        $("#ceemail").parent().parent().addClass("error");
        return;
    }

    if(email.match(/.*@(localhost|127\.0\.0\.1)/i)) {
        $("<div/>").addClass("alert alert-error")
            .text("Nice try, but no.")
            .insertAfter($("#ceemail").parent().parent());
        $("#ceemail").parent().parent().addClass("error");
        return;
    }

    var data = {
        name: name,
        pw: pw,
        email: email
    };
    postJSON(WEB_URL + "/api/account/email?callback=?", data,
        function (data) {
        if(data.success) {
            $("<div/>").addClass("alert alert-success")
                .text("Email updated")
                .insertBefore($("#changeemailpane form"));
            uname = name;
            session = data.session;
            onLogin();
        }
        else {
            $("<div/>").addClass("alert alert-error")
                .text(data.error)
                .insertBefore($("#changeemailpane form"));
        }
    });

});

$("#rpbtn").click(function() {
    $("#rpbtn").text("Sending...");
    $("#pwresetpane").find(".alert-error").remove();
    $("#pwresetpane").find(".alert-success").remove();
    var name = $("#rpusername").val();
    var email = $("#rpemail").val();

    var data = {
        name: name,
        email: email
    };
    postJSON(WEB_URL + "/api/account/passwordreset?callback=?", data,
        function (data) {
        $("#rpbtn").text("Send Reset");
        if(data.success) {
            $("<div/>").addClass("alert alert-success")
                .text("Password reset link issued.  Check your email.")
                .insertBefore($("#pwresetpane form"));
        }
        else {
            $("<div/>").addClass("alert alert-error")
                .text(data.error)
                .insertBefore($("#pwresetpane form"));
        }
    });

});

$("#profilesave").click(function() {
    $("#profilepane").find(".alert-error").remove();
    $("#profilepane").find(".alert-success").remove();
    var img = $("#profileimg").val();
    var text = $("#profiletext").val();
    var data = {
        name: uname,
        session: session,
        profile_image: img,
        profile_text: text
    };

    postJSON(WEB_URL+"/api/account/profile?callback=?", data,
        function (data) {
        if(data.success) {
            $("<div/>").addClass("alert alert-success")
                .text("Profile updated.")
                .insertBefore($("#profilepane form"));
        }
        else {
            $("<div/>").addClass("alert alert-error")
                .text(data.error)
                .insertBefore($("#profilepane form"));
        }
    });
});

$("#login").click(function() {
    if(!loggedin) {
        makeTabCallback("#login", "#loginpane")();
    }
    else {
        uname = "";
        session = "";
        eraseCookie("cytube_uname");
        eraseCookie("cytube_session");
        $("#accountnav li")[0].innerHTML = "Not Logged In";
        $("#register").show();
        $("#login").text("Login");
        loggedin = false;
    }
});
