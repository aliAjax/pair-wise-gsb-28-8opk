// 状态层：资料变更与改派流水的唯一入口，localStorage 持久化，重开仍可追看
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { seedDrivers, seedOrders, seedTrips } from "./data";
import { planReassign } from "./engine";
import { AuditEntry, Driver, Order, PENDING_ID, ReassignMode, Trip } from "./types";

type ReassignArgs = {
  sourceTripId: string;
  targetTripId: string;
  selectedIds: string[];
  reason: string;
  mode: ReassignMode;
};

type EmergencyState = {
  drivers: Driver[];
  trips: Trip[];
  orders: Order[];
  audit: AuditEntry[];

  /** 执行整批转车 / 拆单；返回本次流水，页面据此提示成功与留区数量 */
  reassign: (args: ReassignArgs) => AuditEntry;
  /** 登记 / 解除封路 */
  setClosed: (tripId: string, closed: boolean, roadInfo: string) => void;
  clearAudit: () => void;
  resetDemo: () => void;
};

const freshSeed = () => ({
  drivers: structuredClone(seedDrivers),
  trips: structuredClone(seedTrips),
  orders: structuredClone(seedOrders),
  audit: [] as AuditEntry[]
});

export const useEmergencyStore = create<EmergencyState>()(
  persist(
    (set, get) => ({
      ...freshSeed(),

      reassign: ({ sourceTripId, targetTripId, selectedIds, reason, mode }) => {
        const { orders, drivers, trips } = get();
        const { orders: nextOrders, entry } = planReassign({
          orders,
          drivers,
          trips,
          sourceTripId,
          targetTripId,
          selectedIds,
          reason,
          mode,
          auditId: crypto.randomUUID(),
          at: new Date().toISOString()
        });
        set({ orders: nextOrders, audit: [entry, ...get().audit] });
        return entry;
      },

      setClosed: (tripId, closed, roadInfo) =>
        set({
          trips: get().trips.map((trip: Trip) =>
            trip.id === tripId
              ? { ...trip, closed, roadInfo: closed ? roadInfo || "道路封闭" : null }
              : trip
          )
        }),

      clearAudit: () => set({ audit: [] }),
      resetDemo: () => set(freshSeed())
    }),
    {
      name: "hxwlfront-14-emergency-v1",
      // 待处理区为虚拟区域，不落库，重开时按 tripId === PENDING 重建
      partialize: (state) => ({
        drivers: state.drivers,
        trips: state.trips,
        orders: state.orders,
        audit: state.audit
      })
    }
  )
);

export { PENDING_ID };
