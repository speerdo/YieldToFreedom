# Yield to Freedom — Implementation Spec

**For:** Claude Code (Astro 5 + Neon + Drizzle + Vercel monorepo)
**Goal:** Fix three high-priority issues and add a logo mark. Work top to bottom; tasks are ordered by priority.
**Writing style for all prose content below:** no em dashes, prose-forward (not bullet-heavy), conversational but professional.

---

## Task 1 — CRITICAL: Server-render the ETF directory (`/etfs`)

### Problem
The `/etfs` page renders an empty table without JavaScript. A crawler (or any JS-disabled fetch) sees only filter controls and a "Enable JavaScript for filtering" message. The table body comes back with zero rows. This is the most SEO-important page on the site (the hub that links to every ticker profile), and right now it has no crawlable content or internal links in the initial HTML.

### Fix
Render the full ETF list as real HTML on the server, then layer the existing client-side filtering on top as progressive enhancement. The individual profile pages (e.g. `/etfs/SCHD`) already SSR correctly, so mirror that data-fetching approach here.

### Specific requirements
1. In the `/etfs` page component (likely `src/pages/etfs/index.astro`), fetch the full ETF list at build/request time using the same Drizzle query layer the profile pages use. Do NOT rely on the client `fetch('/api/etfs')` call for initial render.
2. Render every ETF as a real `<tr>` (and the card view as real markup) in the server output, including a real `<a href="/etfs/{TICKER}">` link on each row. These internal links are the primary SEO payload. They must exist in the raw HTML.
3. Keep the existing JS filtering/sorting, but have it operate on the already-rendered DOM (filter by hiding/showing rows) OR re-fetch and re-render. Either is fine as long as the initial server HTML is complete without JS.
4. Ensure the `<noscript>` experience is the full list (unfiltered), not an empty table. Remove or rework the "Enable JavaScript for filtering" empty state so it never replaces real content.
5. Decide rendering mode: prefer `export const prerender = true` (SSG) if the ETF set changes only on the weekly sync, with an ISR/redeploy on sync. If the data must be fresher, use SSR with a short cache header. Confirm which is in use and make the directory match the profiles.

### Acceptance check
`curl -s https://yield-to-freedom.vercel.app/etfs | grep -c '/etfs/'` should return a large number (one per ETF), not near-zero. Viewing source (not inspector) should show the full table with ticker links.

---

## Task 2 — HIGH: Rebuild the Strategy page into a real pillar page (`/strategy`)

### Problem
The strategy page is ~150 words and underdelivers versus the homepage. It is the page that should anchor the brand and rank for "income investing strategy" style queries, but each pillar gets one sentence and there is no depth, no worked example, no risk discussion. This is the biggest content opportunity on the site.

### Fix
Replace the body of `src/pages/strategy/index.astro` (keep the layout, header, nav, footer, disclaimer components) with the long-form content below. Keep the three deep-dive links (DRIP, Margin, FI Score) and the "Explore funds" section at the bottom. Use real semantic headings (`<h2>`, `<h3>`) so the page is scannable and SEO-structured. Keep prose-forward formatting; the sample copy below is written that way already, paste it close to verbatim and adjust tickers/numbers if your data differs.

### Page metadata
- `<title>`: `The Income-First Strategy: Three Pillars to Financial Freedom | Yield to Freedom`
- meta description: `A complete framework for income-first investing: the three pillars (income, stability, growth), the 40/30/30 allocation, how to tune it, and the honest risks most yield sites skip.`

### CONTENT TO ADD (paste as the page body)

