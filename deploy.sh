#!/bin/bash
# ── MedBook Deployment Script ─────────────────────────────────────────────────
# Run this once on a fresh Ubuntu 22.04 server (AWS EC2, GCP VM, etc.)
# Usage: bash deploy.sh
set -e

echo "==== MedBook Deployment Starting ===="

# 1. Update system
sudo apt-get update -qq
sudo apt-get install -y python3 python3-pip python3-venv git nginx

# 2. Clone or update project
if [ -d "/opt/medbook" ]; then
  echo "Updating existing installation..."
  cd /opt/medbook && git pull
else
  echo "Fresh installation..."
  sudo git clone https://github.com/YOUR_USERNAME/medbook.git /opt/medbook
  sudo chown -R $USER:$USER /opt/medbook
fi

cd /opt/medbook

# 3. Set up Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt --quiet

# 4. Create .env if it doesn't exist
if [ ! -f ".env" ]; then
  cp .env.example .env
  # Generate a random secret key
  SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  sed -i "s/replace-this-with-a-random-32-character-string/$SECRET/" .env
  echo "Created .env with random SECRET_KEY"
fi

# 5. Create systemd service so app runs on boot and restarts on crash
sudo tee /etc/systemd/system/medbook.service > /dev/null << SERVICE
[Unit]
Description=MedBook FastAPI Application
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/medbook/backend
Environment="PATH=/opt/medbook/.venv/bin"
ExecStart=/opt/medbook/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable medbook
sudo systemctl restart medbook

# 6. Configure Nginx as reverse proxy
sudo tee /etc/nginx/sites-available/medbook > /dev/null << NGINX
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/medbook /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

echo ""
echo "==== Deployment Complete ===="
echo "App is running at: http://$(curl -s ifconfig.me)"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status medbook   # check if app is running"
echo "  sudo journalctl -u medbook -f   # view live logs"
echo "  sudo systemctl restart medbook  # restart app"