window.WhepPlayer = class WhepPlayer extends PlayerJSPlayer
  constructor: (data) ->
    super(data)
    @load(data)

  load: (data) ->
    @ready = false
    @setMediaProperties(data)

    { whepURL, streamKey } = data.meta

    waitUntilDefined window, 'PlayerJSPlayer', =>
      videoEl = document.createElement 'video'
      videoEl.autoplay = true
      videoEl.muted    = true
      videoEl.controls = true
      removeOld(videoEl)
      @setupPlayer(videoEl, data)

      pc = new RTCPeerConnection()
      pc.addTransceiver 'audio', direction: 'recvonly'
      pc.addTransceiver 'video', direction: 'recvonly'

      pc.ontrack = (event) ->
        videoEl.srcObject = event.streams[0]

      pc.oniceconnectionstatechange = ->
        document.getElementById('connectionState').innerText = pc.iceConnectionState

      pc.createOffer().then (offer) ->
        pc.setLocalDescription offer
        fetch whepURL,
          method: 'POST'
          headers:
            'Authorization': "Bearer #{streamKey}"
            'Content-Type': 'application/sdp'
          body: offer.sdp
        .then (r) -> r.text()
        .then (answer) ->
          pc.setRemoteDescription type: 'answer', sdp: answer

      pc.onconnectionstatechange = ->
        if pc.connectionState is 'connected'
          @ready = true
          @fire 'ready'
          document.getElementById('readyFlag').innerText = 'yes'
