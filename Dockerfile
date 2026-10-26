# The image the ACM cluster runs. Built by GitHub Actions (.github/workflows/build.yml).
FROM node:24-alpine

ENV NODE_ENV=production

# tini passes stop signals to Node, so the pod shuts down promptly.
# User 10001 matches the pod's securityContext (and the ACM Member Portal's).
RUN apk add --no-cache tini \
 && addgroup -S -g 10001 app && adduser -S -u 10001 -G app app

WORKDIR /app

# Install only what the game needs, exactly as the lock file says. Copying these two
# files first lets Docker reuse this slow step when only the code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=app:app . .

# The only writable folder: the saved game and uploaded questions. On the cluster a
# persistent volume is mounted here.
RUN mkdir -p /app/data && chown app:app /app/data

USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# Not "npm start": in the container there is no .env; settings come from the environment.
CMD ["node", "server.js"]
