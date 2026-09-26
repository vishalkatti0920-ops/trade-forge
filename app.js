(() => {
  "use strict";

  const STORAGE_KEY = "trade-forge.journal.v1";
  const byId = (id) => document.getElementById(id);
  const form = byId("trade-form");
  const tradeList = byId("trade-list");
  const emptyState = byId("empty-state");
  const searchInput = byId("search-input");
  const directionFilter = byId("direction-filter");
  const toast = byId("toast");
  const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
  let trades = readTrades();
  let toastTimer;

  function readTrades() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(isValidTrade) : [];
    } catch {
      return [];
    }
  }

  function isValidTrade(trade) {
    return trade && typeof trade === "object" &&
      typeof trade.id === "string" &&
      typeof trade.symbol === "string" && trade.symbol.length <= 12 &&
      (trade.side === "long" || trade.side === "short") &&
      Number.isFinite(trade.entry) && trade.entry > 0 &&
      Number.isFinite(trade.exit) && trade.exit > 0 &&
      Number.isFinite(trade.quantity) && trade.quantity > 0 &&
      Number.isFinite(trade.fees) && trade.fees >= 0 &&
      typeof trade.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(trade.date) &&
      typeof trade.notes === "string" && trade.notes.length <= 500;
  }

  function saveTrades() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
      return true;
    } catch {
      showToast("Could not save. Your browser storage may be full.");
      return false;
    }
  }

  function tradePnl(trade) {
    const movement = trade.side === "long" ? trade.exit - trade.entry : trade.entry - trade.exit;
    return movement * trade.quantity - trade.fees;
  }

  function money(value) {
    return currency.format(value);
  }

  function formatDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
      .format(new Date(year, month - 1, day));
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function updateStats() {
    const total = trades.reduce((sum, trade) => sum + tradePnl(trade), 0);
    const wins = trades.filter((trade) => tradePnl(trade) > 0).length;
    const winRate = trades.length ? (wins / trades.length) * 100 : null;
    const average = trades.length ? total / trades.length : 0;

    byId("stat-pnl").textContent = money(total);
    byId("stat-pnl").className = "stat-value " + (total > 0 ? "positive" : total < 0 ? "negative" : "");
    byId("stat-winrate").textContent = winRate === null ? "—" : winRate.toFixed(1) + "%";
    byId("winrate-note").textContent = trades.length ? wins + " winning " + (wins === 1 ? "trade" : "trades") : "No closed trades yet";
    byId("stat-count").textContent = String(trades.length);
    byId("stat-average").textContent = money(average);
    byId("stat-average").className = "stat-value " + (average > 0 ? "positive" : average < 0 ? "negative" : "");
    byId("nav-count").textContent = String(trades.length);
  }

  function makeTradeRow(trade) {
    const row = document.createElement("tr");
    const tradeCell = node("td");
    const title = node("span", "trade-primary", trade.symbol);
    const side = node("span", "side-pill " + trade.side, trade.side);
    title.append(side);
    tradeCell.append(title);
    if (trade.notes) {
      const note = node("span", "trade-secondary trade-notes", trade.notes);
      note.title = trade.notes;
      tradeCell.append(note);
    }

    const dateCell = node("td", "", formatDate(trade.date));
    dateCell.title = trade.date;

    const prices = node("td");
    prices.append(node("span", "trade-primary", money(trade.entry) + " → " + money(trade.exit)));

    const sizeCell = node("td", "", new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(trade.quantity));
    const result = tradePnl(trade);
    const pnlCell = node("td", "pnl-cell " + (result > 0 ? "positive" : result < 0 ? "negative" : ""), money(result));
    const actionCell = node("td");
    const remove = node("button", "delete-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", "Delete " + trade.symbol + " trade");
    remove.title = "Delete trade";
    remove.addEventListener("click", () => deleteTrade(trade.id));
    actionCell.append(remove);

    row.append(tradeCell, dateCell, prices, sizeCell, pnlCell, actionCell);
    return row;
  }

  function renderTrades() {
    const query = searchInput.value.trim().toUpperCase();
    const side = directionFilter.value;
    const filtered = [...trades]
      .filter((trade) => (!query || trade.symbol.includes(query)) && (side === "all" || trade.side === side))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    tradeList.replaceChildren(...filtered.map(makeTradeRow));
    emptyState.classList.toggle("visible", filtered.length === 0);
    tradeList.parentElement.hidden = filtered.length === 0;
    byId("result-count").textContent = "Showing " + filtered.length + (filtered.length === 1 ? " trade" : " trades");
    updateStats();
  }

  function deleteTrade(id) {
    const trade = trades.find((item) => item.id === id);
    if (!trade || !window.confirm("Delete the " + trade.symbol + " trade?")) return;
    trades = trades.filter((item) => item.id !== id);
    if (saveTrades()) {
      renderTrades();
      showToast("Trade deleted.");
    }
  }

  function readFormTrade() {
    const entry = Number(byId("entry").value);
    const exit = Number(byId("exit").value);
    const quantity = Number(byId("quantity").value);
    const fees = Number(byId("fees").value || 0);
    const symbol = byId("symbol").value.trim().toUpperCase();
    const date = byId("date").value;

    if (!symbol || !Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit) || exit <= 0 ||
        !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(fees) || fees < 0 || !date) {
      showToast("Check the symbol, prices, quantity, fees, and date.");
      return null;
    }

    return {
      id: makeId(),
      symbol: symbol.slice(0, 12),
      side: byId("side").value,
      entry,
      exit,
      quantity,
      fees,
      date,
      notes: byId("notes").value.trim().slice(0, 500)
    };
  }

  function makeId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function updatePreview() {
    const entry = Number(byId("entry").value);
    const exit = Number(byId("exit").value);
    const quantity = Number(byId("quantity").value);
    const fees = Number(byId("fees").value || 0);
    const side = byId("side").value;
    if (!(entry > 0) || !(exit > 0) || !(quantity > 0) || fees < 0) {
      byId("pnl-preview").textContent = "$0.00";
      byId("pnl-preview").className = "";
      return;
    }
    const result = (side === "long" ? exit - entry : entry - exit) * quantity - fees;
    byId("pnl-preview").textContent = money(result);
    byId("pnl-preview").className = result > 0 ? "positive" : result < 0 ? "negative" : "";
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ format: "trade-forge-journal", version: 1, trades }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "trade-forge-journal.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Journal exported.");
  }

  async function importData(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed && parsed.trades;
      if (!Array.isArray(incoming) || !incoming.every(isValidTrade)) {
        throw new Error("The file does not contain valid Trade Forge journal data.");
      }
      if (!window.confirm("Replace your current journal with " + incoming.length + " imported trades?")) return;
      trades = incoming.map((trade) => ({ ...trade, id: makeId() }));
      if (saveTrades()) {
        renderTrades();
        showToast("Journal imported.");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not read that file.");
    } finally {
      event.target.value = "";
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const trade = readFormTrade();
    if (!trade) return;
    trades.push(trade);
    if (saveTrades()) {
      renderTrades();
      form.reset();
      byId("date").value = new Date().toLocaleDateString("en-CA");
      updatePreview();
      showToast(trade.symbol + " trade saved.");
    }
  });

  ["entry", "exit", "quantity", "fees", "side"].forEach((id) => byId(id).addEventListener("input", updatePreview));
  byId("side").addEventListener("change", updatePreview);
  searchInput.addEventListener("input", renderTrades);
  directionFilter.addEventListener("change", renderTrades);
  byId("export-button").addEventListener("click", exportData);
  byId("import-file").addEventListener("change", importData);
  byId("date").value = new Date().toLocaleDateString("en-CA");
  renderTrades();
  updatePreview();
})();
