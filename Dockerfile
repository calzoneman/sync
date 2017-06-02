FROM alpine:3.6

ADD . /app

RUN cd app && sh container-install.sh

WORKDIR /app

ENV MYSQL_DATABASE cytube
ENV MYSQL_USER cytube
ENV MYSQL_PASSWORD nico_best_girl
ENV MYSQL_ROOT_PASSWORD ruby_best_girl
ENV SYNC_TITLE Sync
ENV SYNC_DESCRIPTION Sync Video
ENV ROOT_URL http://localhost:8080
ENV ROOT_DOMAIN localhost:8080
ENV HTTPS_ENABLED false
#ENV YOUTUBE_KEY
#ENV TWITCH_CLIENT_ID

EXPOSE 8080

CMD ["sh", "run.sh"]
