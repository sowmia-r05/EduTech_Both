# Incident Runbook — NAPLAN PREP

When something breaks in production, find the matching section and follow the steps.
Don't improvise — follow the checklist, then fix forward.

**Key facts (fill in):**
- Backend (Render): `<TODO service name>` · logs: Render Dashboard → service → Logs
- Frontend (Vercel): `edu-tech-both`
- DB (Atlas): cluster `Cluster0`, database `eduTech` (M0 free tier — no auto backups)
- Health check: `GET https://naplanapi.kaisolutions.ai/api/health`
- Backup tool: `C:\Program Files\MongoDB\Tools\100\bin\`
- Latest known-good release SHA: `<TODO>`

---

## 1. SITE DOWN (backend not responding)

**Symptom:** health check fails, users get errors, app won't load.

1. **Confirm it's down:** open `https://naplanapi.kaisolutions.ai/api/health`. No response / 5xx = down.
2. **Check Render logs** (Dashboard → service → Logs) for the crash reason:
   - `MODULE_NOT_FOUND` → a file is missing/misplaced in the deploy → roll back (step 4).
   - MongoDB connection error → check Atlas is up (Atlas status) and Network Access allows Render (`0.0.0.0/0`).
   - Out of memory / killed → the 512 MB instance was overwhelmed → roll back, and check for a runaway (e.g. too many Python jobs).
3. **Cold start?** On Render free tier the first request after idle is slow (~30–60s). Wait once before assuming it's down.
4. **Roll back the code** if a recent deploy caused it:
   - Render Dashboard → service → **Deploys** → last known-good deploy → **Rollback to this deploy**.
   - Wait for "Live", re-check `/api/health`.
5. **Frontend down but backend fine:** Vercel → Deployments → last good one → **Promote to Production**.

---

## 2. PAYMENTS STUCK (checkout done, but access not granted)

**Symptom:** user paid via Stripe but their purchase/access didn't provision.

1. **Check Stripe first:** Stripe Dashboard → Payments → find the customer. Did the charge succeed?
   - Charge failed → not our bug; user needs to retry.
   - Charge succeeded but no access → continue.
2. **Check the webhook fired:** Stripe Dashboard → Developers → Webhooks → recent deliveries.
   - Webhook failed / not sent → check the endpoint URL and that `STRIPE_WEBHOOK_SECRET` in Render matches Stripe.
   - Webhook returned non-2xx → check Render logs at that timestamp.
3. **Check dedup / provisioning in the DB:**
   - `stripeevents` collection — was the event recorded? (dedup key)
   - `purchases` collection — is there a Purchase doc, and is `provisioned` true?
   - If a Purchase exists but `provisioned` is false → provisioning failed after payment. Re-trigger provisioning or provision manually, then set `provisioned: true`.
4. **Never** refund/re-charge to "fix" it — reconcile provisioning instead.
5. Log which customers were affected: `<TODO>`.

---

## 3. FEEDBACK STUCK (AI feedback never completes)

**Symptom:** quiz submitted, but AI feedback stays "generating" / never appears.

1. **Check Render logs** for the Python spawn around that submission:
   - `PythonBusyError` / 503 → the concurrency limiter shed load (pool full). Expected under burst on 1-worker free tier. The submission is marked "error"; user can retry.
   - `ModuleNotFoundError` (Python) → a Python dep isn't installed at build → check the build command runs `pip install -r requirements.txt`.
   - Timeout → the Gemini call or Python script took too long.
2. **Check the attempt's status field** in the DB (`quizattempts` → `ai_feedback_meta.status`): `generating` stuck for a long time = the job died.
3. **Re-trigger:** re-run the feedback for that attempt (admin re-trigger), or have the user resubmit.
4. **Systemic (many stuck at once):** the single Python queue (MAX_CONCURRENT_PYTHON=1) is the bottleneck. Under real load this needs the BullMQ+Redis worker queue (roadmap item). Short term: it self-clears as the queue drains.
5. Note: feedback runs Gemini → costs tokens. A flood of retries costs money; don't mass-retry blindly.

---

## 4. RESTORE THE DATABASE (data corrupted / deleted)

> Only when DATA is wrong — a code rollback (§1) does NOT fix bad data.
> ⚠️ Restore OVERWRITES current data with the backup. Anything written since the
> backup is lost. Last resort.

**Prerequisite:** a backup must exist. Take one before every risky deploy:
```
& "C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe" --uri "<MONGODB_URI>" --out ./backups/backup-<date>
```

**Restore (emergency — overwrites live eduTech):**
```
& "C:\Program Files\MongoDB\Tools\100\bin\mongorestore.exe" --uri "<MONGODB_URI>" --db eduTech --drop ./backups/backup-<date>/eduTech
```
- `--drop` clears the broken collections first, then restores the good copy.

**Test a restore safely (into a throwaway DB, no risk):**
```
& "C:\Program Files\MongoDB\Tools\100\bin\mongorestore.exe" --uri "<MONGODB_URI>" --db eduTech_restoretest ./backups/backup-<date>/eduTech
```
Verify in Atlas → Data Explorer, then delete `eduTech_restoretest`.
(Confirmed working 2026-07-09: 5605 docs restored, 0 failed.)

---

## 5. AFTER ANY INCIDENT
1. Confirm `/api/health` green + one real flow works (login → quiz → result).
2. Write down: what broke, which section fixed it, how long it took.
3. Fix forward on a branch — don't redeploy the same broken build.

---

## Quick reference
| Symptom | Section |
|---|---|
| Site won't load / 5xx | §1 Site down → roll back |
| Frontend broken, API fine | §1.5 Vercel promote |
| Paid but no access | §2 Payments stuck |
| Feedback stuck "generating" | §3 Feedback stuck |
| Data corrupted/deleted | §4 Restore DB |