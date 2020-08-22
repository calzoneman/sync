exports.o = function o(obj) {
    // Workaround for knex returning RowDataPacket and failing assertions
    return Object.assign({}, obj);
}