> # The income-first strategy
>
> Most investing advice optimizes for one number: total return on a brokerage statement you are not allowed to touch until you are old. Income-first investing optimizes for something different and more tangible. It asks what your portfolio can pay you, in actual cash, while you stay invested. The goal is not to get rich on paper. It is to build a stream of distributions that grows over time until it covers your bills, and eventually replaces a paycheck entirely.
>
> Yield to Freedom is built around a single framework for doing that without falling into the traps that sink most income investors. It rests on three pillars, each doing a job the other two cannot.
>
> ## Why three pillars
>
> The instinct of a new income investor is to find the highest yield and buy it. This is the fastest way to lose money in the income space. Funds advertising 15 percent or more often pay that yield partly by returning your own capital to you, and their share price erodes over time. You collect a big distribution, the NAV grinds lower, and a few years later you have a smaller position paying a smaller check. The headline yield was a mirage.
>
> The fix is not to avoid high yield. It is to balance it. Three pillars, each with a distinct role, produce an income stream that is both large today and durable tomorrow.
>
> ### Income: the engine
>
> The income pillar is where your immediate cash flow comes from. These are the funds engineered to pay, often through covered-call strategies on indexes like the Nasdaq 100 or S&P 500, sometimes through real-asset income or other option-based structures. Funds like JEPI, JEPQ, SPYI, and QQQI live here. They are the highest-paying part of the portfolio and the part that most directly moves you toward covering monthly expenses.
>
> The tradeoff is that pure income funds tend to cap their own upside (a covered call gives away gains above the strike) and some carry structural NAV decay. That is acceptable in this framework, because it is not the income pillar's job to appreciate. Its job is to pay. The growth pillar handles appreciation for the whole portfolio.
>
> The key discipline here is judging an income fund by whether the distribution is real and durable, not just large. A fund paying genuine option premium and earned income is a keeper. A fund paying mostly return of your own capital while its price falls is not, no matter how high the headline yield. This distinction is what our A-to-D grade is built to surface.
>
> ### Stability: the backbone
>
> The stability pillar is the ballast. These are dividend-growth and quality-tilt funds (SCHD, VIG, DGRO, DGRW) that raise their payouts year after year through recessions and rallies alike. Their yields are lower than the income pillar, often in the 2 to 4 percent range, but their distributions are among the most reliable in the market and their share prices hold up far better in a downturn.
>
> Stability does two things. It grows your income organically over time without you adding a dollar, because the underlying companies raise their dividends. And it cushions the portfolio when markets fall, which matters enormously if you are using any leverage or drawing on the portfolio, because it keeps your overall equity from collapsing in a bad month. In a downturn, the stability pillar is what holds the floor while the income pillar keeps paying and the growth pillar recovers.
>
> ### Growth: the compounder
>
> The growth pillar is broad-market and thematic equity (VOO, QQQ, VGT and similar) that captures long-term upside while paying little or no yield. At first glance it looks out of place in an income portfolio. It is essential. The growth pillar is what offsets any NAV erosion in the income pillar at the portfolio level, so total net worth keeps rising even as the high-yield funds give back some principal. Without growth, an all-income portfolio slowly shrinks its own capital base. With it, the whole structure compounds.
>
> Think of growth as the part of the portfolio that ensures there is a bigger base to generate income from next year, and the year after.
>
> ## The 40 / 30 / 30 allocation
>
> A sensible starting target is 40 percent income, 30 percent stability, 30 percent growth. Income gets the largest share because cash flow is the point. Stability and growth split the rest, one protecting the income and one expanding the base.
>
> This is a starting point, not a rule. Tune it to your situation:
>
> If you are younger and further from needing the income, tilt toward growth (for example 30 income / 30 stability / 40 growth) and let the base compound longer before you lean on it. If you are close to living off the portfolio, tilt toward income and stability (for example 50 income / 30 stability / 20 growth) to maximize current cash flow and durability. If you hold in a taxable account, weight the more tax-efficient structures (some covered-call index funds use favorable options tax treatment) and be mindful that high distributions are taxable events. If you have high risk tolerance and a long horizon, a heavier income tilt with a strong growth backstop can accelerate the snowball, as long as you understand the volatility you are taking on.
>
> The ratios are levers. The framework is the constant.
>
> ## How the pillars work together in a downturn
>
> The real test of any income strategy is a bad year, so it is worth being concrete about what each pillar does when markets fall. The income pillar keeps paying distributions, though some funds may trim them. The stability pillar holds its value far better than the broad market and keeps raising dividends, which props up both your income and your total equity. The growth pillar falls the most in the moment but recovers and compounds over the cycle, and a downturn is when your reinvested distributions buy it cheaply.
>
> No single fund does all of that. The combination does. That is the entire argument for diversifying across roles rather than chasing one number.
>
> ## The honest risks
>
> Every income site should tell you where this can go wrong, so here it is plainly. High-yield income funds can and do cut distributions, especially in volatile markets, and several carry structural NAV decay that erodes principal over time. Covered-call funds underperform the underlying index in strong bull markets because they cap upside. Past distributions never guarantee future ones. And if you layer leverage on top of an income portfolio, a deep drawdown can force selling at the worst possible time, which is a risk the high yields themselves do not offset.
>
> None of this makes income investing a bad strategy. It makes it a strategy that has to be run with discipline: balance the pillars, judge distributions on durability rather than size, keep a growth backstop, and respect the risks of leverage. Done that way, an income-first portfolio can carry you toward financial freedom faster than a pure accumulation approach, because it pays you along the way.
>
> ## Go deeper
>
> (keep existing links)
> - DRIP and compounding: why reinvesting distributions matters for income stacks.
> - Margin and borrowing: costs, sequencing, and when leverage breaks the psychology of income investing.
> - FI Score and timelines: mapping payouts to recurring expenses.
>
> ## Explore funds
>
> (keep existing) Start with JEPI, SCHD, and VOO, then widen from the full ETF directory.

