function PermissionSet(defaults, permissions) {
    this.permissions = {};
    for (var key in defaults) {
        if (key in permissions) {
            this.permissions[key] = permissions[key];
        } else {
            this.permissions[key] = defaults[key];
        }
    }
}
