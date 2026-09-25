// 资料层：司机 / 车次 / 托运单的初始资料，独立于计算与页面维护
import { Driver, Order, Trip } from "./types";

export const seedDrivers: Driver[] = [
  {
    id: "drv-liu",
    name: "刘师傅",
    capacity: 1000,
    bufferBoxes: 2,
    nextStopAt: "14:20",
    nextStopName: "张江中转站"
  },
  {
    id: "drv-zhao",
    name: "赵师傅",
    capacity: 800,
    bufferBoxes: 1,
    nextStopAt: "13:50",
    nextStopName: "嘉定北站"
  },
  {
    id: "drv-sun",
    name: "孙师傅",
    capacity: 1200,
    bufferBoxes: 0,
    nextStopAt: "15:10",
    nextStopName: "青浦分拨点"
  },
  {
    id: "drv-zhou",
    name: "周师傅",
    capacity: 600,
    bufferBoxes: 3,
    nextStopAt: "14:40",
    nextStopName: "南桥交接点"
  }
];

export const seedTrips: Trip[] = [
  {
    id: "trp-1105",
    tripNo: "TRP-1105",
    driverId: "drv-liu",
    closed: false,
    roadInfo: null
  },
  {
    id: "trp-1108",
    tripNo: "TRP-1108",
    driverId: "drv-zhao",
    closed: false,
    roadInfo: null
  },
  {
    id: "trp-1112",
    tripNo: "TRP-1112",
    driverId: "drv-sun",
    closed: false,
    roadInfo: null
  },
  {
    id: "trp-1115",
    tripNo: "TRP-1115",
    driverId: "drv-zhou",
    closed: true,
    roadInfo: "S20 外环 K42 段封路，预计 17:00 解封"
  }
];

export const seedOrders: Order[] = [
  // —— 封路车次 TRP-1115（周师傅）：应急改派的源头 ——
  { id: "ord-01", orderNo: "YD-7701", route: "南桥商圈 → 奉贤万象城", windowStart: "15:00", windowEnd: "16:00", fragile: true, weight: 120, tripId: "trp-1115", pendingReason: null },
  { id: "ord-02", orderNo: "YD-7702", route: "南桥 → 金海公路仓库", windowStart: "14:30", windowEnd: "15:30", fragile: false, weight: 260, tripId: "trp-1115", pendingReason: null },
  { id: "ord-03", orderNo: "YD-7703", route: "南桥 → 海湾旅游区", windowStart: "16:00", windowEnd: "17:30", fragile: true, weight: 90, tripId: "trp-1115", pendingReason: null },
  { id: "ord-04", orderNo: "YD-7704", route: "南桥 → 环城西路门店", windowStart: "13:30", windowEnd: "14:00", fragile: false, weight: 180, tripId: "trp-1115", pendingReason: null },

  // —— 在途正常车次的既有装载 ——
  { id: "ord-05", orderNo: "YD-7705", route: "张江 → 祖冲之路软件园", windowStart: "14:30", windowEnd: "16:00", fragile: true, weight: 210, tripId: "trp-1105", pendingReason: null },
  { id: "ord-06", orderNo: "YD-7706", route: "张江 → 金科路卖场", windowStart: "15:00", windowEnd: "17:00", fragile: false, weight: 340, tripId: "trp-1105", pendingReason: null },
  { id: "ord-07", orderNo: "YD-7707", route: "嘉定北 → 城北路工厂", windowStart: "14:00", windowEnd: "15:00", fragile: false, weight: 300, tripId: "trp-1108", pendingReason: null },
  { id: "ord-08", orderNo: "YD-7708", route: "嘉定北 → 菊园新区", windowStart: "14:30", windowEnd: "15:30", fragile: true, weight: 150, tripId: "trp-1108", pendingReason: null },
  { id: "ord-09", orderNo: "YD-7709", route: "青浦 → 赵巷奥特莱斯", windowStart: "15:30", windowEnd: "17:00", fragile: false, weight: 420, tripId: "trp-1112", pendingReason: null },
  { id: "ord-10", orderNo: "YD-7710", route: "青浦 → 徐泾虹桥商务区", windowStart: "13:40", windowEnd: "14:20", fragile: false, weight: 380, tripId: "trp-1112", pendingReason: null },

  // —— 待处理区：历史遗留，附留区原因 ——
  { id: "ord-11", orderNo: "YD-7711", route: "南桥 → 庄行镇网点", windowStart: "13:00", windowEnd: "13:30", fragile: false, weight: 160, tripId: "PENDING", pendingReason: "错过下一站：送达截止 13:30 早于各车次下一站发车时刻" }
];
