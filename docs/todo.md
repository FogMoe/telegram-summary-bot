# TODO

## Message Links in Summary

### Goal
Include Telegram message links in summary output for traceability, similar to code location references.

### Plan A (Recommended, no DB schema change)
- Generate links at summary time from `chat_id` + `message_id`.
- Link formats:
  - Public groups (have `chat.username`):
    `https://t.me/<username>/<message_id>`
  - Private supergroups (no username):
    `https://t.me/c/<internal_id>/<message_id>`
    - `internal_id = String(Math.abs(chat_id)).replace(/^100/, '')`
- Source data needed:
  - `chat_id`, `message_id` (already stored)
  - `chat.username` from current context (if available)

### Plan B (Store links, requires DB migration)
- Add columns in `storage/messages.db`:
  - `chat_username` (TEXT)
  - `message_link` (TEXT)
- Compute and store link when saving messages.
- Use stored link in summary without recomputation.

### Output Design (choose one)
- Append a small "References" section with last N message links.
- Or map links to top discussion points / active users.
- Or admin-only links.

### Notes
- Links are only valid if the bot/user can access the chat.
- Public group usernames can change; computed links are safer at runtime.
