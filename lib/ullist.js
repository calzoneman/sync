/*
    ullist.js

    Description: Defines ULList, which represents a doubly linked list
    in which each item has a unique identifier stored in the `uid` field.

*/

function ULList() {
    this.first = null;
    this.last = null;
    this.length = 0;
}

/* Add an item to the beginning of the list */
ULList.prototype.prepend = function(item) {
    if(this.first !== null) {
        item.next = this.first;
        this.first.prev = item;
    }
    else {
        this.last = item;
    }
    this.first = item;
    this.first.prev = null;
    this.length++;
    return true;
}

/* Add an item to the end of the list */
ULList.prototype.append = function(item) {
    if(this.last !== null) {
        item.prev = this.last;
        this.last.next = item;
    }
    else {
        this.first = item;
    }
    this.last = item;
    this.last.next = null;
    this.length++;
    return true;
}

/* Insert an item after one which has a specified UID */
ULList.prototype.insertAfter = function(item, uid) {
    var after = this.find(uid);

    if(!after)
        return false;

    // Update links
    item.next = after.next;
    if(item.next)
        item.next.prev = item;
    item.prev = after;
    after.next = item;

    // New end of list
    if(after == this.last)
        this.last = item;

    this.length++;

    return true;
}

/* Insert an item before one that has a specified UID */
ULList.prototype.insertBefore = function(item, uid) {
    var before = this.find(uid);

    if(!before)
        return false;

    // Update links
    item.next = before;
    item.prev = before.prev;
    if(item.prev)
        item.prev.next = item;
    before.prev = item;

    // New beginning of list
    if(before == this.first)
        this.first = item;

    this.length++;

    return true;
}

/* Remove an item from the list */
ULList.prototype.remove = function(uid) {
    var item = this.find(uid);
    if(!item)
        return false;

    // Boundary conditions
    if(item == this.first)
        this.first = item.next;
    if(item == this.last)
        this.last = item.prev;

    // General case
    if(item.prev)
        item.prev.next = item.next;
    if(item.next)
        item.next.prev = item.prev;

    this.length--;
    return true;
}

/* Find an element in the list, return false if specified UID not found */
ULList.prototype.find = function(uid) {
    // Can't possibly find it in an empty list
    if(this.first === null)
        return false;

    var item = this.first;
    var iter = this.first;
    while(iter !== null && item.uid != uid) {
        item = iter;
        iter = iter.next;
    }

    if(item && item.uid == uid)
        return item;
    return false;
}

/* Clear all elements from the list */
ULList.prototype.clear = function() {
    this.first = null;
    this.last = null;
    this.length = 0;
}

/* Dump the contents of the list into an array */
ULList.prototype.toArray = function(pack) {
    var arr = new Array(this.length);
    var item = this.first;
    var i = 0;
    while(item !== null) {
        if(pack !== false && typeof item.pack == "function")
            arr[i++] = item.pack();
        else
            arr[i++] = item;
        item = item.next;
    }
    return arr;
}

/* iterate across the playlist */
ULList.prototype.forEach = function (fn) {
    var item = this.first;
    while(item !== null) {
        fn(item);
        item = item.next;
    }
};

/* find a media with the given video id */
ULList.prototype.findVideoId = function (id) {
    var item = this.first;
    while(item !== null) {
        if(item.media && item.media.id === id)
            return item;
        item = item.next;
    }
    return false;
};

ULList.prototype.findAll = function(fn) {
    var result = [];
    this.forEach(function(item) {
        if( fn(item) ) {
            result.push(item);
        }
    });
    return result;
}

module.exports = ULList;
