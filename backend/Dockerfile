FROM golang:1.22-alpine AS build

WORKDIR /src

RUN apk add --no-cache git

COPY go.mod go.sum ./
COPY third_party ./third_party
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/server ./main.go

FROM alpine:3.20

RUN addgroup -S app && adduser -S app -G app
RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=build /out/server /app/server

USER app
EXPOSE 8080
ENV PORT=8080

CMD ["/app/server"]