### Note
After this expands, consider adding an in-page table of contents (anchor links to each `<h2>`) for scannability and to win sitelink-style SERP features. Optional but recommended.

---

## Task 3 — HIGH: Fix the misleading distribution-trend flag

### Problem
The SCHD profile shows distribution trend "↓ Declining" and a distribution history with anomalous swings (a -64.9% payment, a +222.1% payment). SCHD is the canonical dividend grower, and the stability pillar is explicitly marketed as funds that "raise their dividends year after year." A knowledgeable visitor sees the contradiction and trusts the grades less. The swings are almost certainly special distributions and/or non-split-adjusted or non-deduplicated raw data, not real cuts.

### Fix (data + display)
1. **Investigate the source data.** In the distribution ingestion (the Tiingo sync job), check whether: (a) special/year-end distributions are being compared against regular quarterly ones, producing fake percentage swings; (b) the same distribution is occasionally double-counted or mis-dated; (c) values are not adjusted for the fund's distribution type. The +222% and -64.9% rows are the tells.
2. **Compute the trend on a smoothed basis.** Do not derive "Declining/Rising" from the most recent single payment versus the prior one. Instead compare trailing-12-month total distributions per share against the prior trailing-12-month total (year-over-year), which is the correct way to judge a dividend grower and will correctly show SCHD as rising. Optionally use a 4-payment moving average.
3. **Separate regular from special distributions** in the trend calc if the data source flags them. Special distributions should be shown (maybe tagged "special") but excluded from the trend signal.
4. **Add a footnote** under the distribution trend wherever it appears: `Trend compares trailing 12-month distributions year over year. Special or year-end distributions can cause large single-period swings and are noted where identified.`

### Acceptance check
SCHD, VIG, DGRO, and DGRW should all show a "Rising" or "Stable" trend, consistent with their dividend-growth nature. No stability-pillar fund should display "Declining" unless it genuinely cut its TTM payout year over year.

---

## Task 4 — Add the logo mark (Mark 1: pillars + arrow)

### Files to create

**`public/logo-mark.svg`** (the icon only, uses `currentColor` so it inherits theme color):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Yield to Freedom">
  <title>Yield to Freedom</title>
  <rect x="14" y="60" width="16" height="22" rx="3" fill="currentColor" opacity="0.35"/>
  <rect x="38" y="44" width="16" height="38" rx="3" fill="currentColor" opacity="0.6"/>
  <rect x="62" y="24" width="16" height="58" rx="3" fill="currentColor"/>
  <path d="M18 70 L74 16" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
  <path d="M60 16 L74 16 L74 30" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

