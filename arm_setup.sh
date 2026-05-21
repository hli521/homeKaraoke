#!/bin/bash

# 1. Define variables
REPO="hli521/homeKaraoke"
FILE_NAME="ggml-small.tar.gz"
TARGET_DIR="./resources/whisper/darwin-arm64"


# curl -s "https://api.github.com/repos/$REPO/releases" | grep browser_download_url
echo "==> Fetching latest release download URL..."

URL=$(curl -s "https://api.github.com/repos/$REPO/releases" \
  | grep "browser_download_url" \
  | grep "$FILE_NAME" \
  | cut -d '"' -f 4)

if [ -z "$URL" ]; then
    echo "Error: Could not find $FILE_NAME in the latest release."
    exit 1
fi

echo "==> Downloading and extracting binary directly to $TARGET_DIR..."

curl -L "$URL" | tar -xzvf - -C "."

echo "==> Setup complete! Binary is in $TARGET_DIR"