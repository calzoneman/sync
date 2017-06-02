FROM alpine:3.6

ADD . /app

RUN cd app && sh container-install.sh

WORKDIR /app

ENV MYSQL_DATABASE cytube
ENV MYSQL_USER cytube
ENV MYSQL_PASSWORD nico_best_girl
ENV MYSQL_ROOT_PASSWORD ruby_best_girl

CMD ["sh", "run.sh"]
