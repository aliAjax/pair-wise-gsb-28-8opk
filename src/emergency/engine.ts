// 计算层：应急改派的纯规则引擎，不含任何 React / 存储代码
import {
  AuditEntry,
  AuditResult,
  Driver,
  Order,
  OrderPlan,
  PENDING_ID,
  ReassignMode,
  RejectCode,
  Trip
} from "./types";

// ---------- 基础工具 ----------

export function timeToMin(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

/** 两个送达时段是否重叠（端点相接不算相撞） */
export function windowsOverlap(a: Order, b: Order): boolean {
  return (
    timeToMin(a.windowStart) < timeToMin(b.windowEnd) &&
    timeToMin(b.windowStart) < timeToMin(a.windowEnd)
  );
}

export const loadOf = (orders: Order[]): number => orders.reduce((sum, o) => sum + o.weight, 0);
export const fragileCountOf = (orders: Order[]): number => orders.filter((o) => o.fragile).length;

export type BoardSummary = {
  /** 已装重量 */
  load: number;
  /** 剩余载重 */
  remaining: number;
  /** 车上易碎件数 */
  fragileOnBoard: number;
  /** 空闲缓冲箱数 */
  freeBoxes: number;
  count: number;
  /** 载重占用率 0~1 */
  usage: number;
};

export function summarizeBoard(driver: Driver, aboard: Order[]): BoardSummary {
  const load = loadOf(aboard);
  const fragileOnBoard = fragileCountOf(aboard);
  return {
    load,
    remaining: Math.max(0, driver.capacity - load),
    fragileOnBoard,
    freeBoxes: Math.max(0, driver.bufferBoxes - fragileOnBoard),
    count: aboard.length,
    usage: driver.capacity === 0 ? 0 : Math.min(1, load / driver.capacity)
  };
}

// ---------- 逐单校验：缓冲箱 → 超吨 → 时段相撞 → 错过下一站 ----------

function reject(code: RejectCode, message: string): OrderPlan {
  return { ok: false, code, message };
}

/**
 * 判断一单能否装上目标车。
 * @param aboard 目标车上「已在板」的单（模拟批量装入时，先前通过的单也逐步加入）
 */
export function checkOrder(order: Order, driver: Driver, aboard: Order[]): OrderPlan {
  const summary = summarizeBoard(driver, aboard);

  if (order.fragile && summary.freeBoxes <= 0) {
    return reject(
      "BUFFER",
      `无缓冲箱：易碎件需缓冲箱，${driver.name} 的 ${driver.bufferBoxes} 个缓冲箱已被在装易碎件占满`
    );
  }

  if (summary.load + order.weight > driver.capacity) {
    return reject(
      "OVERWEIGHT",
      `超吨：已装 ${summary.load}kg，加装本单 ${order.weight}kg 后为 ${summary.load + order.weight}kg，超过载重上限 ${driver.capacity}kg`
    );
  }

  const clash = aboard.find((o) => windowsOverlap(o, order));
  if (clash) {
    return reject(
      "CLASH",
      `时段相撞：本单 ${order.windowStart}-${order.windowEnd} 与车上 ${clash.orderNo}（${clash.windowStart}-${clash.windowEnd}）送达时段重叠`
    );
  }

  // 送达截止时刻不得晚于（含等于）目标车下一站发车时刻，否则赶不上
  if (timeToMin(order.windowEnd) <= timeToMin(driver.nextStopAt)) {
    return reject(
      "MISS",
      `错过下一站：${driver.name} 下一站「${driver.nextStopName}」${driver.nextStopAt} 发车，晚于或紧贴本单送达截止 ${order.windowEnd}`
    );
  }

  return { ok: true };
}

// ---------- 试算（给页面做预览，不改数据） ----------

export type PreviewRow = {
  order: Order;
  plan: OrderPlan;
  /** 若通过，装入后该车的汇总情况 */
  after: BoardSummary | null;
};

/**
 * 按顺序模拟把候选单逐辆装上目标车：通过的单会占位参与后续校验，
 * 被拒的单不占位（与真实改派执行逻辑保持一致）。
 * 候选单彼此不做时段相撞判断——它们原本同车，整批/拆单过来视为同车共存。
 */
export function simulate(
  allOrders: Order[],
  driversById: Map<string, Driver>,
  tripsById: Map<string, Trip>,
  targetTripId: string,
  candidates: Order[]
): PreviewRow[] {
  const targetTrip = tripsById.get(targetTripId);
  const driver = targetTrip ? driversById.get(targetTrip.driverId) : undefined;
  if (!targetTrip || !driver) return [];

  const candidateIds = new Set(candidates.map((o) => o.id));
  const aboard = allOrders.filter((o) => o.tripId === targetTripId && !candidateIds.has(o.id));

  return candidates.map((order) => {
    const plan = checkOrder(order, driver, aboard);
    if (plan.ok) {
      aboard.push(order);
      return { order, plan, after: summarizeBoard(driver, aboard) };
    }
    return { order, plan, after: null };
  });
}

// ---------- 改派执行（纯函数：进状态，出新状态 + 流水） ----------

export type ReassignInput = {
  orders: Order[];
  drivers: Driver[];
  trips: Trip[];
  sourceTripId: string;
  targetTripId: string;
  selectedIds: string[];
  reason: string;
  mode: ReassignMode;
  /** 由调用方（store）注入，保持引擎纯净 */
  auditId: string;
  at: string;
};

export type ReassignOutput = {
  orders: Order[];
  entry: AuditEntry;
};

export function planReassign(input: ReassignInput): ReassignOutput {
  const { orders, drivers, trips, sourceTripId, targetTripId, selectedIds, reason, mode, auditId, at } = input;

  const driversById = new Map(drivers.map((d) => [d.id, d]));
  const tripsById = new Map(trips.map((t) => [t.id, t]));
  const targetTrip = tripsById.get(targetTripId);
  const driver = targetTrip ? driversById.get(targetTrip.driverId) : undefined;
  if (!targetTrip || !driver) {
    throw new Error("目标车次或司机不存在");
  }

  // 保持原车次上的装车顺序
  const position = new Map(orders.map((o, i) => [o.id, i]));
  const selected = orders
    .filter((o) => selectedIds.includes(o.id))
    .sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));

  const candidateIds = new Set(selected.map((o) => o.id));
  const aboard = orders.filter((o) => o.tripId === targetTripId && !candidateIds.has(o.id));

  const results: AuditResult[] = [];
  const nextById = new Map(orders.map((o) => [o.id, { ...o }]));

  for (const order of selected) {
    const originTrip = tripsById.get(order.tripId);
    const fromTripNo = order.tripId === PENDING_ID ? "待处理区" : originTrip?.tripNo ?? order.tripId;
    const plan = checkOrder(order, driver, aboard);

    if (plan.ok) {
      aboard.push(order);
      const moved = nextById.get(order.id)!;
      moved.tripId = targetTripId;
      moved.pendingReason = null;
      results.push({
        orderId: order.id,
        orderNo: order.orderNo,
        ok: true,
        fromTripNo,
        toTripNo: targetTrip.tripNo,
        message: reason || "应急改派"
      });
    } else {
      const stayed = nextById.get(order.id)!;
      // 无论原车次是否就是待处理区，校验不通过一律留在待处理区并写明原因
      stayed.tripId = PENDING_ID;
      stayed.pendingReason = plan.message;
      results.push({
        orderId: order.id,
        orderNo: order.orderNo,
        ok: false,
        fromTripNo,
        toTripNo: null,
        message: plan.message
      });
    }
  }

  const sourceTrip = tripsById.get(sourceTripId);
  const entry: AuditEntry = {
    id: auditId,
    at,
    mode,
    reason: reason || "应急改派",
    sourceTripId,
    sourceTripNo: sourceTripId === PENDING_ID ? "待处理区" : sourceTrip?.tripNo ?? sourceTripId,
    targetTripId,
    targetTripNo: targetTrip.tripNo,
    targetDriverName: driver.name,
    results
  };

  return { orders: [...nextById.values()], entry };
}
