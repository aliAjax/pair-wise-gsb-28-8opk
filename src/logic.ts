// 计算层：装载统计、改派校验与执行，全部为不依赖页面的纯函数

import { BoardState, Driver, Order, Trip } from "./data";

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function windowsOverlap(a: Order, b: Order): boolean {
  return toMinutes(a.windowStart) < toMinutes(b.windowEnd) && toMinutes(b.windowStart) < toMinutes(a.windowEnd);
}

// 司机已装重量由车上订单实时求和，订单一走原装载立即减少
export function loadedKg(orders: Order[], tripId: string): number {
  return orders.filter((order) => order.tripId === tripId).reduce((sum, order) => sum + order.weightKg, 0);
}

// 返回 null 表示可改派，否则返回滞留原因
export function checkOrder(order: Order, trip: Trip, driver: Driver, orders: Order[]): string | null {
  if (order.fragile && !driver.hasBufferBox) {
    return `易碎货需缓冲箱，${driver.name}未配备`;
  }
  const others = orders.filter((item) => item.id !== order.id);
  const afterKg = loadedKg(others, trip.id) + order.weightKg;
  if (afterKg > driver.capacityKg) {
    return `超吨：装后 ${afterKg}kg 超过上限 ${driver.capacityKg}kg`;
  }
  const clash = others.find((item) => item.tripId === trip.id && windowsOverlap(item, order));
  if (clash) {
    return `时段相撞：与 ${clash.orderNo}（${clash.windowStart}-${clash.windowEnd}）重叠`;
  }
  if (toMinutes(order.windowEnd) < toMinutes(driver.nextStopTime)) {
    return `错过下一站：司机 ${driver.nextStopTime} 已离站，晚于送达截止 ${order.windowEnd}`;
  }
  return null;
}

// 逐单校验：成功单上新车次并写改派记录，失败单留待处理区并标注原因
export function applyTransfer(
  state: BoardState,
  trips: Trip[],
  drivers: Driver[],
  orderIds: string[],
  toTripId: string,
  reason: string
): BoardState {
  const trip = trips.find((item) => item.id === toTripId);
  const driver = drivers.find((item) => item.id === trip?.driverId);
  if (!trip || !driver) return state;

  const orders = state.orders.map((order) => ({ ...order }));
  const moved: Order[] = [];

  for (const id of orderIds) {
    const order = orders.find((item) => item.id === id);
    if (!order) continue;
    const problem = checkOrder(order, trip, driver, orders);
    if (problem) {
      order.tripId = null;
      order.pendingReason = problem;
    } else {
      moved.push({ ...order });
      order.tripId = toTripId;
      order.pendingReason = null;
    }
  }

  // 按原车次分组写记录：原车次、原因、新车次
  const byFromTrip = new Map<string | null, string[]>();
  for (const order of moved) {
    const list = byFromTrip.get(order.tripId) ?? [];
    list.push(order.orderNo);
    byFromTrip.set(order.tripId, list);
  }
  const logs = [...state.logs];
  for (const [fromTripId, orderNos] of byFromTrip) {
    logs.unshift({
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      orderNos,
      fromTripId,
      toTripId,
      reason,
    });
  }

  return { orders, logs };
}

export function tripLabel(tripId: string | null, trips: Trip[]): string {
  if (tripId === null) return "待处理区";
  const trip = trips.find((item) => item.id === tripId);
  return trip ? `${trip.id} · ${trip.route}` : tripId;
}
