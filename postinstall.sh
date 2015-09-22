#!/bin/sh

echo "In order to run the server, the source files in src/ must be transpiled to lib/.  This will overwrite any changes you have made to the files in lib/."
echo -n "Do you want to build now? [y/N]? "
read answer
echo

if test "$answer" = "y" || test "$answer" = "Y"; then
    echo "Running $npm_package_scripts_build_server"
    $npm_package_scripts_build_server
else
    echo "Skipping build step.  You can build at a later time by running \`npm run build-server\`."
fi
