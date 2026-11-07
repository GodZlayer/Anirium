FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY manifest.json ./
ENV PORT=4006
EXPOSE 4006
CMD ["node", "server.js"]
