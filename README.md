# D'SURIA HOSTEL HUB — Operational MVP

React 18 + Vite + Firebase Authentication + Cloud Firestore.

## Included
- Google sign-in with approved email whitelist.
- Super Admin / Admin / Student roles and Admin appointment management.
- Student profile and two emergency contacts.
- Operational record forms and Firestore lists for Class Attendance, Outing Log, Geofence GPS check, Daily Status, Cleaning Schedule, Trash Wars, Hostel Lobby, Bills, Monthly Collection, SOS requests, Hostel Rules acknowledgement, and Merit/Demerit records.
- Student records are queried by owner UID; Admin/Super Admin views all module records.
- Cleaning rotation reference: Alpha/Beta/Charlie; weekly Wednesday 6.00 PM.
- RM5 monthly collection reference; RM150 electricity and RM150 water subsidy reference.
- Geofence reference point: 3.1516121, 101.7471753; 100m radius.

## Deploy
1. Replace repository files with the contents of this ZIP.
2. In Firebase Console > Firestore Database > Rules, replace the rules with `firestore.rules` and click Publish.
3. Ensure Firebase Authentication > Settings > Authorized domains includes the GitHub Pages domain.
4. Push/commit the files to the existing GitHub repository. GitHub Actions should build and publish the Vite `dist` folder.
5. Test with separate Super Admin, Admin and Student Google accounts.

## Important operational limitations
- This is an operational MVP, not a fully audited production release. Run a complete acceptance test before using it for official hostel discipline, billing or emergency response.
- Browser GPS is read only after the user presses the GPS button. A web page cannot reliably obtain a phone's location in the background when the browser is closed. The GPS result is device-reported and must be reviewed by Warden/Admin; it is not tamper-proof server verification.
- There is no automatic 10.00 PM background geofence scheduler, push notification service, payment gateway, or server-side Cloud Function in this package.
- Outing destination is currently entered as text; interactive map pin selection is not included yet.
- Trash Wars currently records assignments/completion status; automatic XP, streaks and anti-duplicate reward transactions are not included yet.
- Merit/Demerit currently records proposed points and review status; automatic monthly reset, archive, appeal workflow and lifetime aggregation are not included yet. Suggested app point values are not official college penalties.
- Bills module records bill amounts and subsidy notes; it does not calculate each resident's share automatically. Configure actual room/air-conditioner eligibility and occupant shares before collecting payment.
- Hostel Rules module provides a short reminder and acknowledgement record; it does not embed the complete official PDF. Refer to the official hostel rules document for the authoritative text and penalties.
- SOS records a request in the app. For immediate danger or medical emergency, call 999.
- Firestore Rules protect access to the collections in this MVP, but high-trust operations (role changes, final discipline decisions, XP awards, merit resets and location verification) should be moved to trusted server-side functions before production use.

## Build
Run `npm install`, then `npm run build`. This environment did not have `node_modules` available and dependency installation did not finish, so the production build has not been verified here.
