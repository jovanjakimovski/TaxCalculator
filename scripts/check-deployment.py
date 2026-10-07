"""Validate production settings without printing secret values. No network calls."""
import ipaddress
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

values = {}
env_file = Path(sys.argv[1] if len(sys.argv) > 1 else ".env")
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip("\"'")
values.update(os.environ)
errors = []
def need(key):
    value = values.get(key, "")
    if not value or any(marker in value.upper() for marker in ("YOUR_", "REGION", "REPLACE", "EXAMPLE.COM")):
        errors.append(f"Set {key} to a real deployment value.")
    return value
for key in ("POSTGRES_PASSWORD", "LICENSE_DB_PASSWORD", "LEMON_SQUEEZY_API_KEY", "LEMON_SQUEEZY_WEBHOOK_SECRET"):
    value = need(key)
    if len(value) < 24 or "test-only" in value or "local-only" in value:
        errors.append(f"Use a strong production secret for {key} (at least 24 characters).")
if values.get("POSTGRES_PASSWORD") == values.get("LICENSE_DB_PASSWORD"):
    errors.append("Use different database passwords.")
for key in ("LICENSE_TEST_MODE", "PAYMENT_TEST_MODE", "LICENSE_ALLOW_ANONYMOUS_CHECKOUT"):
    if values.get(key, "false").lower() != "false": errors.append(f"Disable {key} in production.")
if values.get("LICENSE_REQUIRE_ACCOUNT_AUTH", "true").lower() != "true": errors.append("Require account authentication in production.")
for key in ("LEMON_SQUEEZY_STORE_ID", "LEMON_SQUEEZY_VARIANT_ID", "LEMON_SQUEEZY_VARIANT_TWO_ID", "LEMON_SQUEEZY_VARIANT_THREE_ID"):
    if not re.fullmatch(r"[1-9][0-9]*", need(key)): errors.append(f"Use a numeric provider ID for {key}.")
variants = [values.get(key) for key in ("LEMON_SQUEEZY_VARIANT_ID", "LEMON_SQUEEZY_VARIANT_TWO_ID", "LEMON_SQUEEZY_VARIANT_THREE_ID")]
if len(set(variants)) != 3: errors.append("Use three distinct payment variants.")
app = urlparse(need("APP_PUBLIC_URL"))
if app.scheme != "https" or not app.hostname or app.hostname in ("localhost", "127.0.0.1") or app.path not in ("", "/") or app.query or app.fragment or app.username:
    errors.append("APP_PUBLIC_URL must be a public HTTPS origin.")
for key, path in (("COGNITO_REDIRECT_URI", "/auth/callback"), ("COGNITO_LOGOUT_REDIRECT_URI", "/")):
    value = urlparse(need(key))
    if value.scheme != "https" or value.netloc != app.netloc or value.path != path or value.query or value.fragment:
        errors.append(f"{key} must exactly match the app origin and {path}.")
issuer = urlparse(need("COGNITO_ISSUER_URI"))
origin = urlparse(need("COGNITO_IDP_ORIGIN"))
if issuer.scheme != "https" or not re.fullmatch(r"cognito-idp\.[a-z0-9-]+\.amazonaws\.com", issuer.netloc) or not issuer.path.strip("/"):
    errors.append("Use the Cognito user-pool issuer, not the hosted UI, for COGNITO_ISSUER_URI.")
if origin.scheme != "https" or origin.netloc != issuer.netloc or origin.path not in ("", "/"):
    errors.append("COGNITO_IDP_ORIGIN must match the issuer origin for CSP.")
hosted = urlparse(need("COGNITO_HOSTED_UI_AUTHORITY"))
if hosted.scheme != "https" or not hosted.hostname or not hosted.hostname.endswith(".amazoncognito.com"):
    errors.append("Use the Cognito managed hosted-UI HTTPS URL.")
need("COGNITO_APP_CLIENT_ID")
if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", need("SUPPORT_EMAIL")):
    errors.append("Set a working SUPPORT_EMAIL for real users.")
try:
    network = ipaddress.ip_network(need("TRUSTED_PROXY_CIDR"))
    if network.prefixlen == 0: errors.append("Do not trust all networks for forwarded client IPs.")
except ValueError: errors.append("TRUSTED_PROXY_CIDR must be the trusted proxy subnet.")
if errors:
    print("Production configuration needs attention:")
    for error in dict.fromkeys(errors): print(f"- {error}")
    sys.exit(1)
print("Production configuration validation passed. Verify live sign-in, payment, refund, email delivery, HTTPS, and backups before opening to users.")
