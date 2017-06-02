#!/bin/sh

apk update
apk add build-base python git nodejs nodejs-npm mysql mysql-client curl gettext
npm install npm@latest -g
npm install
npm run build-server


