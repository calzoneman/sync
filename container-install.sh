#!/bin/sh

apk update
apk add build-base python git nodejs nodejs-npm mysql mysql-client curl
npm install npm@latest -g
npm install

