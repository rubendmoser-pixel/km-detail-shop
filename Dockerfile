FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /data/uploads

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/km-detail.sqlite
ENV UPLOADS_PATH=/data/uploads

EXPOSE 3000

CMD ["npm", "run", "start:production"]
