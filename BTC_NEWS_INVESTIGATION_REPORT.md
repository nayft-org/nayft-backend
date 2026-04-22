# BTC Related News Investigation Report

## Purpose

This report explains, in simple language, why Bitcoin (`BTC`) related news is not showing up correctly even though Bitcoin news articles do exist in the database.

The goal of this report is to help anyone, including a beginner, understand:

- what we investigated
- which database collections were checked
- what each collection is used for
- what we found
- what the findings mean
- what the most likely root cause is
- what we learned by comparing a failing coin (`BTC`) with a working coin (`USDT` / Tether)

This report is based on direct database inspection, not assumptions.

---

## Short Summary

Bitcoin news is **not missing from the database**.

Instead, Bitcoin news articles are being **stored with the wrong coin tags**.

That means:

- articles about Bitcoin are present in `newsarticles`
- but they are not tagged with `BTC`
- because of that, when the app asks for Bitcoin-related news using the `BTC` tag, it gets nothing

So the problem is most likely **incorrect news-to-coin tagging during ingestion**, not a lack of news articles.

An additional finding from the Tether comparison is also important:

- being present in `coin_identity_resolution_queue` does **not** automatically mean a coin will fail to show related news
- a coin can still show related news if its articles are tagged correctly in `newsarticles`

---

## What We Wanted To Verify

We wanted to answer this question:

> If a coin like BTC shows no related news in the app, is that because no news exists, or because the news was stored incorrectly?

To answer that, we checked:

1. whether BTC exists as a valid coin in the database
2. whether BTC is considered eligible for news tagging
3. whether any BTC-tagged articles exist in `newsarticles`
4. whether Bitcoin-related articles exist in `newsarticles` even if they are not tagged as `BTC`
5. whether there are any data quality problems that could explain the mismatch
6. whether a working comparison coin behaves differently
7. whether `coin_identity_resolution_queue` is actually connected to the related-news failure

---

## How To Read The Queries In This Report

This section is here for beginners.

If you are not used to MongoDB, the investigation queries can feel technical even when the logic is simple.

So before going deeper, here is how to think about them.

### `find(...)`

This is used when we want to inspect actual matching documents.

Example idea:

- "show me all rows where `symbol` is `BTC`"

Why it matters:

- it helps us see raw stored data
- it is good for confirming whether something exists
- it is good for spotting duplicates or wrong field values

### `countDocuments(...)`

This is used when we only care about how many matching rows exist.

Example idea:

- "how many articles are tagged with `BTC`?"

Why it matters:

- it quickly confirms presence or absence
- it helps compare one coin against another
- it helps validate whether a fix actually improved results

### `$text: { $search: ... }`

This is used when we want to search article text instead of relying on stored tags.

Example idea:

- "find articles mentioning BTC or bitcoin"

Why it matters:

- it helps separate "article does not exist" from "article exists but is tagged wrongly"

This was one of the most important techniques in the whole investigation.

### `aggregate([...])`

This is used when we want to summarize patterns across many rows.

Example idea:

- "show the most common symbols stored inside article coin tags"
- "group suspicious symbols and show sample article titles"

Why it matters:

- it helps prove whether an issue is isolated or widespread
- it helps detect patterns that are hard to see from individual documents

### `$unwind`

This takes an array field, like `coins`, and expands it so each element can be analyzed separately.

Why it matters here:

- each news article can have multiple coin tags
- to count individual stored symbols, we first need to split the array into separate entries

### `$group`

This combines matching rows into summary buckets.

Example idea:

- "group by `coins.symbol` and count how many times each symbol appears"

Why it matters:

- it helps us detect repeated bad tags such as `TRUMP`, `TIME`, or `MOVE`

### Projection Objects

In many queries, we used something like:

```javascript
{ _id: 0, title: 1, coins: 1, publishedAt: 1 }
```

This simply means:

- hide `_id`
- show only the fields we care about

Why it matters:

- it makes the output easier to read
- it prevents noise from distracting the investigation

---

## Collections We Investigated

### 1. `coin_registry`

This is the main coin identity collection.

It stores the canonical coin records, such as:

- `coinId`
- `internalCoinId`
- `symbol`
- `name`

You can think of this as the main identity table for coins.

If this collection is inconsistent, many other features can behave strangely.

