# Optional modules guidance

Modules are optional only when a ward can conduct a sacrament meeting without them, they own an independent lifecycle or permission set, disabling them cannot corrupt Core data, and Core has an explicit fallback.

Modules may consume Conducting Core contracts and Platform services. They must not import another module's repositories or tables, silently rewrite Core ordering, or gain permissions merely by registration.

Future module registration is static and typed. Do not add runtime plugin loading or arbitrary third-party code. Each module must document its ID/version, enablement scope, permissions, persistence ownership, public/print/offline surfaces, disabled behavior, and focused tests.
