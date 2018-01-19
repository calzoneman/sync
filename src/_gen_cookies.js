const fs = require('fs');
require('./config').load('config.yaml');
const session = require('./session');

const users = String(fs.readFileSync('/home/calvin/tmp/cytube_startup.txt'))
        .split('\n')
        .filter(ln => /logged in as/.test(ln))
        .map(ln => {
            const m = ln.match(/(\S+) logged in as (\S+)/);
            return { ip: m[1], name: m[2] };
        });

const ip2chan = new Map();

String(fs.readFileSync('/home/calvin/tmp/cytube_startup.txt'))
        .split('\n')
        .filter(ln => /joined/.test(ln))
        .map(ln => {
            const m = ln.match(/(\S+) joined (\S+)/);
            ip2chan.set(m[1], m[2]);
        });

const db = require('./database');
db.init();

function next() {
    if (!users.length) return;

    const { ip, name } = users.shift();
    db.users.getUser(name, (err, u) => {
        if (err === 'User does not exist') {
            process.nextTick(next);
            return;
        }

        if (err) throw err;

        session.genSession(u, Date.now() + 24 * 3600 * 1000, (err, s) => {
            if (err) throw err;

            if (ip2chan.has(ip)) {
                //s = require('cookie-signature').sign(s, 'change-me');
                console.log(`${ip}\t${name}\t${s}\t${ip2chan.get(ip)}`);
            }

            process.nextTick(next);
        });
    });
}

next();
