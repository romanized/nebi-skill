#!/bin/bash
set -e
mkdir -p handoffs shop
cat > shop/shipping-profile.json <<'EOF'
{ "profile": "default",
  "package": { "length_cm": 36, "width_cm": 24, "height_cm": 14, "note": "measured by owner 24 Sep" },
  "zones": ["NL", "BE", "DE"],
  "rates": { "NL": 4.95, "BE": 6.95, "DE": 7.95, "free_over": 75, "live": false } }
EOF
cat > shop/products.csv <<'EOF'
handle,title,price_eur,status
canvas-tote,Canvas Tote,,draft
wool-beanie,Wool Beanie,22,active
linen-apron,Linen Apron,34,active
EOF
cat > shop/tax-settings-memo.md <<'EOF'
# Tax settings memo
- VAT: charge NL VAT (21%) on all orders.
- OSS: not registered. EU cross-border sales are far below the €10k threshold.
- 24 Sep: owner decided no accountant email about OSS ("not worth his hourly rate"). Revisit only if EU sales approach €10k.
EOF
cat > TASKS.md <<'EOF'
# Shop setup: task list (kept by the assistant)

## Open for user
- [ ] Measure the shipping box (L x W x H) for package dimensions
- [ ] Decide: email the accountant about the OSS VAT scheme?
- [ ] Turn on 2FA for the store admin
- [ ] Tote bag price: €24 or €29
- [ ] Upload logo (PNG, 512px) for email branding

## Open for assistant
- [ ] Set package dimensions in shop/shipping-profile.json (blocked on box size)
- [ ] Turn shipping rates live (after package dimensions)
- [ ] Email branding (after logo)
- [ ] Test order (after 2FA)

## Done
- [x] Shipping rates drafted (NL 4.95 / BE 6.95 / DE 7.95, free > 75)
- [x] Beanie description rewritten
- [x] Collections: Accessories, Kitchen
EOF
touch handoffs/.keep
