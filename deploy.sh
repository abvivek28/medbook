#!/bin/bash
# ── MedBook Deployment Script (Amazon Linux Version) ──────────────────────────
set -e

echo "==== MedBook Deployment Starting ===="

# 1. Update system and install Amazon Linux extras
sudo yum update -y -qq
sudo yum install -y python3 python3-pip git nginx

# 2. Clone or update project
# Note: Using /home/ec2-user/medbook instead of /opt to avoid permission headaches
PROJECT_DIR="/home/ec2-user/medbook"

if [ -d "$PROJECT_DIR" ]; then
  echo "Updating existing installation..."
  cd $PROJECT_DIR && git pull
else
  echo "Fresh installation..."
  # REPLACE 'YOUR_USERNAME' with 'abvivek28' below
  git clone https://github.com/abvivek28/medbook.git $PROJECT_DIR
fi

cd $PROJECT_DIR

# 3. Set up Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
# Ensure we are in the backend folder if requirements are there
pip install --upgrade pip
pip install -r backend/requirements.txt --quiet

# 4. Create .env if it doesn't exist
if [ ! -f "backend/.env" ]; then
  # Adjusting path to backend where FastAPI usually looks
  cp backend/.env.example backend/.env || touch backend/.env
  SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  echo "SECRET_KEY=$SECRET" >> backend/.env
  echo "Created .env with random SECRET_KEY"
fi

# 5. Create systemd service
sudo tee /etc/systemd/system/medbook.service > /dev/null << SERVICE
[Unit]
Description=MedBook FastAPI Application
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=$PROJECT_DIR/backend
Environment="PATH=$PROJECT_DIR/.venv/bin"
ExecStart=$PROJECT_DIR/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable medbook
sudo systemctl restart medbook

# 6. Configure Nginx as reverse proxy (Amazon Linux Style)
# Amazon Linux usually doesn't use 'sites-available', it uses /etc/nginx/conf.d/
sudo tee /etc/nginx/conf.d/medbook.conf > /dev/null << NGINX
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

sudo systemctl enable nginx
sudo systemctl restart nginx

echo ""
echo "==== Deployment Complete ===="
echo "App is running at: http://$(curl -s ifconfig.me)"