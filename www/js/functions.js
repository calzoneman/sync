
function addVideo(data, position) {
    var item = $('<li/>');
    item.data('id', data.id);
    item.data('temp', data.temp);
    var btnstrip = $('<div/>').addClass('btn-group video-buttons')
        .appendTo(item);
    var title = $('<a/>', {
        href: videoLink(data.id),
        target: '_blank',
        class: 'video-title'
    }).text(data.title).appendTo(item);
    var duration = $('<span/>').addClass('video-time')
        .text(formatTime(data.duration))
        .appendTo(item);
    
    if (position === 'first') {
        item.prependTo($('#playlist'));
    } else if (position === 'last') {
        item.appendTo($('#playlist'));
    } else {
        var prev = findVideo(position);
        if (prev.length > 0) {
            item.insertAfter(prev);
        }
    }
    addVideoButtons(item);
    return item;
}

function addVideoButtons(li) {
    var btns = li.find('.video-buttons');
    if (btns.length === 0) {
        return;
    }
    
    if (can('playlistjump')) {
        $('<button/>').addClass('btn btn-xs btn-default')
            .html('<span class="glyphicon glyphicon-play"></span>')
            .click(function () {
                SOCKET.emit('playVideo', {
                    id: li.data('id')
                });
            })
            .appendTo(btns);
    }

    if (can('playlistmove')) {
        $('<button/>').addClass('btn btn-xs btn-default')
            .html('<span class="glyphicon glyphicon-share-alt"></span>')
            .click(function () {
                SOCKET.emit('moveVideo', {
                    id: li.data('id'),
                    after: CURRENT.id
                });
            })
            .appendTo(btns);
    }

    if (can('playlistsettemp')) {
        $('<button/>').addClass('btn btn-xs btn-default')
            .html('<span class="glyphicon glyphicon-flag"></span>')
            .click(function () {
                SOCKET.emit('setTemp', {
                    id: li.data('id'),
                    temp: !li.data('temp')
                });
            })
            .appendTo(btns);
    }

    if (can('playlistsettemp')) {
        $('<button/>').addClass('btn btn-xs btn-default')
            .html('<span class="glyphicon glyphicon-trash"></span>')
            .click(function () {
                SOCKET.emit('deleteVideo', {
                    id: li.data('id'),
                    temp: !li.data('temp')
                });
            })
            .appendTo(btns);
    }
}

function videoLink(data) {
    data = data.split(':');
    var type = data[0];
    var id = data[1];
    if (type === void 0 || id === void 0) {
        return '#';
    }

    switch(type) {
        case 'yt':
            return 'http://youtu.be/' + id;
        default:
            return '#';
    }
}

function formatTime(seconds) {
    var h = parseInt(seconds / 3600);
    var m = parseInt((seconds % 3600) / 60);
    var s = seconds % 60;

    var time = '';
    if (h !== 0) {
        h = '' + h;
        if (h.length < 2) {
            h = '0' + h;
        }
        time += h + ':';
    }

    m = '' + m;
    if (m.length < 2) {
        m = '0' + m;
    }
    time += m + ':';

    s = '' + s;
    if (s.lengts < 2) {
        s = '0' + s;
    }
    time += s;

    return time;
}

function addChatMessage(data, buffer) {
    var last = buffer.data('lastmessagename');
    var div = $('<div/>').addClass('chatmsg')
        .addClass('chatmsg-' + data.name);
    var timestamp = $('<span/>').addClass('chat-timestamp').appendTo(div)
        .text('[' + new Date(data.time).toTimeString().split(' ')[0] + '] ');
    var username = $('<span/>').addClass('chat-name').appendTo(div);
    var message = $('<span/>').appendTo(div).text(data.message);
    if (data.msgclass === 'action') {
        username.text(data.name + ' ');
    } else {
        username.text(data.name + ': ');
    }
    switch(data.msgclass) {
        case 'action':
            timestamp.addClass('action');
            username.addClass('action');
            message.addClass('action');
            break;
        case 'spoiler':
            message.addClass('spoiler');
            break;
        case 'greentext':
            message.addClass('greentext');
            break;
        case 'shout':
            timestamp.addClass('shout');
            username.addClass('shout');
            message.addClass('shout');
            break;
        case 'drink':
            div.addClass('drink');
            break;
        default:
            break;
    }

    if (!data.msgclass.match(/action|shout|drink/) &&
        data.name === last) {
        if (!data.message.match(/^\s*<strong>.+?\s*:/)) {
            username.remove();
        }
    }
    buffer.data('lastmessagename', data.name);

    if (data.flair) {
        username.addClass(data.flair);
    }

    div.appendTo(buffer);
}

function can(what) {
    return true;
}