### 2. `exchange_listed_assets`

This collection stores coin symbols that are actively listed on supported exchanges.

Examples:

- BTC on Binance
- BTC on Bybit
- BTC on Coinbase
- BTC on OKX

This collection is important because the current news ingestion logic uses it to decide which coin symbols are "tracked" for news tagging.

In simple words:

- if a symbol is present here, the news ingestion system is allowed to tag articles with that symbol
- if a symbol is missing here, the ingestion system may skip tagging it entirely

### 3. `coin_news_tagging_map`

This collection stores news-tagging metadata for coins.

It includes fields like:

- `symbol`
- `name`
- `keywords`

For BTC, this should ideally help represent that:

- symbol is `BTC`
- name is `Bitcoin`
- possible keyword is `btc`

However, in the current backend implementation, this collection is **not the main source used by `/api/news/store-news`** for deciding tracked coins during ingestion.

That is a very important detail.

### 4. `newsarticles`

This is the collection where ingested news articles are stored.

Each article can contain:

- article title
- publish time
- source info
- a `coins` array

The `coins` array is what connects an article to one or more coins.

Example of expected good tagging:

```json
{
  "title": "Bitcoin may hit new all-time highs",
  "coins": [
    { "symbol": "BTC", "name": "Bitcoin" }
  ]
}
```

If the `coins` array is wrong, the article may exist in the database but still not appear under the correct coin in the app.

### 5. `coin_identity_resolution_queue`

This collection stores tokens that the system could not confidently resolve to a clean internal coin identity.

Examples of fields in this collection:

- `inputToken`
- `normalizedToken`
- `status`
- `confidence`
- `retryCount`

This collection is useful for identity-debugging, but it is very important to understand what it does and does not mean.

What it means:

- some part of the system tried to resolve a token like `tether`
- that resolution was uncertain or failed

What it does **not** automatically mean:

- that related news will fail
- that news ingestion failed
- that the coin cannot appear in the app

This distinction became much clearer after comparing BTC with Tether.

---

## Database Checks Performed

## Step 1. Check Whether BTC Exists In `coin_registry`

Query used:

```javascript
db.coin_registry.find(
  { symbol: "BTC" },
  { _id: 0, coinId: 1, internalCoinId: 1, symbol: 1, name: 1 }
)
```

### Result

Two BTC rows were found:

- `coinId: "1"` with one `internalCoinId`
- `coinId: "bitcoin"` with a different `internalCoinId`

Both rows had:

- `symbol: "BTC"`
- `name: "Bitcoin"`

### What This Means

This shows a data consistency problem.

There should ideally be one clean identity for Bitcoin, but instead there are two BTC records with different internal identities.

This does **not automatically prove** why BTC news is missing, but it is an important warning sign because duplicate identities can create confusion across the system.

For example:

- one part of the app may reference one internal ID
- another part may reference another internal ID
- data can become split across identity paths

So this is a real issue, even if it is not the final root cause of the news problem.

---

## Step 2. Check Whether BTC Is Present In `exchange_listed_assets`

Query used:

```javascript
db.exchange_listed_assets.find(
  { base_asset: "BTC" },
  { _id: 0, internalCoinId: 1, provider: 1, base_asset: 1, quote_asset: 1, status: 1 }
)
```

### Result

BTC was found in multiple exchange rows, including providers like:

- `binance`
- `bybit`
- `coinbase`
- `okx`

### What This Means

This is very important.

It proves BTC is part of the tracked coin universe used by the current news ingestion system.

In simple language:

- BTC is not being ignored because it is missing from exchange listings
- the ingestion system is allowed to tag articles as BTC

So we can rule out one possible explanation:

> "Maybe BTC is missing because the system does not know BTC is a tracked coin."

That explanation is false. BTC is definitely tracked.

---

## Step 3. Check Whether BTC Exists In `coin_news_tagging_map`

Query used:

```javascript
db.coin_news_tagging_map.find(
  { symbol: "BTC" },
  { _id: 0, internalCoinId: 1, symbol: 1, name: 1, keywords: 1 }
)
```

### Result

A BTC row was found with:

- `symbol: "BTC"`
- `keywords: ["btc"]`
- `name: "BTC"`

### What This Means

This proves there is some stored tagging metadata for BTC.

However, there is an important technical detail:

