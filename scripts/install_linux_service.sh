#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo."
  exit 1
fi

install -d -o root -g root /opt/justshare
cp -R justshare requirements.txt run_justshare.sh /opt/justshare/
python3 -m venv /opt/justshare/.venv
/opt/justshare/.venv/bin/python -m pip install -r /opt/justshare/requirements.txt
id justshare >/dev/null 2>&1 || useradd --system --home /opt/justshare --shell /usr/sbin/nologin justshare
chown -R justshare:justshare /opt/justshare
cp deploy/justshare.service /etc/systemd/system/justshare.service
systemctl daemon-reload
systemctl enable --now justshare
echo "JustShare service installed. Check logs with: journalctl -u justshare -f"
