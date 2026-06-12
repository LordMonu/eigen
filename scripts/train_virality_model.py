#!/usr/bin/env python3
"""
Eigen Studio — Phase 7: XGBoost Virality Model Training
========================================================

Offline training script. Runs locally (e.g. Mac Mini), reads
generation_outcomes joined to their prompt_blueprints from Supabase, trains
a binary classifier on (features → went_viral), and upserts the serialized
model + metrics into studio_model_artifacts.

Requirements:
    pip install xgboost scikit-learn supabase python-dotenv pandas numpy

Setup:
    Add to .env at the repo root (NOT just .env.local — this script doesn't
    load Next.js env files):
        NEXT_PUBLIC_SUPABASE_URL=...
        SUPABASE_SERVICE_ROLE_KEY=...    # service key — local-only secret

Usage:
    python scripts/train_virality_model.py

Output:
    - Prints class distribution, AUC-ROC, top feature importances
    - Upserts the model artifact (serialized JSON booster + feature list +
      metrics) to studio_model_artifacts keyed by model_type='xgboost_v1'

Notes:
    - Tier 2a (retrieval-augmented scoring) keeps running regardless. This
      Tier 2b (XGBoost) is additive — the Next.js scorer doesn't read this
      table yet. A future inference endpoint will pick up the latest row.
    - The plan calls for ≥100 outcomes; we set MIN_OUTCOMES = 50 to match
      the Phase 6 retrieval threshold and bail with a clean message if the
      corpus is too small or class-imbalanced.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:
    print("Missing dependency: python-dotenv")
    print("Run: pip install xgboost scikit-learn supabase python-dotenv pandas numpy")
    sys.exit(1)

load_dotenv()

try:
    import numpy as np  # noqa: F401  (xgboost depends on numpy; explicit import keeps the failure clear)
    import pandas as pd
    import xgboost as xgb
    from sklearn.metrics import classification_report, roc_auc_score
    from sklearn.model_selection import train_test_split
    from supabase import create_client
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install xgboost scikit-learn supabase python-dotenv pandas numpy")
    sys.exit(1)

# ─── CONFIG ───────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
MIN_OUTCOMES = 50
MIN_VIRAL_EXAMPLES = 5
VIEWS_AUTO_VIRAL = 10_000  # backup labeling if went_viral wasn't set manually
MODEL_TYPE = "xgboost_v1"

# ─── FEATURE EXTRACTION ───────────────────────────────────────────────────────

def extract_video_features(schema: dict[str, Any]) -> dict[str, Any]:
    """Numeric features from a VideoPromptSchema (lib/studio/schema.ts)."""
    return {
        "hook_length": len(str(schema.get("hook", ""))),
        "script_length": len(str(schema.get("full_script", ""))),
        "scene_count": len(schema.get("scenes", []) or []),
        "dialogue_count": len(schema.get("dialogue", []) or []),
        "has_silence_beats": int(len(schema.get("silence_beats", []) or []) > 0),
        "has_trend_alignment": int(bool(schema.get("trend_alignment"))),
        "has_voice": int(bool(schema.get("voice"))),
        "duration": float(schema.get("duration_seconds", 0) or 0),
        "aspect_ratio_vertical": int(schema.get("aspect_ratio") == "9:16"),
        "platform_tiktok": int(schema.get("platform") == "tiktok"),
        "platform_reels": int(schema.get("platform") == "reels"),
        "platform_shorts": int(schema.get("platform") == "shorts"),
        "loopable": int(bool(schema.get("loopability"))),
        "has_cta": int(bool(schema.get("cta"))),
        "sfx_count": len(schema.get("sfx", []) or []),
        "tonality_comedic": int(str(schema.get("tonality", "")).lower() == "comedic"),
        "tonality_dramatic": int(str(schema.get("tonality", "")).lower() == "dramatic"),
    }


def extract_image_features(schema: dict[str, Any]) -> dict[str, Any]:
    """Numeric features from an ImagePromptSchema (lib/studio/schema.ts)."""
    return {
        "hook_length": len(str(schema.get("visual_hook", ""))),
        "text_overlay_count": len(schema.get("text_overlay", []) or []),
        "has_subjects": int(len(schema.get("subjects", []) or []) > 0),
        "subject_count": len(schema.get("subjects", []) or []),
        "aspect_ratio_vertical": int(schema.get("aspect_ratio") == "9:16"),
        "aspect_ratio_square": int(schema.get("aspect_ratio") == "1:1"),
        "platform_tiktok": int(schema.get("platform") == "tiktok"),
        "platform_reels": int(schema.get("platform") == "reels"),
        "photoreal": int("photo" in str(schema.get("style_medium", "")).lower()),
        "three_d": int("3d" in str(schema.get("style_medium", "")).lower()),
        "has_composition": int(bool(schema.get("composition"))),
        "scene_length": len(str(schema.get("scene", ""))),
    }


# Canonical column order. We pad missing keys with 0 so video + image rows
# share one feature matrix and the saved feature_columns list applies to
# inference uniformly.
ALL_FEATURE_COLUMNS = sorted(
    set(extract_video_features({}).keys()) | set(extract_image_features({}).keys())
) + ["media_type_video"]


def extract_features(schema: dict[str, Any], media_type: str) -> dict[str, Any]:
    if media_type == "video":
        base = extract_video_features(schema)
    else:
        base = extract_image_features(schema)
    # Fill in absent keys so every row has every column.
    row: dict[str, Any] = {col: 0 for col in ALL_FEATURE_COLUMNS}
    row.update(base)
    row["media_type_video"] = int(media_type == "video")
    return row


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main() -> int:
    print("=== Eigen Studio — Virality Model Training (Phase 7) ===\n")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
        print("Add both to .env at the repo root (service role key is local-only).")
        return 1

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Fetch outcomes joined with their blueprint's schema_json.
    # `!inner` requires the FK relationship; defined in supabase/studio-outcomes.sql.
    print("Fetching outcomes from Supabase…")
    result = sb.table("generation_outcomes").select(
        "id, went_viral, views, shares, saves, likes, platform, "
        "prompt_blueprints!inner(media_type, schema_json)"
    ).execute()
    rows = result.data or []
    print(f"  Found {len(rows)} outcomes\n")

    if len(rows) < MIN_OUTCOMES:
        print(
            f"Need at least {MIN_OUTCOMES} outcomes to train; have {len(rows)}. "
            f"Tier 2a (retrieval) keeps running. Record more outcomes and rerun."
        )
        return 0

    records: list[dict[str, Any]] = []
    for row in rows:
        bp_raw = row.get("prompt_blueprints") or {}
        # Supabase typed joins can return object OR list depending on cardinality.
        bp = bp_raw[0] if isinstance(bp_raw, list) and bp_raw else bp_raw
        schema = (bp or {}).get("schema_json") or {}
        media_type = (bp or {}).get("media_type") or "video"

        features = extract_features(schema, media_type)
        # Label: trust went_viral if set; otherwise fall back to views threshold.
        went_viral = bool(row.get("went_viral"))
        if not went_viral:
            views = int(row.get("views") or 0)
            went_viral = views >= VIEWS_AUTO_VIRAL
        features["went_viral"] = int(went_viral)
        records.append(features)

    df = pd.DataFrame(records)
    # Guarantee column order is deterministic across runs.
    feature_cols = [c for c in ALL_FEATURE_COLUMNS if c in df.columns]
    df = df[feature_cols + ["went_viral"]]

    n_viral = int(df["went_viral"].sum())
    n_not = int((df["went_viral"] == 0).sum())
    print("Class distribution:")
    print(f"  viral=1 : {n_viral}")
    print(f"  viral=0 : {n_not}\n")

    if n_viral < MIN_VIRAL_EXAMPLES:
        print(
            f"Only {n_viral} viral examples (need ≥{MIN_VIRAL_EXAMPLES}). "
            f"Too few for reliable training — record more outcomes and rerun."
        )
        return 0

    # Train / test split, stratified so both classes are represented in test.
    X = df[feature_cols]
    y = df["went_viral"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print("Training XGBoost…")
    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    auc = float(roc_auc_score(y_test, y_prob))

    print(f"\nAUC-ROC: {auc:.3f}\n")
    print("Classification report:")
    print(classification_report(y_test, y_pred))

    importances = dict(zip(feature_cols, model.feature_importances_.tolist()))
    top = sorted(importances.items(), key=lambda kv: kv[1], reverse=True)[:10]
    print("Top features:")
    for feat, imp in top:
        print(f"  {feat:<24} {imp:.4f}")

    # Serialize booster → JSON string (xgboost 2.x returns bytes).
    booster_bytes = model.get_booster().save_raw(raw_format="json")
    booster_json = (
        booster_bytes.decode("utf-8") if isinstance(booster_bytes, (bytes, bytearray)) else booster_bytes
    )

    artifact = {
        "model_type": MODEL_TYPE,
        "feature_columns": feature_cols,
        "feature_importances": importances,
        "metrics": {
            "auc_roc": round(auc, 4),
            "n_train": int(len(X_train)),
            "n_test": int(len(X_test)),
            "n_viral_total": n_viral,
            "n_not_viral_total": n_not,
        },
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_booster": booster_json,
    }

    print("\nUpserting artifact to studio_model_artifacts…")
    sb.table("studio_model_artifacts").upsert(
        {
            "model_type": MODEL_TYPE,
            "artifact_json": artifact,
            "trained_at": artifact["trained_at"],
        },
        on_conflict="model_type",
    ).execute()

    print("✓ Done. Tier 2b artifact is ready.")
    print("  When an inference endpoint is wired, it will load this row.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
