import { useState } from "react";
import { Button, Empty, Popconfirm, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEmergencyStore } from "../store";
import { AuditEntry, AuditResult } from "../types";

function formatAt(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const resultColumns: ColumnsType<AuditResult> = [
  {
    title: "订单",
    dataIndex: "orderNo",
    key: "orderNo",
    width: 130,
    render: (no: string) => <span style={{ fontWeight: 700 }}>{no}</span>
  },
  {
    title: "结果",
    dataIndex: "ok",
    key: "ok",
    width: 110,
    render: (ok: boolean) =>
      ok ? <Tag color="green">改派成功</Tag> : <Tag color="red">留待处理区</Tag>
  },
  {
    title: "原车次",
    dataIndex: "fromTripNo",
    key: "from",
    width: 110
  },
  {
    title: "新车次",
    dataIndex: "toTripNo",
    key: "to",
    width: 110,
    render: (no: string | null) => no ?? <span style={{ color: "#b03a3a" }}>—</span>
  },
  {
    title: "原因 / 说明",
    dataIndex: "message",
    key: "message",
    render: (text: string) => <span style={{ color: "#536078" }}>{text}</span>
  }
];

export default function AuditPanel() {
  const audit = useEmergencyStore((s) => s.audit);
  const clearAudit = useEmergencyStore((s) => s.clearAudit);
  const [page, setPage] = useState(1);

  const columns: ColumnsType<AuditEntry> = [
    {
      title: "时间",
      dataIndex: "at",
      key: "at",
      width: 170,
      render: formatAt
    },
    {
      title: "方式",
      dataIndex: "mode",
      key: "mode",
      width: 100,
      render: (mode) => (
        <Tag color={mode === "batch" ? "geekblue" : "purple"}>
          {mode === "batch" ? "整批转车" : "拆单改派"}
        </Tag>
      )
    },
    {
      title: "改派去向",
      key: "route",
      render: (_, row) => (
        <span>
          <strong>{row.sourceTripNo}</strong>
          <span style={{ margin: "0 6px", color: "#8791a4" }}>→</span>
          <strong>{row.targetTripNo}</strong>
          <span style={{ marginLeft: 8, color: "#69758c" }}>{row.targetDriverName}</span>
        </span>
      )
    },
    {
      title: "原因",
      dataIndex: "reason",
      key: "reason",
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ color: "#536078" }}>{text}</span>
        </Tooltip>
      )
    },
    {
      title: "结果",
      dataIndex: "results",
      key: "results",
      width: 150,
      render: (results: AuditResult[]) => {
        const ok = results.filter((r) => r.ok).length;
        return (
          <span>
            <Tag color="green">成功 {ok}</Tag>
            {results.length - ok > 0 && <Tag color="red">留区 {results.length - ok}</Tag>}
          </span>
        );
      }
    }
  ];

  return (
    <section className="panel audit-panel">
      <div className="panel-head">
        <div>
          <h2>改派流水</h2>
          <p className="panel-desc">每单记录原车次、原因与新车次；失败单记录留区原因，重开页面仍可追看</p>
        </div>
        {audit.length > 0 && (
          <Popconfirm title="清空全部流水？" okText="清空" cancelText="取消" onConfirm={clearAudit}>
            <Button danger type="text">清空流水</Button>
          </Popconfirm>
        )}
      </div>

      {audit.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无改派记录" style={{ padding: "28px 0" }} />
      ) : (
        <Table<AuditEntry>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={audit}
          pagination={{ current: page, pageSize: 5, onChange: setPage, showSizeChanger: false }}
          expandable={{
            expandedRowRender: (entry) => (
              <Table<AuditResult>
                rowKey="orderId"
                size="small"
                columns={resultColumns}
                dataSource={entry.results}
                pagination={false}
              />
            )
          }}
        />
      )}
    </section>
  );
}
