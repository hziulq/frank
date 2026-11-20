(() => {
  const STORAGE_KEY = "frank-orders-v1";
  const MAX = 20;

  // ---- 状態 ----
  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && Array.isArray(s.orders)) return s;
    } catch {}
    return { orders: [], nextNo: 1 };
  };
  const state = load();
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  // 入力中の注文（1本ごとに {m, k}）
  let draft = [{ m: true, k: true }];
  let lastRemoved = null;
  let toastTimer = null;

  // ---- 要素 ----
  const $ = (id) => document.getElementById(id);
  const countEl = $("count");
  const itemsEl = $("items");
  const ordersEl = $("orders");
  const summaryEl = $("summary");
  const toastEl = $("toast");

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- 新規注文フォーム ----
  function renderDraft() {
    countEl.textContent = draft.length;
    itemsEl.innerHTML = draft
      .map(
        (it, i) => `
        <li>
          <span class="num">${i + 1}本目</span>
          <button class="toggle mustard ${it.m ? "on" : ""}" data-i="${i}" data-key="m">マスタード</button>
          <button class="toggle ketchup ${it.k ? "on" : ""}" data-i="${i}" data-key="k">ケチャップ</button>
        </li>`
      )
      .join("");
  }

  $("plus").addEventListener("click", () => {
    if (draft.length >= MAX) return;
    const last = draft[draft.length - 1];
    draft.push({ ...last }); // 直前の1本と同じ設定で追加
    renderDraft();
  });

  $("minus").addEventListener("click", () => {
    if (draft.length <= 1) return;
    draft.pop();
    renderDraft();
  });

  itemsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle");
    if (!btn) return;
    const it = draft[+btn.dataset.i];
    it[btn.dataset.key] = !it[btn.dataset.key];
    renderDraft();
  });

  document.querySelectorAll("[data-bulk]").forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.dataset.bulk;
      const m = v === "both" || v === "mustard";
      const k = v === "both" || v === "ketchup";
      draft = draft.map(() => ({ m, k }));
      renderDraft();
    })
  );

  $("add").addEventListener("click", () => {
    state.orders.push({
      no: state.nextNo++,
      at: Date.now(),
      items: draft.map((it) => ({ ...it })),
    });
    save();
    draft = [{ m: true, k: true }];
    renderDraft();
    renderOrders();
  });

  // ---- 注文一覧 ----
  const label = (it) =>
    it.m && it.k
      ? `<span class="tag m">マ</span><span class="tag k">ケ</span>両方`
      : it.m
      ? `<span class="tag m">マ</span>マスタードのみ`
      : it.k
      ? `<span class="tag k">ケ</span>ケチャップのみ`
      : `<span class="tag n">−</span>なし`;

  function groupItems(items) {
    const order = ["11", "10", "01", "00"];
    const counts = {};
    items.forEach((it) => {
      const key = `${+it.m}${+it.k}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return order
      .filter((k) => counts[k])
      .map((k) => ({ it: { m: k[0] === "1", k: k[1] === "1" }, n: counts[k] }));
  }

  const fmtTime = (t) => {
    const d = new Date(t);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const elapsed = (t) => {
    const min = Math.floor((Date.now() - t) / 60000);
    return min < 1 ? "たった今" : `${min}分前`;
  };

  function renderOrders() {
    const total = state.orders.reduce((s, o) => s + o.items.length, 0);
    summaryEl.textContent = state.orders.length
      ? `待ち ${state.orders.length}件 / ${total}本`
      : "待ちなし";

    if (!state.orders.length) {
      ordersEl.innerHTML = `<div class="empty">待ちの注文はありません</div>`;
      return;
    }
    ordersEl.innerHTML = state.orders
      .map(
        (o) => `
        <div class="order">
          <div class="no">#${esc(o.no)}</div>
          <div class="body">
            <div class="meta">${fmtTime(o.at)}（${elapsed(o.at)}）・計${o.items.length}本</div>
            ${groupItems(o.items)
              .map((g) => `<div class="line">${label(g.it)} <b>×${g.n}</b></div>`)
              .join("")}
          </div>
          <button class="serve" data-no="${esc(o.no)}">提供済み</button>
        </div>`
      )
      .join("");
  }

  ordersEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".serve");
    if (!btn) return;
    const no = +btn.dataset.no;
    const idx = state.orders.findIndex((o) => o.no === no);
    if (idx < 0) return;
    lastRemoved = { order: state.orders[idx], idx };
    state.orders.splice(idx, 1); // 提供したらデータは破棄
    save();
    renderOrders();
    showToast(`#${no} を提供済みにしました`);
  });

  // ---- 取り消しトースト（誤タップ対策、5秒間のみ）----
  function showToast(msg) {
    $("toast-msg").textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() {
    toastEl.hidden = true;
    lastRemoved = null; // 期限切れで完全に破棄
  }
  $("undo").addEventListener("click", () => {
    if (!lastRemoved) return;
    state.orders.splice(lastRemoved.idx, 0, lastRemoved.order);
    save();
    renderOrders();
    clearTimeout(toastTimer);
    hideToast();
  });

  // 番号リセット：待ちが0件のときは1番から振り直す
  if (!state.orders.length) {
    state.nextNo = 1;
    save();
  }

  renderDraft();
  renderOrders();
  setInterval(renderOrders, 30000); // 経過時間の表示更新
})();
