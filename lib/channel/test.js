var ChannelModule = require("./module");

function TestModule(channel) {
    ChannelModule.apply(this, arguments);
}

TestModule.prototype = Object.create(ChannelModule);

TestModule.prototype.load = function (data) {
    console.log('TestModule load');
};

TestModule.prototype.save = function (data) {
    console.log('TestModule save');
};

module.exports = TestModule;
