var NotWebsocket = function() {
    this.connected = false;
    $.getJSON(WEB_URL + "/nws/connect", function(data) {
        this.hash = data;
        this.connected = true;
        this.recv(["connect", undefined]);
        this.pollint = setInterval(function() {
            this.poll();
        }.bind(this), 100);
    }.bind(this));

    this.handlers = {};
}

NotWebsocket.prototype.emit = function(msg, data) {
    if(!this.connected) {
        setTimeout(function() {
            this.emit(msg, data);
        }.bind(this), 100);
    }
    var pkt = [msg, data];
    var str = escape(JSON.stringify(pkt));
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
    $.getJSON(WEB_URL+"/nws/"+this.hash+"/poll", function(data) {
        for(var i = 0; i < data.length; i++) {
            console.log("DBG", data[i]);
            this.recv(data[i]);
        }
    }.bind(this));
}

NotWebsocket.prototype.recv = function(pkt) {
    var msg = pkt[0], data = pkt[1];
    if(!(msg in this.handlers))
        return;
    for(var i = 0; i < this.handlers[msg].length; i++) {
        this.handlers[msg][i](data);
    }
}
