#!/bin/sh
# Writes /tmp/runtime-config/config.js from the API_URL environment variable (read by src/api/client.ts).
# API_URL must be an origin such as https://api.example.com (no path, no credentials, no quotes).
set -eu

dir=/tmp/runtime-config
mkdir -p "$dir"
url="${API_URL:-}"

case "$url" in
  "" ) ;;  # empty: the page falls back to the address baked in at build time (VITE_API_URL)
  http://*|https://* )
    case "$url" in
      *[!A-Za-z0-9._:/-]* | *@* ) echo "API_URL contains characters that are not allowed (credentials, quotes, spaces): refusing to start" >&2; exit 1 ;;
    esac ;;
  * ) echo "API_URL must start with http:// or https://" >&2; exit 1 ;;
esac

printf 'window.__SCAMMIND_CONFIG__ = { API_URL: "%s" };\n' "$url" > "$dir/config.js"
echo "runtime config written (API_URL ${url:-<build default>})"
