# TechTurf API tests (Postman)

End-to-end API tests for the whole CRM: 642 requests and about 1,350 assertions.

| File | What it is |
|------|------------|
| `TechTurf_API.postman_collection.json` | The collection (import this) |
| `TechTurf_Local.postman_environment.json` | Variables: server URL and an admin login |
| `fixtures/sample-upload.txt` | File used by the Drive upload test |
| `generate-collection.js` | Builds the two JSON files. Edit this, not the JSON |

## What it needs

Only an **admin account**. The run creates its own test data and removes it at the end:
- **Accounts:** a test designer and a test team leader (`pm.*@example.invalid`).
- **Data:** a client, project, task, team and conversations, plus a Drive folder.

## Sections

| # | Section | What it checks |
|---|---------|----------------|
| 0 | Setup | Admin login, creates and logs in the two test accounts |
| 1 | Auth | Email + password + **role** must match. Wrong role is 403, unknown email and wrong password give the same 401 |
| 2 | Security: login required | Built from `backend/routes`: **every** endpoint without a token must return 401 |
| 3 | Security: roles | Built from `backend/routes`: every admin/leader-only endpoint must return 403 for a designer |
| 4.01-4.18 | Module flows | Create, read, update and delete, validation errors, and who may change what, for Users, Teams, Clients/Client Connect, Projects, Tasks, Submissions, Client Portal, Client Reports, Messages, Payments, Tickets, Courses, Notifications, Workspace, Secure Drive, Enterprise, Admin/DB viewer, Dashboard |
| 5 | Optional | Flows that notify or email **all staff** (announcements, approvals, client reviews). Skipped unless `run_notifying_tests` = `true` |
| 6 | Role workspaces | Design Vault, Nexus Lab, Broadcast Hub and Creator Slate answer with data |
| 8 | Cleanup | Deletes everything the run created and deactivates the test accounts |

Every response is also checked to arrive in under 2 seconds.

Sections 2 and 3 use ids that don't exist (`999999`), so a missing check can't touch
real data. The "employee cannot delete X" tests only target records the run itself
created.

## Run it in Postman

1. Start the app (`npm start` in the repo root). The API is on `http://localhost:3000`.
2. **Import** both JSON files and select the **TechTurf Local** environment.
3. Fill in `admin_email` and `admin_password`.
4. Open the collection, click **Run**, and keep the default order.

If Postman marks the upload file as missing: open the "Upload file (form-data)" requests
and re-select `postman/fixtures/sample-upload.txt` in the Body tab. Or set Postman's
working directory (Settings > General) to this `postman` folder.

## Run it from the command line (Newman)

From the `project` folder:

```bash
npx newman run postman/TechTurf_API.postman_collection.json -e postman/TechTurf_Local.postman_environment.json --working-dir postman --env-var admin_email=YOUR_ADMIN_EMAIL --env-var admin_password=YOUR_ADMIN_PASSWORD
```

## After changing the API

```bash
node postman/generate-collection.js
```

Then re-import the collection. New routes get their 401/403 security tests automatically.

## Expected result

Every assertion should pass (verified 2026-11-03: about 1,350 assertions, 0 failures,
with and without the optional section). A failure means something regressed.

The first version of this suite found these bugs, all now fixed and covered by tests:
- **Client portal login checked no password.** Login now needs the Access ID or email
  plus the password. Admins create the password from the client's panel on the Clients
  page ("Create/Reset portal password").
- **Six modules were never mounted:** design-vault, nexus-lab, broadcast-hub,
  creator-slate, content-forge and operation-hq.
- **No login was required** for `/api/audit`, `/api/settings`, `/api/analytics/*` and
  `/api/frontend-studio/*`.
- **Any employee could manage payments, others' tickets, courses and chats.**
- **Client records included the portal password hash.**
- **Admin heatmap and roles summary returned 500.**
- **Unknown API routes returned the HTML app shell** instead of a JSON 404.

## Notes

- Each run leaves two deactivated test accounts (shown as `deleted_N`) and its
  audit-log entries. The audit log is kept on purpose.
- Records with no delete endpoint (goals, help articles, task templates, feedback,
  jobs, client tickets) are removed through the admin DB console
  (`/api/dbadmin/query`). Each statement only matches this run's `run_id`.
- Point `base_url` at staging rather than production: the run creates and deletes data.
- If SMTP is configured, the test accounts' notifications go to `@example.invalid`
  addresses, which can't be delivered.
