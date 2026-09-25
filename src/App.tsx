// 页面层：路线应急台 UI，资料见 data.ts，计算见 logic.ts

import { useState } from "react";
import { BoardState, Order, Trip, drivers, trips, loadState, resetState, saveState } from "./data";
import { applyTransfer, loadedKg, tripLabel } from "./logic";

const project = {
  industry: "物流",
  title: "路线应急台",
  subtitle: "嘉定线封路停运。同一车次可整批转给有空位的司机，也可勾选部分订单拆单；超吨、时段相撞或错过下一站的订单自动留在待处理区并标注原因。",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function driverOf(trip: Trip) {
  return drivers.find((driver) => driver.id === trip.driverId)!;
}

export default function App() {
  const [state, setState] = useState<BoardState>(loadState);
  const [selected, setSelected] = useState<string[]>([]);
  const [targetTripId, setTargetTripId] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");

  const openTrips = trips.filter((trip) => !trip.closed);
  const pendingOrders = state.orders.filter((order) => order.tripId === null);
  const selectedOrders = state.orders.filter((order) => selected.includes(order.id));
  const selectedWeight = selectedOrders.reduce((sum, order) => sum + order.weightKg, 0);
  const movedCount = state.logs.reduce((sum, log) => sum + log.orderNos.length, 0);

  function commit(next: BoardState) {
    setState(next);
    saveState(next);
  }

  function toggle(orderId: string) {
    setSelected((prev) => (prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]));
  }

  function selectBatch(orderIds: string[]) {
    setSelected((prev) => Array.from(new Set([...prev, ...orderIds])));
  }

  function handleTransfer() {
    if (!selected.length || !targetTripId || !reason.trim()) return;
    const next = applyTransfer(state, trips, drivers, selected, targetTripId, reason.trim());
    const okCount = selected.filter((id) => next.orders.find((order) => order.id === id)?.tripId === targetTripId).length;
    const heldCount = selected.length - okCount;
    setNotice(`改派完成：${okCount} 单成功转入 ${tripLabel(targetTripId, trips)}${heldCount ? `，${heldCount} 单留在待处理区` : ""}`);
    commit(next);
    setSelected([]);
    setReason("");
  }

  function handleReset() {
    if (!window.confirm("恢复初始数据并清空改派记录？")) return;
    commit(resetState());
    setSelected([]);
    setNotice("");
  }

  function renderOrderRow(order: Order) {
    return (
      <label className={`order-row ${selected.includes(order.id) ? "picked" : ""}`} key={order.id}>
        <input type="checkbox" checked={selected.includes(order.id)} onChange={() => toggle(order.id)} />
        <span className="order-no">{order.orderNo}</span>
        <span>{order.route}</span>
        <span>{order.windowStart}-{order.windowEnd}</span>
        <span>{order.weightKg}kg</span>
        {order.fragile ? <span className="fragile">易碎</span> : <span />}
      </label>
    );
  }

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">{project.industry} · 封路应急调度</p>
            <h1>{project.title}</h1>
            <p className="subtitle">{project.subtitle}</p>
          </div>
          <button className="secondary" type="button" onClick={handleReset}>恢复初始数据</button>
        </header>

        <section className="metrics">
          <article className="metric"><span>待处理订单</span><strong>{pendingOrders.length}</strong></article>
          <article className="metric"><span>已改派订单</span><strong>{movedCount}</strong></article>
          <article className="metric"><span>封路车次</span><strong>{trips.filter((trip) => trip.closed).length}</strong></article>
        </section>

        {notice && <div className="notice">{notice}</div>}

        <section className="board">
          <div className="col">
            {trips.map((trip) => {
              const driver = driverOf(trip);
              const tripOrders = state.orders.filter((order) => order.tripId === trip.id);
              const loaded = loadedKg(state.orders, trip.id);
              const pct = Math.min(100, Math.round((loaded / driver.capacityKg) * 100));
              return (
                <section className="list-panel trip-card" key={trip.id}>
                  <div className="toolbar">
                    <h2>
                      {trip.id} · {trip.route}
                      {trip.closed && <span className="closed-badge">封路停运</span>}
                    </h2>
                    {tripOrders.length > 0 && (
                      <button className="secondary" type="button" onClick={() => selectBatch(tripOrders.map((order) => order.id))}>
                        整批选择
                      </button>
                    )}
                  </div>
                  <p className="driver-line">
                    {driver.name} · 上限 {driver.capacityKg}kg · 已装 {loaded}kg · 下一站 {driver.nextStopTime}
                    {driver.hasBufferBox ? " · 有缓冲箱" : " · 无缓冲箱"}
                  </p>
                  <div className="load-track"><div className={`load-fill ${pct >= 90 ? "hot" : ""}`} style={{ width: `${pct}%` }} /></div>
                  <div className="order-list">
                    {tripOrders.length === 0 ? <div className="empty">车上暂无订单</div> : tripOrders.map(renderOrderRow)}
                  </div>
                </section>
              );
            })}

            <section className="list-panel pending-panel">
              <div className="toolbar">
                <h2>待处理区（{pendingOrders.length}）</h2>
                {pendingOrders.length > 0 && (
                  <button className="secondary" type="button" onClick={() => selectBatch(pendingOrders.map((order) => order.id))}>
                    全选待处理
                  </button>
                )}
              </div>
              <div className="order-list">
                {pendingOrders.length === 0 ? <div className="empty">暂无滞留订单</div> : pendingOrders.map((order) => (
                  <div key={order.id}>
                    {renderOrderRow(order)}
                    <span className="reason">{order.pendingReason}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="col">
            <section className="panel">
              <h2>改派面板</h2>
              <div className="form-grid">
                <p className="hint">已选 {selected.length} 单 · 合计 {selectedWeight}kg。点车次卡上的「整批选择」整批转移，勾选部分订单即拆单。</p>
                <label>
                  目标车次
                  <select value={targetTripId} onChange={(event) => setTargetTripId(event.target.value)}>
                    <option value="">请选择</option>
                    {openTrips.map((trip) => (
                      <option key={trip.id} value={trip.id}>
                        {trip.id} · {trip.route} · {driverOf(trip).name}（余量 {driverOf(trip).capacityKg - loadedKg(state.orders, trip.id)}kg）
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  改派原因
                  <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="如：嘉定线封路，整批改派" />
                </label>
                <button type="button" disabled={!selected.length || !targetTripId || !reason.trim()} onClick={handleTransfer}>
                  执行改派
                </button>
                <p className="hint">校验规则：超吨 / 时段相撞 / 错过下一站 / 易碎需缓冲箱；未通过的单据留在待处理区并注明原因。</p>
              </div>
            </section>

            <section className="panel">
              <h2>改派记录</h2>
              {state.logs.length === 0 ? <div className="empty">暂无改派记录</div> : (
                <div className="log-list">
                  {state.logs.map((log) => (
                    <article className="log-item" key={log.id}>
                      <p className="log-head">{log.orderNos.join("、")}</p>
                      <p className="log-route">{tripLabel(log.fromTripId, trips)} → {tripLabel(log.toTripId, trips)}</p>
                      <p className="log-meta">原因：{log.reason} · {formatTime(log.time)}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
