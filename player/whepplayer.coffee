window.WhepPlayer = class WhepPlayer extends Player
  constructor: (data) ->
    return new WhepPlayer(data) unless this instanceof WhepPlayer
    super(data)
    @load(data)

  load: (data) ->
    @ready  = false
    @paused = true
    @setMediaProperties(data)

    unless data.meta?.whepURL
      u = new URL(data.id)
      streemId = u.pathname.split('/').filter(Boolean)[0]
      data.meta ?= {}
      # Adjust these to whatever your backend expects
      data.meta.whepURL   = "#{u.origin}/api/whep"
      data.meta.streamKey = streemId

    { whepURL, streamKey } = data.meta

    # Create video element
    videoEl = document.createElement 'video'
    videoEl.autoplay = true
    videoEl.muted    = true
    videoEl.controls = true

    # Use the standard container swapper
    holder = removeOld()          # jQuery object
    holder.empty().append(videoEl)

    @videoEl = videoEl

    # ---- WebRTC setup ----
    pc = new RTCPeerConnection()
    pc.addTransceiver 'audio', direction: 'recvonly'
    pc.addTransceiver 'video', direction: 'recvonly'

    pc.ontrack = (e) => @videoEl.srcObject = e.streams[0]

    pc.onconnectionstatechange = =>
      if pc.connectionState is 'connected'
        @ready = true
        @fire? 'ready'

    pc.createOffer()
      .then (offer) =>
        pc.setLocalDescription offer
        fetch whepURL,
          method: 'POST'
          headers:
            Authorization: "Bearer #{streamKey}"
            'Content-Type': 'application/sdp'
          body: offer.sdp
      .then (r) -> r.text()
      .then (answer) ->
        pc.setRemoteDescription type: 'answer', sdp: answer
      .catch (err) ->
        console.error 'WHEP negotiation failed:', err

    @pc = pc

  play: ->
    @paused = false
    @videoEl?.play?()

  pause: ->
    @paused = true
    @videoEl?.pause?()

  seekTo: (t) ->
    @videoEl?.currentTime = t if @ready

  setVolume: (v) ->
    @videoEl?.volume = v if @ready

  getTime: (cb) ->
    if @ready and @videoEl?
      cb @videoEl.currentTime
    else
      cb 0

  getVolume: (cb) ->
    if @ready and @videoEl?
      cb @videoEl.volume
    else
      cb VOLUME
