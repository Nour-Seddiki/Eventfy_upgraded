"""Can a real person receive mail at this address?

Signup runs every new address through email_problem(), and the admin account review
uses it to flag existing accounts. On top of email-validator's syntax check it rejects
placeholder and disposable domains, catches common typos of the big providers, and asks
DNS whether the domain has a mail server at all (EMAIL_DOMAIN_CHECKS, on by default).

It can't prove the address belongs to whoever typed it (Eventfy sends no email; Google
sign-in is the one path that proves ownership), but it keeps out made-up, throwaway and
mistyped addresses.
"""
import functools

from email_validator import EmailNotValidError, EmailUndeliverableError, validate_email

from app.config import settings

# Documentation/test domains, and ones people type to get past a form.
PLACEHOLDER_DOMAINS = frozenset({
    "example.com", "example.net", "example.org", "example.edu",
    "test.com", "test.net", "test.org", "testing.com", "demo.com", "fake.com",
    "fakemail.com", "domain.com", "yourdomain.com", "mydomain.com", "company.com",
    "email.test", "mail.test", "noemail.com", "nomail.com", "none.com", "invalid.com",
})
# Reserved top-level domains (RFC 2606/6761) that never have public mail servers.
RESERVED_TLDS = frozenset({"test", "example", "invalid", "localhost", "local", "internal", "lan", "home", "corp"})

# Throwaway inboxes (the common ones; subdomains are matched too).
DISPOSABLE_DOMAINS = frozenset({
    "mailinator.com", "mailinator.net", "mailinator.org", "guerrillamail.com", "guerrillamail.net",
    "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de", "guerrillamailblock.com", "sharklasers.com",
    "grr.la", "pokemail.net", "spam4.me", "10minutemail.com", "10minutemail.net", "10minemail.com",
    "20minutemail.com", "temp-mail.org", "temp-mail.io", "tempmail.com", "tempmail.net", "tempmail.dev",
    "tempmailo.com", "tempmail.plus", "tempr.email", "tempail.com", "temp-mail.com", "tmpmail.org",
    "tmpmail.net", "tmail.ws", "discard.email", "discardmail.com", "yopmail.com", "yopmail.net",
    "yopmail.fr", "cool.fr.nf", "jetable.org", "trashmail.com", "trashmail.de", "trashmail.net",
    "trash-mail.com", "getnada.com", "nada.email", "maildrop.cc", "mintemail.com", "mohmal.com",
    "throwawaymail.com", "fakeinbox.com", "dispostable.com", "mailnesia.com", "mytemp.email",
    "emailondeck.com", "spamgourmet.com", "burnermail.io", "moakt.com", "mailcatch.com",
    "inboxkitten.com", "1secmail.com", "1secmail.org", "1secmail.net", "emailfake.com",
    "fakemailgenerator.com", "armyspy.com", "cuvox.de", "dayrep.com", "einrot.com", "fleckens.hu",
    "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us", "mail.tm",
    "mailto.plus", "etempmail.com", "harakirimail.com", "spambox.us", "incognitomail.org",
    "anonbox.net", "mail-temp.com", "zetmail.com", "byom.de", "wegwerfmail.de", "crazymailing.com",
    "mailpoof.com", "dropmail.me", "emltmp.com", "tempinbox.com", "spamdecoy.net", "mailbox.in.ua",
})

# Typos of the providers most people use; several of these domains really exist (and
# accept mail), so DNS alone would let the typo through.
COMMON_TYPOS = {
    "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gmaill.com": "gmail.com",
    "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmail.co": "gmail.com", "gmail.cm": "gmail.com",
    "gmail.con": "gmail.com", "gmail.om": "gmail.com", "gmail.fr": "gmail.com", "gmail.dz": "gmail.com",
    "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmal.com": "hotmail.com",
    "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com", "hotamil.com": "hotmail.com",
    "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com",
    "outlok.com": "outlook.com", "outloo.com": "outlook.com", "outlook.co": "outlook.com",
    "outlook.con": "outlook.com", "icloud.co": "icloud.com", "iclod.com": "icloud.com",
}


def normalize_email(email: str) -> str:
    """Accounts compare emails case-insensitively; store them lowercase."""
    return (email or "").strip().lower()


def _in(domain: str, domains: frozenset) -> bool:
    parts = domain.split(".")
    return any(".".join(parts[i:]) in domains for i in range(len(parts) - 1))


@functools.lru_cache(maxsize=1024)
def _dns_problem(domain: str) -> str | None:
    """Does the domain publish a mail server? Timeouts and resolver failures pass."""
    try:
        validate_email(f"postmaster@{domain}", check_deliverability=True, timeout=5)
    except EmailUndeliverableError:
        return f"{domain} can't receive email. Check the email address for typos."
    except EmailNotValidError as exc:
        return str(exc)
    return None


def email_problem(email: str, *, strict: bool | None = None) -> str | None:
    """Why this email can't be an account's address, or None when it looks real.

    strict (default: EMAIL_DOMAIN_CHECKS) adds the domain checks: typos, placeholder and
    disposable domains, and a DNS lookup for a mail server. Without it, syntax only.
    """
    try:
        info = validate_email(email or "", check_deliverability=False)
    except EmailNotValidError as exc:
        return f"Enter a valid email address. {exc}"
    if not (settings.email_domain_checks if strict is None else strict):
        return None
    local, domain = info.local_part, info.ascii_domain.lower()
    if domain in COMMON_TYPOS:
        return f"Did you mean {local}@{COMMON_TYPOS[domain]}? Check the email address for typos."
    if _in(domain, PLACEHOLDER_DOMAINS) or domain.rsplit(".", 1)[-1] in RESERVED_TLDS:
        return f"{domain} is a placeholder, not a real mailbox. Use an email address you can open."
    if _in(domain, DISPOSABLE_DOMAINS):
        return "Disposable email addresses aren't accepted. Use an email address you'll keep."
    return _dns_problem(domain)
