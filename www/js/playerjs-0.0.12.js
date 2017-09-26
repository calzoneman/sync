/*! Player.js - v0.0.12 - 2016-10-20
* http://github.com/embedly/player.js
* Copyright (c) 2016 Embedly; Licensed BSD */
(function(window, document){
var playerjs = {};

playerjs.DEBUG = false;
playerjs.VERSION = '0.0.11';
playerjs.CONTEXT = 'player.js';
playerjs.POST_MESSAGE = !!window.postMessage;

/*
* Utils.
*/
playerjs.origin = function(url){
  // Grab the origin of a URL
  if (url.substr(0, 2) === '//'){
    url = window.location.protocol + url;
  }

  return url.split('/').slice(0,3).join('/');
};

playerjs.addEvent = function(elem, type, eventHandle) {
  if (!elem) { return; }
  if ( elem.addEventListener ) {
    elem.addEventListener( type, eventHandle, false );
  } else if ( elem.attachEvent ) {
    elem.attachEvent( "on" + type, eventHandle );
  } else {
    elem["on"+type]=eventHandle;
  }
};

// usage: log('inside coolFunc',this,arguments);
// http://paulirish.com/2009/log-a-lightweight-wrapper-for-consolelog/
playerjs.log = function(){
  playerjs.log.history = playerjs.log.history || [];   // store logs to an array for reference
  playerjs.log.history.push(arguments);
  if(window.console && playerjs.DEBUG){
    window.console.log( Array.prototype.slice.call(arguments) );
  }
};

// isFunctions
playerjs.isString = function (obj) {
  return Object.prototype.toString.call(obj) === '[object String]';
};

playerjs.isObject = function(obj){
  return Object.prototype.toString.call(obj) === "[object Object]";
};

playerjs.isArray = function(obj){
  return Object.prototype.toString.call(obj) === "[object Array]";
};

playerjs.isNone = function(obj){
  return (obj === null || obj === undefined);
};

playerjs.has = function(obj, key){
  return Object.prototype.hasOwnProperty.call(obj, key);
};

// ie8 doesn't support indexOf in arrays, based on underscore.
playerjs.indexOf = function(array, item) {
  if (array == null){ return -1; }
  var i = 0, length = array.length;
  if (Array.prototype.IndexOf && array.indexOf === Array.prototype.IndexOf) {
    return array.indexOf(item);
  }
  for (; i < length; i++) {
    if (array[i] === item) { return i; }
  }
  return -1;
};

// Assert
playerjs.assert = function(test, msg) {
  if (!test) {
    throw msg || "Player.js Assert Failed";
  }
};
/*
* Keeper is just a method for keeping track of all the callbacks.
*/

playerjs.Keeper = function(){
  this.init();
};

playerjs.Keeper.prototype.init = function(){
  this.data = {};
};

playerjs.Keeper.prototype.getUUID = function(){
  // Create a random id. #http://stackoverflow.com/a/2117523/564191
  return 'listener-xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
  });
};

playerjs.Keeper.prototype.has = function(event, id){
  if (!this.data.hasOwnProperty(event)){
    return false;
  }

  if (playerjs.isNone(id)){
    return true;
  }

  // Figure out if we have the event.
  var events = this.data[event];

  for (var i = 0; i < events.length; i++){
    if (events[i].id === id){
      return true;
    }
  }

  return false;
};

playerjs.Keeper.prototype.add = function(id, event, cb, ctx, one){
  var d = {
    id: id,
    event: event,
    cb: cb,
    ctx: ctx,
    one: one
  };

  if (this.has(event)){
    this.data[event].push(d);
  } else {
    this.data[event] = [d];
  }
};

