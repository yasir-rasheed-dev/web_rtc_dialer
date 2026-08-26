# Frontend

React 18 + Vite + SIP.js frontend for the Ringnex Asterisk 22 sidecar.

## Commands

```bash
npm ci
npm test
npm run dev
npm run build
```

During development, Vite proxies `/api` and `/socket.io` to
`http://127.0.0.1:3100`. SIP.js connects directly to the WSS URL released by the
authenticated backend session.

The application does not embed SIP, AMI, DB or Commio credentials. The backend
returns the signed-in user's decrypted SIP credential for the current tab only;
the softphone clears it when unmounted.

The prebuilt production output is in `dist/`. Use the root
`docs/DEPLOYMENT.md` for the matching Apache and backend setup.
