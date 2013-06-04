const chars = "abcdefghijklmnopqsrtuvwxyz" +
              "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
              "0123456789";


var NotWebsocket = function() {
    this.hash = "";
    for(var i = 0; i < 30; i++) {
        this.hash += chars[parseInt(Math.random() * (chars.length - 1))];
    }

    this.pktqueue = [];
    this.handlers = {};
    this.room = "";
}

NotWebsocket.prototype.emit = function(msg, data) {
    //hack because something fishy is going on
    if(typeof msg === "object") {
        data = msg["1"];
        msg = msg["0"];
    }
    var pkt = [msg, data];
    this.pktqueue.push(pkt);
}

NotWebsocket.prototype.poll = function() {
    var q = this.pktqueue;
    this.pktqueue = [];
    return q;
}

NotWebsocket.prototype.on = function(msg, callback) {
    if(!(msg in this.handlers))
        this.handlers[msg] = [];
    this.handlers[msg].push(callback);
}

NotWebsocket.prototype.recv = function(urlstr) {
    var msg, data;
    try {
        var js = JSON.parse(urlstr);
        msg = js[0];
        data = js[1];
    }
    catch(e) {
        console.log("Failed to parse NWS string");
    }
    if(!msg)
        return;
    if(!(msg in this.handlers))
        return;
    for(var i = 0; i < this.handlers[msg].length; i++) {
        this.handlers[msg][i](data);
    }
}

NotWebsocket.prototype.join = function(rm) {
    this.room = rm;
}

NotWebsocket.prototype.disconnect = function() {
    
}

function sendJSON(res, obj) {
    var response = JSON.stringify(obj, null, 4);
    if(res.callback) {
        response = res.callback + "(" + response + ")";
    }
    var len = unescape(encodeURIComponent(response)).length;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Length", len);
    res.end(response);
}

var clients = {};
function newConnection(req, res) {
    var nws = new NotWebsocket();
    clients[nws.hash] = nws;
    sendJSON(res, nws.hash);
    return nws;
}
exports.newConnection = newConnection;

function msgReceived(req, res) {
    var h = req.params.hash;
    if(h in clients) {
        if(req.params.str == "poll") {
            sendJSON(res, clients[h].poll());
        }
        else {
            clients[h].recv(unescape(req.params.str));
            sendJSON(res, "");
        }
    }
}
exports.msgReceived = msgReceived;

function inRoom(rm) {
    var cl = [];
    for(var h in clients) {
        if(clients[h].room == rm) {
            cl.push(clients[h]);
        }
    }

    return {
        emit: function() {
            for(var i = 0; i < this.cl.length; i++) {
                this.cl[i].emit(arguments);
            }
        },
        cl: cl
    };
}
exports.inRoom = inRoom;