playerjs.Keeper.prototype.execute = function(event, id, data, ctx){
  if (!this.has(event, id)){
    return false;
  }

  var keep = [],
    execute = [];

  for (var i=0; i< this.data[event].length; i++){
    var d = this.data[event][i];

    // There are omni events, in that they do not have an id. i.e "ready".
    // Or there is an ID and we only want to execute the right id'd method.
    if (playerjs.isNone(id) || (!playerjs.isNone(id) && d.id === id )){

      execute.push({
        cb: d.cb,
        ctx: d.ctx? d.ctx: ctx,
        data: data
      });

      // If we only wanted to execute this once.
      if (d.one === false){
        keep.push(d);
      }
    } else {
      keep.push(d);
    }
  }

  if (keep.length === 0){
    delete this.data[event];
  } else {
    this.data[event] = keep;
  }

  // We need to execute everything after we deal with the one stuff. otherwise
  // we have issues to order of operations.
  for (var n=0; n < execute.length; n++){
    var e = execute[n];
    e.cb.call(e.ctx, e.data);
  }
};

playerjs.Keeper.prototype.on = function(id, event, cb, ctx){
  this.add(id, event, cb, ctx, false);
};

playerjs.Keeper.prototype.one = function(id, event, cb, ctx){
  this.add(id, event, cb, ctx, true);
};

playerjs.Keeper.prototype.off = function(event, cb){
  // We should probably restructure so this is a bit less of a pain.
  var listeners = [];

  if (!this.data.hasOwnProperty(event)){
    return listeners;
  }

  var keep = [];

  // Loop through everything.
  for (var i=0; i< this.data[event].length; i++){
    var data = this.data[event][i];
    // If we only keep if there was a CB and the CB is there.
    if (!playerjs.isNone(cb) && data.cb !== cb) {
      keep.push(data);
    } else if (!playerjs.isNone(data.id)) {
      listeners.push(data.id);
    }
  }

  if (keep.length === 0){
    delete this.data[event];
  } else {
    this.data[event] = keep;
  }

  return listeners;
};

/*
* Player.js is a javascript library for interacting with iframes via
* postMessage that use an Open Player Spec
*
*/

playerjs.Player = function(elem, options){
  if (!(this instanceof playerjs.Player)) {
    return new playerjs.Player(elem, options);
  }
  this.init(elem, options);
};

playerjs.EVENTS = {
  READY: 'ready',
  PLAY: 'play',
  PAUSE: 'pause',
  ENDED: 'ended',
  TIMEUPDATE: 'timeupdate',
  PROGRESS: 'progress',
  ERROR: 'error'
};

playerjs.EVENTS.all = function(){
  var all = [];
  for (var key in playerjs.EVENTS) {
    if (playerjs.has(playerjs.EVENTS, key) && playerjs.isString(playerjs.EVENTS[key])) {
      all.push(playerjs.EVENTS[key]);
    }
  }
  return all;
};

playerjs.METHODS = {
  PLAY: 'play',
  PAUSE: 'pause',
  GETPAUSED: 'getPaused',
  MUTE: 'mute',
  UNMUTE: 'unmute',
  GETMUTED: 'getMuted',
  SETVOLUME: 'setVolume',
  GETVOLUME: 'getVolume',
  GETDURATION: 'getDuration',
  SETCURRENTTIME: 'setCurrentTime',
  GETCURRENTTIME:'getCurrentTime',
  SETLOOP: 'setLoop',
  GETLOOP: 'getLoop',
  REMOVEEVENTLISTENER: 'removeEventListener',
  ADDEVENTLISTENER: 'addEventListener'
};

playerjs.METHODS.all = function(){
  var all = [];
  for (var key in playerjs.METHODS) {
    if (playerjs.has(playerjs.METHODS, key) && playerjs.isString(playerjs.METHODS[key])) {
      all.push(playerjs.METHODS[key]);
    }
  }
  return all;
};

playerjs.READIED = [];

