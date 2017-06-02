FROM alpine:3.6

ADD . /app

RUN cd app && sh container-install.sh

WORKDIR /app

ENV MYSQL_HOST localhost
ENV MYSQL_PORT 3306
ENV MYSQL_DATABASE cytube
ENV MYSQL_USER cytube
ENV MYSQL_PASSWORD nico_best_girl
ENV MYSQL_ROOT_PASSWORD ruby_best_girl
ENV SYNC_TITLE Sync
ENV SYNC_DESCRIPTION Sync Video
ENV ROOT_URL http://localhost:8080
ENV ROOT_PORT 8080
ENV IO_ROOT_URL http://localhost
ENV IO_ROOT_PORT 1337
ENV ROOT_DOMAIN localhost:8080
ENV HTTPS_ENABLED false
ENV TRUST_ALL_PROXIES false
#ENV YOUTUBE_KEY
#ENV TWITCH_CLIENT_ID

EXPOSE 8080
# EXPOSE 1337
# EXPOSE 8443

ADD conf /app/conf
ADD config.template.docker.yaml /app/config.template.yaml
ADD run.sh /app/run.sh

WORKDIR /app

CMD ["sh", "run.sh"]
