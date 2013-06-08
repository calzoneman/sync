/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var uname = readCookie("sync_uname") || "";
var session = readCookie("sync_session") || "";
var api = WEB_URL + "/api/json/";
var loggedin = false;

if(uname && session) {
    var loginstr = "name=" + uname + "&session=" + session;
    var url = api + "login?" + loginstr + "&callback=?";
    $.getJSON(url, function(data) {
        if(data.success) {
            onLogin();
        }
    });
}

function onLogin() {
    $("#cpwusername").val(uname);
    $("#ceusername").val(uname);
    $("#accountnav li")[0].innerHTML = "Logged in as " + uname;
    $("#register").hide();
    loggedin = true;
    $("#login").text("Logout");
    createCookie("sync_uname", uname, 7);
    createCookie("sync_session", session, 7);
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
        $.getJSON(api + "getprofile?name=" + uname + "&callback=?", function(data) {
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
    var url = api + "register?" + [
        "name=" + name,
        "pw=" + pw
    ].join("&") + "&callback=?";

    $.getJSON(url, function(data) {
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
    var loginstr = "name=" + uname + "&pw=" + $("#loginpw").val();
    var url = api + "login?" + loginstr + "&callback=?";
    $.getJSON(url, function(data) {
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
    var url = api + "changepass?" + [
        "name=" + name,
        "oldpw=" + oldpw,
        "newpw=" + newpw
    ].join("&") + "&callback=?";
    $.getJSON(url, function(data) {
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

    if(!email.match(/^[a-z0-9_\.]+@[a-z0-9_\.]+[a-z]+$/)) {
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

    email = escape(email);
    var url = api + "setemail?" + [
        "name=" + name,
        "pw=" + pw,
        "email=" + email
    ].join("&") + "&callback=?";
    $.getJSON(url, function(data) {
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

    email = escape(email);
    var url = api + "resetpass?" + [
        "name=" + name,
        "email=" + email
    ].join("&") + "&callback=?";
    $.getJSON(url, function(data) {
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
    img = escape(img).replace(/\//g, "%2F")
        .replace(/&/g, "%26")
        .replace(/=/g, "%3D")
        .replace(/\?/g, "%3F");
    var url = api + "setprofile?" + [
        "name=" + uname,
        "session=" + session,
        "profile_image=" + img,
        "profile_text=" + escape($("#profiletext").val())
    ].join("&") + "&callback=?";

    $.getJSON(url, function(data) {
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
        eraseCookie("sync_uname");
        eraseCookie("sync_session");
        $("#accountnav li")[0].innerHTML = "Not Logged In";
        $("#register").show();
        $("#login").text("Login");
        loggedin = false;
    }
});

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
