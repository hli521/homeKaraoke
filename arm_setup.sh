#!/bin/bash
# 1. Define variables
REPO="hli521/homeKaraoke"
FILE_NAME="ggml-small.tar.gz"
TARGET_DIR="./resources/whisper/darwin-arm64"

echo "==> Fetching latest release download URL..."
URL=$(curl -s "https://github.com" | grep "browser_download_url" | grep "$FILE" | cut -d '"' -f 4)

if [ -z "$URL" ]; then
    echo "Error: Could not find $FILE in the latest release."
    exit 1
fi

echo "==> Downloading and extracting binary directly to $TARGET_DIR..."
# Downloads and decompresses on-the-fly without saving the .tar.gz to disk
curl -L "$URL" | tar -xzvf - -C "$TARGET_DIR"

echo "==> Setup complete! Binary is in $TARGET_DIR"
