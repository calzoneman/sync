#!/bin/sh

envsubst < config.template.yaml > config.yaml

mysqld --user=root &
while :
do
    node index.js
    sleep 2
done