playerjs.Player.prototype.init = function(elem, options){

  var self = this;

  if (playerjs.isString(elem)){
    elem = document.getElementById(elem);
  }

  this.elem = elem;

  // Figure out the origin of where we are sending messages.
  this.origin = playerjs.origin(elem.src);

  // Event handling.
  this.keeper = new playerjs.Keeper();

  // Queuing before ready.
  this.isReady = false;
  this.queue = [];

  // Assume that everything is supported, unless we know otherwise.
  this.events = playerjs.EVENTS.all();
  this.methods = playerjs.METHODS.all();

  if (playerjs.POST_MESSAGE){
    // Set up the reciever.
    playerjs.addEvent(window, 'message', function(e){
      self.receive(e);
    });
  } else {
    playerjs.log('Post Message is not Available.');
  }

  // See if we caught the src event first, otherwise assume we haven't loaded
  if (playerjs.indexOf(playerjs.READIED, elem.src) > -1){
    self.loaded = true;
  } else {
    // Try the onload event, just lets us give another test.
    this.elem.onload = function(){
      self.loaded = true;
    };
  }
};

playerjs.Player.prototype.send = function(data, callback, ctx){
  // Add the context and version to the data.
  data.context = playerjs.CONTEXT;
  data.version = playerjs.VERSION;

  // We are expecting a response.
  if (callback) {
    // Create a UUID
    var id = this.keeper.getUUID();

    // Set the listener.
    data.listener = id;

    // Only hang on to this listener once.
    this.keeper.one(id, data.method, callback, ctx);
  }

  if (!this.isReady && data.value !== 'ready'){
    playerjs.log('Player.queue', data);
    this.queue.push(data);
    return false;
  }

  playerjs.log('Player.send', data, this.origin);

  if (this.loaded === true){
    this.elem.contentWindow.postMessage(JSON.stringify(data), this.origin);
  }

  return true;
};

playerjs.Player.prototype.receive = function(e){
  playerjs.log('Player.receive', e);

  if (e.origin !== this.origin){
    return false;
  }

  var data;
  try {
    data = JSON.parse(e.data);
  } catch (err){
    // Not a valid response.
    return false;
  }

  // abort if this message wasn't a player.js message
  if (data.context !== playerjs.CONTEXT) {
    return false;
  }

  // We need to determine if we are ready.
  if (data.event === 'ready' && data.value && data.value.src === this.elem.src){
    this.ready(data);
  }

  if (this.keeper.has(data.event, data.listener)){
    this.keeper.execute(data.event, data.listener, data.value, this);
  }
};


playerjs.Player.prototype.ready = function(data){

  if (this.isReady === true){
    return false;
  }

  // If we got a list of supported methods, we should set them.
  if (data.value.events){
    this.events = data.value.events;
  }
  if (data.value.methods){
    this.methods = data.value.methods;
  }

  // set ready.
  this.isReady = true;
  this.loaded = true;

  // Clear the queue
  for (var i=0; i<this.queue.length; i++){
    var obj = this.queue[i];

    playerjs.log('Player.dequeue', obj);

    if (data.event === 'ready'){
      this.keeper.execute(obj.event, obj.listener, true, this);
    }
    this.send(obj);
  }
  this.queue = [];
};

playerjs.Player.prototype.on = function(event, callback, ctx){
  var id = this.keeper.getUUID();

  if (event === 'ready'){
    // We only want to call ready once.
    this.keeper.one(id, event, callback, ctx);
  } else {
    this.keeper.on(id, event, callback, ctx);
  }

  this.send({
    method: 'addEventListener',
    value: event,
    listener: id
  });

  return true;
};

playerjs.Player.prototype.off = function(event, callback){

  var listeners = this.keeper.off(event, callback);
  playerjs.log('Player.off', listeners);

  if (listeners.length > 0) {
    for (var i in listeners){
      this.send({
        method: 'removeEventListener',
        value: event,
        listener: listeners[i]
      });
      return true;
    }
  }

  return false;
};

// Based on what ready passed back, we can determine if the events/method are
// supported by the player.
playerjs.Player.prototype.supports = function(evtOrMethod, names){

  playerjs.assert(playerjs.indexOf(['method', 'event'], evtOrMethod) > -1,
    'evtOrMethod needs to be either "event" or "method" got ' + evtOrMethod);

  // Make everything an array.
  names = playerjs.isArray(names) ? names : [names];

  var all = evtOrMethod === 'event' ? this.events : this.methods;

  for (var i=0; i < names.length; i++){
    if (playerjs.indexOf(all, names[i]) === -1){
      return false;
    }
  }

  return true;
};

