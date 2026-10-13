FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY web ./web
ENV DATA_DIR=/data PORT=8080
USER 3033:3033
EXPOSE 8080
ENTRYPOINT ["node", "server.js"]
