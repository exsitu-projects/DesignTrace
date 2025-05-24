#!/bin/bash

# Build Vue app
cd client || { echo "Failed to cd into client"; exit 1; }
npm run build
cd .. || { echo "Failed to cd back"; exit 1; }

# Remove old dist folder if it exists
if [ -d dist ]; then
  rm -rf dist
fi

# Create new dist folder
mkdir -p dist

# Copy built files from client/dist to dist
cp -r client/dist/* dist/

# Run Flask app
python app.py
