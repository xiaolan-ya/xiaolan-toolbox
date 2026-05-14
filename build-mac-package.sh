#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}"

if [ ! -d node_modules ]; then
  npm install
fi

npm run test:mac
npm run dist:mac:unsigned

echo
echo "Mac package is ready in ./dist"
