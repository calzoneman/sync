Docker
------

Cytube can be deployed using Docker.

TL;DR
-----

Example for using the dockerfile on this repo.

```
docker build -t sync .
docker network create sync

docker run -d --name sync-db \
-e MARIADB_ROOT_PASSWORD='abcdefg123456' \
-e MARIADB_DATABASE=cytube \
-e MARIADB_USER=cytube \
-e MARIADB_PASSWORD=aaaaa \
--network sync mariadb

docker run -d --name sync-web \
-e MYSQL_HOST=sync-db \
-e MYSQL_PASSWORD=aaaaa \
-e ROOT_URL=https://cytube.my.domain \
-e IO_ROOT_URL=https://cytube.my.domain \
-e ROOT_DOMAIN=cytube.my.domain \
-e VIRTUAL_HOST=cytube.my.domain \
-e VIRTUAL_PORT=8080 \
-e LETSENCRYPT_HOST=cytube.my.domain \
-e YOUTUBE_KEY=abcdefg \
--network sync sync
```

Explanation
-----------

TODO