the current `/api/news/store-news` ingestion logic is not primarily using this curated mapping collection when building article-to-coin tags.

That means:

- this collection being correct is good
- but it does not guarantee the ingestion system will tag BTC correctly

This is a key reason the database can look partially correct while the final article tagging still fails.

---

## Step 4. Check Whether Any Articles Are Stored With `coins.symbol = "BTC"`

Query used:

```javascript
db.newsarticles.find(
  { "coins.symbol": "BTC" },
  { _id: 0, externalId: 1, title: 1, publishedAt: 1, coins: 1 }
).sort({ publishedAt: -1 }).limit(20)
```

And:

```javascript
db.newsarticles.countDocuments({ "coins.symbol": "BTC" })
```

### Result

The count returned:

```javascript
0
```

### What This Means

There are currently no articles stored in `newsarticles` that are tagged with `BTC`.

At this stage, there were two possible explanations:

1. there really are no Bitcoin-related articles in the database
2. Bitcoin-related articles exist, but were tagged incorrectly

So we had to investigate further.

---

## Step 5. Search For Bitcoin-Related Articles By Text Instead Of Coin Tag

Query used:

```javascript
db.newsarticles.find(
  { $text: { $search: "BTC bitcoin" } },
  { _id: 0, externalId: 1, title: 1, publishedAt: 1, coins: 1 }
).sort({ publishedAt: -1 }).limit(20)
```

### Result

This returned multiple articles with Bitcoin in the title or content.

Examples from the results included titles like:

- `Repo Market Stress Signals Bitcoin Is Positioned For Its Next Major Bull Cycle`
- `American Bitcoin Shares Spike After Trump-Backed Firm Activates 11K BTC Miners`
- `Bitcoin may hit new all-time highs in the next 2-3 years - ProCap Financial’s Anthony Pompliano`

But the `coins` arrays on these articles were wrong.

Examples of wrong tags found:

- `BULL`
- `MAJOR`
- `TRUMP`
- `TIME`
- `EASY`

### What This Means

This is the most important finding in the entire investigation.

It proves that:

- Bitcoin-related articles **do exist** in `newsarticles`
- those articles are **not tagged as BTC**
- instead, they are tagged with unrelated words found in the article titles

This means the system is not failing to ingest the article itself.

The system is failing to assign the correct coin tags to that article.

---

## Step 6. Compare BTC With A Working Coin: Tether (`USDT`)

To make the investigation stronger, we checked a coin that **does show related news** in the app: Tether.

The reason for this comparison was simple:

- if BTC fails and Tether works
- and both go through similar storage collections
- then the differences between them can help us understand the real cause

### Step 6A. Check Tether In `coin_registry`

Query used:

```javascript
db.coin_registry.find(
  {
    $or: [
      { symbol: "USDT" },
      { name: /tether/i },
      { coinId: "tether" }
    ]
  },
  { _id: 0, coinId: 1, internalCoinId: 1, symbol: 1, name: 1 }
)
```

### Result

The results showed more than one Tether-related row, including:

- a `USDT` / `Tether USDt` row
- a `coinId: "tether"` row with `symbol: "USDT"`

### What This Means

This is useful because it shows that Tether also has identity complexity, just like BTC.

So a perfectly clean identity model is clearly **not required** for related news to work.

That weakens the idea that duplicate identities alone explain the BTC news problem.

### Step 6B. Check Tether In `exchange_listed_assets`

Queries used:

```javascript
db.exchange_listed_assets.find(
  {
    $or: [
      { base_asset: "USDT" },
      { quote_asset: "USDT" }
    ]
  },
  { _id: 0, internalCoinId: 1, provider: 1, base_asset: 1, quote_asset: 1, status: 1 }
).limit(20)
```

and:

```javascript
db.exchange_listed_assets.find(
  { base_asset: "USDT" },
  { _id: 0, internalCoinId: 1, provider: 1, base_asset: 1, quote_asset: 1, status: 1 }
)
```

### Result

The results showed:

- many rows where `USDT` appears as `quote_asset`
- and also rows where `USDT` appears as `base_asset`

### What This Means

This is important because the current ingestion logic builds tracked news symbols from `base_asset`.

Since `USDT` exists as a `base_asset`, Tether is eligible for direct symbol-based news tagging in the current system.

### Step 6C. Check Whether Tether-Tagged News Exists

