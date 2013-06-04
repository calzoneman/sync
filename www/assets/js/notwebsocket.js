var NotWebsocket = function() {
    this.connected = false;
    this.polltmr = false;
    $.getJSON(WEB_URL + "/nws/connect", function(data) {
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
    var str = escape(JSON.stringify(pkt)).replace(/\//g, "%2F");
    $.getJSON(WEB_URL+"/nws/"+this.hash+"/"+str, function() {
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
