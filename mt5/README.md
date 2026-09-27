# Trade Forge MT5 demo Expert Advisor

This folder contains an optional MetaTrader 5 Expert Advisor for **XM MT5 demo accounts**. It is a separate, early integration step; it does not connect to the Trade Forge website or Angel One.

## What the EA does

- Watches the chart symbol and timeframe where you attach it.
- Uses a long-only simple moving-average crossover: default fast SMA 10 and slow SMA 30.
- Reads completed candles and checks once when a new candle starts.
- Opens one small buy position after an upward cross.
- Closes its own position after a downward cross.
- Sets a broker-side stop loss and take profit on each entry.
- Skips new entries when spread exceeds the configured maximum.
- Uses a unique magic number so it only manages its own positions.

## Safety defaults and limits

- `InpEnableDemoTrading` defaults to `false`; no trade actions are sent until this input is deliberately enabled.
- The EA refuses to initialize unless the connected MT5 account reports **DEMO**, and checks again before every action.
- Keep it on an XM **demo** account. Do not attach it to a real account.
- This is sample automation, not a proven or profitable strategy. Moving-average crossovers can lose money, and gaps, slippage, execution, and market conditions can affect outcomes.
- Default size is 0.01 lots, stop loss 300 points, take profit 600 points, and maximum entry spread 30 points. Point values differ by instrument and broker; review them for the chosen symbol before any demo run.
- Stop loss/take profit are submitted with the entry. They cannot guarantee a maximum loss through gaps or execution differences.
- The MT5 chart must remain connected/running for the EA to evaluate new bars.
- This EA does not read/write the Trade Forge journal and has no Angel One connection.
- No account password, API key, or broker secret belongs in this public repository.

## Install for a demo review

1. In MT5, sign in to an XM demo account and confirm the account is labelled Demo.
2. Open **File → Open Data Folder → MQL5 → Experts**.
3. Copy `TradeForgeDemo.mq5` there and open it in MetaEditor.
4. Compile in MetaEditor. Compilation has not been verified by this project environment.
5. In MT5 Strategy Tester, first choose **Every tick based on real ticks** if available, the intended symbol and timeframe, then review the results without enabling live use.
6. For a demo forward run, attach the EA to a demo chart and inspect all inputs. Only set `InpEnableDemoTrading` to true after the symbol, volume, stop/target, spread limit and chart timeframe are understood. Allow algorithmic trading only for this demo setup.

The website's historical CSV simulator remains separate. This EA is source code for MT5 and does not make the public GitHub Pages site place trades.