Queries used:

```javascript
db.newsarticles.find(
  { "coins.symbol": "USDT" },
  { _id: 0, externalId: 1, title: 1, publishedAt: 1, coins: 1 }
).sort({ publishedAt: -1 }).limit(20)
```

and:

```javascript
db.newsarticles.countDocuments({ "coins.symbol": "USDT" })
```

### Result

The count returned:

```javascript
2
```

The documents showed that Tether-related articles were indeed stored with `coins.symbol = "USDT"`.

Examples also showed that some articles had mixed tagging, such as:

- a correct tag: `USDT`
- alongside an incorrect extra tag such as `MOVE` or `TIME`

### What This Means

This is another major finding.

It proves that:

- the system **can** store related news correctly for at least some coins
- the tagging system is not completely broken
- but the tagging system is noisy and can still add false-positive extra symbols

In simple words:

- Tether works, but not perfectly
- BTC fails more severely because it is missing the correct `BTC` tag entirely

### Step 6D. Check Tether In `coin_identity_resolution_queue`

Query used:

```javascript
db.coin_identity_resolution_queue.find(
  {
    $or: [
      { normalizedToken: "tether" },
      { inputToken: /tether/i }
    ]
  },
  {
    _id: 0,
    inputToken: 1,
    normalizedToken: 1,
    status: 1,
    confidence: 1,
    evidence: 1,
    retryCount: 1,
    firstSeenAt: 1,
    lastTriedAt: 1
  }
)
```

### Result

A queue document existed for Tether with values like:

- `normalizedToken: "tether"`
- `status: "pending"`
- `confidence: 0`

### What This Means

This is extremely valuable for the overall conclusion.

It proves that a coin can appear in `coin_identity_resolution_queue` and **still** successfully show related news.

So we can now safely say:

> presence in `coin_identity_resolution_queue` is not the direct reason BTC related news is missing

Instead, the queue should be treated as a separate identity-resolution signal, not as proof of a news-ingestion failure.

---

## Step 7. Prove That The Wrong Tags Are Real Tracked Symbols, Not Random Text Noise

At this point in the investigation, we already knew that Bitcoin-related articles were getting tags such as:

- `TRUMP`
- `TIME`
- `BULL`
- `MOVE`
- `MAJOR`
- `EASY`

But we still needed to answer an important question:

> Are these values appearing by accident, or do they actually exist in the tracked coin universe?

This matters because the solution depends on the answer.

- If these were random garbage values, the bug would look one way.
- If these are real tracked symbols from the database, the bug is deeper and more structural.

### Step 7A. Check Whether Suspicious Symbols Exist In `exchange_listed_assets`

Query used:

```javascript
db.exchange_listed_assets.find(
  {
    base_asset: { $in: ["BULL", "MAJOR", "TIME", "MOVE", "TRUMP", "EASY"] }
  },
  {
    _id: 0,
    internalCoinId: 1,
    provider: 1,
    base_asset: 1,
    quote_asset: 1,
    status: 1
  }
).sort({ base_asset: 1, provider: 1 })
```

### Why This Query Was Important

The current ingestion logic builds its tracked coin universe from `exchange_listed_assets.base_asset`.

So if these suspicious symbols are present there, then the backend is not imagining them.

It is genuinely allowed to treat them as tracked coins.

### Result

The query showed that these suspicious symbols are indeed present in `exchange_listed_assets`.

Examples seen in the results:

- `BULL`
- `EASY`
- `MAJOR`
- `MOVE`
- `TIME`
- `TRUMP`

### What This Means

This is a major finding.

It proves the false-positive tags are not random corruption.

They are real tracked `base_asset` symbols that exist in the exchange asset collection.

That means the current title-matching logic is accidentally matching ordinary title words against real but contextually wrong tracked symbols.

In simple words:

- the words are real symbols in the database
- but they are being matched in the wrong context
- so the bug is not "fake data got inserted"
- the bug is "real data is being matched too loosely"

### Step 7B. Measure How Common Those Suspicious Symbols Are In `exchange_listed_assets`

Query used:

```javascript
db.exchange_listed_assets.aggregate([
  {
    $match: {
      base_asset: { $in: ["BULL", "MAJOR", "TIME", "MOVE", "TRUMP", "EASY"] }
    }
  },
  {
    $group: {
      _id: "$base_asset",
      count: { $sum: 1 },
      providers: { $addToSet: "$provider" },
      quotes: { $addToSet: "$quote_asset" }
    }
  },
  { $sort: { _id: 1 } }
])
```

### Why This Query Was Important

Finding one row is helpful.

But counting and grouping them is much stronger, because it tells us whether these suspicious symbols are rare edge cases or widely represented tracked assets.

### Result

The grouped results showed that these symbols are not isolated one-off rows.

Examples from the findings:

- `BULL` exists
- `MAJOR` appears across more than one provider
- `MOVE` appears across several providers and quote assets
- `TIME` appears across multiple providers
- `TRUMP` appears across multiple providers

### What This Means

This makes the issue even more serious.

It means the false-positive matching risk is built into the tracked symbol universe itself.

So if the title-matching logic is too permissive, this problem can happen repeatedly, not just on one article.

---

## Step 8. Prove That The Suspicious Symbols Also Exist In `coin_news_tagging_map`

At this stage, we knew the suspicious symbols existed in `exchange_listed_assets`.

But we also needed to check whether they were present in `coin_news_tagging_map`, because that tells us whether they are part of the broader coin-tagging ecosystem, not just exchange listings.

### Query Used

```javascript
db.coin_news_tagging_map.find(
  {
    symbol: { $in: ["BULL", "MAJOR", "TIME", "MOVE", "TRUMP", "EASY"] }
  },
  {
    _id: 0,
    symbol: 1,
    name: 1,
    keywords: 1
  }
).sort({ symbol: 1 })
```

### Why This Query Was Important

This query checks whether the same suspicious symbols also exist in the curated news-tagging map.

If they do, it means:

- these symbols are not only tracked exchange assets
- they are also recognized in the news-tagging support data

### Result

The query returned rows for these suspicious symbols as well, with keyword entries such as:

- `BULL` with keyword `bull`
- `EASY` with keyword `easy`
- `MAJOR` with keyword `major`
- `MOVE` with keyword `move`
- `TIME` with keyword `time`
- `TRUMP` with keyword `trump`

### What This Means

This is another very high-value finding.

It proves that these ambiguous English words are present not only in exchange listings but also in the news-tagging map itself.

That means the system currently contains multiple data sources that can legitimize those words as candidate coin tags.

So if matching is not context-aware enough, the system is naturally vulnerable to tagging ordinary sentence words as coins.

---

## Step 9. Prove That The Problem Is Widespread, Not Just A Few BTC Articles

At the beginning, the issue looked like a BTC problem.

But to design the right fix, we needed to answer this:

> Is BTC just one unlucky example, or is the system broadly polluted with false-positive coin tags?

### Step 9A. Count The Most Common Stored Coin Symbols In `newsarticles`

Query used:

```javascript
db.newsarticles.aggregate([
  { $unwind: "$coins" },
  {
    $group: {
      _id: "$coins.symbol",
      count: { $sum: 1 }
    }
  },
  { $sort: { count: -1 } },
  { $limit: 50 }
])
```

### Why This Query Was Important

This query asks:

- "Which coin symbols appear most often inside stored article tags?"

That is useful because a healthy tagging system should show meaningful dominant symbols.

Instead, the results revealed many suspicious English words appearing frequently.

### Result

The results included suspicious symbols such as:

- `TRUMP`
- `TIME`
- `BULL`
- `MOVE`
- `MAJOR`

Some of these appeared multiple times and some were among the most common stored article tags.

### What This Means

This proves the problem is not limited to one or two documents.

The false-positive tags are recurring often enough to become visible in the top grouped results.

That means this is a systematic tagging-quality problem.

### Step 9B. Group Suspicious Stored Symbols And Show Sample Titles

Query used:

```javascript
db.newsarticles.aggregate([
  { $unwind: "$coins" },
  {
    $match: {
      "coins.symbol": { $in: ["BULL", "MAJOR", "TIME", "MOVE", "TRUMP", "EASY"] }
    }
  },
  {
    $group: {
      _id: "$coins.symbol",
      count: { $sum: 1 },
      sampleTitles: { $push: "$title" }
    }
  },
  {
    $project: {
      count: 1,
      sampleTitles: { $slice: ["$sampleTitles", 5] }
    }
  },
  { $sort: { count: -1 } }
])
```