//create function to add to the Player prototype
function createPrototypeFunction(name) {

  return function() {

    var data = {
      method: name
    };

    var args = Array.prototype.slice.call(arguments);

    //for getters add the passed parameters to the arguments for the send call
    if (/^get/.test(name)) {
      playerjs.assert(args.length > 0, 'Get methods require a callback.');
      args.unshift(data);
    } else {
      //for setter add the first arg to the value field
      if (/^set/.test(name)) {
        playerjs.assert(args.length !== 0, 'Set methods require a value.');
        data.value = args[0];
      }
      args = [data];
    }

    this.send.apply(this, args);
  };
}

// Loop through the methods to add them to the prototype.
for (var i = 0, l = playerjs.METHODS.all().length; i < l; i++) {
  var methodName = playerjs.METHODS.all()[i];

  // We don't want to overwrite existing methods.
  if (!playerjs.Player.prototype.hasOwnProperty(methodName)){
    playerjs.Player.prototype[methodName] = createPrototypeFunction(methodName);
  }
}

// We need to catch all ready events in case the iframe is ready before the
// player is invoked.
playerjs.addEvent(window, 'message', function(e){
  var data;
  try {
    data = JSON.parse(e.data);
  } catch (err){
    return false;
  }

  // abort if this message wasn't a player.js message
  if (data.context !== playerjs.CONTEXT) {
    return false;
  }

  // We need to determine if we are ready.
  if (data.event === 'ready' && data.value && data.value.src){
    playerjs.READIED.push(data.value.src);
  }
});

/*
* Does all the wiring up for the backend.
*
* var receiver = new playerjs.Receiver();
* receiver.on('play', function(){ video.play() });
* receiver.on('getDuration', function(callback){ callback(video.duration) });
* receiver.emit('timeupdate', {});
*/

playerjs.Receiver = function(events, methods){
  this.init(events, methods);
};

playerjs.Receiver.prototype.init = function(events, methods){
  var self = this;

  // Deal with the ready crap.
  this.isReady = false;

  // Bind the window message.
  this.origin = playerjs.origin(document.referrer);

  //Create a holder for all the methods.
  this.methods = {};

  // holds all the information about what's supported
  this.supported = {
    events: events ? events : playerjs.EVENTS.all(),
    methods: methods ? methods : playerjs.METHODS.all()
  };

  // Deals with the adding and removing of event listeners.
  this.eventListeners = {};

  // We can't send any messages.
  this.reject = !(window.self !== window.top && playerjs.POST_MESSAGE);

  // We aren't in an iframe, don't listen.
  if (!this.reject){
    playerjs.addEvent(window, 'message', function(e){
      self.receive(e);
    });
  }
};

playerjs.Receiver.prototype.receive = function(e){
  // Only want to listen to events that came from our origin.
  if (e.origin !== this.origin){
    return false;
  }

  // Browsers that support postMessage also support JSON.
  var data = {};
  if (playerjs.isObject(e.data)){
    data = e.data;
  } else {
    try {
      data = window.JSON.parse(e.data);
    } catch (err){
      playerjs.log('JSON Parse Error', err);
    }
  }

  playerjs.log('Receiver.receive', e, data);

  // Nothing for us to do.
  if (!data.method){
    return false;
  }

  // make sure the context is correct.
  if (data.context !== playerjs.CONTEXT){
    return false;
  }

  // Make sure we have a valid method.
  if (playerjs.indexOf(playerjs.METHODS.all(), data.method) === -1){
    this.emit('error', {
      code: 2,
      msg: 'Invalid Method "'+data.method+'"'
    });
    return false;
  }

  // See if we added a listener
  var listener = !playerjs.isNone(data.listener) ? data.listener : null;

  // Add Event Listener.
  if (data.method === 'addEventListener') {
    if (this.eventListeners.hasOwnProperty(data.value)) {
      //If the listener is the same, i.e. null only add it once.
      if (playerjs.indexOf(this.eventListeners[data.value], listener) === -1){
        this.eventListeners[data.value].push(listener);
      }
    } else {
      this.eventListeners[data.value] = [listener];
    }

    if (data.value === 'ready' && this.isReady){
      this.ready();
    }
  }
  // Remove the event listener.
  else if (data.method === 'removeEventListener') {
    if (this.eventListeners.hasOwnProperty(data.value)) {
      var index = playerjs.indexOf(this.eventListeners[data.value], listener);

      // if we find the element, remove it.
      if (index > -1){
        this.eventListeners[data.value].splice(index, 1);
      }

      if (this.eventListeners[data.value].length === 0){
        delete this.eventListeners[data.value];
      }
    }
  }
  // Go get it.
  else {
    this.get(data.method, data.value, listener);
  }
};

