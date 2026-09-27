# Trade Forge

A local-first trading journal with an offline paper simulator for learning how preset entry and exit rules behave on historical prices.

## Run it

Open `index.html` in a modern browser. No build step, account, backend, or dependency installation is required. The optional DM Sans and DM Mono fonts load from Google Fonts; the system font stack is used if they are unavailable.

## What it does

- Record long or short trades with symbol, optional strategy, entry, exit, quantity, close date, fees, and notes.
- Calculate net P&L, win rate, trade count, and average P&L.
- Search by symbol or strategy and filter by side.
- Edit and delete entries, export a JSON backup, and import a backup.
- Save entries in this browser's local storage.
- Run an offline moving-average paper simulation on historical prices.

## Historical paper simulator

The simulator reads daily closing prices from a CSV with `date` and `close` columns. For example:

```csv
date,close
2025-01-02,100.25
2025-01-03,101.10
```

Set the fast and slow simple moving average periods, the simulated quantity, and starting balance. It opens one simulated long position at the next daily close after the fast average crosses above the slow average and closes it at the next daily close after the fast average crosses below. This next-close fill is an approximation because the CSV contains daily closing prices only. It only opens a position if the simulated cash balance covers its cost. Any remaining position closes at the last row in the file. The invented demo prices let you try the interface without market data.

This is a historical simulation only. It does not stream live prices, connect to a broker, or place real orders. Fees and slippage are not included, and results do not predict future performance. CSV data is processed in your browser and is not uploaded.

## P&L calculation

- Long: `(exit price - entry price) × quantity - fees`
- Short: `(entry price - exit price) × quantity - fees`

Values are displayed in USD. Win rate is the share of logged trades with positive net P&L.

## Publish a live preview

The live preview is published from the repository's `main` branch using GitHub Pages. Merging a change to `main` triggers deployment. GitHub Pages makes the website publicly accessible. Journal entries and simulator CSV data are handled locally in each visitor's browser and are not sent to a server.

## Data and limitations

Journal entries stay in the browser profile where they were created. Clearing browser data removes them, so export a backup before changing devices or browser profiles. Import replaces the current journal after confirmation. The paper simulator is not an automated live-trading service and does not provide investment advice.
