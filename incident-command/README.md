# Incident Command

A self-contained, zero-dependency incident console you can extract anywhere and run locally.
Declare incidents, set severity and status, assign IC / comms / ops, and keep a timestamped timeline.

## Run it

Extract the archive, then from the `incident-command` folder:

| Platform | Command |
| --- | --- |
| macOS / Linux | `./start.sh` (or double-click `start.command` on macOS) |
| Windows | `start.bat` (double-click works) |
| Any | `node server.js` |

The script starts the server on `http://127.0.0.1:4173` (next free port if busy) and opens your
browser automatically. Requires Node.js 18+; nothing to install.

`index.html` at the archive root is a launcher: open it and it redirects to the running server,
or opens the app in offline mode if no server is up. A browser page cannot spawn a process, so
the server itself must be started by one of the commands above.

## Storage

- Server running: incidents persist to `data/incidents.json` (plain JSON, easy to diff or back up).
- Offline mode: incidents persist to browser localStorage.
- `Export JSON` / `Import JSON` move data between the two.

## Layout

```
incident-command/
  index.html        launcher page
  server.js         static file server + /api/incidents (GET/PUT)
  public/           the app (index.html, app.js, styles.css)
  data/             incidents.json, created on first save
  start.sh / start.command / start.bat
```

## Environment

- `PORT` — starting port (default 4173)
- `NO_OPEN=1` — do not open a browser on start
