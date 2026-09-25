// 路线应急台 —— 领域模型（资料层与计算层共用的类型契约）

/** 车次上的托运单 */
export type Order = {
  id: string;
  /** 订单号 */
  orderNo: string;
  /** 路线 / 送达目的地 */
  route: string;
  /** 送达时段起 HH:MM */
  windowStart: string;
  /** 送达时段止 HH:MM */
  windowEnd: string;
  /** 易碎标记：改派时目标司机必须有空缓冲箱 */
  fragile: boolean;
  /** 重量 kg */
  weight: number;
  /** 当前所在车次；PENDING_ID 表示在待处理区 */
  tripId: string;
  /** 待处理区中展示的留区原因（最近一次校验失败原因） */
  pendingReason: string | null;
};

/** 司机资料：运力、缓冲箱、下一站时刻 */
export type Driver = {
  id: string;
  name: string;
  /** 载重上限 kg */
  capacity: number;
  /** 随车缓冲箱数量（用于易碎件） */
  bufferBoxes: number;
  /** 下一站发车时刻 HH:MM */
  nextStopAt: string;
  /** 下一站名称 */
  nextStopName: string;
};

/** 车次：一名司机当前值乘的一个车次 */
export type Trip = {
  id: string;
  /** 车次号，如 TRP-1105 */
  tripNo: string;
  driverId: string;
  /** 是否因封路停摆 */
  closed: boolean;
  /** 封路 / 应急说明，作为改派原因的默认值 */
  roadInfo: string | null;
};

/** 单条改派校验结论 */
export type OrderPlan =
  | { ok: true }
  | { ok: false; code: RejectCode; message: string };

/** 退回待处理区的四类原因（超吨、时段相撞、错过下一站、无缓冲箱） */
export type RejectCode = "BUFFER" | "OVERWEIGHT" | "CLASH" | "MISS";

export type ReassignMode = "batch" | "split";

/** 改派记录中的逐单结果 */
export type AuditResult = {
  orderId: string;
  orderNo: string;
  ok: boolean;
  /** 原车次号（待处理区来源记“待处理区”） */
  fromTripNo: string;
  /** 新车次号，失败为 null */
  toTripNo: string | null;
  /** 成功为改派说明，失败为留区原因 */
  message: string;
};

/** 改派流水（重开后仍可追看） */
export type AuditEntry = {
  id: string;
  /** ISO 时间戳 */
  at: string;
  mode: ReassignMode;
  /** 改派原因（封路说明等） */
  reason: string;
  sourceTripId: string;
  sourceTripNo: string;
  targetTripId: string;
  targetTripNo: string;
  targetDriverName: string;
  results: AuditResult[];
};

/** 待处理区虚拟车次 id */
export const PENDING_ID = "PENDING";
