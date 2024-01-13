FROM node:20-alpine As build

WORKDIR /app

COPY --chown=node:node . .

USER node

ENTRYPOINT [ "node", "sum.js" ]
