export function ackOrErrorMsg(ack, user) {
    if (typeof ack === 'function') {
        return ack;
    }

    return (result) => {
        if (result.error) {
            user.socket.emit('errorMsg', { msg: result.error.message });
        }
    };
}