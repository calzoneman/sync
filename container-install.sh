#!/bin/sh

apk update
apk add build-base python3 git npm mysql mysql-client curl gettext ffmpeg
npm install npm@latest -g
npm install
npm run build-server
