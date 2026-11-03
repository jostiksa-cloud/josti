# Known limitations

- No Supabase project was available. Local runs use PGlite. Production requires the operator to supply PostgreSQL and, if desired, Supabase Storage.
- Migration `005_demo_data.sql` is skipped automatically when `NODE_ENV=test` (or `JOSTI_SKIP_DEMO_DATA=1`) so automated journey tests register clean accounts. Apply it for local demos with `bun run db:migrate` outside test mode, or use `bun run seed:demo`.
- Password-reset email is stored and logged only when `ALLOW_DEV_RESET_TOKEN=true` outside production. SMTP delivery is not sent by an in-process mailer; configure an external delivery process before relying on recovery in production.
- Push delivery was verified against a local mock provider, not Apple or Google. Real delivery needs APNs and FCM credentials and a physical device.
- iOS and Android JavaScript bundles were exported on Windows. A signed device binary was not produced. iOS native builds require macOS. Android device builds require the Android SDK or EAS.
- Background location is implemented for an active trip. It is not claimed to continue after the operating system force-quits the app.
- Public map positions are approximate. Tracking uses authenticated polling, not Supabase Realtime.
- Rate limiting is in-memory for one API process. Put a reverse-proxy limit in front of multiple instances.
- The free-period duration, eligibility, and billing start date are unset on purpose.
- Fasah, SMS, WhatsApp, auctions, return trips, maintenance, warehousing, price prediction, wallets, and payment gateways are not implemented.
- Browser visual testing of every viewport was not executed with an interactive browser in this environment. API acceptance tests and production builds were executed.
- Administrator closure is the configured policy until the client approves another authority.
