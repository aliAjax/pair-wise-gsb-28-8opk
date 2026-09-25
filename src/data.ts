// 资料层：类型、种子数据与本地持久化，不含计算与页面逻辑

export type Order = {
  id: string;
  orderNo: string;
  route: string;
  windowStart: string; // 送达时段起 "HH:MM"
  windowEnd: string; // 送达时段止 "HH:MM"
  weightKg: number;
  fragile: boolean; // 易碎标记
  tripId: string | null; // null 表示在待处理区
  pendingReason: string | null; // 滞留原因
};

export type Trip = {
  id: string; // 车次号
  route: string;
  driverId: string;
  closed: boolean; // 封路停运
};

export type Driver = {
  id: string;
  name: string;
  capacityKg: number; // 装载上限
  hasBufferBox: boolean; // 是否配缓冲箱
  nextStopTime: string; // 下一站时刻 "HH:MM"
};

export type ReassignLog = {
  id: string;
  time: string;
  orderNos: string[];
  fromTripId: string | null; // 原车次，null 表示来自待处理区
  toTripId: string; // 新车次
  reason: string; // 改派原因
};

export type BoardState = {
  orders: Order[];
  logs: ReassignLog[];
};

export const drivers: Driver[] = [
  { id: "D1", name: "刘师傅", capacityKg: 1000, hasBufferBox: true, nextStopTime: "09:30" },
  { id: "D2", name: "赵师傅", capacityKg: 800, hasBufferBox: false, nextStopTime: "10:00" },
  { id: "D3", name: "孙师傅", capacityKg: 1200, hasBufferBox: true, nextStopTime: "08:30" },
];

export const trips: Trip[] = [
  { id: "T-101", route: "浦东线", driverId: "D1", closed: false },
  { id: "T-102", route: "嘉定线", driverId: "D2", closed: true },
  { id: "T-103", route: "闵行线", driverId: "D3", closed: false },
];

const seedOrders: Order[] = [
  { id: "o1001", orderNo: "ORD-1001", route: "浦东线", windowStart: "08:00", windowEnd: "09:30", weightKg: 260, fragile: false, tripId: "T-101", pendingReason: null },
  { id: "o1002", orderNo: "ORD-1002", route: "浦东线", windowStart: "11:30", windowEnd: "13:00", weightKg: 300, fragile: false, tripId: "T-101", pendingReason: null },
  { id: "o2001", orderNo: "ORD-2001", route: "嘉定线", windowStart: "08:00", windowEnd: "09:00", weightKg: 180, fragile: true, tripId: "T-102", pendingReason: null },
  { id: "o2002", orderNo: "ORD-2002", route: "嘉定线", windowStart: "09:30", windowEnd: "11:00", weightKg: 220, fragile: false, tripId: "T-102", pendingReason: null },
  { id: "o2003", orderNo: "ORD-2003", route: "嘉定线", windowStart: "13:00", windowEnd: "15:00", weightKg: 150, fragile: true, tripId: "T-102", pendingReason: null },
  { id: "o3001", orderNo: "ORD-3001", route: "闵行线", windowStart: "09:00", windowEnd: "10:30", weightKg: 400, fragile: false, tripId: "T-103", pendingReason: null },
  { id: "o3002", orderNo: "ORD-3002", route: "闵行线", windowStart: "14:00", windowEnd: "16:00", weightKg: 350, fragile: true, tripId: "T-103", pendingReason: null },
];

export const storageKey = "hxwlfront-14-emergency-board";

function initialState(): BoardState {
  return { orders: seedOrders.map((order) => ({ ...order })), logs: [] };
}

export function loadState(): BoardState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as BoardState;
      if (Array.isArray(parsed.orders) && Array.isArray(parsed.logs)) return parsed;
    }
  } catch {
    // 数据损坏时回退到初始数据
  }
  return initialState();
}

export function saveState(state: BoardState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

export function resetState(): BoardState {
  const fresh = initialState();
  saveState(fresh);
  return fresh;
}
