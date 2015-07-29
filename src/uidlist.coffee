serialUidGenerator = ->
    nextUid = 1
    return -> nextUid++

module.exports = class UidList
    constructor: ->
        @_items = {}
        @_uidGenerator = serialUidGenerator()
        @_headUid = null
        @_tailUid = null
        @length = 0

    _createItem: (payload, prev, next) ->
        uid = @_uidGenerator()
        item =
            payload: payload
            uid: uid
            prevUid: prev
            nextUid: next
        return item

    insertHead: (payload) ->
        item = @_createItem(payload, null, @_headUid)
        if @_headUid
            @_items[@_headUid].prevUid = item.uid
        @_headUid = item.uid
        if not @_tailUid
            @_tailUid = item.uid
        @_items[item.uid] = item
        @length++
        return item.uid

    insertTail: (payload) ->
        item = @_createItem(payload, @_tailUid, null)
        if @_tailUid
            @_items[@_tailUid].nextUid = item.uid
        @_tailUid = item.uid
        if not @_headUid
            @_headUid = item.uid
        @_items[item.uid] = item
        @length++
        return item.uid

    insertBefore: (payload, nextUid) ->
        if nextUid not of @_items
            throw new ReferenceError('Target uid not found')

        item = @_createItem(payload, @_items[nextUid].prevUid, nextUid)

        if item.prevUid
            @_items[item.prevUid].nextUid = item.uid
        @_items[nextUid].prevUid = item.uid

        @_items[item.uid] = item
        @length++
        if @_headUid == nextUid
            @_headUid = item.uid

        return item.uid

    insertAfter: (payload, prevUid) ->
        if prevUid not of @_items
            throw new ReferenceError('Target uid not found')

        item = @_createItem(payload, prevUid, @_items[prevUid].nextUid)

        @_items[prevUid].nextUid = item.uid
        if item.nextUid
            @_items[item.nextUid].prevUid = item.uid

        @_items[item.uid] = item
        @length++
        if @_tailUid == prevUid
            @_tailUid = item.uid

        return item.uid

    get: (uid) ->
        if uid not of @_items
            throw new ReferenceError('Target uid not found')

        return @_items[uid].payload

    find: (pred) ->
        uid = @_headUid
        while uid
            if pred(@_items[uid].payload)
                return @_items[uid].payload
            uid = @_items[uid].nextUid
        return false

    findAll: (pred) ->
        results = []
        uid = @_headUid
        while uid
            if pred(@_items[uid].payload)
                results.push(@_items[uid].payload)
            uid = @_items[uid].nextUid
        return results

    remove: (uid) ->
        if uid not of @_items
            throw new ReferenceError('Target uid not found')

        item = @_items[uid]
        delete @_items[uid]

        if @_headUid == uid
            @_headUid = item.nextUid
        if @_tailUid == uid
            @_tailUid = item.prevUid
        if item.nextUid
            @_items[item.nextUid].prevUid = item.prevUid
        if item.prevUid
            @_items[item.prevUid].nextUid = item.nextUid

        @length--

    clear: ->
        @_items = {}
        @_headUid = null
        @_tailUid = null
        @length = 0

    toArray: (options = { wrapWithUid: false }) ->
        result = new Array(@length)
        uid = @_headUid
        i = 0
        while uid
            item = @_items[uid]
            if options.wrapWithUid
                fullItem =
                    uid: uid
                fullItem[options.payloadKey or 'payload'] = item.payload
                result[i++] = fullItem
            else
                result[i++] = item.payload
            uid = item.nextUid
        return result

    forEach: (fn) ->
        uid = @_headUid
        while uid
            fn(@_items[uid].payload)
            uid = @_items[uid].nextUid
