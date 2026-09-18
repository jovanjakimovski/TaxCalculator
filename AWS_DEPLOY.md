# AWS deployment

This setup runs the frontend, Spring Boot API, and PostgreSQL on one EC2 instance. Only the frontend port is public.

## 1. Create the EC2 instance

1. In AWS EC2, launch an Ubuntu instance eligible for your Free Tier.
2. Create or select a key pair.
3. In the security group, allow:
   - SSH `22` from your IP only
   - HTTP `80` from anywhere
4. Do not open ports `5432` or `8080`.

## 2. Install Docker

SSH into the instance and run:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
exit
```

Reconnect over SSH after the `exit` so the Docker group takes effect.

## 3. Start the application

```bash
git clone YOUR_REPOSITORY_URL tax-calculator
cd tax-calculator
cp .env.example .env
nano .env
```

Set `POSTGRES_PASSWORD` to a long random password, then run:

```bash
docker compose -f docker-compose.aws.yml up -d --build
```

Open the EC2 public IPv4 address in your browser:

```text
http://YOUR_EC2_PUBLIC_IP/
```

## Useful commands

```bash
# View service status
docker compose -f docker-compose.aws.yml ps

# View logs
docker compose -f docker-compose.aws.yml logs -f

# Update after a code change
git pull
docker compose -f docker-compose.aws.yml up -d --build
```

PostgreSQL data is stored in the `postgres_data` Docker volume and survives container rebuilds. Do not run `docker compose down -v` unless you intentionally want to delete the database.

For production, add HTTPS with a domain and a certificate before sharing the app publicly. Also create an AWS Budget alert so accidental usage cannot surprise you.
