#!/bin/bash
set -e
mkdir -p data handoffs notes
cat > data/search_campaigns_sept.csv <<'EOF'
campaign,status,spend_eur_month,clicks,conversions
Brand - exact,enabled,60.10,412,19
Generic - sneakers,enabled,28.90,233,1
EOF
{ echo "sku,title,status,price_eur"
  for i in $(seq 1 83); do printf "SK%03d,Product %d,active,%d\n" $i $i $((29 + i % 40)); done
  for i in $(seq 84 100); do printf "SK%03d,Draft item %d,draft,0\n" $i $i; done; } > data/catalog_export.csv
cat > notes/negatives-draft.txt <<'EOF'
free
cheap
fake
replica
kids
EOF
touch handoffs/.keep
