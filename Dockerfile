FROM node:20

RUN apt update && apt install -y build-essential git wget

COPY ./ /app
WORKDIR /app

RUN rm -rf node_modules lib package-lock.json
RUN npm cache clean --force
RUN npm install
RUN /bin/sh /app/postinstall.sh
RUN npm run build-server
RUN npm rebuild

RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

CMD ["node", "index.js"]