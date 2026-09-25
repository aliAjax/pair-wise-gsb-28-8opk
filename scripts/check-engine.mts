import { planReassign, simulate } from "../src/emergency/engine";
import { seedDrivers, seedOrders, seedTrips } from "../src/emergency/data";
import { Order } from "../src/emergency/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error("✗", msg); }
  else console.log("✓", msg);
}

const closedOrders = seedOrders.filter((o) => o.tripId === "trp-1115");
const closedIds = closedOrders.map((o) => o.id);

// 1. 整批转到 TRP-1112（孙师傅 cap 1200 已装 800，缓冲箱 0，下一站 15:10）
//    逐单模拟：7701 易碎无箱失败 → 7702(260kg) 1060≤1200 且时段不撞、15:30>15:10 成功
//    → 7703 易碎仍无箱失败 → 7704 此时 1060+180=1240 超吨失败
const r1 = planReassign({
  orders: structuredClone(seedOrders),
  drivers: seedDrivers,
  trips: seedTrips,
  sourceTripId: "trp-1115",
  targetTripId: "trp-1112",
  selectedIds: closedIds,
  reason: "S20 封路",
  mode: "batch",
  auditId: "a1",
  at: new Date().toISOString()
});
const byNo = new Map(r1.entry.results.map((r) => [r.orderNo, r]));
assert(byNo.get("YD-7701")!.ok === false && byNo.get("YD-7701")!.message.includes("缓冲箱"), "易碎件 7701：孙师傅无空闲缓冲箱 → 留区");
assert(byNo.get("YD-7702")!.ok, "7702 260kg：800+260=1060≤1200，时段不撞，截止15:30 晚于15:10 → 成功");
assert(byNo.get("YD-7703")!.ok === false && byNo.get("YD-7703")!.message.includes("缓冲箱"), "易碎件 7703：全程无空闲缓冲箱 → 留区");
assert(byNo.get("YD-7704")!.ok === false && byNo.get("YD-7704")!.message.includes("超吨"), "7704：7702 已上车后 1060+180=1240 超吨 → 留区");
assert(r1.entry.results.filter((r) => r.ok).length === 1, "孙师傅车只收下 7702 一单");
assert(r1.orders.find((o) => o.orderNo === "YD-7701")!.tripId === "PENDING", "失败单进入待处理区");
assert(r1.orders.find((o) => o.orderNo === "YD-7702")!.tripId === "trp-1112", "成功单挂上目标车次");
assert(r1.orders.find((o) => o.orderNo === "YD-7701")!.pendingReason?.includes("缓冲箱") ?? false, "留区原因写在单上");
assert(r1.orders.filter((o) => o.tripId === "trp-1115").length === 0, "整批后原车次清空：成功单转走、失败单进待处理区，装载立即核减为 0");

// 2. 整批转到 TRP-1105（刘师傅 cap1000 已装550，2 缓冲箱已装1易碎 → 空闲1，下一站14:20）
const r2 = planReassign({
  orders: structuredClone(seedOrders),
  drivers: seedDrivers,
  trips: seedTrips,
  sourceTripId: "trp-1115",
  targetTripId: "trp-1105",
  selectedIds: closedIds,
  reason: "S20 封路",
  mode: "batch",
  auditId: "a2",
  at: new Date().toISOString()
});
const by2 = new Map(r2.entry.results.map((r) => [r.orderNo, r]));
assert(by2.get("YD-7701")!.ok === false && by2.get("YD-7701")!.message.includes("时段相撞"), "7701 与在装 7705 时段重叠 → 时段相撞留区");
assert(by2.get("YD-7702")!.ok === false && by2.get("YD-7702")!.message.includes("时段相撞"), "7702 与在装单时段重叠 → 相撞");
assert(by2.get("YD-7703")!.ok === false && by2.get("YD-7703")!.message.includes("时段相撞"), "7703 与 7706 时段重叠 → 相撞");
assert(by2.get("YD-7704")!.ok === false && by2.get("YD-7704")!.message.includes("错过下一站"), "7704 截止14:00 ≤ 14:20 → 错过下一站");