### Why This Query Was Important

Counting is good, but examples are much better for human understanding.

This query helped answer:

- "In what kinds of article titles do these suspicious tags appear?"

### Result

The grouped output showed patterns such as:

- `TRUMP` appearing on several Bitcoin-related or macro-related article titles
- `TIME` appearing on titles where `time` is just an ordinary English word
- `BULL` appearing on titles where `bull` clearly describes market sentiment
- `MOVE` appearing on titles where `move` clearly means price movement or money transfer
- `MAJOR` appearing on titles where `major` is just descriptive language
- `EASY` appearing on titles where `easy` is normal sentence text

### What This Means

This is extremely strong evidence.

It shows the false-positive tags line up directly with natural language words inside article titles.

So the problem is not hidden, random, or ambiguous anymore.

It is clearly visible in article text and clearly connected to overly permissive word-based matching.

---

## Step 10. Compare BTC And USDT More Directly

To make the comparison even stronger, we also looked at both coins side by side.

### Step 10A. Compare Tag Counts

Queries used:

```javascript
db.newsarticles.countDocuments({ "coins.symbol": "BTC" })
```

and:

```javascript
db.newsarticles.countDocuments({ "coins.symbol": "USDT" })
```

### Result

The counts were:

- `BTC`: `0`
- `USDT`: `2`

### What This Means

This gives a clean, easy-to-understand contrast.

- BTC-related articles exist in the database but none are stored with the correct `BTC` tag
- USDT-related articles do exist with the correct `USDT` tag

So the system is partially functioning, but very unevenly.

### Step 10B. Compare `coin_news_tagging_map` Coverage For BTC And USDT

Query used:

```javascript
db.coin_news_tagging_map.find(
  { symbol: { $in: ["BTC", "USDT"] } },
  {
    _id: 0,
    symbol: 1,
    name: 1,
    keywords: 1,
    internalCoinId: 1
  }
)
```

### Result

The results showed:

- `BTC` with keyword list containing only `btc`
- `USDT` with keyword list containing only `usdt`

### What This Means

This is important because it shows neither coin currently has richer full-name keyword support in the stored tagging map.

So the BTC problem is not simply:

> "USDT works because its tagging map is much better."

That explanation is not supported here.

The stronger explanation remains:

- some articles happen to include `USDT` clearly enough for successful tagging
- Bitcoin articles often contain ordinary words that collide with real tracked symbols like `TRUMP`, `TIME`, `BULL`, `MOVE`, and `MAJOR`
- so BTC loses more often because the current matching strategy is weak in ambiguous natural-language contexts

### Step 10C. Compare Identity Complexity And Queue Presence

Queries used:

```javascript
db.coin_registry.find(
  { symbol: { $in: ["BTC", "USDT"] } },
  { _id: 0, coinId: 1, internalCoinId: 1, symbol: 1, name: 1 }
).sort({ symbol: 1, coinId: 1 })
```

```javascript
db.coin_identity_resolution_queue.find(
  {
    $or: [
      { normalizedToken: "bitcoin" },
      { normalizedToken: "btc" },
      { inputToken: /bitcoin/i },
      { inputToken: /btc/i }
    ]
  },
  {
    _id: 0,
    inputToken: 1,
    normalizedToken: 1,
    status: 1,
    confidence: 1,
    evidence: 1,
    retryCount: 1,
    firstSeenAt: 1,
    lastTriedAt: 1
  }
)
```

```javascript
db.coin_identity_resolution_queue.find(
  {
    $or: [
      { normalizedToken: "tether" },
      { normalizedToken: "usdt" },
      { inputToken: /tether/i },
      { inputToken: /usdt/i }
    ]
  },
  {
    _id: 0,
    inputToken: 1,
    normalizedToken: 1,
    status: 1,
    confidence: 1,
    evidence: 1,
    retryCount: 1,
    firstSeenAt: 1,
    lastTriedAt: 1
  }
)
```

### Result

The comparison showed:

- both BTC and USDT have identity complexity in `coin_registry`
- both BTC and Tether-related tokens appear in `coin_identity_resolution_queue`

### What This Means

This is one more strong reason not to confuse identity-resolution problems with news-tagging problems.

