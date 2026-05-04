const registry = new Map(); // botId -> Set<socket>

function register(botId, socket) {
    if (!registry.has(botId)) {
        registry.set(botId, new Set());
    }
    registry.get(botId).add(socket);
    socket.once('disconnect', () => {
        const sockets = registry.get(botId);
        if (sockets) {
            sockets.delete(socket);
            if (sockets.size === 0) {
                registry.delete(botId);
            }
        }
    });
}

function disconnect(botId) {
    const sockets = registry.get(botId);
    if (sockets) {
        for (const socket of sockets) {
            socket.disconnect(true);
        }
        registry.delete(botId);
    }
}

module.exports = { register, disconnect };
