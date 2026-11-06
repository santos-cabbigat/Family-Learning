# Family Learning

Authoritative website: https://santos-cabbigat.github.io/Family-Learning/
Source: https://github.com/santos-cabbigat/Family-Learning

The GitHub Actions workflow tests and publishes `docs/`. No purchased workbook or learner records belong in this repository.

## Current edition 0.3.1

- Phonics A private pack: one activity per card, hidden teacher guidance, workbook page reference, manual stopping point, separate scores and attempt history per child.
- Local records and packs use separate IndexedDB databases. Updates preserve both.
- State writes use a single read/write transaction to prevent two tabs losing each other's changes.
- Export/import JSON includes profiles, original teaching materials, assignments, submitted work, chapter results, bookmarks, and validated settings. Purchased cards and PDF remain in the separate private lesson ZIP.
- Google Drive manual sync merges immutable learning records, uploads a new snapshot, downloads it again for verification, and only then acknowledges its records. Failure remains retryable. Credentials are never exported.
- Update checks use this GitHub Pages origin. Service-worker assets bypass HTTP cache during installation, and activation waits for explicit Apply update.
- The Android APK is **archived version 0.1.2**, not the current web edition. Use Chrome/Safari's home-screen web app for current features. Never uninstall an old app before exporting and checking its restored records.

## Google Drive setup still required

The app has no Google OAuth Web client configured. The app owner configures one Google Cloud project for the shared website: enable Drive API, configure consent/audience (and test users if applicable), create a Web application OAuth client, and authorize the JavaScript origin `https://santos-cabbigat.github.io` (no path). The client ID may be set in `docs/config.json` for all devices or saved in Settings for the current browser. Never store a client secret in the frontend. `drive.file` limits the app to app-created/selected files; it does not silently read all purchased workbooks.

Direct Google OAuth and real-account Drive upload/restore require this setup and have not yet been verified. Adapter tests use simulated API responses, including failures, retries, expiry, pagination and verification mismatch. Background/closed-app sync is not implemented. Tokens are in memory and may require reconnecting after expiry/reload.

On a second device restore the family backup before entering new work, then import the private pack. A different family space with existing work cannot be silently replaced. Google Drive snapshots contain learning records, not the private ZIP or device-specific OAuth configuration.

## Verification

Run `node --test tests/*.test.js`. Browser QA: update from earlier version with existing records; export/import same-family backup; per-child progress; teaching cards/guide; settings, subject navigation and installation. Physical iPad/Android testing remains necessary; no new native APK was built in this release.

The legacy chatgpt.site edition is retained with a migration notice and export access, so existing browser records can be recovered without an automatic cross-origin redirect.

## Households, students and materials

Settings supports 1–100 active students with names and Kindergarten/Grades 1–6/Other. Reducing the count archives inactive students without deleting assignments or results. Restoring a student preserves their identity. Material grade classification and profile changes are immutable records included in sync and backup; phonics skill level remains separate from school grade.

New browser installations contain only placeholder student profiles, no purchased books or sample lesson content. Relatives use the same website but have independent local databases and their own Google Drive accounts. The app creates `Family Learning Backups` and `Family Learning Materials` folders; no manual folder names or scripts are required. Publish one OAuth Web client configuration for the website and complete Google's audience requirements before wider sharing. Do not send relatives the owner's personal learning-record JSON.

The Sync screen can separately upload installed lesson pack ZIPs and list/download packs created by this app in the connected account. Pack uploads verify SHA-256 and size; record uploads verify the complete JSON. These are user-triggered operations. No real Google account has been tested without an OAuth client. Purchased K5 workbooks must not be redistributed outside their permitted license; recipients need their own licensed material or publisher permission.

Settings now separates the family Connect Google Drive button from the collapsed App owner setup section. Connecting alone never uploads records. Each family chooses its own account, then uses Backup and restore. Check connection setup reloads the published configuration without requiring an app reinstall. A local client ID override is only for testing or separately hosted copies, not the normal family setup.
