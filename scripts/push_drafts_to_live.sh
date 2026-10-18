#!/bin/sh
# Push the local DRAFT catalog products (the title + source-URL imports, ids `src-...`) to the live Railway Postgres.
#
#   sh scripts/push_drafts_to_live.sh            # build the SQL only (nothing leaves this machine) and show the size
#   sh scripts/push_drafts_to_live.sh --apply    # build it, then run it on the live database in ONE transaction
#
# Additive only: INSERT ... ON CONFLICT DO NOTHING, so a product (or SKU / slug) that is already live is left exactly as it is.
# Live had 12,216 of the 24,493 local `src-` drafts on 2026-10-18; the rest are added. The few drafts already filled locally by the
# AI import go up as plain title + URL drafts (their brands / categories / profiles / images exist only on this machine) - run
# "Fill" on them again on the live admin. Needs: docker (local againerp-moharaz-postgres up), railway CLI logged in + linked.
cd "$(dirname "$0")/.." || exit 1
export MSYS_NO_PATHCONV=1
OUT="${TMPDIR:-/tmp}/drafts_to_live.sql"
U=$(docker exec againerp-moharaz-postgres printenv POSTGRES_USER)
D=$(docker exec againerp-moharaz-postgres printenv POSTGRES_DB)
ICOLS="id,company_id,sku,barcode,barcode_type,name,item_type,status,created_at,updated_at"
PCOLS="id,item_id,company_id,name,slug,sku,model,description,price,compare_at_price,purchase_price,last_selling_price,stock,track_quantity,not_for_selling,weight,tax_rate,tax_type,stock_status,status,product_type,visibility,brand,category,brand_id,category_id,attribute_profile_id,short_description,tags_json,seo_title,seo_description,focus_keyphrase,warranty,origin,thumbnail,custom_specs_json,variant_attributes_json,combo_components_json,source_url,seller_info_json,dropship_meta_json,gallery_json,video_urls_json,created_at,updated_at,remarks,in_inventory,on_website,updated_by_id,updated_by_name"
{
  echo "BEGIN;"
  echo "CREATE TEMP TABLE s_items AS SELECT $ICOLS FROM items WITH NO DATA;"
  echo "COPY s_items ($ICOLS) FROM STDIN;"
  docker exec againerp-moharaz-postgres psql -U "$U" -d "$D" -c "COPY (SELECT $ICOLS FROM items WHERE id IN (SELECT item_id FROM catalog_products WHERE id LIKE 'src-%')) TO STDOUT"
  echo '\.'
  echo "CREATE TEMP TABLE s_prod AS SELECT $PCOLS FROM catalog_products WITH NO DATA;"
  echo "COPY s_prod ($PCOLS) FROM STDIN;"
  docker exec againerp-moharaz-postgres psql -U "$U" -d "$D" -c "COPY (SELECT $PCOLS FROM catalog_products WHERE id LIKE 'src-%') TO STDOUT"
  echo '\.'
  cat <<EOF
UPDATE s_prod SET brand_id=NULL, category_id=NULL, attribute_profile_id=NULL, thumbnail=NULL, gallery_json=NULL, custom_specs_json=NULL,
  description=NULL, short_description=NULL, tags_json='[]', seo_title=NULL, seo_description=NULL, focus_keyphrase=NULL, warranty=NULL,
  remarks=NULL, brand=NULL, category=NULL, model=NULL
  WHERE description IS NOT NULL OR attribute_profile_id IS NOT NULL OR custom_specs_json IS NOT NULL OR thumbnail IS NOT NULL
     OR remarks IS NOT NULL OR brand_id IS NOT NULL OR category_id IS NOT NULL;
INSERT INTO items ($ICOLS) SELECT $ICOLS FROM s_items ON CONFLICT DO NOTHING;
INSERT INTO catalog_products ($PCOLS) SELECT $PCOLS FROM s_prod WHERE item_id IN (SELECT id FROM items) ON CONFLICT DO NOTHING;
SELECT 'items now', count(*) FROM items;
SELECT 'catalog_products now', count(*) FROM catalog_products;
SELECT 'src- drafts now', count(*) FROM catalog_products WHERE id LIKE 'src-%';
COMMIT;
EOF
} > "$OUT"
echo "SQL built: $OUT ($(wc -c < "$OUT") bytes, $(grep -c '' "$OUT") lines)"
if [ "$1" = "--apply" ]; then
  gzip -c "$OUT" | railway ssh --service Postgres -- 'gunzip | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f -'
else
  echo "Nothing was sent. Re-run with --apply to run it on the live database."
fi
