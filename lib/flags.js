module.exports = {
    C_READY      : 1 << 0,
    C_ERROR      : 1 << 1,
    C_REGISTERED : 1 << 2,

    U_READY      : 1 << 0,
    U_LOGGING_IN : 1 << 1,
    U_LOGGED_IN  : 1 << 2,
    U_REGISTERED : 1 << 3,
    U_AFK        : 1 << 4,
    U_MUTED      : 1 << 5,
    U_SMUTED     : 1 << 6,
    U_IN_CHANNEL : 1 << 7
};
