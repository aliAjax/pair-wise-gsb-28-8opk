import { useMemo, useState } from "react";
import { App as AntApp, Button, Input, Modal, Progress, Statistic, Tag, Tooltip } from "antd";
import {
  AlertOutlined,
  ExclamationCircleFilled,
  ReloadOutlined
} from "@ant-design/icons";
import AuditPanel from "./components/AuditPanel";
import ReassignModal from "./components/ReassignModal";
import { summarizeBoard } from "./engine";
import { useEmergencyStore } from "./store";
import { Driver, Order, PENDING_ID, Trip } from "./types";

function OrderChip({ order }: { order: Order }) {
  return (
    <Tooltip
      title={
        <div>
          <div>路线：{order.route}</div>
          <div>送达时段：{order.windowStart}-{order.windowEnd}</div>
          <div>{order.fragile ? "易碎件（需缓冲箱）" : "普通件"} · {order.weight}kg</div>
        </div>
      }
    >
      <div className={`chip ${order.fragile ? "chip-fragile" : ""}`}>
        <span className="chip-no">{order.orderNo}</span>
        <span className="chip-meta">
          {order.windowStart}-{order.windowEnd} · {order.weight}kg
        </span>
        {order.fragile && <span className="chip-mark">易碎</span>}
      </div>
    </Tooltip>
  );
}

function TripCard({
  trip,
  driver,
  aboard,
  onReassign,
  onToggleClosed
}: {
  trip: Trip;
  driver: Driver;
  aboard: Order[];
  onReassign: () => void;
  onToggleClosed: (closed: boolean, roadInfo: string) => void;
}) {
  const { modal } = AntApp.useApp();
  const summary = summarizeBoard(driver, aboard);
  const overload = summary.load > driver.capacity;

  function handleReopen() {
    onToggleClosed(false, "");
  }

  return (
    <article className={`trip-card ${trip.closed ? "trip-closed" : ""}`}>
      <header className="trip-head">
        <div>
          <p className="trip-no">
            {trip.tripNo}
            {trip.closed ? (
              <Tag color="red" icon={<AlertOutlined />} style={{ marginLeft: 8 }}>
                封路停摆
              </Tag>
            ) : (
              <Tag color="green" style={{ marginLeft: 8 }}>在运</Tag>
            )}
          </p>
          <p className="trip-driver">{driver.name}</p>
        </div>
        {trip.closed ? (
          <Button size="small" onClick={handleReopen}>解封</Button>
        ) : (
          <Button
            size="small"
            danger
            icon={<AlertOutlined />}
            onClick={() => {
              let info = "";
              modal.confirm({
                title: `登记 ${trip.tripNo} 封路？`,
                content: (
                  <RoadInfoInput
                    onChange={(v) => {
                      info = v;
                    }}
                  />
                ),
                okText: "登记封路并改派",
                cancelText: "取消",
                icon: <ExclamationCircleFilled />,
                onOk: () => {
                  onToggleClosed(true, info || "道路封闭");
                }
              });
            }}
          >
            登记封路
          </Button>
        )}
      </header>

      {trip.closed && trip.roadInfo && <p className="road-info">⚠ {trip.roadInfo}</p>}

      <div className="trip-stats">
        <div>
          <p className="stat-label">已装 / 载重上限</p>
          <p className={`stat-value ${overload ? "stat-danger" : ""}`}>
            {summary.load}<span className="stat-unit"> / {driver.capacity}kg</span>
          </p>
          <Progress
            percent={Math.round(summary.usage * 100)}
            size="small"
            status={overload || summary.usage >= 1 ? "exception" : summary.usage > 0.85 ? "active" : "normal"}
            showInfo={false}
          />
        </div>
        <div className="trip-stat-grid">
          <div>
            <p className="stat-label">空闲缓冲箱</p>
            <p className={`stat-value ${summary.freeBoxes === 0 ? "stat-warn" : ""}`}>
              {summary.freeBoxes}
              <span className="stat-unit"> / {driver.bufferBoxes} 个</span>
            </p>
          </div>
          <div>
            <p className="stat-label">下一站时刻</p>
            <p className="stat-value">
              {driver.nextStopAt}
              <span className="stat-unit"> {driver.nextStopName}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="chip-list">
        {aboard.length === 0 && <p className="empty-line">暂无装载</p>}
        {aboard.map((order) => (
          <OrderChip key={order.id} order={order} />
        ))}
      </div>

      <Button block type="primary" danger={trip.closed} onClick={onReassign}>
        {trip.closed ? "应急改派（整批/拆单）" : aboard.length > 0 ? "转出托运单" : "无可转出单"}
      </Button>
    </article>
  );
}

