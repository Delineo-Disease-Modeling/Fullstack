#!/bin/sh
cd /Users/ryad/Code/delineo/Fullstack/client
export PATH="/opt/homebrew/bin:$PATH"
exec node node_modules/vite/bin/vite.js --port 5199 --host 0.0.0.0