// 3. 找到一个能成功的组合：7703 → TRP-1108（赵师傅 cap800 已装450，缓冲箱1已装1易碎→0空闲；7703是易碎→缓冲箱失败）
// 改用 7702 → TRP-1108：450+260=710≤800，时段14:30-15:30 与 7707(14-15) 重叠 → 相撞
const r3 = planReassign({
  orders: structuredClone(seedOrders),
  drivers: seedDrivers,
  trips: seedTrips,
  sourceTripId: "trp-1115",
  targetTripId: "trp-1108",
  selectedIds: ["ord-02"],
  reason: "拆单",
  mode: "split",
  auditId: "a3",
  at: new Date().toISOString()
});
assert(!r3.entry.results[0].ok && r3.entry.results[0].message.includes("时段相撞"), "拆单 7702→赵师傅：与 7707 时段相撞");

// 4. 成功路径：7702 → TRP-1105：550+260=810≤1000；但时段 14:30-15:30 撞 7705(14:30-16:00)
// 成功路径：7703 → TRP-1108 易碎无缓冲箱失败；7703 → TRP-1112 无缓冲箱失败
// 7703 → TRP-1105：90kg，易碎占唯一空闲缓冲箱，16:00-17:30 撞7706(15-17)
// 找一个干净成功：7702 → TRP-1112：800+260=1060≤1200，非易碎，时段14:30-15:30，在装 7709(15:30-17)端点相接不撞、7710(13:40-14:20)不重叠，截止15:30 > 15:10 ✓
const r4 = planReassign({
  orders: structuredClone(seedOrders),
  drivers: seedDrivers,
  trips: seedTrips,
  sourceTripId: "trp-1115",
  targetTripId: "trp-1112",
  selectedIds: ["ord-02"],
  reason: "拆单救急",
  mode: "split",
  auditId: "a4",
  at: new Date().toISOString()
});
assert(r4.entry.results[0].ok, "7702→孙师傅：容量/缓冲/时段/下一站全通过 → 成功");
assert(r4.orders.find((o) => o.id === "ord-02")!.tripId === "trp-1112", "成功单挂上目标车次");
assert(r4.entry.results[0].fromTripNo === "TRP-1115" && r4.entry.results[0].toTripNo === "TRP-1112", "流水写清原车次与新车次");
assert(r4.entry.results[0].message === "拆单救急", "流水带上改派原因");
const stayClosed = r4.orders.filter((o) => o.tripId === "trp-1115").reduce((s, o) => s + o.weight, 0);
assert(stayClosed === 390, "原车次装载立即核减：650-260=390kg");

// 5. 待处理区重试：7711 → 孙师傅 15:10；窗口 13:00-13:30 → 截止13:30 ≤ 15:10 错过
const r5 = planReassign({
  orders: structuredClone(seedOrders),
  drivers: seedDrivers,
  trips: seedTrips,
  sourceTripId: "PENDING",
  targetTripId: "trp-1112",
  selectedIds: ["ord-11"],
  reason: "重试",
  mode: "split",
  auditId: "a5",
  at: new Date().toISOString()
});
assert(!r5.entry.results[0].ok && r5.entry.results[0].fromTripNo === "待处理区", "待处理区来源记为“待处理区”，仍失败继续留区");

// 6. 模拟试算：批量中先到的易碎件占箱，影响后到易碎件
const driversById = new Map(seedDrivers.map((d) => [d.id, d]));
const tripsById = new Map(seedTrips.map((t) => [t.id, t]));
// 刘师傅只有1空闲箱；先放 7701（但与7705撞），验证箱位占位用周车空车不行——
// 用自定义司机数据：空车1箱，两易碎件
const customDriver = { id: "d1", name: "测试师傅", capacity: 1000, bufferBoxes: 1, nextStopAt: "08:00", nextStopName: "场站" };
const customTrip = { id: "t1", tripNo: "T1", driverId: "d1", closed: false, roadInfo: null };
const f1: Order = { id: "x1", orderNo: "F1", route: "A", windowStart: "09:00", windowEnd: "10:00", fragile: true, weight: 10, tripId: "PENDING", pendingReason: null };
const f2: Order = { id: "x2", orderNo: "F2", route: "B", windowStart: "10:30", windowEnd: "11:30", fragile: true, weight: 10, tripId: "PENDING", pendingReason: null };
const sim = simulate([f1, f2], new Map([["d1", customDriver]]), new Map([["t1", customTrip]]), "t1", [f1, f2]);
assert(sim[0].plan.ok && !sim[1].plan.ok && sim[1].plan.ok === false, "同批先装入的易碎件占用唯一缓冲箱，第二件报无缓冲箱");

console.log(failures === 0 ? "\n全部规则验证通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
