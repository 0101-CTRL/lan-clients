# APIv3 LAN Clients Console

A lightweight local web UI for testing and exploring the Cradlepoint / Ericsson NCM APIv3 beta `lan_clients` endpoint.

This tool helps users query LAN client records without manually building APIv3 curl requests.

> Important: `lan_clients` is an internal beta endpoint and may not be available to all customers.

---

## What this tool does

- Queries the APIv3 beta `lan_clients` endpoint
- Filters by router ID, hostname, and network type
- Shows known LAN clients behind a router
- Displays hostname, IP address, MAC address, manufacturer, router ID, and connection type
- Displays Wi-Fi details when available, such as RSSI, SSID, band, RX rate, and TX rate
- Separates recently updated records from older/stale records
- Shows actual GET request history
- Exports shown or fetched client rows to CSV
- Shows raw JSON responses for troubleshooting

---

## What this tool does not do

This tool does not force a router-side LAN client rescan.

A refresh in the UI only sends another GET request to NCM. If NCM has not received newer LAN client information, the returned data may not change.

The endpoint should not be treated as a real-time connected-client feed.

---

## Endpoint

Base endpoint:

```text
https://api.cradlepointecm.com/api/v3/beta/lan_clients
```

Common filters:

```text
filter[router]=1234567
filter[hostname]=example-host
filter[network_type]=ethernet,wifi,bluetooth,unknown
```

---

## Quick install

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip curl

cd /home/ubuntu
git clone https://github.com/0101-CTRL/lan-clients.git

sudo rm -rf /opt/api-v3-lan-clients-ui
sudo mkdir -p /opt/api-v3-lan-clients-ui
sudo cp -a lan-clients/. /opt/api-v3-lan-clients-ui/
sudo chown -R ubuntu:ubuntu /opt/api-v3-lan-clients-ui
```

---

## Run manually

```bash
cd /opt/api-v3-lan-clients-ui
PORT=8093 ./run_local.sh
```

Open:

```text
http://<server-ip>:8093
```

---

## Run with systemd

```bash
cd /opt/api-v3-lan-clients-ui
sudo ./install_systemd.sh
```

Check status:

```bash
sudo systemctl status api-v3-lan-clients-ui --no-pager -l
```

Restart:

```bash
sudo systemctl restart api-v3-lan-clients-ui
```

Follow logs:

```bash
sudo journalctl -u api-v3-lan-clients-ui -f
```

Open:

```text
http://<server-ip>:8093
```

---

## Public server safety

This UI accepts a bearer token in the browser.

Do not expose it broadly on the public internet without protection.

Recommended options:

- Restrict access with firewall rules
- Use an SSH tunnel
- Put the app behind HTTPS and authentication if exposing it long term

SSH tunnel example:

```bash
ssh -L 8093:127.0.0.1:8093 ubuntu@<server-ip>
```

Then open locally:

```text
http://127.0.0.1:8093
```

---

# LAN Clients Endpoint FAQ

## What does the endpoint return?

The `lan_clients` endpoint returns LAN client records NCM currently has stored.

A good way to describe it:

```text
What LAN clients does NCM know about for this router?
```

It should not automatically be interpreted as:

```text
What clients are connected this exact second?
```

---

## Is this a live connected-client list?

Not exactly.

The endpoint does not expose a simple `connected=true` or `online=true` field.

The UI estimates freshness based on timestamps, but that estimate should not be treated as a guaranteed live connected/disconnected state.

---

## Why do I see more clients than are actually connected?

Because the endpoint can include previously seen LAN clients.

Old phones, laptops, IoT devices, test clients, and other previously connected devices may continue to appear after they disconnect.

That is expected for a stored LAN client inventory-style endpoint.

---

## What does “Freshness estimate” mean?

The UI uses the best available timestamp to estimate whether a client record looks recent or stale.

This is an estimate only.

A recent timestamp is a useful freshness signal, but it does not absolutely prove the client is connected right now.

---

## What does “NCM record update” mean?

It means the endpoint returned an `updated_at` timestamp for the LAN client record.

In plain English:

```text
NCM last updated this stored client record at this time.
```

This is useful, but it is not the same thing as a guaranteed router-side “client was observed at this exact moment” timestamp.

---

## What is `collection_time`?

The endpoint documentation describes `collection_time` as the time when data was last received by the router.

If `collection_time` is returned, it is the best available router-report timestamp for that row.

However, some observed responses do not include `collection_time`. In those cases, the UI falls back to `updated_at`.

---

## What does `connected_seconds` mean?

It appears to represent how long the client had been connected at the time the record was reported or updated.

It should not be read as a live timer that continues counting in real time.

---

## Why do multiple clients have the same timestamp?

That likely means NCM updated multiple LAN client records as part of the same stored report or batch update.

It does not necessarily mean each client independently checked in at that exact second.

---

## How timely is the data?

The documented 5-minute vs. 60-minute cadence applies specifically to Wi-Fi rate values such as `rxrate` and `txrate`.

That documented interval should not automatically be applied to the entire LAN client record unless the API documentation explicitly says so.

For the broader LAN client record, the endpoint returns the latest stored information NCM has available. In testing, records often appear to update in batches and may look roughly hourly, but that should be treated as observed behavior rather than a guaranteed API interval or SLA.

---

## Can I force a LAN client refresh?

Not through this endpoint.

The endpoint only supports GET.

Running another GET retrieves the latest LAN client data NCM already has stored. It does not appear to force the router to rescan LAN clients.

---

## Why does clicking refresh not change the data?

Because the UI refresh only performs another API GET request.

If NCM has not received newer LAN client data, the timestamps and rows may stay the same.

---

## Why are Wi-Fi fields blank?

Wi-Fi-only fields such as RSSI, SSID, band, RX rate, and TX rate may be blank when:

- the client is not Wi-Fi
- the client is historical or stale
- the router did not report that value
- NCM does not currently have that value stored

Blank Wi-Fi fields do not always mean the client is broken or disconnected.

---

## Recommended wording

Use:

```text
Known LAN clients
Recently updated records
Previously seen clients
NCM record update
Freshness estimate
```

Avoid:

```text
Currently connected clients
Live clients
Guaranteed active
Real-time LAN clients
```

---

## Customer-facing explanation

At a high level, this endpoint gives us NCM’s latest stored view of LAN clients seen behind a router. The router reports client information into NCM, and the API lets us retrieve those stored records by router, hostname, or network type. It is useful for understanding what devices NCM knows about and when those records were last updated, but it should not be treated as a real-time feed of exactly who is connected at this second.

---

## CSV exports

The UI has two export options:

### Export shown CSV

Exports only the rows currently visible after UI filters are applied.

### Export fetched CSV

Exports every row returned by the current API page, even if the table filter is hiding some of them.

---

## Cleanup before committing changes

Avoid committing:

- API tokens
- `.env` files
- exported CSVs
- raw API responses
- GET history
- customer/router-specific data
- local backups
- virtual environments

Quick check:

```bash
grep -RInE "Bearer |Authorization|access_token|refresh_token|client_secret|api_key|token|password" . \
  --exclude-dir=.git \
  --exclude=.gitignore \
  --exclude=README.md || true
```

Browser-side token/history data can be cleared from the UI or with browser DevTools:

```javascript
localStorage.clear();
sessionStorage.clear();
```

---

## Availability note

This endpoint is internal beta and may not be available to all customers. Behavior may change as the API evolves.
