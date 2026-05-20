"""
Steam account value estimator.

Covers:
  - parse_cents          : strip currency symbols, convert to integer cents
  - compute_games_value  : sum SteamSpy initial prices across the game library
  - compute_inventory_value : price CS2 items via Skinport bulk API,
                              Dota 2 / TF2 / Rust via Steam Market priceoverview
  - compute_badges_value : estimate cost to craft every badge the user has earned

Rate-limiting is handled with module-level timestamps (same approach as the
Node.js backend): each uncached outbound request checks how long ago the last
one fired and sleeps only as long as necessary.

Usage:
    pip install requests
    python account_value.py --key YOUR_API_KEY --steamid 76561198XXXXXXXXX
    python account_value.py --key YOUR_API_KEY --steamid 76561198XXXXXXXXX --skip-inventory
    python account_value.py --key YOUR_API_KEY --steamid 76561198XXXXXXXXX --json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from urllib.parse import quote as url_quote

try:
    import requests
except ImportError:
    sys.exit("Missing dependency: pip install requests")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

STEAM_API_BASE = "https://api.steampowered.com"

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

# Minimum seconds between uncached requests to each rate-limited endpoint
_MARKET_DELAY = 1.1   # Steam Market priceoverview
_BADGE_DELAY  = 0.5   # Steam Market search/render (badge card prices)

# Module-level timestamps + locks (thread-safe for parallel sub-computations)
_last_market_fetch: float = 0.0
_last_badge_fetch:  float = 0.0
_market_lock = threading.Lock()
_badge_lock  = threading.Lock()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_cents(price_str: str) -> int:
    """
    Convert a price string such as '$12.34' or '€5.99' to integer cents.
    Strips every character that is not a digit or a decimal point, then
    multiplies by 100 and rounds.

    Returns 0 if the string cannot be parsed.
    """
    cleaned = "".join(ch for ch in price_str if ch.isdigit() or ch == ".")
    try:
        return round(float(cleaned) * 100)
    except ValueError:
        return 0


def fmt_cents(cents: int) -> str:
    """Format integer cents as a human-readable USD string."""
    return f"${cents / 100:,.2f}"


def _rate_wait(last: float, delay: float) -> float:
    """Sleep only the remaining time needed to honour a rate limit.
    Returns the timestamp of the call that is about to be made.
    Callers must hold the appropriate lock before calling this."""
    gap = delay - (time.monotonic() - last)
    if last > 0 and gap > 0:
        time.sleep(gap)
    return time.monotonic()


def _steam_api(endpoint: str, api_key: str, **params) -> dict:
    """GET a Steam Web API endpoint and return the parsed JSON."""
    r = requests.get(
        f"{STEAM_API_BASE}{endpoint}",
        params={"key": api_key, **params},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()




# ---------------------------------------------------------------------------
# Games value
# Mirrors computeGamesValue + getSteamSpyInitialPrice in accountValue.ts
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1024)
def _steamspy_initial_price(appid: int) -> int:
    """
    Fetch the initial (launch) price for a game from SteamSpy in cents.
    Returns 0 for free-to-play games or when the data is unavailable.
    Results are cached in-process to avoid duplicate requests.
    """
    try:
        r = requests.get(
            "https://steamspy.com/api.php",
            params={"request": "appdetails", "appid": appid},
            timeout=10,
        )
        data = r.json()
        raw = data.get("initialprice") or "0"
        cents = int(raw)
        return cents if cents > 0 else 0
    except Exception:
        return 0


def compute_games_value(api_key: str, steamid: str) -> dict:
    """
    Estimate the total value of a user's game library.

    Algorithm:
      1. Fetch all owned games via IPlayerService/GetOwnedGames.
      2. Split into chunks of 10 and query SteamSpy for each appid.
         (Chunking + 150 ms inter-chunk sleep avoids overwhelming SteamSpy.)
      3. Sum the initial prices; skip free/missing entries (price == 0).
      4. Return totals plus the top 50 games sorted by price descending.
    """
    data = _steam_api(
        "/IPlayerService/GetOwnedGames/v1",
        api_key,
        steamid=steamid,
        include_appinfo=1,
        include_played_free_games=1,
    )
    games: list[dict] = data.get("response", {}).get("games", [])

    priced: list[dict] = []
    chunks = [games[i : i + 10] for i in range(0, len(games), 10)]

    for chunk_idx, chunk in enumerate(chunks):
        for game in chunk:
            cents = _steamspy_initial_price(game["appid"])
            if cents > 0:
                priced.append({**game, "initialprice_cents": cents})
        # Pause between chunks (skip after last)
        if chunk_idx < len(chunks) - 1:
            time.sleep(0.15)

    total_cents = sum(g["initialprice_cents"] for g in priced)
    top_games   = sorted(priced, key=lambda g: g["initialprice_cents"], reverse=True)[:50]

    return {
        "total_cents":   total_cents,
        "game_count":    len(games),
        "priced_count":  len(priced),
        "top_games":     top_games,
    }


# ---------------------------------------------------------------------------
# Inventory value
# Mirrors computeInventoryValue + buildQtyMap + fetchSteamMarketPrice
# ---------------------------------------------------------------------------

def _fetch_raw_inventory(steamid: str, appid: int) -> dict:
    """Fetch a raw Steam community inventory, retrying once on HTTP 429."""
    url = f"https://steamcommunity.com/inventory/{steamid}/{appid}/2"
    headers = {
        **_BROWSER_HEADERS,
        "Referer": f"https://steamcommunity.com/profiles/{steamid}/inventory/",
    }
    r = requests.get(url, params={"l": "english", "count": 2000}, headers=headers, timeout=20)
    if r.status_code == 429:
        time.sleep(5)
        r = requests.get(url, params={"l": "english", "count": 2000}, headers=headers, timeout=20)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise RuntimeError(f"Steam returned failure for inventory appid={appid}")
    return data


def _build_qty_map(inv: dict | None) -> dict[str, dict]:
    """
    Build a map of  market_hash_name → { qty, desc }  for marketable items.

    This mirrors buildQtyMap inside computeInventoryValue.  Only descriptions
    with marketable == 1 are included; quantities for identical items are summed.
    """
    if not inv:
        return {}

    desc_map: dict[str, dict] = {
        f"{d['classid']}_{d['instanceid']}": d
        for d in inv.get("descriptions", [])
        if d.get("marketable") == 1
    }

    qty_map: dict[str, dict] = {}
    for asset in inv.get("assets", []):
        key  = f"{asset['classid']}_{asset['instanceid']}"
        desc = desc_map.get(key)
        if not desc:
            continue
        mhn = desc.get("market_hash_name", "")
        amount = int(asset.get("amount", 1))
        if mhn in qty_map:
            qty_map[mhn]["qty"] += amount
        else:
            qty_map[mhn] = {"qty": amount, "desc": desc}

    return qty_map


@lru_cache(maxsize=4096)
def _steam_market_price(appid: int, market_hash_name: str) -> int | None:
    """
    Fetch the Steam Market lowest_price for one item in cents.

    Rate-limited to ~1 request per 1.1 s (same as the Node.js backend).
    Results are cached in-process; a cached hit does not consume the delay.
    Returns None if the item has no listing or the request fails.
    """
    global _last_market_fetch
    with _market_lock:
        _last_market_fetch = _rate_wait(_last_market_fetch, _MARKET_DELAY)

    url = (
        "https://steamcommunity.com/market/priceoverview/"
        f"?appid={appid}&market_hash_name={url_quote(market_hash_name)}&currency=1"
    )
    try:
        r = requests.get(url, headers=_BROWSER_HEADERS, timeout=12)
        if r.status_code == 429:
            time.sleep(2)
            r = requests.get(url, headers=_BROWSER_HEADERS, timeout=12)
        data = r.json()
        if not data.get("success") or not data.get("lowest_price"):
            return None
        return parse_cents(data["lowest_price"])
    except Exception:
        return None


def _skinport_price_map() -> dict[str, dict]:
    """
    Download the full Skinport CS2 item price list in one bulk request.
    Returns a dict keyed by market_hash_name.
    """
    r = requests.get(
        "https://api.skinport.com/v1/items",
        params={"app_id": 730, "currency": "USD"},
        headers=_BROWSER_HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    return {item["market_hash_name"]: item for item in r.json()}


def compute_inventory_value(
    steamid: str,
    prefetched: dict[str, dict | None] | None = None,
) -> dict:
    """
    Estimate inventory value across CS2 (730), Dota 2 (570), TF2 (440), Rust (252490).

    CS2 items are priced via Skinport's bulk endpoint (one request for all items).
    Dota 2, TF2, and Rust items are priced one-by-one via Steam Market
    priceoverview, with a 1.1 s rate-limit between uncached fetches.

    If `prefetched` is provided (dict keyed by str(appid)) it is used directly
    instead of fetching from Steam — the caller (Node.js backend) supplies this
    because its proven fetch path is more reliable than Python requests here.

    Failed inventory fetches (private profile, empty) contribute $0 to the total.
    """
    APPIDS = [730, 570, 440, 252490]
    inventories: dict[int, dict | None] = {}
    for appid in APPIDS:
        if prefetched is not None:
            inventories[appid] = prefetched.get(str(appid))
        else:
            try:
                inventories[appid] = _fetch_raw_inventory(steamid, appid)
            except Exception as exc:
                print(f"  [warn] inventory {appid} unavailable: {exc}", file=sys.stderr)
                inventories[appid] = None

    top_items: list[dict] = []
    totals: dict[int, int] = {a: 0 for a in APPIDS}

    # --- CS2: Skinport bulk pricing ---
    cs2_qty = _build_qty_map(inventories.get(730))
    if cs2_qty:
        try:
            price_map = _skinport_price_map()
            for mhn, entry in cs2_qty.items():
                sp_item = price_map.get(mhn)
                if sp_item and sp_item.get("min_price") is not None:
                    price_cents = round(sp_item["min_price"] * 100)
                    totals[730] += price_cents * entry["qty"]
                    top_items.append({
                        "appid":             730,
                        "name":              entry["desc"].get("name", ""),
                        "market_hash_name":  mhn,
                        "price_cents":       price_cents,
                        "quantity":          entry["qty"],
                    })
        except Exception as exc:
            print(f"  [warn] CS2 Skinport pricing failed: {exc}", file=sys.stderr)

    # --- Dota 2, TF2, Rust: Steam Market per-item pricing ---
    for appid in [570, 440, 252490]:
        for mhn, entry in _build_qty_map(inventories.get(appid)).items():
            price_cents = _steam_market_price(appid, mhn)
            if price_cents:
                totals[appid] += price_cents * entry["qty"]
                top_items.append({
                    "appid":            appid,
                    "name":             entry["desc"].get("name", ""),
                    "market_hash_name": mhn,
                    "price_cents":      price_cents,
                    "quantity":         entry["qty"],
                })

    top_items.sort(key=lambda i: i["price_cents"] * i["quantity"], reverse=True)

    return {
        "total_cents":  sum(totals.values()),
        "cs2_cents":    totals[730],
        "dota2_cents":  totals[570],
        "tf2_cents":    totals[440],
        "rust_cents":   totals[252490],
        "top_items":    top_items[:50],
    }


# ---------------------------------------------------------------------------
# Badges value
# Mirrors computeBadgesValue + getBadgeCardData in accountValue.ts
# ---------------------------------------------------------------------------

@lru_cache(maxsize=2048)
def _badge_card_data(appid: int) -> dict | None:
    """
    Fetch the trading card count and median card price for one game.

    Queries Steam Market search/render filtered to item_class=2 (trading cards)
    for the given game.  Rate-limited to ~2 requests per second.

    Returns { card_count, median_price } in cents, or None if no cards found.
    """
    global _last_badge_fetch
    with _badge_lock:
        _last_badge_fetch = _rate_wait(_last_badge_fetch, _BADGE_DELAY)

    url = (
        "https://steamcommunity.com/market/search/render/"
        "?appid=753"
        "&category_753_item_class[]=tag_item_class_2"
        f"&category_753_Game[]=tag_Game_{appid}"
        "&count=100&sort_column=price&sort_dir=asc&norender=0"
    )
    try:
        r = requests.get(url, headers=_BROWSER_HEADERS, timeout=12)
        data = r.json()
        if not data.get("success") or not data.get("total_count") or not data.get("results"):
            return None
        prices = sorted(
            result["sell_price"]
            for result in data["results"]
            if result.get("sell_price", 0) > 0
        )
        if not prices:
            return None
        return {
            "card_count":   len(data["results"]),
            "median_price": prices[len(prices) // 2],
        }
    except Exception:
        return None


def compute_badges_value(api_key: str, steamid: str) -> dict:
    """
    Estimate how much it cost (in trading cards) to craft every badge.

    Algorithm:
      1. Fetch all badges via IPlayerService/GetBadges.
      2. Filter to game badges only (appid > 0, level > 0).
         Level-0 and system badges (appid == 0) are excluded.
      3. For each unique game appid, query Steam Market for the card set
         price (cached per appid to avoid duplicate requests).
      4. Craft cost per badge = badge.level × card_count × median_card_price.
    """
    data   = _steam_api("/IPlayerService/GetBadges/v1", api_key, steamid=steamid)
    badges = [
        b for b in data.get("response", {}).get("badges", [])
        if b.get("appid", 0) > 0 and b.get("level", 0) > 0
    ]

    # Limit to 50 unique game appids (highest-level first) to bound computation time.
    # At 0.5 s/request that caps badge pricing at ~25 s in the worst case.
    seen: set[int] = set()
    limited: list[dict] = []
    for badge in sorted(badges, key=lambda b: b.get("level", 0), reverse=True):
        if badge["appid"] not in seen:
            seen.add(badge["appid"])
            limited.append(badge)
            if len(seen) >= 50:
                break
    badges = limited

    total_cents  = 0
    priced_count = 0

    for badge in badges:
        card_data = _badge_card_data(badge["appid"])
        if card_data:
            total_cents  += badge["level"] * card_data["card_count"] * card_data["median_price"]
            priced_count += 1

    return {
        "total_cents":   total_cents,
        "badge_count":   len(badges),
        "priced_count":  priced_count,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Estimate the total value of a Steam account.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Note: inventory and badge valuation make many sequential HTTP requests\n"
            "and can take several minutes for large accounts.  Use --skip-inventory\n"
            "and --skip-badges for a faster games-only estimate."
        ),
    )
    p.add_argument("--key",              required=True,  help="Steam Web API key")
    p.add_argument("--steamid",          required=True,  help="SteamID64 of target account")
    p.add_argument("--inventories-json", default=None,   help="Path to JSON file with pre-fetched inventory data (keyed by appid string)")
    p.add_argument("--skip-inventory",   action="store_true", help="Skip inventory valuation")
    p.add_argument("--skip-badges",      action="store_true", help="Skip badge valuation")
    p.add_argument("--top",              type=int, default=10,  help="Top N items/games to display (default 10)")
    p.add_argument("--json",             action="store_true",   help="Print full result as JSON")
    return p.parse_args()


def main() -> None:
    args = _parse_args()

    _empty_inventory: dict = {
        "total_cents": 0, "cs2_cents": 0, "dota2_cents": 0,
        "tf2_cents": 0, "rust_cents": 0, "top_items": [],
    }
    _empty_badges: dict = {"total_cents": 0, "badge_count": 0, "priced_count": 0}

    # Load pre-fetched inventory data if provided by the caller (Node.js backend).
    prefetched_inventories: dict[str, dict | None] | None = None
    if args.inventories_json:
        with open(args.inventories_json, encoding="utf-8") as fh:
            prefetched_inventories = json.load(fh)

    if args.json:
        # Run all three sub-computations in parallel for the backend path.
        futures: dict = {}
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures["games"] = pool.submit(compute_games_value, args.key, args.steamid)
            if not args.skip_inventory:
                futures["inventory"] = pool.submit(
                    compute_inventory_value, args.steamid, prefetched_inventories
                )
            if not args.skip_badges:
                futures["badges"] = pool.submit(compute_badges_value, args.key, args.steamid)

        games     = futures["games"].result()
        inventory = futures["inventory"].result() if "inventory" in futures else _empty_inventory
        badges    = futures["badges"].result()    if "badges"    in futures else _empty_badges
    else:
        # Interactive (CLI) path: sequential with progress output.
        print(f"Estimating account value for {args.steamid} …\n")
        print("Computing game library value …")
        games = compute_games_value(args.key, args.steamid)
        print(f"  {games['priced_count']}/{games['game_count']} games priced  →  {fmt_cents(games['total_cents'])}")

        inventory = _empty_inventory
        if not args.skip_inventory:
            print("\nComputing inventory value …")
            inventory = compute_inventory_value(args.steamid, prefetched_inventories)
            print(
                f"  CS2 {fmt_cents(inventory['cs2_cents'])}  "
                f"Dota2 {fmt_cents(inventory['dota2_cents'])}  "
                f"TF2 {fmt_cents(inventory['tf2_cents'])}  "
                f"Rust {fmt_cents(inventory['rust_cents'])}"
            )
            print(f"  Total inventory: {fmt_cents(inventory['total_cents'])}")

        badges = _empty_badges
        if not args.skip_badges:
            print("\nComputing badge craft value …")
            badges = compute_badges_value(args.key, args.steamid)
            print(f"  {badges['priced_count']}/{badges['badge_count']} badges priced  →  {fmt_cents(badges['total_cents'])}")

    grand_total = games["total_cents"] + inventory["total_cents"] + badges["total_cents"]

    result = {
        "games":             games,
        "inventory":         inventory,
        "badges":            badges,
        "grand_total_cents": grand_total,
    }

    if args.json:
        json.dump(result, sys.stdout, indent=2)
        return

    # Human-readable summary
    divider = "─" * 46
    print(f"\n{divider}")
    print(f"  Games      {fmt_cents(games['total_cents']):>12}")
    print(f"  Inventory  {fmt_cents(inventory['total_cents']):>12}")
    print(f"  Badges     {fmt_cents(badges['total_cents']):>12}")
    print(divider)
    print(f"  TOTAL      {fmt_cents(grand_total):>12}")

    n = args.top
    if games["top_games"]:
        print(f"\nTop {n} most expensive games:")
        for g in games["top_games"][:n]:
            print(f"  {fmt_cents(g['initialprice_cents']):>9}  {g['name']}")

    if inventory["top_items"]:
        print(f"\nTop {n} most valuable inventory items:")
        for item in inventory["top_items"][:n]:
            line_total = item["price_cents"] * item["quantity"]
            qty_str    = f" ×{item['quantity']}" if item["quantity"] > 1 else ""
            print(f"  {fmt_cents(line_total):>9}  {item['name']}{qty_str}")


if __name__ == "__main__":
    main()
