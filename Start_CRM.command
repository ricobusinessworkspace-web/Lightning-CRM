#!/bin/bash
cd ~/calling-station-v2

echo "Prüfe auf Updates..."

# Supabase Storage URLs
VERSION_URL="https://duzmanqvyhqurxlpxrrg.supabase.co/storage/v1/object/public/updates/version.json"
ZIP_URL="https://duzmanqvyhqurxlpxrrg.supabase.co/storage/v1/object/public/updates/update.zip"

# Remote Version holen (Timeout nach 3s)
REMOTE_VERSION=$(curl -s --connect-timeout 3 "$VERSION_URL" | grep -o '"version" *: *"[^"]*"' | cut -d'"' -f4)

# Lokale Version aus package.json lesen
LOCAL_VERSION=$(cat package.json | grep '"version"' | head -1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')

if [ ! -z "$REMOTE_VERSION" ] && [ "$REMOTE_VERSION" != "$LOCAL_VERSION" ]; then
  echo "====================================="
  echo "🚀 Neues Update gefunden: v$REMOTE_VERSION (Aktuell: v$LOCAL_VERSION)"
  echo "Lade Update herunter..."
  curl -s -o update_temp.zip "$ZIP_URL"
  
  if [ -f "update_temp.zip" ]; then
    echo "Entpacke und installiere Update..."
    unzip -o -q update_temp.zip
    rm update_temp.zip
    echo "Update erfolgreich! Installiere eventuelle neue Abhängigkeiten..."
    npm install --silent
  else
    echo "Fehler beim Download des Updates."
  fi
  echo "====================================="
else
  echo "✓ Du bist auf dem neuesten Stand (v$LOCAL_VERSION)."
fi

echo "Startet Calling Station CRM..."
npm start
