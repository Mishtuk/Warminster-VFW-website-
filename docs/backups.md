# Backups, restore and down-alert

The database (`vfw.db`) holds everything the admin edits, inquiries, orders and site settings. Uploaded news photos live in `DATA_DIR/photos`. Secrets (`SESSION_SECRET`, `SMTP_URL`, `ADMIN_PASSWORD`) are app settings in Azure, not in the archive; keep them in the post's password manager.

## Make a backup
```
DATA_DIR=/home/data BACKUP_DIR=/home/backups node scripts/backup.mjs
```
- Takes a consistent copy of the live database (`VACUUM INTO`, safe while the site runs) plus the photos.
- Writes one folder `BACKUP_DIR/vfw-backup-<timestamp>Z/` and keeps the newest 14 (`BACKUP_KEEP` to change).
- Prints one line, `backup ok: ...`, and exits non-zero on any failure.
- Keep `BACKUP_DIR` outside the web root and outside `DATA_DIR/backup` (the app's own 7 daily database copies live there).

## Restore
Stop the site first, then:
```
node scripts/restore.mjs /home/backups/vfw-backup-2026-11-01T03-00-00-000Z /home/data
```
It refuses a non-empty `DATA_DIR`. `--force` replaces only `vfw.db` and `photos`. Start the site and check the admin.

## Restore drill (do it once before launch, then every few months)
1. Run a backup. 2. Restore it into an empty temp folder: `node scripts/restore.mjs <archive> /tmp/drill`.
3. Start a throwaway site on another port: `DATA_DIR=/tmp/drill PORT=8099 node server.js`. Sign in, check the news, events, inquiries and photos match the live site. Stop it by its PID.
4. `npm test` runs the same round trip automatically (`test/backup.test.js`).

## Launch plan on Azure App Service (Linux)
1. **Nightly run.** Easiest: a WebJob (Kudu, triggered, cron `0 0 3 * * *`) that runs the command above. A timer inside the app would also work, but a WebJob keeps backups running when the site is stuck.
2. **Off-server copy.** `/home` is the only copy otherwise. Create a Storage account (Blob, cool tier, locally redundant), a private container `vfw-backups`, and have the same WebJob upload the newest folder with `azcopy copy <folder> "<container SAS URL>" --recursive` (SAS token with add/write only, kept as an app setting). Add a lifecycle rule to delete blobs after 90 days. Cost: a few cents a month for this size (a few hundred MB at cool-tier rates); confirm in the Azure pricing calculator.
3. **Down-alert.** UptimeRobot free plan: new HTTP(s) monitor on the site home page `/`, interval 5 minutes, alert contact by email to the post's address (and one officer). It emails on down and again on recovery.
4. After the first night, check the Blob container shows the archive, and do the restore drill from the downloaded copy.
