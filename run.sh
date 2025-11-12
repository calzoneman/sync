#!/bin/sh

envsubst < config.template.yaml > config.yaml

while :
do
    node index.js
    sleep 2
done
