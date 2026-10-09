FROM node:22-alpine

# The app shells out to the real curl binary (Node's fetch gets blocked by ZaubaCorp).
# Keep curl recent: older builds (e.g. 7.88 on Debian bookworm) get a 403 from Cloudflare.
RUN apk add --no-cache curl ca-certificates

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY MCAData.js ./

ENV NODE_ENV=production \
    PORT=4000

EXPOSE 4000

USER node

CMD ["node", "MCAData.js"]
