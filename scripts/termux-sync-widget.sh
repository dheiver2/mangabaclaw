#!/data/data/com.termux/files/usr/bin/bash
# MangabaClaw OAuth Sync Widget
# Syncs Claude Code tokens to MangabaClaw over SSH
# Place in ~/.shortcuts/ on phone for Termux:Widget

termux-toast "Syncing MangabaClaw auth..."

# Run sync on the configured MangabaClaw host.
SERVER="${MANGABACLAW_SERVER:-mangabaclaw-host}"
RESULT=$(ssh "$SERVER" '$HOME/mangabaclaw/scripts/sync-claude-code-auth.sh' 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    # Extract expiry time from output
    EXPIRY=$(echo "$RESULT" | grep "Token expires:" | cut -d: -f2-)

    termux-vibrate -d 100
    termux-toast "MangabaClaw synced! Expires:${EXPIRY}"

    # Optional: restart mangabaclaw service
    ssh "$SERVER" 'systemctl --user restart mangabaclaw' 2>/dev/null
else
    termux-vibrate -d 300
    termux-toast "Sync failed: ${RESULT}"
fi