playerjs.Receiver.prototype.get = function(method, value, listener){
  var self = this;

  // Now lets do it.
  if (!this.methods.hasOwnProperty(method)){
    this.emit('error', {
      code: 3,
      msg: 'Method Not Supported"'+method+'"'
    });
    return false;
  }

  var func = this.methods[method];

  if (method.substr(0,3) === 'get') {
    var callback = function(val){
      self.send(method, val, listener);
    };
    func.call(this, callback);
  } else {
    func.call(this, value);
  }
};

playerjs.Receiver.prototype.on = function(event, callback){
  this.methods[event] = callback;
};

playerjs.Receiver.prototype.send = function(event, value, listener){

  playerjs.log('Receiver.send', event, value, listener);

  if (this.reject){
    // We are not in a frame, or we don't support POST_MESSAGE
    playerjs.log('Receiver.send.reject', event, value, listener);
    return false;
  }

  var data = {
    context: playerjs.CONTEXT,
    version: playerjs.VERSION,
    event: event
  };

  if (!playerjs.isNone(value)){
    data.value = value;
  }

  if (!playerjs.isNone(listener)){
    data.listener = listener;
  }

  var msg = JSON.stringify(data);
  window.parent.postMessage(msg, this.origin === "" ? '*' : this.origin);
};

playerjs.Receiver.prototype.emit = function(event, value){

  if (!this.eventListeners.hasOwnProperty(event)){
    return false;
  }

  playerjs.log('Instance.emit', event, value, this.eventListeners[event]);

  for (var i=0; i < this.eventListeners[event].length; i++){
    var listener = this.eventListeners[event][i];
    this.send(event, value, listener);
  }

  return true;
};

playerjs.Receiver.prototype.ready = function(){
  playerjs.log('Receiver.ready');
  this.isReady = true;

  var data = {
    src: window.location.toString(),
    events: this.supported.events,
    methods: this.supported.methods
  };

  if (!this.emit('ready', data)){
    this.send('ready', data);
  }

};

playerjs.HTML5Adapter = function(video){
  if (!(this instanceof playerjs.HTML5Adapter)) {
    return new playerjs.HTML5Adapter(video);
  }
  this.init(video);
};

playerjs.HTML5Adapter.prototype.init = function(video){

  playerjs.assert(video, 'playerjs.VideoJSReceiver requires a video element');

  // Set up the actual receiver
  var receiver = this.receiver = new playerjs.Receiver();

  /* EVENTS */
  video.addEventListener('playing', function(){
    receiver.emit('play');
  });

  video.addEventListener('pause', function(){
    receiver.emit('pause');
  });

  video.addEventListener('ended', function(){
    receiver.emit('ended');
  });

  video.addEventListener('timeupdate', function(){
    receiver.emit('timeupdate', {
      seconds: video.currentTime,
      duration: video.duration
    });
  });

  video.addEventListener('progress', function(){
    receiver.emit('buffered', {
      percent: video.buffered.length
    });
  });

  /* Methods */
  receiver.on('play', function(){
    video.play();
  });

  receiver.on('pause', function(){
    video.pause();
  });

  receiver.on('getPaused', function(callback){
    callback(video.paused);
  });

  receiver.on('getCurrentTime', function(callback){
    callback(video.currentTime);
  });

  receiver.on('setCurrentTime', function(value){
    video.currentTime = value;
  });

  receiver.on('getDuration', function(callback){
    callback(video.duration);
  });

  receiver.on('getVolume', function(callback){
    callback(video.volume * 100);
  });

  receiver.on('setVolume', function(value){
    video.volume = value/100;
  });

  receiver.on('mute', function(){
    video.muted = true;
  });

  receiver.on('unmute', function(){
    video.muted = false;
  });

  receiver.on('getMuted', function(callback){
    callback(video.muted);
  });

  receiver.on('getLoop', function(callback){
    callback(video.loop);
  });

  receiver.on('setLoop', function(value){
    video.loop = value;
  });
};