function RoadInfoInput({ onChange }: { onChange: (info: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div style={{ marginTop: 12 }}>
      <Input.TextArea
        rows={2}
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        placeholder="例：S20 外环 K42 段封路，预计 17:00 解封"
      />
    </div>
  );
}

export default function EmergencyBoard() {
  // useApp 的 message/modal/notification 需要 antd App 上下文，包一层
  return (
    <AntApp style={{ minHeight: "100vh" }}>
      <BoardInner />
    </AntApp>
  );
}

function BoardInner() {
  const orders = useEmergencyStore((s) => s.orders);
  const trips = useEmergencyStore((s) => s.trips);
  const drivers = useEmergencyStore((s) => s.drivers);
  const setClosed = useEmergencyStore((s) => s.setClosed);
  const resetDemo = useEmergencyStore((s) => s.resetDemo);
  const { modal } = AntApp.useApp();

  const [modalTripId, setModalTripId] = useState<string | null>(null);

  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const ordersByTrip = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      const list = map.get(order.tripId) ?? [];
      list.push(order);
      map.set(order.tripId, list);
    }
    return map;
  }, [orders]);

  const pending = ordersByTrip.get(PENDING_ID) ?? [];
  const closedTrips = trips.filter((t) => t.closed);
  const totalLoad = useMemo(
    () => orders.filter((o) => o.tripId !== PENDING_ID).reduce((s, o) => s + o.weight, 0),
    [orders]
  );

  return (
    <main className="emergency-app">
      <div className="emergency-shell">
        <header className="emergency-top">
          <div>
            <p className="eyebrow">物流 · 封路应急调度</p>
            <h1>路线应急台</h1>
            <p className="subtitle">
              封路后无需逐单改司机：同一车次可整批转给有空位的司机，也可拆单改派；
              超吨、时段相撞、错过下一站或易碎无缓冲箱的单自动留在待处理区并说明原因。
            </p>
          </div>
          <Tooltip title="恢复初始演示资料（不影响已保存的操作逻辑）">
            <Button icon={<ReloadOutlined />} onClick={() => resetDemo()}>重置演示数据</Button>
          </Tooltip>
        </header>

        {closedTrips.length > 0 && (
          <div className="closed-banner">
            <AlertOutlined />
            <span>
              当前 {closedTrips.length} 个车次封路停摆：
              {closedTrips.map((t) => `${t.tripNo}${t.roadInfo ? `（${t.roadInfo}）` : ""}`).join("；")}
            </span>
          </div>
        )}

        <section className="kpi-row">
          <div className="kpi"><Statistic title="封路车次" value={closedTrips.length} suffix={`/ ${trips.length}`} valueStyle={{ color: closedTrips.length ? "#c84b31" : undefined }} /></div>
          <div className="kpi"><Statistic title="待处理区订单" value={pending.length} suffix="单" valueStyle={{ color: pending.length ? "#d48806" : undefined }} /></div>
          <div className="kpi"><Statistic title="在途装载总量" value={totalLoad} suffix="kg" /></div>
          <div className="kpi"><Statistic title="在岗司机" value={drivers.length} suffix="人" /></div>
        </section>

        <div className="board-grid">
          <section className="trip-column">
            <div className="section-head">
              <h2>车次与司机</h2>
              <span className="section-hint">卡片显示上限、已装重量、空闲缓冲箱与下一站时刻</span>
            </div>
            <div className="trip-grid">
              {trips.map((trip) => {
                const driver = driversById.get(trip.driverId)!;
                return (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    driver={driver}
                    aboard={ordersByTrip.get(trip.id) ?? []}
                    onReassign={() => setModalTripId(trip.id)}
                    onToggleClosed={(closed, roadInfo) => {
                      setClosed(trip.id, closed, roadInfo || "道路封闭");
                      if (closed) setModalTripId(trip.id);
                    }}
                  />
                );
              })}
            </div>
          </section>

          <aside className="side-column">
            <section className={`panel pending-panel ${pending.length ? "has-pending" : ""}`}>
              <div className="panel-head">
                <div>
                  <h2>待处理区 <span className="pending-count">{pending.length}</span></h2>
                  <p className="panel-desc">校验未通过的单留在这里，重新指派目标车即可再次试算</p>
                </div>
              </div>
              {pending.length === 0 ? (
                <p className="empty-line center">暂无留区订单</p>
              ) : (
                <div className="pending-list">
                  {pending.map((order) => (
                    <div key={order.id} className="pending-item">
                      <OrderChip order={order} />
                      <p className="pending-reason">
                        <ExclamationCircleFilled /> {order.pendingReason}
                      </p>
                    </div>
                  ))}
                  <Button block onClick={() => setModalTripId(PENDING_ID)}>
                    对待处理区再次改派
                  </Button>
                </div>
              )}
            </section>

            <section className="panel rules-panel">
              <h2>校验规则</h2>
              <ul>
                <li><Tag color="orange">缓冲箱</Tag>易碎件只能转给有空闲缓冲箱的司机</li>
                <li><Tag color="red">超吨</Tag>加装后总重不得超过载重上限</li>
                <li><Tag color="volcano">时段</Tag>送达时段不得与目标车在装单重叠</li>
                <li><Tag color="magenta">下一站</Tag>送达截止晚于目标车下一站发车才能赶上</li>
              </ul>
              <p className="rules-note">
                整批改派逐单试算：通过的单立即转移并核减原车次装载，未通过的单连同原因留在待处理区。
              </p>
            </section>
          </aside>
        </div>

        <AuditPanel />
      </div>

      {modalTripId && <ReassignModal sourceTripId={modalTripId} onClose={() => setModalTripId(null)} />}
    </main>
  );
}