If both coins have identity complexity, and both can appear in the queue, but only BTC fails to show related news correctly, then the missing-news issue cannot be explained by queue presence alone.

---

## What The Wrong Tags Tell Us

Let us explain this very simply.

Suppose the article title is:

`Repo Market Stress Signals Bitcoin Is Positioned For Its Next Major Bull Cycle`

A correct result would likely tag:

- `BTC`

But the stored result included tags like:

- `MAJOR`
- `BULL`

That means the tagging logic is treating some ordinary title words as if they are coin symbols.

That is a classic false-positive tagging problem.

### What Is A False Positive?

A false positive means the system thinks something is a valid match, but it actually is not.

In this case:

- the word `Bull` is being treated like a coin symbol
- the word `Major` is being treated like a coin symbol
- the word `Time` is being treated like a coin symbol
- the word `Trump` is being treated like a coin symbol

Even though those words appear in article titles, that does not mean those articles are actually about those coins.

---

## Most Likely Technical Reason

Based on the backend code analysis performed earlier, the current ingestion logic does roughly this:

1. it builds a list of tracked symbols from `exchange_listed_assets.base_asset`
2. it turns those symbols into matchable keywords
3. it scans article titles for those keywords
4. if a title word matches a tracked symbol, it adds that coin tag
5. short ticker handling has some safeguards, but the matching is still vulnerable to bad title-word matches

At the same time, the ingestion logic does **not strongly rely on a better curated "Bitcoin" alias map** for matching full coin names.

That creates two problems:

### Problem 1. Real Bitcoin Articles Can Be Missed

If the title says `Bitcoin` but the system mainly expects `BTC`, it may miss the correct match.

### Problem 2. Random Tracked Words Can Be Incorrectly Added

If words like `BULL`, `TIME`, `TRUMP`, or `MAJOR` exist in the tracked symbol universe, then title scanning can incorrectly tag them as coins.

This is exactly what the `newsarticles` query results suggest.

The newer database checks make this explanation much stronger because they prove all of the following at the same time:

- the suspicious words are real tracked symbols in `exchange_listed_assets`
- the same suspicious words also exist in `coin_news_tagging_map`
- those suspicious symbols appear repeatedly inside stored `newsarticles.coins`
- the sample titles show those words are often just normal English sentence words

Taken together, that means the current matching approach is too permissive for ambiguous, dictionary-like coin symbols.

---

## Why The App Shows No BTC News

The frontend or API will likely ask for news linked to BTC using something like:

- `coins.symbol = "BTC"`
- or equivalent coin-related filters

But the stored documents do not contain:

```json
{ "symbol": "BTC" }
```

Instead, they contain wrong symbols like:

```json
{ "symbol": "BULL" }
{ "symbol": "MAJOR" }
{ "symbol": "TRUMP" }
```

So when the app asks:

> "Show me all articles tagged for BTC"

the database correctly answers:

> "I have none tagged as BTC"

That is why the app appears to have no BTC news even though Bitcoin articles are actually present.

---

## What We Can Say With Confidence

### Confirmed Findings

The following points are strongly supported by direct database evidence:

1. BTC exists in `coin_registry`
2. BTC appears more than once in `coin_registry` with different `internalCoinId` values
3. BTC exists in `exchange_listed_assets`
4. BTC exists in `coin_news_tagging_map`
5. `newsarticles` contains no documents tagged with `coins.symbol = "BTC"`
6. `newsarticles` does contain Bitcoin-related articles when searched by text
7. those articles are tagged with incorrect symbols such as `BULL`, `MAJOR`, `TRUMP`, `TIME`, and `EASY`
8. Tether (`USDT`) does have related articles correctly tagged in `newsarticles`
9. Tether can also receive false-positive extra tags like `MOVE` or `TIME`
10. Tether appears in `coin_identity_resolution_queue` even though related news still works for it
11. suspicious symbols like `BULL`, `MAJOR`, `TIME`, `MOVE`, `TRUMP`, and `EASY` are real `base_asset` values in `exchange_listed_assets`
12. those same suspicious symbols also exist in `coin_news_tagging_map`
13. suspicious stored tags recur often enough in `newsarticles` to show a broad systemic pattern, not a one-off anomaly
14. BTC has `0` stored article tags while USDT has `2`, even though both have identity complexity and queue presence
15. both BTC and USDT tagging maps are minimal, with only ticker-style keywords (`btc`, `usdt`)

