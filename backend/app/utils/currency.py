"""Currency rules shared by event validation and Chargily checkout.

Chargily only charges in DZD; events priced in another currency are
converted with the same fixed rates the frontend displays
(keep in sync with frontend/app/util.js and frontend/currencyUtils.js).
"""

RATES_TO_DZD = {"DZD": 1, "USD": 230, "EUR": 280, "GBP": 300}

# Chargily rejects checkouts below this amount
MIN_ONLINE_PRICE_DZD = 50


def to_dzd(price: float, currency: str | None) -> int:
    rate = RATES_TO_DZD.get((currency or "DZD").upper())
    if rate is None:
        raise ValueError(f"Unsupported currency: {currency}")
    return int(round(price * rate))