**`public/logo-mark-blue.svg`** (fixed brand-blue version for favicon/OG, does not inherit color):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Yield to Freedom">
  <title>Yield to Freedom</title>
  <rect x="14" y="60" width="16" height="22" rx="3" fill="#2563eb" opacity="0.4"/>
  <rect x="38" y="44" width="16" height="38" rx="3" fill="#2563eb" opacity="0.65"/>
  <rect x="62" y="24" width="16" height="58" rx="3" fill="#2563eb"/>
  <path d="M18 70 L74 16" fill="none" stroke="#1d4ed8" stroke-width="5" stroke-linecap="round"/>
  <path d="M60 16 L74 16 L74 30" fill="none" stroke="#1d4ed8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### Horizontal lockup (for the header/nav)
Create a small component (e.g. `src/components/Logo.astro`) that renders the mark inline next to the wordmark, so the mark inherits the current theme's text color via `currentColor`:

```astro
---
// src/components/Logo.astro
---
<a href="/" class="ytf-logo" aria-label="Yield to Freedom home">
  <svg class="ytf-mark" width="28" height="28" viewBox="0 0 96 96" aria-hidden="true">
    <rect x="14" y="60" width="16" height="22" rx="3" fill="currentColor" opacity="0.35"/>
    <rect x="38" y="44" width="16" height="38" rx="3" fill="currentColor" opacity="0.6"/>
    <rect x="62" y="24" width="16" height="58" rx="3" fill="currentColor"/>
    <path d="M18 70 L74 16" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M60 16 L74 16 L74 30" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <span class="ytf-wordmark">Yield to Freedom</span>
</a>
<style>
  .ytf-logo { display: inline-flex; align-items: center; gap: 0.55rem; text-decoration: none; color: var(--brand, #2563eb); }
  .ytf-wordmark { font-weight: 600; font-size: 1.05rem; color: var(--text, inherit); letter-spacing: -0.01em; }
  .ytf-mark { flex: none; color: var(--brand, #2563eb); }
</style>
```

Then replace the current text-only "Yield to Freedom" link in the site header with `<Logo />`. Wire `--brand` and `--text` to whatever your existing theme variables are (the site already supports Light/Dark/Tan/Purple themes, so use the per-theme accent variable rather than hardcoding blue, and the mark will recolor automatically because it uses `currentColor`).

### Favicon
Replace the current favicon with the mark. Easiest path in Astro: drop `public/logo-mark-blue.svg` and reference it in the base layout `<head>`:

```html
<link rel="icon" type="image/svg+xml" href="/logo-mark-blue.svg" />
```

Also generate a PNG fallback (32x32 and 180x180 apple-touch-icon) from the SVG if you want broad device support; any SVG-to-PNG step in the build or a one-time export is fine.

---

## Task 5 — Lower priority polish (optional, do after 1–4)

1. **Theme switcher.** Four themes (Light/Dark/Tan/Purple) is a lot of surface area to keep consistent. Consider trimming to Light + Dark to reduce QA burden and tighten brand identity. If keeping all four, make sure the new logo's `currentColor` accent reads well in each (especially Tan).
2. **Grade score links to methodology.** On every place a grade or score appears (profile pages show "Score 95.98 / 100"), link it to the A-to-D grading explainer post so the score is transparent rather than arbitrary. Small change, meaningful trust win.
3. **Blog volume.** Three posts is thin for topical authority. Prioritize long-tail comparison and explainer posts that internally link to ticker profiles: "[Fund A] vs [Fund B]", "Best monthly dividend ETFs", "What is [fund] and how does it work". The existing rental-property comparison post is strong link bait; make more in that vein.
4. **Strategy page TOC.** Once Task 2 lands, add anchor-link table of contents at the top of the strategy page.

---

## Out of scope / leave alone
The ETF profile pages (e.g. `/etfs/SCHD`) and the homepage are strong. Do not restructure them. The `$10k income snapshot`, DRIP-in-shares framing, "cashflow blocks" language, distribution table, and same-pillar cross-links are the site's best work. Only touch the distribution-trend calculation per Task 3.

---

## Suggested commit sequence
1. `fix(etfs): server-render directory list for SEO and no-JS`
2. `feat(strategy): expand strategy into full pillar page`
3. `fix(data): smooth distribution trend, exclude special distributions`
4. `feat(brand): add pillars-and-arrow logo mark, favicon, header lockup`
5. `chore(polish): grade methodology links, theme trim, blog plan`
