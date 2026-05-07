---
title: 'High-Yield ETFs Ranked: Our A-to-D Grading System Explained'
description: 'How Yield to Freedom scores income ETFs from 0–100 and maps them to letter grades—plus what the score does not capture.'
pubDate: 2026-05-10
image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80'
imageAlt: 'Data analysis and research documents spread across a desk for ETF grading methodology'
tags: ['grading', 'methodology', 'ytf score']
---

The **Yield to Freedom (YTF) grade** is a **rules-based research label** for our curated income ETF universe. It is **not** a buy/sell signal, not a prediction, and not personalized advice.

## What we optimize for

Grades summarize how well an ETF aligns with **income-forward, sleeve-based planning**: trailing cash yield, payout consistency cues, expense ratio, dividend cadence, scale/liquidity proxy, and whether the ticker fits its assigned **pillar** (Income, Stability, Growth, Mixed).

## The mechanics (high level)

- Raw inputs come from Neon after FMP nightly sync succeeds (otherwise metrics may be sparse).
- A deterministic function (`src/lib/grader/grade.ts`) produces a **0–100 score** mapped to **A / B / C / D**.
- History is logged to `etf_grade_history` when the cron grader runs.

## What grades deliberately ignore

- Your tax bracket, horizon, labor income, leverage, concentrated employer stock
- Regulatory or personal ESG exclusions
- “Feel” narratives from social feeds

Whenever you see a chip on the site, the fine print applies: **YTF grades are for research and education only.**

**Browse the universe:** [ETF directory](/etfs) · **Compare funds:** [/compare](/compare)

*Educational only — not investment advice.*
