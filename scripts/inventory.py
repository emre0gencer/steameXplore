"""
Steam inventory processing utilities.

Covers:
  - buildItems   : merge assets + descriptions, deduplicate by (classid, instanceid),
                   aggregate quantities
  - RARITY_RANK  : color-hex → priority map (lower = rarer)
  - sort_by_rarity : stable rarity-first sort, alphabetical on ties
  - get_tag_value  : pull a specific category value out of an item's tags array
  - CS2 filter helpers

Can be imported as a module or run directly against a saved inventory JSON file:

    python inventory.py inventory.json
    python inventory.py inventory.json --appid 730 --rarity Covert
    python inventory.py inventory.json --type Rifle --exterior "Factory New"

Requires no third-party packages.
"""

from __future__ import annotations

import json
import sys
import argparse
from typing import Any


# ---------------------------------------------------------------------------
# Rarity colour map
# Maps the hex colour stored in name_color / rarity tag → sort priority.
# Lower number = rarer.  Items whose colour isn't listed sort last (999).
# ---------------------------------------------------------------------------

RARITY_RANK: dict[str, int] = {
    # CS2
    "e4ae39": 0,   # Contraband  (only Karambit Case Hardened Blue Gem tier)
    "eb4b4b": 1,   # Covert
    "d32ce6": 2,   # Classified
    "8847ff": 3,   # Restricted
    "4b69ff": 4,   # Mil-Spec
    "5e98d9": 5,   # Industrial Grade
    "b0c3d9": 6,   # Consumer Grade
    # TF2
    "ffd700": 0,   # Unusual
    "aa0000": 1,   # Collector's
    "8650ac": 3,   # Community
    # Dota 2
    "e29b00": 1,   # Immortal
    "aaaa00": 2,   # Ancient
}


# ---------------------------------------------------------------------------
# Tag helpers
# ---------------------------------------------------------------------------

def get_tag_value(item: dict[str, Any], category: str) -> str:
    """Return the localized tag name for a given category, or '' if absent."""
    for tag in item.get("tags", []):
        if tag.get("category") == category:
            return tag.get("localized_tag_name", "")
    return ""


def item_rarity_rank(item: dict[str, Any]) -> int:
    """
    Derive a numeric rarity rank for sorting.

    Checks the 'Rarity' tag colour first, falls back to name_color.
    Items not found in RARITY_RANK sort to the end (rank 999).
    """
    rarity_tag = next(
        (t for t in item.get("tags", []) if t.get("category") == "Rarity"),
        None,
    )
    raw_color = (
        rarity_tag.get("color", "") if rarity_tag else item.get("name_color", "")
    )
    color_key = raw_color.lower().lstrip("#")
    return RARITY_RANK.get(color_key, 999)


# ---------------------------------------------------------------------------
# Sorting
# ---------------------------------------------------------------------------