### Strong Conclusion

The main issue is very likely:

**incorrect coin tagging during news ingestion**

and not:

- missing Bitcoin articles
- missing BTC exchange listing data
- missing BTC tagging metadata
- mere presence in `coin_identity_resolution_queue`

---

## Secondary Data Quality Concern

The duplicate BTC records in `coin_registry` are also important.

This may or may not be the direct cause of the news-tagging problem, but it is a separate data integrity issue that should be cleaned up.

Why this matters:

- duplicate identities can confuse downstream lookups
- they make debugging harder
- they can create inconsistent relations across collections

So there are likely **two issues**:

1. a primary issue: bad news article coin tagging
2. a secondary issue: duplicate BTC identities in `coin_registry`

---

## Final Diagnosis

The evidence currently points to this explanation:

### Root Cause Hypothesis

The news ingestion process is storing Bitcoin-related articles, but the article-to-coin matching logic is assigning the wrong `coins.symbol` values.

Because of that:

- BTC news exists in the database
- but it is not retrievable through BTC-based filtering

This makes the system behave as if BTC has no news, when the real problem is that BTC news is mis-tagged.

The Tether comparison also strengthens this diagnosis:

- Tether has a queue entry in `coin_identity_resolution_queue`
- yet Tether still has stored related news tagged as `USDT`
- therefore the queue is not the main cause of missing related news
- the main cause remains the quality of article-to-coin tagging inside news ingestion

The latest cross-collection checks make the diagnosis even sharper:

- several false-positive tags are valid tracked symbols in the database
- several of those symbols are also represented in the tagging map
- those symbols appear repeatedly in article tags when the same English words appear in headlines

So the strongest current hypothesis is:

**the ingestion system is over-matching ambiguous symbol words from titles without enough contextual protection**

---

## What Should Be Fixed Next

Before changing production data, the next code fix should focus on the news ingestion/tagging logic.

The likely improvements will involve:

1. reducing false-positive matches from ordinary title words
2. improving full-name coin matching, such as matching `Bitcoin` to `BTC`
3. using more reliable curated keyword sources
4. tightening validation before a title word is accepted as a real coin symbol
5. separating identity-resolution issues from news-tagging issues so they are not confused during debugging
6. designing special handling for ambiguous dictionary-word symbols like `TRUMP`, `TIME`, `MOVE`, `BULL`, `MAJOR`, and `EASY`

In parallel, the duplicate BTC identities in `coin_registry` should also be reviewed and cleaned up carefully.

---

## Recommended Follow-Up Actions

### Immediate

- review the `/api/news/store-news` coin-tagging logic
- inspect why ordinary title words are being converted into coin symbols
- add stricter rules for title-based matching

### Data Review

- audit duplicate symbols in `coin_registry`
- verify whether other major coins have the same duplicate-identity problem
- inspect whether other news articles are also tagged with false-positive symbols
- compare more failing coins against one or two working coins, the same way BTC was compared against Tether
- identify the most ambiguous English-word symbols and classify them as high-risk for title-only matching

### Validation After Fix

After the code is fixed, rerun ingestion and verify:

- BTC-related articles are stored with `coins.symbol = "BTC"`
- false tags like `BULL`, `MAJOR`, `TIME`, `TRUMP`, and `EASY` no longer appear unless they are truly intended
- working coins like `USDT` still keep their correct tags after the fix
- coin-specific news endpoints now return the expected articles
- grouped aggregate results on `newsarticles.coins.symbol` no longer show suspicious English-word symbols dominating the stored tag distribution

---

## Why This Report Matters

This report is useful not only because it says "BTC news is broken."

It is useful because it proves, step by step, that:

- the articles exist
- the articles are stored
- the articles are often tagged wrongly
- the wrong tags are not random
- the wrong tags come from real tracked symbols that are ambiguous English words
- queue presence is a side signal, not the main cause
- the issue is systemic enough to require a design-quality fix, not a small one-off patch

That gives us much better confidence before starting implementation.

---

## One-Line Conclusion

Bitcoin news is present in the database, but it is being tagged with incorrect coin symbols, so the app cannot find it under `BTC`, and the Tether comparison shows that `coin_identity_resolution_queue` is not the direct cause of this failure.
