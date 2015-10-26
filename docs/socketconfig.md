Socket.IO Client Configuration
==============================

As of 2015-10-25, the legacy `/sioconfig` JavaScript for retrieving connection
information is being deprecated in favor of a new API.  The purpose of this
change is to allow partitioning channels across multiple servers in order to
better handle increasing traffic.

To get the socket.io configuration for the server hosting a particular channel,
make a `GET` request to `/socketconfig/<channel name>.json`.  The response will
be a JSON object containing a list of acceptable servers to connect to, or an
error message.

Examples:

```
GET /socketconfig/test.json
200 OK

{
    "servers": [
        {
            "url": "https://localhost:8443",
            "secure": true
        },
        {
            "url": "http://localhost:1337",
            "secure": false
        },
        {
            "url": "https://local6:8443",
            "secure": true,
            "ipv6": true
        },
        {
            "url": "http://local6:1337",
            "secure": false,
            "ipv6": true
        }
    ]
}

GET /socketconfig/$invalid$.json
404 Not Found

{
    "error": "Channel \"$invalid$\" does not exist."
}
```

Each entry in the `servers` array has `"secure":true` if the connection is
secured with TLS, otherwise it it is false.  An entry with `"ipv6":true`
indicates that the server is listening on the IPv6 protocol.

You can pick any URL to connect socket.io to in order to join the specified
channel.  I recommend picking one with `"secure":true`, only choosing an
insecure connection if implementing a TLS connection is infeasible.
