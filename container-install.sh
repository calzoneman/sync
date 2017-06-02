#!/bin/sh

apk update
apk build-base python git add nodejs nodejs-npm mysql mysql-client curl
npm install npm@latest -g
npm install

