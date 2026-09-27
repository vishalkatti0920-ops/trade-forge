(() => {
  "use strict";

  const fileInput = document.getElementById("paper-csv");
  const runButton = document.getElementById("run-paper-simulation");
  const demoButton = document.getElementById("load-demo-prices");
  const status = document.getElementById("paper-status");
  const results = document.getElementById("paper-results");
  const runCount = document.getElementById("paper-run-count");
  const netPnl = document.getElementById("paper-net-pnl");
  const finalBalance = document.getElementById("paper-final-balance");
  const winRate = document.getElementById("paper-win-rate");
  const resultRows = document.getElementById("paper-trade-list");
  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
  let prices = [];

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted && character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (!quoted && character === ",") {
        row.push(cell.trim());
        cell = "";
      } else if (!quoted && (character === "\n" || character === "\r")) {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        row.push(cell.trim());
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += character;
      }
    }
    if (quoted) throw new Error("The CSV has an unclosed quotation mark.");
    row.push(cell.trim());
    if (row.some((value) => value !== "")) rows.push(row);
    if (rows.length < 2) throw new Error("The CSV needs a header row and at least one price row.");

    const header = rows.shift().map((value) => value.replace(/^\uFEFF/, "").toLowerCase());
    const dateIndex = header.indexOf("date");
    const closeIndex = header.findIndex((value) => ["close", "adj close", "adj_close", "closing price"].includes(value));
    if (dateIndex < 0 || closeIndex < 0) throw new Error("Add columns named date and close to the CSV.");

    const parsed = rows.map((values, index) => {
      const date = values[dateIndex];
      const close = Number((values[closeIndex] || "").replace(/[,$]/g, ""));
      if (!date || !Number.isFinite(Date.parse(date)) || !(close > 0)) {
        throw new Error("Check the date and positive closing price on CSV row " + (index + 2) + ".");
      }
      return { date, close };
    }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

    for (let index = 1; index < parsed.length; index += 1) {
      if (Date.parse(parsed[index].date) === Date.parse(parsed[index - 1].date)) {
        throw new Error("The CSV has more than one price for the same date.");
      }
    }
    if (parsed.length > 100000) throw new Error("Use a CSV with 100,000 rows or fewer.");
    return parsed;
  }

  function makeDemoPrices() {
    const generated = [];
    const start = new Date("2024-01-02T12:00:00Z");
    for (let day = 0; day < 180; day += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + day);
      const close = 100 + day * 0.08 + Math.sin(day / 5) * 3 + Math.sin(day / 17) * 5;
      generated.push({ date: date.toISOString().slice(0, 10), close: Math.max(1, close) });
    }
    return generated;
  }

  function averageAt(index, period) {
    let sum = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) sum += prices[offset].close;
    return sum / period;
  }

  function simulate() {
    const fastPeriod = Number(document.getElementById("paper-fast").value);
    const slowPeriod = Number(document.getElementById("paper-slow").value);
    const quantity = Number(document.getElementById("paper-quantity").value);
    const startingBalance = Number(document.getElementById("paper-balance").value);
    if (!prices.length) {
      setStatus("Load a CSV or sample prices first.", true);
      return;
    }
    if (!Number.isInteger(fastPeriod) || !Number.isInteger(slowPeriod) || fastPeriod < 2 || slowPeriod <= fastPeriod ||
        !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(startingBalance) || startingBalance <= 0) {
      setStatus("Use whole-day averages where the fast period is smaller, plus positive quantity and starting balance.", true);
      return;
    }
    if (prices.length <= slowPeriod) {
      setStatus("This run needs at least " + (slowPeriod + 1) + " daily prices for the selected slow average.", true);
      return;
    }

    const completed = [];
    let position = null;
    for (let index = slowPeriod; index < prices.length; index += 1) {
      const previousFast = averageAt(index - 1, fastPeriod);
      const previousSlow = averageAt(index - 1, slowPeriod);
      const fast = averageAt(index, fastPeriod);
      const slow = averageAt(index, slowPeriod);
      if (!position && previousFast <= previousSlow && fast > slow) {
        position = { date: prices[index].date, price: prices[index].close };
      } else if (position && previousFast >= previousSlow && fast < slow) {
        completed.push(closePosition(position, prices[index], quantity, "Average crossover"));
        position = null;
      }
    }
    if (position) completed.push(closePosition(position, prices[prices.length - 1], quantity, "End of data"));

    const total = completed.reduce((sum, trade) => sum + trade.pnl, 0);
    const wins = completed.filter((trade) => trade.pnl > 0).length;
    const balance = startingBalance + total;
    runCount.textContent = String(completed.length);
    netPnl.textContent = formatter.format(total);
    netPnl.className = total > 0 ? "positive" : total < 0 ? "negative" : "";
    finalBalance.textContent = formatter.format(balance);
    winRate.textContent = completed.length ? ((wins / completed.length) * 100).toFixed(1) + "%" : "—";
    resultRows.replaceChildren(...completed.map(makeResultRow));
    results.hidden = false;
    setStatus("Simulation complete: " + prices.length + " daily prices checked. No real orders were placed.");
  }

  function closePosition(position, exit, quantity, reason) {
    return {
      entryDate: position.date,
      entry: position.price,
      exitDate: exit.date,
      exit: exit.close,
      pnl: (exit.close - position.price) * quantity,
      reason
    };
  }

  function makeResultRow(trade) {
    const row = document.createElement("tr");
    [trade.entryDate, formatter.format(trade.entry), trade.exitDate, formatter.format(trade.exit), formatter.format(trade.pnl), trade.reason]
      .forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 4) cell.className = trade.pnl > 0 ? "positive" : trade.pnl < 0 ? "negative" : "";
        row.append(cell);
      });
    return row;
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      prices = parseCsv(await file.text());
      results.hidden = true;
      setStatus(file.name + " loaded: " + prices.length + " daily prices. Press Run simulation.");
    } catch (error) {
      prices = [];
      results.hidden = true;
      setStatus(error instanceof Error ? error.message : "Could not read that CSV file.", true);
    }
  });
  demoButton.addEventListener("click", () => {
    prices = makeDemoPrices();
    results.hidden = true;
    setStatus("Invented sample data loaded (" + prices.length + " days). Press Run simulation.");
  });
  runButton.addEventListener("click", simulate);
})();
