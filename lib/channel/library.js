function LibraryModule(channel) {
    this.channel = channel;
}

LibraryModule.prototype.load = function () {

};

LibraryModule.prototype.save = function () {

};

LibraryModule.prototype.postJoin = function (user) {

};

LibraryModule.prototype.cacheMedia = function (media) {
    /* Google Drive videos should not be cached due to the expiration */
    if (media.type === "gd") {
        return false;
    }

    if (this.channel.is(Channel.REGISTERED)) {
        db.channels.addTOLibrary(this.channel.name, media);
    }
};
