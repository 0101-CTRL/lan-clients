# APIv3 LAN Clients Console

Standalone local UI for testing the internal-beta Ericsson / Cradlepoint `lan_clients` APIv3 endpoint.

Endpoint used by this console:

```text
GET https://api.cradlepointecm.com/api/v3/beta/lan_clients
```

The UI is intentionally local-first: your browser talks to the local FastAPI app, and the FastAPI app calls NCM. The bearer token is never written to server logs by this app. Token persistence is browser-local only and optional.

## What it does

- Checks whether a bearer token can reach the `lan_clients` endpoint.
- Lists LAN clients returned by `/api/v3/beta/lan_clients`.
- Supports the documented filters:
  - `filter[router]=1,2`
  - `filter[hostname]=host1,host2`
  - `filter[network_type]=ethernet,wifi`
- Shows summary cards for loaded clients, Wi-Fi count, Ethernet count, average Wi-Fi RSSI, stale reports, and unique routers.
- Highlights Wi-Fi signal quality based on RSSI.
- Shows router relationship ID and tenant relationship ID in the JSON detail view.
- Exports loaded rows to CSV or the full response envelope to JSON.
- Generates a copyable redacted curl command.
- Supports `meta.pagination.before` and `meta.pagination.after` cursors when NCM returns them.

## Important endpoint notes

The `lan_clients` endpoint is internal beta and is not available to all customers. A `403 Forbidden` usually means the token/account does not have access to this beta endpoint.

The endpoint docs list `GET 201 Created` as the success response. This console treats both `200` and `201` as success.

For wireless clients, `rxrate` and `txrate` are last reported values based on the data-update interval, not actual live throughput.

## Run locally

```bash
cd api-v3-lan-clients-ui
./run_local.sh
```

Default port:

```text
http://localhost:8093
```

Override host/port:

```bash
HOST=0.0.0.0 PORT=8093 ./run_local.sh
```

## Install under /opt

```bash
sudo mkdir -p /opt/api-v3-lan-clients-ui && sudo cp -a . /opt/api-v3-lan-clients-ui/ && sudo chown -R "$USER":"$USER" /opt/api-v3-lan-clients-ui && cd /opt/api-v3-lan-clients-ui && ./run_local.sh
```

## Optional systemd service

```bash
sudo cp api-v3-lan-clients-ui.service.example /etc/systemd/system/api-v3-lan-clients-ui.service
sudo systemctl daemon-reload
sudo systemctl enable --now api-v3-lan-clients-ui
sudo systemctl status api-v3-lan-clients-ui --no-pager -l
```

Then open:

```text
http://<server-ip>:8093
```

## Project layout

```text
app.py
requirements.txt
run_local.sh
api-v3-lan-clients-ui.service.example
static/
  index.html
  app.js
  styles.css
```

## Troubleshooting

### 403 Forbidden

The endpoint is internal beta and may not be enabled for the account/token.

### 400 Bad Request

Check filter values. The documented network type values are `ethernet`, `wifi`, `bluetooth`, and `unknown`.

### No clients returned

Try removing filters first. The endpoint represents clients last known to the router, so an overly specific router, hostname, or network type filter can make the result look empty.

### Browser opens but requests fail

Check the terminal running `./run_local.sh` or systemd status output. The app calls NCM from the server where it is running, so that host needs outbound HTTPS access to `api.cradlepointecm.com`.


## v0.6 timestamp-source clarity

This patch avoids implying that `updated_at` is the same thing as a router LAN-client snapshot.

- Renames the table column to **Report timestamp**.
- Uses `collection_time` as the preferred router-report timestamp.
- Clearly labels rows where `collection_time` is missing and `updated_at` is being used as a lower-confidence fallback.
- Changes fallback activity labels to **Recently updated** / **Older record** instead of implying the client was seen in a router snapshot.
- Updates GET history to show the latest timestamp source.


## v0.8 timestamp source cleanup

This patch simplifies timestamp wording when `collection_time` is missing. Rows now show `Record updated` instead of `using updated_at fallback`, and the UI treats those rows as lower-confidence freshness estimates rather than confirmed router report timestamps.


## v0.9 timestamp-cell cleanup
- Reworked the table timestamp cell so fallback rows no longer stack three separate labels.
- Uses compact date text in the table, e.g. `Jul 6, 7:08 AM`.
- Shows a single subdued source note: `Record timestamp / collection_time not returned` or `Router report / collection_time`.


## v1.0 contextual hover help
- Added hover/focus help popups to ambiguous table headers and row values.
- Activity inference now explains whether it came from `collection_time` or the lower-confidence `updated_at` fallback.
- Timestamp cells now explain `collection_time` vs `updated_at` without forcing users to decode the raw field names.
- Added inline help for `connected_seconds`, Wi-Fi RSSI/status, and Wi-Fi last-reported rate values.


## v1.1 notes

- Removed native browser `title` tooltip text from inline help icons so Chrome no longer duplicates the custom hover popover.
- Added separate CSV exports for the currently shown client list and the full fetched client list.
- Client-list exports include timestamp source, timestamp age, activity inference, connected duration, router ID, network type, manufacturer, and Wi-Fi details when present.


## v1.2 CSV export cleanup

- Client exports now use an explicit `.csv` filename, UTF-8 BOM, and CRLF line endings for better Excel/Windows handling.
- Export buttons are labeled `Export shown CSV` and `Export fetched CSV`.
- GET history export now produces CSV instead of JSON.
- Raw API response remains available separately through `Export raw JSON`.
