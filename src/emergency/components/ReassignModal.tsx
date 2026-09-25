import { ReactNode, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Checkbox, Empty, Input, Modal, Radio, Select, Tag } from "antd";
import { summarizeBoard, simulate } from "../engine";
import { useEmergencyStore } from "../store";
import { Order, PENDING_ID, ReassignMode } from "../types";

type Props = {
  sourceTripId: string;
  onClose: () => void;
};

const modeLabel: Record<ReassignMode, string> = {
  batch: "整批转车",
  split: "拆单改派"
};

function OrderLine({ order, extra }: { order: Order; extra?: ReactNode }) {
  return (
    <div className="ord-line">
      <div className="ord-line-main">
        <span className="ord-no">{order.orderNo}</span>
        <span className="ord-route">{order.route}</span>
        <span className="ord-window">送达 {order.windowStart}-{order.windowEnd}</span>
        {order.fragile && <Tag color="orange" className="ord-tag">易碎</Tag>}
        <span className="ord-weight">{order.weight}kg</span>
      </div>
      {extra}
    </div>
  );
}

export default function ReassignModal({ sourceTripId, onClose }: Props) {
  const { message } = App.useApp();
  const orders = useEmergencyStore((s) => s.orders);
  const trips = useEmergencyStore((s) => s.trips);
  const drivers = useEmergencyStore((s) => s.drivers);
  const reassign = useEmergencyStore((s) => s.reassign);

  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const tripsById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);

  const sourceTrip = tripsById.get(sourceTripId);
  const sourceOrders = useMemo(
    () => orders.filter((o) => o.tripId === sourceTripId),
    [orders, sourceTripId]
  );

  // 可选目标：除来源外的在跑车次（待处理区不是车，不能作为目标）
  const targetOptions = useMemo(
    () =>
      trips
        .filter((t) => t.id !== sourceTripId && t.id !== PENDING_ID)
        .map((t) => {
          const driver = driversById.get(t.driverId)!;
          const aboard = orders.filter((o) => o.tripId === t.id);
          const summary = summarizeBoard(driver, aboard);
          return {
            value: t.id,
            label: `${t.tripNo} · ${driver.name}（已装 ${summary.load}/${driver.capacity}kg，空闲缓冲箱 ${summary.freeBoxes}，下一站 ${driver.nextStopAt}）`
          };
        }),
    [trips, driversById, orders, sourceTripId]
  );

  const [mode, setMode] = useState<ReassignMode>(sourceTrip?.closed ? "batch" : "split");
  const [selectedIds, setSelectedIds] = useState<string[]>(sourceOrders.map((o) => o.id));
  const [targetTripId, setTargetTripId] = useState<string | undefined>(undefined);
  const [reason, setReason] = useState(sourceTrip?.roadInfo ?? "封路应急改派");

  // 每次从不同车次打开都重置为初始选择
  useEffect(() => {
    setMode(sourceTrip?.closed ? "batch" : "split");
    setSelectedIds(orders.filter((o) => o.tripId === sourceTripId).map((o) => o.id));
    setTargetTripId(undefined);
    setReason(sourceTripId === PENDING_ID ? "待处理区重试改派" : sourceTrip?.roadInfo ?? "封路应急改派");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTripId]);

  const effectiveIds = mode === "batch" ? sourceOrders.map((o) => o.id) : selectedIds;
  const selectedOrders = sourceOrders.filter((o) => effectiveIds.includes(o.id));

  const preview = useMemo(() => {
    if (!targetTripId) return [];
    return simulate(
      orders,
      driversById,
      tripsById,
      targetTripId,
      sourceOrders.filter((o) => effectiveIds.includes(o.id))
    );
  }, [targetTripId, orders, driversById, tripsById, sourceOrders, effectiveIds]);

  const passCount = preview.filter((r) => r.plan.ok).length;
  const failRows = preview.filter((r) => !r.plan.ok);

  function handleConfirm() {
    if (!targetTripId) {
      message.warning("请先选择目标车次");
      return;
    }
    if (effectiveIds.length === 0) {
      message.warning("请至少选择一单");
      return;
    }
    const entry = reassign({
      sourceTripId,
      targetTripId,
      selectedIds: effectiveIds,
      reason: reason.trim(),
      mode
    });
    const okCount = entry.results.filter((r) => r.ok).length;
    const failCount = entry.results.length - okCount;
    if (failCount === 0) {
      message.success(`${okCount} 单已整批改挂至 ${entry.targetTripNo}（${entry.targetDriverName}），原车次装载已核减`);
    } else if (okCount === 0) {
      message.warning(`全部 ${failCount} 单未通过校验，已留在待处理区并注明原因`);
    } else {
      message.warning(`${okCount} 单改挂 ${entry.targetTripNo} 成功，${failCount} 单留在待处理区`);
    }
    onClose();
  }

  const title = sourceTripId === PENDING_ID
    ? "待处理区 · 再次改派"
    : `${sourceTrip?.tripNo ?? ""} · 应急改派`;

  return (
    <Modal
      title={title}
      open
      onCancel={onClose}
      width={720}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button
          key="ok"
          type="primary"
          disabled={!targetTripId || effectiveIds.length === 0}
          onClick={handleConfirm}
        >
          确认{modeLabel[mode]}（{effectiveIds.length} 单）
        </Button>
      ]}
    >
      <div className="modal-stack">
        <Alert
          type={sourceTripId === PENDING_ID ? "warning" : sourceTrip?.closed ? "error" : "info"}
          showIcon
          message={
            sourceTripId === PENDING_ID
              ? `待处理区现有 ${sourceOrders.length} 单，选择有空位的车次重试`
              : `来源车次 ${sourceTrip!.tripNo}（${driversById.get(sourceTrip!.driverId)?.name}）在装 ${sourceOrders.length} 单，共 ${sourceOrders.reduce((s, o) => s + o.weight, 0)}kg${sourceTrip?.closed ? `；${sourceTrip.roadInfo}` : ""}`
          }
        />

        <div className="field-row">
          <span className="field-label">改派方式</span>
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value as ReassignMode)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: "batch", label: "整批转车（同车次全部单）" },
              { value: "split", label: "拆单改派（勾选部分单）" }
            ]}
          />
        </div>

        <div className="candidate-box">
          <p className="box-title">本车次托运单（{selectedOrders.length}/{sourceOrders.length} 已选）</p>
          {sourceOrders.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可转的单" />}
          {sourceOrders.map((order) => {
            const checked = effectiveIds.includes(order.id);
            return (
              <Checkbox
                key={order.id}
                checked={checked}
                disabled={mode === "batch"}
                onChange={(e) =>
                  setSelectedIds((prev) =>
                    e.target.checked ? [...prev, order.id] : prev.filter((id) => id !== order.id)
                  )
                }
              >
                <OrderLine order={order} />
              </Checkbox>
            );
          })}
        </div>

        <div className="field-row">
          <span className="field-label">目标车次</span>
          <Select
            style={{ flex: 1 }}
            placeholder="选择有空位的在运车次"
            value={targetTripId}
            onChange={setTargetTripId}
            options={targetOptions}
            notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有其他可接的车次" />}
          />
        </div>

        <div className="field-row align-start">
          <span className="field-label">改派原因</span>
          <Input.TextArea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="将随每单写入流水：原车次、原因、新车次"
          />
        </div>

        {targetTripId && preview.length > 0 && (
          <div className="preview-box">
            <p className="box-title">
              试算结果
              <Tag color="green">{passCount} 单可改派</Tag>
              {failRows.length > 0 && <Tag color="red">{failRows.length} 单将留待处理区</Tag>}
            </p>
            {preview.map((row) =>
              row.plan.ok ? (
                <div key={row.order.id} className="preview-row pass">
                  <OrderLine
                    order={row.order}
                    extra={<Tag color="green" className="row-tag">可装入</Tag>}
                  />
                  <p className="preview-detail">
                    装入后目标车 {row.after!.load}kg，余载重 {row.after!.remaining}kg，空闲缓冲箱 {row.after!.freeBoxes}
                  </p>
                </div>
              ) : (
                <div key={row.order.id} className="preview-row fail">
                  <OrderLine
                    order={row.order}
                    extra={<Tag color="red" className="row-tag">留待处理区</Tag>}
                  />
                  <p className="preview-detail">{row.plan.message}</p>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
