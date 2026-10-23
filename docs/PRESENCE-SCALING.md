# Live board presence: scaling

Presence is the live-board relay on `/collab/board`. It carries remote cursors, card locks, selection
outlines and drag ghosts for the project board's Tasks tab. The default runs it inside the API process.
Use this runbook only when one API process is not enough.

## What scales

Only presence moves out. The API, crons, SSE, Slack and Hocuspocus collab stay single-process.

Presence workers hold sockets, rooms and locks. A family (a root project plus its direct sub-projects)
lives on exactly one worker, so its locks and drag events stay consistent.

## Steps

1. Run N workers with pm2 in **fork** mode on distinct ports: `PRESENCE_PORT=3101` through
   `PRESENCE_PORT=310N`. Do not use cluster mode. It round-robins sockets across workers and breaks
   family stickiness.
2. Set `PRESENCE_MODE=standalone` on the API.
3. Add the nginx block below.
4. Reload nginx, then restart the API.

Workers need the same `DATABASE_URL` and Prisma environment as the API. Start one with
`npm run presence` (tsx) or `npm run presence:start` (built `dist/`).

## nginx block

Place the `location /collab/board` block **before** the existing `location /collab/` block.
Copy the upgrade headers and timeouts from your `location /collab/` block. The values below show the shape.

```nginx
upstream presence {
    hash $arg_root consistent;
    server 127.0.0.1:3101;
    server 127.0.0.1:3102;
    # one server line per worker
}

location /collab/board {
    proxy_pass http://presence;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    # copy proxy_read_timeout / proxy_send_timeout from location /collab/
}
```

`hash $arg_root consistent` keeps every room of one family on the same worker, because the client
sends `root` in the URL.

## Rollback

1. Unset `PRESENCE_MODE` on the API and restart it. The relay runs inside the API again.
2. Remove the `location /collab/board` block and the `upstream presence` block.
3. Reload nginx.
4. Stop the presence workers.

## What happens during resharding

Adding or removing a worker moves some families to another worker. Their sockets reconnect, and
the client rejoins its room.

Locks survive. Each lock mirrors into the `BoardLock` table, so a card that someone is dragging stays
locked through the move.
