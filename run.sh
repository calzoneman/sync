#!/bin/sh
mysqld --user=root &
while :
do
    node index.js
    sleep 2
done
