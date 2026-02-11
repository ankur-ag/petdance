#!/bin/bash
# Fix: Permission 'iam.serviceAccounts.signBlob' denied
# Cloud Functions needs this to generate signed URLs for Storage uploads/downloads.
# Run once: ./scripts/fix-storage-permissions.sh

PROJECT_ID="petdance-da752"
# Default Compute SA used by Cloud Functions (from your logs)
SA_EMAIL="447264049130-compute@developer.gserviceaccount.com"

echo "Granting Service Account Token Creator to ${SA_EMAIL}..."
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="${PROJECT_ID}"

echo "Done. Wait ~1 min for propagation, then try again."
