# Atencion

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Implementation choice delegated by the instruction to complete the local replica autonomously: React, Vite, native Node server and SQLite. Local delivery; no publication or remote repository.

## Users
Restaurant customers at a table, waiters attending requests, and restaurant administrators maintaining menu, tables and staff.

## Product Purpose
Reproduce the observed Chamaii experience locally: QR entry, waiter calls, bill requests, multimedia menu, live attendance and full administration.

## Operating Context
Customer phones, staff phones/tablets, and a monitor or television in the restaurant. Data shared live across screens through the local server.

## Capabilities and Constraints
Reference functions and known limits are recorded in investigacion/CHAMAII-investigacion.md. Subscription charging by a third party and device permission behaviors cannot be reproduced offline as real external services. Preserve local data; implement real CRUD, roles, reports and request transitions.

The local platform-administration console adds account and restaurant oversight. Restaurant registration is available from login and creates a separate SQLite database, key, uploads, staff, settings, menu, tables, requests and live channel for each restaurant. Mate bar retains its original database. Hosting, email verification, subscription management and billing remain subsequent stages.

Mate bar uses ventas@matebar.com as its restaurant owner. The separate platform principal admin@local.test belongs only to Atencion administration, not to restaurant staff or customer accounts. Each identity has separate credentials and session scope. Platform sessions cannot administer or operate restaurant requests, and restaurant backups cannot replace platform credentials or permissions.

The user selected a monthly subscription per restaurant for the future SaaS business model. Prices, plan limits, onboarding approval and payment integration have not yet been specified.

For future subscription management, the user specified that suspending a restaurant must block its administration and new customer requests. Suspension enforcement is not included in the current read-only platform console.

## Brand Commitments
Explicit visual authority: close fidelity to Chamaii screenshots and the authenticated application. The user confirmed the application name Atencion, Spanish copy, Mate bar as the restaurant name and Bolivianos (BOB/Bs), which take precedence over the original Portuguese brand. Preserve observed layout and behavior. No aesthetic redesign. Exact pixel equality is not certified for screens that were not observed.

## Evidence on Hand
investigacion/CHAMAII-investigacion.md, ESPECIFICACION-version-propia.md, and local screenshot evidence. Restaurant content beyond demo data is not provided.

## Product Principles
Shared server state; no fake successful requests. Clear status for customers. Screens match the observed reference. Reversible local development. Device-specific capabilities report support accurately.
