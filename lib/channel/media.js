function Media(id, title, seconds, type, meta) {
    if (!meta) {
        meta = {};
    }

    this.id = id;
    this.title = title;
    this.seconds = seconds;
    this.type = type;
    this.object = meta.object;
    this.params = meta.params;
    this.direct = meta.direct;
}
