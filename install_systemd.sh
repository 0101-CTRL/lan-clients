#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="api-v3-lan-clients-ui"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8093}"
HOST="${HOST:-0.0.0.0}"

if [ "${EUID}" -ne 0 ]; then
  echo "Please run with sudo: sudo ./install_systemd.sh"
  exit 1
fi

RUN_AS_USER="${SUDO_USER:-ubuntu}"
if ! id "${RUN_AS_USER}" >/dev/null 2>&1; then
  echo "Could not find Linux user: ${RUN_AS_USER}"
  echo "Run with: sudo RUN_AS_USER=<user> ./install_systemd.sh"
  exit 1
fi

RUN_AS_GROUP="$(id -gn "${RUN_AS_USER}")"

chown -R "${RUN_AS_USER}:${RUN_AS_GROUP}" "${APP_DIR}"
chmod +x "${APP_DIR}/run_local.sh"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<SERVICE
[Unit]
Description=APIv3 LAN Clients Console
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=HOST=${HOST}
Environment=PORT=${PORT}
ExecStart=${APP_DIR}/run_local.sh
Restart=always
RestartSec=3
User=${RUN_AS_USER}
Group=${RUN_AS_GROUP}

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

echo "Installed and started ${SERVICE_NAME}."
echo "Open: http://<server-ip>:${PORT}"
echo "Status: sudo systemctl status ${SERVICE_NAME} --no-pager -l"
