#!/bin/sh

set -e

echo "Building from src/ to lib/"
$npm_package_scripts_build_server
echo "Building from player/ to www/js/player.js"
$npm_package_scripts_build_player
echo "Done"
