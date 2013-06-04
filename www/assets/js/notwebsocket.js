var NotWebsocket = function() {
    this.connected = false;
    $.getJSON(WEB_URL + "/nws/connect", function(data) {
        console.log(data);
        this.hash = data;
        this.connected = true;
        this.recv(["connect", undefined]);
        this.pollint = setInterval(function() {
            this.poll();
        }.bind(this), 100);
    }.bind(this));

    this.handlers = {};
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
            this.reconndelay += 100;
        setTimeout(function() {
            this.reconnect();
        }.bind(this), this.reconndelay);
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
    $.getJSON(WEB_URL+"/nws/"+this.hash+"/"+str, function(){});
}

NotWebsocket.prototype.on = function(msg, callback) {
    if(!(msg in this.handlers))
        this.handlers[msg] = [];
    this.handlers[msg].push(callback);
}

NotWebsocket.prototype.poll = function() {
    if(!this.connected)
        return;
    if(this.polling)
        return false;
    $.getJSON(WEB_URL+"/nws/"+this.hash+"/poll?callback=?", function(data) {
        this.polling = true;
        for(var i = 0; i < data.length; i++) {
            try {
                this.recv(data[i]);
            }
            catch(e) { }
        }
        this.polling = false;
    }.bind(this))
    .fail(function() {
        console.log(arguments);
        this.disconnect();
    }.bind(this));
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
    clearInterval(this.pollint);
    this.connected = false;
    this.reconndelay = 1000;
    setTimeout(function() {
        this.reconnect();
    }.bind(this), this.reconndelay);
}
