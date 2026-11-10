# Family Learning

Authoritative website: https://santos-cabbigat.github.io/Family-Learning/
Source: https://github.com/santos-cabbigat/Family-Learning

The GitHub Actions workflow tests and publishes `docs/`. No purchased workbook or learner records belong in this repository.

## Current edition 0.6.0

- Natural Science Ready volumes and bonuses, plus Science Diagrams topic collections, are discovered by exact private Drive ZIP filenames. The public catalog contains descriptive metadata only.
- Each prepared science lesson/resource has a companion teaching plan and printable PDF. Student quick checks exclude teacher marking points. Publisher answer-key pages are separate teacher resources.
- Existing subject packs gain preparation, objectives, teaching procedures, differentiation, assessment and reflection through the teaching-plan renderer; original card guidance and supplied answer images remain available.
- Print student sheets, teacher plans or marking keys separately, or download included PDFs. Browser/OS printer availability still needs verification on the user’s actual device.
- Multi-document diagram packs retain each original PDF rather than duplicating it into a second merged workbook.

## Existing learning and backup functions

- Phonics A private pack: one activity per card, hidden teacher guidance, workbook page reference, manual stopping point, separate scores and attempt history per child.
- Local records and packs use separate IndexedDB databases. Updates preserve both.
- State writes use a single read/write transaction to prevent two tabs losing each other's changes.
- Export/import JSON includes profiles, original teaching materials, assignments, submitted work, chapter results, bookmarks, and validated settings. Purchased cards and PDF remain in the separate private lesson ZIP.
- Google Drive manual sync merges immutable learning records, uploads a new snapshot, downloads it again for verification, and only then acknowledges its records. Failure remains retryable. Credentials are never exported.
- Update checks use this GitHub Pages origin. Service-worker assets bypass HTTP cache during installation, and activation waits for explicit Apply update.
- The Android APK is **archived version 0.1.2**, not the current web edition. Use Chrome/Safari's home-screen web app for current features. Never uninstall an old app before exporting and checking its restored records.

## Google Drive configuration

The shared web client is configured in `docs/config.json`. The app owner configures one Google Cloud project for the shared website: enable Drive API, configure consent/audience (and test users if applicable), create a Web application OAuth client, and authorize the JavaScript origin `https://santos-cabbigat.github.io` (no path). The client ID may be set in `docs/config.json` for all devices or saved in Settings for the current browser. Never store a client secret in the frontend. `drive.file` limits the app to app-created/selected files; it does not silently read all purchased workbooks.

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


## Mobile settings update

The primary menu is Today, Subjects, Progress and Settings. Sync is under Settings → Backup and restore. Existing #sync links still work. Settings opens a grouped list; students, Google Drive, reminders, updates and offline access each have their own screen. Create remains in Today and the materials library; individual learning plans remain in Today and Settings. The Google connection button now checks setup and reports missing configuration instead of remaining disabled. Google sign-in still requires the owner-provided Web client ID in docs/config.json; this release does not claim real-account sync is configured.

The Google Drive setup guide now walks the owner through project selection, API enablement, consent, test users, drive.file permission, Web OAuth client creation, local client setup, and verified backup/restore. Large API links appear in Drive settings and at the top, relevant step and bottom of the guide. Checkpoints are instructions for the user, not claims that the app has inspected their Google Cloud project.

## Public downloadable subject catalog

Settings → Downloads reads `docs/catalog.json` (schema `{ "version": 1, "packages": [] }`). Each published item has an `id` matching the lesson pack manifest, `grade` (Kindergarten or Grade 1–6), `subject` (Phonics, Math, Grammar, Writing, Reading Comprehension, Science), `title`, optional `description`, and an HTTPS `url` to the permitted Family Learning ZIP. Never put personal student records or copyrighted/purchased materials without redistribution rights in this public catalog.

Download fetches catalog ZIPs inside the app, validates their manifests and saves them in IndexedDB under Subjects. External ZIP hosts must support HTTPS and CORS. Purchased packs stay private. Phonics A can be located by its exact prepared ZIP filename in the user's Drive. Backed-up packs use the normal per-file Drive grant. Looking up an external private pack can separately request `drive.readonly` after the user taps Allow and download. The resulting token is used only for that download. Configure this optional scope in Google Auth Platform → Data Access and review Google's verification requirements before wider rollout.
