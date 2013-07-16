/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

exports.MYSQL_SERVER = "";
exports.MYSQL_DB = "";
exports.MYSQL_USER = "";
exports.MYSQL_PASSWORD = "";
exports.IO_PORT = 1337; // Socket.IO port, DO NOT USE PORT 80.
exports.WEBSERVER_PORT = 8080; // Webserver port.  Binding port 80 requires root permissions
exports.MAX_PER_IP = 10;
exports.GUEST_LOGIN_DELAY = 60; // Seconds

/*
    Set to true if your IO_URL and WEB_URL are behind a reverse proxy
    (e.g. Cloudflare) so that client IPs are passed through correctly.

    If you are not behind a reverse proxy, leave it as false, otherwise
    clients can fake their IP address in the x-forwarded-for header
*/
exports.REVERSE_PROXY = false;

var nodemailer = require("nodemailer");
exports.MAIL = false;
/* Example for setting up email:
exports.MAIL = nodemailer.createTransport("SMTP", {
    service: "Gmail",
    auth: {
        user: "some.user@gmail.com",
        pass: "supersecretpassword"
    }
});

See https://github.com/andris9/Nodemailer
*/
exports.MAIL_FROM = "some.user@gmail.com";
// Domain for password reset link
// Email sent goes to exports.DOMAIN/reset.html?resethash
exports.DOMAIN = "http://localhost";
