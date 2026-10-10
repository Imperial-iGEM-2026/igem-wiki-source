#!/bin/sh
cd "$(dirname "$0")" || exit 1
[ -d node_modules/playwright ] || npm ci --no-audit --no-fund || exit 1
node server.mjs
