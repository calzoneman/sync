FROM alpine:3.6

ADD . /app

RUN cd app && sh container-install.sh

WORKDIR /app

CMD ["node", "index.js"]
