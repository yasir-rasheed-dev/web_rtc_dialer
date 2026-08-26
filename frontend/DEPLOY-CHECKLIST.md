# Frontend deployment checklist

1. Confirm `npm test` and `npm run build` pass.
2. Back up the current dialer document root.
3. Copy `dist/` into `/var/www/ringnex-dialer/`.
4. Apply the root package's Apache template after reviewing its diff.
5. Run `sudo apache2ctl configtest`; continue only after `Syntax OK`.
6. Reload Apache and check `/api/health` through HTTPS.
7. Sign in as Agent A and Agent B in separate browser profiles.
8. Confirm both agents register under sidecar `pjsip show contacts`.
9. Test internal extension audio before one authorized Commio call.
10. Verify the call log, recording playback, KPI update and supervisor action.

All Asterisk commands must target `/opt/ringnex-webrtc`, not the existing
MagnusBilling Asterisk 13 instance.
