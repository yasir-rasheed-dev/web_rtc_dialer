# Ringnex SaaS Foundation - Migration Guide

This package is based on the supplied **before-saas-working** backend and latest supplied frontend. It keeps the existing WebRTC/Asterisk/Commio call features while introducing the multi-tenant SaaS foundation.

## What is implemented in this package

- Product Owner / Super Admin login at `/admin`
- Super Admin tenant/setup creation
- Tenant Active / Inactive status
- Pricing cards and tenant-specific overrides
- Per-tenant user, outbound-minute and inbound-minute limits (stored/reporting; see quota note below)
- Super Admin-controlled extension start number
- Workspace + email + password tenant login
- Dynamic tenant roles and privileges (`roles`, `permissions`, `role_permissions`)
- `user.role_id` assignment
- Permission-based menus and call-control buttons
- Backend permission enforcement
- Tenant-isolated users, contacts, DIDs, calls, recordings, reports and live monitoring
- Tenant-local extension allocation
- Globally unique tenant-aware PJSIP usernames
- Automatic PJSIP Realtime provisioning retained
- Per-agent DID retained
- Same-tenant warm transfer target enforcement
- Tenant-aware Socket.IO rooms
- Tenant usage / seat reporting
- Carrier CDR storage model for Commio reconciliation
- Asterisk AstDB mapping reconciliation when AMI connects
- Tenant-aware Asterisk routing reference snippet

## Important: current working data is preserved

The SQL migration creates a `legacy` workspace and assigns existing users/calls to it. After migration, existing users can sign in with workspace:

`legacy`

Their existing SIP credentials, extensions and DIDs are not regenerated.

## Install sequence

1. Keep the existing working project backup untouched.
2. Copy the updated backend/frontend source into a new SaaS working folder.
3. Keep your real `.env` and `.env.realtime` files locally; this package intentionally does not ship them.
4. In backend run:

   `npm run migrate:saas`

5. Add to backend `.env`:

   `SUPER_ADMIN_EMAIL=...`
   `SUPER_ADMIN_PASSWORD=...` (12+ characters)
   `SUPER_ADMIN_NAME=...`

6. Create Product Owner account:

   `npm run seed:super-admin`

7. Start backend and frontend as before.
8. Open `/admin` for Product Owner portal.
9. Tenant users sign in through normal app using `Workspace + Email + Password`.

## Asterisk tenant isolation

The backend now writes:

- `ringnex_tenant/<endpoint>`
- `ringnex_tenant_status/<tenant-id>`
- `ringnex_ext/<tenant-id>/<extension>`
- existing `ringnex_did/<endpoint>`

The file `backend/asterisk/tenant-routing-snippet.conf` is a reference for the custom Ringnex Asterisk dialplan. It must be reviewed/merged into the **custom `/opt/ringnex-webrtc` Asterisk only**. Do not apply it to the separate MagnusBilling/system Asterisk.

Until the dialplan is switched to tenant-aware routing, the application/database is tenant-aware but SIP-level blind/internal routing is not fully isolated.

## Commio CDR integration status

The database and usage screens support carrier CDR/cost rows through `carrier_cdrs`. The exact Commio CDR API adapter is intentionally not hard-coded because the account-specific endpoint/auth/response contract was not supplied. Once the Commio API contract is provided, the sync service can map carrier CDRs into this table without changing the tenant model.

## Minute quota enforcement note

Inbound/outbound allowances are stored and reported now. Hard-block vs overage behavior was not finalized in the business rules. Therefore this package does **not** terminate or block calls when a minute limit is reached. That should be implemented only after deciding `HARD_LIMIT` vs `OVERAGE` and after carrier-billing reconciliation rules are confirmed.

## Billing note

`price_per_user` and estimated seat revenue are implemented. Automatic payment collection/Stripe is not included because payment-gateway scope was not finalized.
