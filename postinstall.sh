#!/bin/sh

set -e

if ! command -v npm >/dev/null; then
    echo "Could not find npm in \$PATH"
    exit 1
fi

echo "Building from src/ to lib/"
npm run build-server
echo "Building from player/ to www/js/player.js"
npm run build-player
echo "Done"