def sort_by_rarity(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Return a new list sorted rarest-first.
    Items with equal rarity rank are sorted alphabetically by name.
    Original list is not mutated.
    """
    return sorted(items, key=lambda item: (item_rarity_rank(item), item.get("name", "")))


# ---------------------------------------------------------------------------
# Item building  (mirrors buildItems in Inventory.tsx)
# ---------------------------------------------------------------------------

def build_items(
    assets: list[dict[str, Any]],
    descriptions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Merge a Steam inventory asset list with its description list.

    Steps:
      1. Index descriptions by "classid_instanceid".
      2. Count how many times each key appears in assets (quantity).
      3. Walk assets in order; emit one item per unique key, skipping duplicates.

    Returns a list of enriched item dicts, one per unique (classid, instanceid) pair.
    """
    if not assets or not descriptions:
        return []

    # Build description lookup
    desc_map: dict[str, dict] = {}
    for desc in descriptions:
        key = f"{desc['classid']}_{desc['instanceid']}"
        desc_map[key] = desc

    # Count quantities (assets may repeat the same key for stacked items)
    qty_map: dict[str, int] = {}
    for asset in assets:
        key = f"{asset['classid']}_{asset['instanceid']}"
        qty_map[key] = qty_map.get(key, 0) + 1

    # Emit one item per unique key, preserving original asset order
    seen: set[str] = set()
    items: list[dict] = []
    for asset in assets:
        key = f"{asset['classid']}_{asset['instanceid']}"
        if key in seen:
            continue
        seen.add(key)

        desc = desc_map.get(key)
        if not desc:
            continue

        items.append({
            "classid": asset["classid"],
            "instanceid": asset["instanceid"],
            "appid": desc.get("appid"),
            "name": desc.get("name", ""),
            "market_name": desc.get("market_name", ""),
            "market_hash_name": desc.get("market_hash_name") or desc.get("market_name", ""),
            "icon_url": desc.get("icon_url", ""),
            "icon_url_large": desc.get("icon_url_large") or desc.get("icon_url", ""),
            "name_color": desc.get("name_color", ""),
            "background_color": desc.get("background_color", ""),
            "type": desc.get("type", ""),
            "tradable": desc.get("tradable", 0),
            "marketable": desc.get("marketable", 0),
            "commodity": desc.get("commodity", 0),
            "market_tradable_restriction": desc.get("market_tradable_restriction"),
            "descriptions": desc.get("descriptions", []),
            "actions": desc.get("actions", []),
            "fraudwarnings": desc.get("fraudwarnings", []),
            "tags": desc.get("tags", []),
            "quantity": qty_map.get(key, 1),
        })

    return items


# ---------------------------------------------------------------------------
# CS2 filter  (mirrors the filter bar in Inventory.tsx)
# ---------------------------------------------------------------------------

def filter_items(
    items: list[dict[str, Any]],
    type_: str = "All",
    rarity: str = "All",
    exterior: str = "All",
    quality: str = "All",
) -> list[dict[str, Any]]:
    """
    Apply the same four CS2 filters available in the UI.
    Pass 'All' (default) to skip a filter.
    """
    out = []
    for item in items:
        if type_ != "All" and get_tag_value(item, "Type") != type_:
            continue
        if rarity != "All" and get_tag_value(item, "Rarity") != rarity:
            continue
        if exterior != "All" and get_tag_value(item, "Exterior") != exterior:
            continue
        if quality != "All" and get_tag_value(item, "Quality") != quality:
            continue
        out.append(item)
    return out


def available_filter_options(items: list[dict[str, Any]]) -> dict[str, list[str]]:
    """Return the set of unique values for each CS2 filter category."""
    categories = ["Type", "Rarity", "Exterior", "Quality"]
    return {
        cat: sorted({get_tag_value(i, cat) for i in items if get_tag_value(i, cat)})
        for cat in categories
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Process a Steam inventory JSON file: build, sort by rarity, and optionally filter.",
    )
    p.add_argument(
        "file",
        nargs="?",
        default="-",
        help="Path to a Steam inventory JSON file, or '-' to read from stdin (default: stdin)",
    )
    p.add_argument("--appid", type=int, help="Only show items for this appid")
    p.add_argument("--type",     dest="type_",   default="All", help="CS2 Type filter")
    p.add_argument("--rarity",   default="All",  help="CS2 Rarity filter")
    p.add_argument("--exterior", default="All",  help="CS2 Exterior filter")
    p.add_argument("--quality",  default="All",  help="CS2 Quality filter")
    p.add_argument("--json",     action="store_true", help="Output raw JSON instead of table")
    return p.parse_args()


def main() -> None:
    args = _parse_args()

    if args.file == "-":
        data = json.load(sys.stdin)
    else:
        with open(args.file, encoding="utf-8") as fh:
            data = json.load(fh)

    items = build_items(data.get("assets", []), data.get("descriptions", []))
    items = sort_by_rarity(items)

    if args.appid:
        items = [i for i in items if i.get("appid") == args.appid]

    items = filter_items(items, args.type_, args.rarity, args.exterior, args.quality)

    if args.json:
        json.dump(items, sys.stdout, indent=2)
        return

    opts = available_filter_options(items)
    if any(opts.values()):
        print("Available filter options:")
        for cat, vals in opts.items():
            if vals:
                print(f"  {cat}: {', '.join(vals)}")
        print()

    col_name     = 52
    col_rarity   = 22
    col_exterior = 18
    col_qty      = 5
    header = (
        f"{'Rank':<6}"
        f"{'Name':<{col_name}}"
        f"{'Rarity':<{col_rarity}}"
        f"{'Exterior':<{col_exterior}}"
        f"{'Qty':>{col_qty}}"
    )
    print(header)
    print("-" * len(header))

    for item in items:
        rarity_label   = get_tag_value(item, "Rarity") or item.get("name_color", "—")
        exterior_label = get_tag_value(item, "Exterior") or "—"
        rank           = item_rarity_rank(item)
        name           = item["name"][:col_name - 1]

        print(
            f"{rank:<6}"
            f"{name:<{col_name}}"
            f"{rarity_label[:col_rarity - 1]:<{col_rarity}}"
            f"{exterior_label[:col_exterior - 1]:<{col_exterior}}"
            f"{item['quantity']:>{col_qty}}"
        )

    print(f"\n{len(items)} item(s)")


if __name__ == "__main__":
    main()
