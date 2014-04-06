module.exports = {
    getJSON: function (transport, options, cb) {
        var d = domain.create();
        d.on("error", function (err) {
            Logger.errlog.log(err.stack);
            Logger.errlog.log("getJSON failed (request: " + options.host + options.path);
            cb(500, null);
        });

        d.run(function () {
            var req = transport.request(options, function (res) {
                var buffer = "";
                res.setEncoding("utf-8");
                res.on("data", function (chunk) {
                    buffer += chunk;
                });
                res.on("end", function () {
                    if (res.statusCode !== 200) {
                        cb(res.statusCode, buffer);
                    }

                    var data;
                    try {
                        data = JSON.parse(buffer);
                        cb(res.statusCode, data);
                    } catch (e) {
                        cb(500, buffer);
                    }
                });
            });
        });
    }
};
