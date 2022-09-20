FROM alpine

ADD bin /app/bin
ADD gdrive-userscript /app/gdrive-userscript
ADD player /app/player
ADD src /app/src
ADD templates /app/templates
ADD www /app/www
ADD .eslintrc.js /app/.eslintrc.js
ADD index.js /app/index.js
ADD package.json /app/package.json
ADD package-lock.json /app/package-lock.json
ADD postinstall.sh /app/postinstall.sh
ADD servcmd.sh.js /app/servcmd.sh.js
ADD container-install.sh /app/container-install.sh

RUN cd app && sh container-install.sh

ENV MYSQL_HOST localhost
ENV MYSQL_PORT 3306
ENV MYSQL_DATABASE cytube
ENV MYSQL_USER cytube
ENV MYSQL_PASSWORD nico_best_girl
ENV SYNC_TITLE Sync
ENV SYNC_DESCRIPTION Sync Video
ENV ROOT_URL http://localhost:8080
ENV ROOT_PORT 8080
ENV IO_ROOT_URL http://localhost
ENV IO_ROOT_PORT 1337
ENV ROOT_DOMAIN localhost:8080
ENV HTTPS_ENABLED false
ENV COOKIE_SECRET aaa
ENV IMMEDIATE_PROXY 172.16.0.0/12
#ENV YOUTUBE_KEY
#ENV TWITCH_CLIENT_ID

EXPOSE 8080
EXPOSE 1337
# EXPOSE 8443

ADD conf /app/conf
ADD config.template.docker.yaml /app/config.template.yaml
ADD run.sh /app/run.sh

WORKDIR /app

CMD ["sh", "run.sh"]
