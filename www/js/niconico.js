/*
 *    Niconico iframe embed api
 *    Written by Xaekai
 *    Copyright (c) 2022 Radiant Feather; Licensed AGPLv3
 *
 */
class NicovideoEmbed {
    static origin = 'https://embed.nicovideo.jp';
    static methods = [
        'loadComplete',
        'mute',
        'pause',
        'play',
        'seek',
        'volumeChange',
    ];
    static frames = [
        'error',
        'loadComplete',
        'playerMetadataChange',
        'playerStatusChange',
        'seekStatusChange',
        'statusChange',
        //'player-error:video:play',
        //'player-error:video:seek',
    ];
    static events = [
        'ended',
        'error',
        'muted',
        'pause',
        'play',
        'progress',
        'ready',
        'timeupdate',
        'unmuted',
        'volumechange',
    ];

    constructor(options) {
        this.handlers = Object.fromEntries(NicovideoEmbed.frames.map(key => [key,[]]));
        this.listeners = Object.fromEntries(NicovideoEmbed.events.map(key => [key,[]]));
        this.state = ({
            ready: false,
            playerStatus: 1,
            currentTime: 0.0, // ms
            muted: false,
            volume: 0.99,
            maximumBuffered: 0,
        });

        this.setupHandlers();
        this.scaffold(options);
    }

    scaffold({ iframe = null, playerId = 1, videoId = null }){
        this.playerId = playerId;
        this.messageListener();
        if(iframe === null){
            if(videoId === null){
                throw new Error('You must provide either an existing iframe or a videoId');
            }
            const iframe = this.iframe = document.createElement('iframe');

            const source = new URL(`${NicovideoEmbed.origin}/watch/${videoId}`);
            source.search = new URLSearchParams({
                jsapi: 1,
                playerId
            });
            iframe.setAttribute('src', source);
            iframe.setAttribute('id', playerId);
            iframe.setAttribute('allow', 'autoplay; fullscreen');
            iframe.addEventListener('load', ()=>{
                this.observe();
            })
        } else {
            this.iframe = iframe;
            this.observe();
        }
    }

    setupHandlers() {
        this.handlers.loadComplete.push((data) => {
            this.emit('ready');
            this.state.ready = true;
            Object.assign(this, data);
        });
        this.handlers.error.push((data) => {
            this.emit('error', data);
        });
        this.handlers.playerStatusChange.push((data) => {
            let event;
            switch (data.playerStatus) {
                case 1: /* Buffering */ return;
                case 2: event = 'play'; break;
                case 3: event = 'pause'; break;
                case 4: event = 'ended'; break;
            }
            this.state.playerStatus = data.playerStatus;
            this.emit(event);
        });
        this.handlers.playerMetadataChange.push(({ currentTime, volume, muted, maximumBuffered }) => {
            const self = this.state;

            if (currentTime !== self.currentTime) {
                self.currentTime = currentTime;
                this.emit('timeupdate', currentTime);
            }

            if (muted !== self.muted) {
                self.muted = muted;
                this.emit(muted ? 'muted' : 'unmuted');
            }

            if (volume !== self.volume) {
                self.volume = volume;
                this.emit('volumechange', volume);
            }

            if (maximumBuffered !== self.maximumBuffered) {
                self.maximumBuffered = maximumBuffered;
                this.emit('progress', maximumBuffered);
            }
        });
        this.handlers.seekStatusChange.push((data) => {
            //
        });
        this.handlers.statusChange.push((data) => {
            //
        });
    }

    messageListener() {
        const dispatcher = (event) => {
            if (event.origin === NicovideoEmbed.origin && event.data.playerId === this.playerId) {
                const { data } = event.data;
                this.dispatch(event.data.eventName, data);
            }
        }
        window.addEventListener('message', dispatcher);

        /* Clean up */
        this.observer = new MutationObserver((alterations) => {
            alterations.forEach((change) => {
                change.removedNodes.forEach((deletion) => {
                    if(deletion.nodeName === 'IFRAME') {
                        window.removeEventListener('message', dispatcher)
                        this.observer.disconnect();
                    }
                });
            });
        });
    }

    observe(){
        this.state.receptive = true;
        this.observer.observe(this.iframe.parentElement, { subtree: true, childList: true });
    }

    dispatch(frame, data = null){
        if(!NicovideoEmbed.frames.includes(frame)){
            console.error(JSON.stringify(data, undefined, 4));
            throw new Error(`NicovideoEmbed ${frame}`);
        }
        [...this.handlers[frame]].forEach(handler => {
            handler.call(this, data);
        });
    }

    emit(event, data = null){
        [...this.listeners[event]].forEach(listener => {
            listener.call(this, data);
        });
        if(event === 'ready'){
            this.listeners.ready.length = 0;
        }
    }

    postMessage(request) {
        if(!this.state.receptive){
            setTimeout(() => { this.postMessage(request) }, 1000 / 24);
            return;
        }
        const message = Object.assign({
            sourceConnectorType: 1,
            playerId: this.playerId
        }, request);

        this.iframe.contentWindow.postMessage(message, NicovideoEmbed.origin);
    }

    on(event, listener){
        if(!NicovideoEmbed.events.includes(event)){
            throw new Error('Unrecognized event name');
        }
        if(event === 'ready'){
            if(this.state.ready){
                listener();
                return this;
            } else {
                setTimeout(() => { this.loadComplete() }, 1000 / 60);
            }
        }
        this.listeners[event].push(listener);
        return this;
    }

    mute(state){
        this.postMessage({ eventName: 'pause', data: { mute: state } });
    }

    pause(){
        this.postMessage({ eventName: 'pause' });
    }

    play(){
        this.postMessage({ eventName: 'play' });
    }

    loadComplete(){
        this.postMessage({ eventName: 'loadComplete' });
    }

    seek(ms){
        this.postMessage({ eventName: 'seek', data: { time: ms } });
    }

    volumeChange(volume){
        this.postMessage({ eventName: 'pause', data: { volume } });
    }

}

window.NicovideoEmbed = NicovideoEmbed;
