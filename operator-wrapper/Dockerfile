FROM alpine

RUN apk update && apk add curl && apk add bash && apk add nodejs

WORKDIR /wrap

COPY ./down.js .
COPY ./up.js .

ENTRYPOINT ["/bin/bash"]
