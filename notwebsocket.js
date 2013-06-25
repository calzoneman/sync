/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Logger = require("./logger");

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
    this.lastpoll = Date.now();
    this.noflood = {};
}

NotWebsocket.prototype.checkFlood = function(id, rate) {
    if(id in this.noflood) {
        this.noflood[id].push(Date.now());
    }
    else {
        this.noflood[id] = [Date.now()];
    }
    if(this.noflood[id].length > 10) {
        this.noflood[id].shift();
        var hz = 10000 / (this.noflood[id][9] - this.noflood[id][0]);
        if(hz > rate) {
            throw "Rate is too high: " + id;
        }
    }
}

NotWebsocket.prototype.emit = function(msg, data) {
    var pkt = [msg, data];
    this.pktqueue.push(pkt);
}

NotWebsocket.prototype.poll = function() {
    this.checkFlood("poll", 100);
    this.lastpoll = Date.now();
    var q = [];
    for(var i = 0; i < this.pktqueue.length; i++) {
        q.push(this.pktqueue[i]);
    }
    this.pktqueue.length = 0;
    return q;
}

NotWebsocket.prototype.on = function(msg, callback) {
    if(!(msg in this.handlers))
        this.handlers[msg] = [];
    this.handlers[msg].push(callback);
}

NotWebsocket.prototype.recv = function(urlstr) {
    this.checkFlood("recv", 100);
    var msg, data;
    try {
        var js = JSON.parse(urlstr);
        msg = js[0];
        data = js[1];
    }
    catch(e) {
        Logger.errlog.log("Failed to parse NWS string");
        Logger.errlog.log(urlstr);
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
    if(!(rm in rooms)) {
        rooms[rm] = [];
    }

    rooms[rm].push(this);
}

NotWebsocket.prototype.leave = function(rm) {
    if(rm in rooms) {
        var idx = rooms[rm].indexOf(this);
        if(idx >= 0) {
            rooms[rm].splice(idx, 1);
        }
    }
}

NotWebsocket.prototype.disconnect = function() {
    for(var rm in rooms) {
        this.leave(rm);
    }

    this.recv(JSON.stringify(["disconnect", undefined]));
    this.emit("disconnect");

    clients[this.hash] = null;
    delete clients[this.hash];
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
var rooms = {};

function newConnection(req, res) {
    var nws = new NotWebsocket();
    clients[nws.hash] = nws;
    res.callback = req.query.callback;
    sendJSON(res, nws.hash);
    return nws;
}
exports.newConnection = newConnection;

function msgReceived(req, res) {
    res.callback = req.query.callback;
    var h = req.params.hash;
    if(h in clients && clients[h] != null) {
        var str = req.params.str;
        res.callback = req.query.callback;
        try {
            if(str == "poll") {
                sendJSON(res, clients[h].poll());
            }
            else {
                clients[h].recv(decodeURIComponent(str));
                sendJSON(res, "");
            }
        }
        catch(e) {
            res.send(429); // 429 Too Many Requests
        }
    }
    else {
        res.send(404);
    }
}
exports.msgReceived = msgReceived;

function inRoom(rm) {
    var cl = [];

    if(rm in rooms) {
        for(var i = 0; i < rooms[rm].length; i++) {
            cl.push(rooms[rm][i]);
        }
    }

    cl.emit = function(msg, data) {
        for(var i = 0; i < this.length; i++) {
            this[i].emit(msg, data);
        }
    };

    return cl;
}
exports.inRoom = inRoom;

function checkDeadSockets() {
    for(var h in clients) {
        if(Date.now() - clients[h].lastpoll >= 2000) {
            clients[h].disconnect();
        }
    }
}

setInterval(checkDeadSockets, 2000);
