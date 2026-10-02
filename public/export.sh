#!/bin/bash
# iMessage Chat Exporter for What Brandon Thinks
# Reads local ~/Library/Messages/chat.db on macOS and exports text for Brandon

set -e

CHAT_DB="$HOME/Library/Messages/chat.db"
OUTPUT_FILE="$HOME/Desktop/imessage-export-for-brandon.txt"

echo "=================================================="
echo "  What Brandon Thinks — iMessage Chat Exporter   "
echo "=================================================="

if [ ! -f "$CHAT_DB" ]; then
    echo "❌ Error: Could not find ~/Library/Messages/chat.db."
    echo "Make sure you are running this on a Mac signed into iMessage."
    exit 1
fi

echo "🔍 Accessing iMessage database..."

# Query last 1,000 messages from chat.db with readable timestamps
sqlite3 "$CHAT_DB" <<EOF > "$OUTPUT_FILE" 2>/dev/null || {
    echo "⚠️ Full Disk Access is required by macOS."
    echo "Please go to: System Settings > Privacy & Security > Full Disk Access > Terminal (Enable)"
    exit 1
}
.mode list
.separator " : "
SELECT 
    datetime(message.date/1000000000 + strftime("%s", "2001-01-01"), "unixepoch", "localtime") as timestamp,
    CASE WHEN message.is_from_me = 1 THEN "Me" ELSE ifnull(handle.id, "Them") END as sender,
    message.text
FROM message
LEFT JOIN handle ON message.handle_id = handle.ROWID
WHERE message.text IS NOT NULL AND length(message.text) > 0
ORDER BY message.date DESC
LIMIT 1500;
EOF

if [ -s "$OUTPUT_FILE" ]; then
    echo "✅ Success! Chat exported to: $OUTPUT_FILE"
    echo "🚀 Now drag and drop '$OUTPUT_FILE' into https://whatbrandonthinks.com/setup"
else
    echo "❌ Export failed. Please ensure Terminal has Full Disk Access in macOS Settings."
fi
