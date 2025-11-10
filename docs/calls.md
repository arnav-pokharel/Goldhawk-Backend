# Call API Overview

These endpoints replace the legacy Jitsi meeting routes and power the WebRTC call flow shared with the signaling service.

## REST Endpoints

- `POST /api/calls/start` – create an active meeting log and return a `call.id` for signaling.
- `POST /api/calls/end` – mark a call finished and optionally attach transcript/recording URLs.
- `PATCH /api/calls` – update transcript, recording URL, status, or `endedAt` once processing completes.
- `GET /api/calls/:dealId/history` – list call attempts for a deal (most recent first).
- `POST /api/calls/turn` – issue temporary TURN credentials for the caller/callee.

All routes require the authenticated user to be the startup or investor tied to the `deal` record.

## Environment

Configure these variables in the backend runtime so `/api/calls/turn` can relay media across restrictive networks:

- `TURN_SHARED_SECRET` – shared key used to sign temporary TURN usernames.
- `TURN_URLS` – comma-separated STUN/TURN URIs (e.g. `stun:stun.l.google.com:19302,turn:turn.example.com:3478`).
- `TURN_TTL_SECONDS` – optional lifetime for issued credentials (defaults to 3600 seconds).

The signaling service also expects a matching `JWT_SECRET/SESSION_SECRET` so frontend tokens can be validated consistently.
