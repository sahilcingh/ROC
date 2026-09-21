# ROC / MCA Company Lookup API — Project Notes

## What this is

An API that looks up Indian company/LLP data from ZaubaCorp:
1. Send a partial company/LLP name (3+ characters) → get back a list of matching companies.
2. Send the identifier of one of those matches → get back its full details (address, status, capital, directors and each director's other directorships, etc).

## Original requirement

The scope comes directly from the person who requested it:

> "click search and find MDa Soft, it will show list of companies with name MDa Soft, select the company and it will show details about th compnay, bas yahi banane hai. I will give name of company few characters and you have to give list of companies and when i give the name you have to give all other information."

That's the entire confirmed scope — a stateless, on-demand, two-step lookup. There is no bulk/mass-import requirement; an earlier prototype included a SQL Server bulk-import endpoint, but that turned out not to be part of the actual ask and was removed.

## Key architecture decisions

1. **No headless browser.** The original prototype used Puppeteer to get past Cloudflare. The target deploy VPS cannot have Chrome installed, so any browser-based approach is off the table regardless of whether it's needed.
2. **Plain HTTP is enough — but not from Node's own `fetch`.** ZaubaCorp does not serve a Cloudflare JS challenge for these endpoints under normal request patterns — verified live. However, Node's built-in `fetch` (undici) gets fingerprinted and blocked with a 403 "Just a moment..." challenge on every request, while the `curl` binary with identical headers is not blocked (verified back-to-back, same IP, ruling out rate-limiting). So the app shells out to the real `curl` binary via `child_process` instead of using `fetch`/axios directly. **`curl` must be present on the deploy VPS** — near-universal on Linux, but worth a quick `curl --version` check.
3. **Stateless — no database.** No SQL Server, no persistence. Each request scrapes live and returns the result.
4. **Response format kept backward-compatible** with the original prototype's delimited-string format (`Key:Value^Key:Value...`) in case a client is already built against it.

## API endpoints

- `POST /MCAGetCIN` — body `{ ComName, SCode }` → `{ RData }`, a `Name~Identifier^Name~Identifier...` list.
- `POST /MDAGetCINMasterData` — body `{ CIN, SCode }` (CIN = the identifier from the search step) → `{ CIN, RData }`, a `Key:Value^Key:Value...` string.
- `GET /SData` — trivial health check.

Both real endpoints require a shared secret (`SCODE_GETCIN` / `SCODE_MASTER` env vars) sent as `SCode`.

## Testing status (2026-09-20)

Verified live against zaubacorp.com. Found and fixed 3 bugs along the way:
- A non-existent identifier returned an all-blank record instead of "No Data Found !" (ZaubaCorp returns HTTP 500 for unknown slugs, not 404) — fixed by detecting an empty parsed company name.
- LLPs use different ZaubaCorp field labels than companies ("LLP Status", "LLP Identification Number", "Number of Partners") — fixed with fallback lookups.
- Foreign companies (CIN starting with `F`) use "Foreign Company Registration Number" — same fix applied.

Confirmed working with no further changes needed: regular public/private limited companies, an LLP with zero partners, an LLP with multiple partners and nested other-directorships, and a large/complex real case (a company under liquidation with ~6 directors each holding dozens of other directorships).

**Not yet tested:** One Person Company (OPC), Section 8/non-profit-specific fields, a company with status literally "Struck Off".

## Known open items

- No rate limiting yet on the two endpoints (recommended regardless of ZaubaCorp's own limits, to prevent abuse of our own API).
- Fallback behavior if ZaubaCorp/Cloudflare ever blocks `curl` too is not built — currently returns `"Error: Blocked by site protection"` with no automatic retry/fallback path.
- Bulk import (scraping ZaubaCorp's full company list into a database) is explicitly **not** part of current scope, but flagged as a likely future need — would require its own throttling, persistence, and legal/ToS review before building.

## Running locally

```
npm install
cp .env.example .env   # fill in SCODE_GETCIN, SCODE_MASTER, PORT
npm start
```
