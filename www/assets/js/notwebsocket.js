/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var NotWebsocket = function() {
    this.connected = false;
    this.polltmr = false;
    this.nws = true;
    $.getJSON(WEB_URL + "/nws/connect?callback=?", function(data) {
        this.hash = data;
        this.connected = true;
        this.recv(["connect", undefined]);
        this.pollint = 100;
        this.pollonce();
    }.bind(this));

    this.handlers = {};
}

NotWebsocket.prototype.pollonce = function() {
    if(this.polltmr !== false)
        clearTimeout(this.polltmr);
    if(!this.connected)
        return;
    this.poll();
    this.polltmr = setTimeout(function() {
        this.pollonce();
    }.bind(this), this.pollint);
}

NotWebsocket.prototype.poll = function() {
    if(!this.connected)
        return;
    if(this.polling)
        return;
    $.getJSON(WEB_URL+"/nws/"+this.hash+"/poll?callback=?", function(data) {
        this.polling = true;
        // Adaptive polling rate
        // Poll every 1000ms if no activity
        //      every 500ms if minor activity
        //      every 100ms is very active
        if(data.length == 0) {
            this.pollint = 1000;
        }
        else if(data.length < 10 && this.pollint < 500) {
            this.pollint += 100;
        }
        else if(data.length > 10) {
            this.pollint = 100;
        }
        for(var i = 0; i < data.length; i++) {
            try {
                this.recv(data[i]);
            }
            catch(e) { }
        }
        this.polling = false;
    }.bind(this))
    .fail(function() {
        this.disconnect();
    }.bind(this));
}

NotWebsocket.prototype.emit = function(msg, data) {
    if(!this.connected) {
        setTimeout(function() {
            this.emit(msg, data);
        }.bind(this), 100);
        return;
    }
    var pkt = [msg, data];
    var str = encodeURIComponent(JSON.stringify(pkt)).replace(/\//g, "%2F");
    $.getJSON(WEB_URL+"/nws/"+this.hash+"/"+str+"?callback=?", function() {
        // Poll more quickly because sending a packet usually means
        // expecting some data to come back
        this.pollint = 100;
        this.pollonce();
    }.bind(this));
}

NotWebsocket.prototype.reconnect = function() {
    $.getJSON(WEB_URL + "/nws/connect", function(data) {
        this.hash = data;
        this.connected = true;
        this.recv(["connect", undefined]);
        this.pollint = setInterval(function() {
            this.poll();
        }.bind(this), 100);
    }.bind(this))
    .fail(function() {
        if(this.reconndelay < 10000)
            this.reconndelay += 500;
        setTimeout(function() {
            this.reconnect();
        }.bind(this), this.reconndelay);
    }.bind(this));
}

NotWebsocket.prototype.on = function(msg, callback) {
    if(!(msg in this.handlers))
        this.handlers[msg] = [];
    this.handlers[msg].push(callback);
}

NotWebsocket.prototype.recv = function(pkt) {
    var msg = pkt[0], data = pkt[1];
    if(!(msg in this.handlers)) {
        return;
    }
    for(var i = 0; i < this.handlers[msg].length; i++) {
        this.handlers[msg][i](data);
    }
}

NotWebsocket.prototype.disconnect = function() {
    this.recv(["disconnect", undefined]);
    if(this.polltmr !== false)
        clearTimeout(this.polltmr);
    this.polltmr = false;
    this.connected = false;
    this.reconndelay = 1000;
    setTimeout(function() {
        this.reconnect();
    }.bind(this), this.reconndelay);
}

