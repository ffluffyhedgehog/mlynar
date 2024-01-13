FROM node:20-alpine As build

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./

# In order to run `npm run build` we need access to the Nest CLI which is a dev dependency. In the previous development stage we ran `npm ci` which installed all dependencies, so we can copy over the node_modules directory from the development image
RUN npm ci

COPY --chown=node:node . .

# Run the build command which creates the production bundle
RUN npm run build

# Set NODE_ENV environment variable
ENV NODE_ENV production

USER node

FROM node:18-alpine As production

# Copy the bundled code from the build stage to the production image
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist

ARG MLYNAR_VERSION
ENV MLYNAR_VERSION=$MLYNAR_VERSION


# Start the server using the production build
CMD [ "node", "dist/main.js" ]