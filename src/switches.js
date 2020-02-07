const switches = {
    plDirtyCheck: true,
    ytCache: true
};

export function isActive(switchName) {
    return switches.hasOwnProperty(switchName) && switches[switchName] === true;
}

export function setActive(switchName, active) {
    switches[switchName] = active;
}