/* Call when the video has loaded */
playerjs.HTML5Adapter.prototype.ready = function(){
  this.receiver.ready();
};
//http://www.longtailvideo.com/support/jw-player/28851/javascript-api-reference
playerjs.JWPlayerAdapter = function(player){
  if (!(this instanceof playerjs.JWPlayerAdapter)) {
    return new playerjs.JWPlayerAdapter(player);
  }
  this.init(player);
};

playerjs.JWPlayerAdapter.prototype.init = function(player){

  playerjs.assert(player, 'playerjs.JWPlayerAdapter requires a player object');

  // Set up the actual receiver
  var receiver = this.receiver = new playerjs.Receiver();

  // JWPlayer doesn't have a seLoop, so we can do it ourself.
  this.looped = false;

  /* EVENTS */
  player.onPause(function(){
    receiver.emit('pause');
  });

  player.onPlay(function(){
    receiver.emit('play');
  });

  player.onTime(function(e){
    var seconds = e.position,
      duration = e.duration;

    if (!seconds || !duration){
      return false;
    }

    var value = {
      seconds: seconds,
      duration: duration
    };
    receiver.emit('timeupdate', value);
  });

  var self = this;
  player.onComplete(function(){
    // Fake the looping
    if (self.looped === true){
      // By default jwplayer seeks after play.
      player.seek(0);
    } else {
      // Else throw the ended event.
      receiver.emit('ended');
    }
  });

  player.onError(function(){
    receiver.emit('error');
  });


  /* METHODS */
  receiver.on('play', function(){
    player.play(true);
  });

  receiver.on('pause', function(){
    player.pause(true);
  });

  receiver.on('getPaused', function(callback){
    callback(player.getState().toLowerCase() !== 'PLAYING'.toLowerCase());
  });

  receiver.on('getCurrentTime', function(callback){
    callback(player.getPosition());
  });

  receiver.on('setCurrentTime', function(value){
    player.seek(value);
  });

  receiver.on('getDuration', function(callback){
    callback(player.getDuration());
  });

  receiver.on('getVolume', function(callback){
    callback(player.getVolume());
  });

  receiver.on('setVolume', function(value){
    player.setVolume(value);
  });

  receiver.on('mute', function(){
    player.setMute(true);
  });

  receiver.on('unmute', function(){
    player.setMute(false);
  });

  receiver.on('getMuted', function(callback){
    callback(player.getMute() === true);
  });

  receiver.on('getLoop', function(callback){
    callback(this.looped);
  }, this);

  receiver.on('setLoop', function(value){
    this.looped = value;
  }, this);
};

/* Call when the video.js is ready */
playerjs.JWPlayerAdapter.prototype.ready = function(){
  this.receiver.ready();
};

playerjs.MockAdapter = function(){
  if (!(this instanceof playerjs.MockAdapter)) {
    return new playerjs.MockAdapter();
  }
  this.init();
};

