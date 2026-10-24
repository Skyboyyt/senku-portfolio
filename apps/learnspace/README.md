# Learnspace public gateway

Vercel serves the public Learnspace application through external rewrites. The existing Cloudflare application remains responsible for courses, database storage, uploads, and authenticated account features. Sign-in and sign-out return to that canonical application domain.

Deploy this directory as a separate Vercel project with the Other framework preset. No build command is required.