playerjs.MockAdapter.prototype.init = function(){

  // Our mock video
  var video = {
    duration: 20,
    currentTime: 0,
    interval: null,
    timeupdate: function(){},
    volume: 100,
    mute: false,
    playing: false,
    loop : false,
    play: function(){
      video.interval = setInterval(function(){
        video.currentTime += 0.25;
        video.timeupdate({
          seconds: video.currentTime,
          duration: video.duration
        });
      }, 250);
      video.playing = true;
    },
    pause: function(){
      clearInterval(video.interval);
      video.playing = false;
    }
  };

  // Set up the actual receiver
  var receiver = this.receiver = new playerjs.Receiver();

  receiver.on('play', function(){
    var self = this;
    video.play();
    this.emit('play');
    video.timeupdate = function(data){
      self.emit('timeupdate', data);
    };
  });

  receiver.on('pause', function(){
    video.pause();
    this.emit('pause');
  });

  receiver.on('getPaused', function(callback){
    callback(!video.playing);
  });

  receiver.on('getCurrentTime', function(callback){
    callback(video.currentTime);
  });

  receiver.on('setCurrentTime', function(value){
    video.currentTime = value;
  });

  receiver.on('getDuration', function(callback){
    callback(video.duration);
  });

  receiver.on('getVolume', function(callback){
    callback(video.volume);
  });

  receiver.on('setVolume', function(value){
    video.volume = value;
  });

  receiver.on('mute', function(){
    video.mute = true;
  });

  receiver.on('unmute', function(){
    video.mute = false;
  });

  receiver.on('getMuted', function(callback){
    callback(video.mute);
  });

  receiver.on('getLoop', function(callback){
    callback(video.loop);
  });

  receiver.on('setLoop', function(value){
    video.loop = value;
  });
};

/* Call when the video has loaded */
playerjs.MockAdapter.prototype.ready = function(){
  this.receiver.ready();
};
playerjs.VideoJSAdapter = function(player){
  if (!(this instanceof playerjs.VideoJSAdapter)) {
    return new playerjs.VideoJSAdapter(player);
  }
  this.init(player);
};

playerjs.VideoJSAdapter.prototype.init = function(player){

  playerjs.assert(player, 'playerjs.VideoJSReceiver requires a player object');

  // Set up the actual receiver
  var receiver = this.receiver = new playerjs.Receiver();

  /* EVENTS */
  player.on("pause", function(){
    receiver.emit('pause');
  });

  player.on("play", function(){
    receiver.emit('play');
  });

  player.on("timeupdate", function(e){
    var seconds = player.currentTime(),
      duration = player.duration();

    if (!seconds || !duration){
      return false;
    }

    var value = {
      seconds: seconds,
      duration: duration
    };
    receiver.emit('timeupdate', value);
  });

  player.on("ended", function(){
    receiver.emit('ended');
  });

  player.on("error", function(){
    receiver.emit('error');
  });


  /* METHODS */
  receiver.on('play', function(){
    player.play();
  });

  receiver.on('pause', function(){
    player.pause();
  });

  receiver.on('getPaused', function(callback){
    callback(player.paused());
  });

  receiver.on('getCurrentTime', function(callback){
    callback(player.currentTime());
  });

  receiver.on('setCurrentTime', function(value){
    player.currentTime(value);
  });

  receiver.on('getDuration', function(callback){
    callback(player.duration());
  });

  receiver.on('getVolume', function(callback){
    callback(player.volume() * 100);
  });

  receiver.on('setVolume', function(value){
    player.volume(value/100);
  });

  receiver.on('mute', function(){
    player.volume(0);
  });

  receiver.on('unmute', function(){
    player.volume(1);
  });

  receiver.on('getMuted', function(callback){
    callback(player.volume() === 0);
  });

  receiver.on('getLoop', function(callback){
    callback(player.loop());
  });

  receiver.on('setLoop', function(value){
    player.loop(value);
  });
};

/* Call when the video.js is ready */
playerjs.VideoJSAdapter.prototype.ready = function(){
  this.receiver.ready();
};

  if (typeof define === 'function' && define.amd) {
    define(function () {
      return playerjs
    })
  } else if (typeof module === 'object' && module.exports) {
    module.exports = playerjs
  } else {
    window.playerjs = playerjs;
  }
})(window, document);
