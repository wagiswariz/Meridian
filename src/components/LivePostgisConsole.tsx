import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  RefreshCw,
  Shield,
  Terminal,
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
  Play,
  Lock,
  Unlock,
  FileCode,
  Activity,
  UserPlus,
  Layers,
} from 'lucide-react';
import {
  LiveDatabaseState,
  SqlPrivilege,
  generateQgisPostgisConnectionXml,
  generatePgServiceConf,
  generateLiveDatabaseQgsProjectXml,
  generateZeroSyncPyQgisBridgeScript,
} from '../utils/qgisEngine';

const ALL_PRIVILEGES: SqlPrivilege[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

export default function LivePostgisConsole() {
  const [dbState, setDbState] = useState<LiveDatabaseState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [subView, setSubView] = useState<'live_tables' | 'rbac_sql' | 'qgis_export'>('live_tables');

  // Active simulated role for testing instant edits vs Viewer permission blocks
  const [activeSessionRole, setActiveSessionRole] = useState<string>('postgres_admin');
  const [activeWorkstation, setActiveWorkstation] = useState<string>('DESKTOP-GIS01 (QGIS 3.38)');
  const [selectedTableKey, setSelectedTableKey] = useState<string>('public.hydro_sub_basins');

  // Inline Edit & Insert State
  const [editingFid, setEditingFid] = useState<number | null>(null);
  const [editAttributes, setEditAttributes] = useState<Record<string, string | number | boolean>>({});
  const [txBanner, setTxBanner] = useState<{
    type: 'success' | 'error';
    message: string;
    sql?: string;
  } | null>(null);

  // SQL Console State
  const [sqlInput, setSqlInput] = useState<string>(
    'REVOKE INSERT, UPDATE, DELETE ON TABLE public.hydro_sub_basins FROM external_viewer;'
  );
  const [sqlResult, setSqlResult] = useState<{
    ok: boolean;
    commandTag?: string;
    message: string;
    rows?: Record<string, unknown>[];
  } | null>(null);

  // Create Role Form State
  const [isCreatingRole, setIsCreatingRole] = useState<boolean>(false);
  const [newRoleName, setNewRoleName] = useState<string>('');
  const [newRoleLabel, setNewRoleLabel] = useState<string>('');
  const [newRoleTier, setNewRoleTier] = useState<'admin' | 'editor' | 'viewer'>('viewer');

  // PostGIS Exporter Config State
  const [pgHost, setPgHost] = useState<string>(
    typeof window !== 'undefined' ? window.location.hostname : 'db.meridian-gis.internal'
  );
  const [pgPort, setPgPort] = useState<string>('5432');
  const [pgDatabase, setPgDatabase] = useState<string>('citarum_postgis_prod');
  const [pgService, setPgService] = useState<string>('meridian_postgis_live');
  const [exportRole, setExportRole] = useState<string>('postgres_admin');
  const [selectedExportTab, setSelectedExportTab] = useState<
    'pyqgis_bridge' | 'connections_xml' | 'pg_service' | 'live_qgs'
  >('pyqgis_bridge');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const serverOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const fetchDatabaseState = async (showBanner = false) => {
    setLoading(true);
    try {
      const res = await fetch('/api/db/state');
      if (!res.ok) throw new Error('Failed to fetch live database state');
      const data: LiveDatabaseState = await res.json();
      setDbState(data);
      if (showBanner) {
        setTxBanner({
          type: 'success',
          message: `Refreshed live spatial tables from database (Current txid #${data.currentTxid})`,
        });
      }
    } catch (err) {
      setTxBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Database connection error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch + Real-time SSE listener so edits in one window/client immediately pop up
  useEffect(() => {
    fetchDatabaseState(false);

    let evSource: EventSource | null = null;
    try {
      evSource = new EventSource('/api/db/stream');
      evSource.addEventListener('db_update', () => {
        fetchDatabaseState(false);
      });
      evSource.onerror = () => {
        evSource?.close();
      };
    } catch {
      // Fallback to manual refresh if SSE is blocked by proxy
    }

    return () => {
      evSource?.close();
    };
  }, []);

  const selectedTable = useMemo(() => {
    if (!dbState) return null;
    return (
      dbState.tables.find((t) => t.tableKey === selectedTableKey) || dbState.tables[0] || null
    );
  }, [dbState, selectedTableKey]);

  const activeRoleObj = useMemo(() => {
    if (!dbState) return null;
    return (
      dbState.roles.find((r) => r.roleName === activeSessionRole) || dbState.roles[0] || null
    );
  }, [dbState, activeSessionRole]);

  const activeRoleTablePrivs = useMemo(() => {
    if (!dbState || !selectedTable) return [];
    return dbState.grants[activeSessionRole]?.[selectedTable.tableKey] || [];
  }, [dbState, activeSessionRole, selectedTable]);

  // Exporters content
  const postgisXmlContent = useMemo(
    () => generateQgisPostgisConnectionXml(pgHost, pgPort, pgDatabase, exportRole, pgService),
    [pgHost, pgPort, pgDatabase, exportRole, pgService]
  );

  const pgServiceContent = useMemo(
    () => generatePgServiceConf(pgHost, pgPort, pgDatabase, exportRole, pgService),
    [pgHost, pgPort, pgDatabase, exportRole, pgService]
  );

  const liveQgsContent = useMemo(
    () =>
      generateLiveDatabaseQgsProjectXml(
        serverOrigin,
        pgService,
        exportRole,
        dbState?.tables || []
      ),
    [serverOrigin, pgService, exportRole, dbState?.tables]
  );

  const zeroSyncPyQgisScript = useMemo(
    () =>
      generateZeroSyncPyQgisBridgeScript(
        serverOrigin,
        exportRole,
        dbState?.tables || []
      ),
    [serverOrigin, exportRole, dbState?.tables]
  );

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Start editing a row inline
  const handleStartEditRow = (fid: number, attrs: Record<string, string | number | boolean>) => {
    setEditingFid(fid);
    setEditAttributes({ ...attrs });
    setTxBanner(null);
  };

  // Save inline row edit directly to SQL database (Instant UPDATE)
  const handleCommitRowUpdate = async (fid: number) => {
    if (!selectedTable) return;
    setTxBanner(null);

    try {
      const res = await fetch('/api/db/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleName: activeSessionRole,
          workstation: activeWorkstation,
          operation: 'UPDATE',
          tableKey: selectedTable.tableKey,
          fid,
          attributes: editAttributes,
        }),
      });

      const data = await res.json();
      if (data.state) setDbState(data.state);

      if (!res.ok) {
        setTxBanner({
          type: 'error',
          message: data.error || 'SQL UPDATE rejected by role permissions',
          sql: data.auditEntry?.sqlStatement,
        });
        return;
      }

      setEditingFid(null);
      setTxBanner({
        type: 'success',
        message: `Instant Commit (txid #${data.auditEntry?.txid}): Written directly to ${selectedTable.tableKey} as "${activeSessionRole}".`,
        sql: data.auditEntry?.sqlStatement,
      });
    } catch (err) {
      setTxBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Transaction failed',
      });
    }
  };

  // Insert a new spatial feature row directly into database (Instant INSERT)
  const handleInsertNewFeature = async () => {
    if (!selectedTable) return;
    setTxBanner(null);

    const sampleAttrs: Record<string, string | number> = {};
    selectedTable.columns.forEach((col) => {
      if (col.name.includes('code') || col.name.includes('id')) {
        sampleAttrs[col.name] = `NEW-${Math.floor(100 + Math.random() * 899)}`;
      } else if (col.dataType.includes('numeric') || col.dataType.includes('integer')) {
        sampleAttrs[col.name] = Number((Math.random() * 120 + 25).toFixed(2));
      } else if (col.name.includes('status') || col.name.includes('tier')) {
        sampleAttrs[col.name] = 'Active Edit';
      } else {
        sampleAttrs[col.name] = `QGIS Live Feature (${activeSessionRole})`;
      }
    });

    try {
      const res = await fetch('/api/db/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleName: activeSessionRole,
          workstation: activeWorkstation,
          operation: 'INSERT',
          tableKey: selectedTable.tableKey,
          attributes: sampleAttrs,
        }),
      });

      const data = await res.json();
      if (data.state) setDbState(data.state);

      if (!res.ok) {
        setTxBanner({
          type: 'error',
          message: data.error || 'SQL INSERT rejected by role permissions',
          sql: data.auditEntry?.sqlStatement,
        });
        return;
      }

      setTxBanner({
        type: 'success',
        message: `Instant INSERT (txid #${data.auditEntry?.txid}): Feature written directly to ${selectedTable.tableKey}.`,
        sql: data.auditEntry?.sqlStatement,
      });
    } catch (err) {
      setTxBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Insert failed',
      });
    }
  };

  // Delete a spatial feature row directly from database (Instant DELETE)
  const handleDeleteFeature = async (fid: number) => {
    if (!selectedTable) return;
    setTxBanner(null);

    try {
      const res = await fetch('/api/db/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleName: activeSessionRole,
          workstation: activeWorkstation,
          operation: 'DELETE',
          tableKey: selectedTable.tableKey,
          fid,
        }),
      });

      const data = await res.json();
      if (data.state) setDbState(data.state);

      if (!res.ok) {
        setTxBanner({
          type: 'error',
          message: data.error || 'SQL DELETE rejected by role permissions',
          sql: data.auditEntry?.sqlStatement,
        });
        return;
      }

      setTxBanner({
        type: 'success',
        message: `Instant DELETE (txid #${data.auditEntry?.txid}): Feature fid=${fid} removed from ${selectedTable.tableKey}.`,
        sql: data.auditEntry?.sqlStatement,
      });
    } catch (err) {
      setTxBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  };

  // Toggle GRANT / REVOKE checkbox in Visual Role Matrix
  const handleTogglePrivilege = async (
    targetRole: string,
    tableKey: string,
    privilege: SqlPrivilege,
    currentlyEnabled: boolean
  ) => {
    setTxBanner(null);
    try {
      const res = await fetch('/api/db/grants/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executingRole: activeSessionRole,
          workstation: activeWorkstation,
          targetRole,
          tableKey,
          privilege,
          enable: !currentlyEnabled,
        }),
      });

      const data = await res.json();
      if (data.state) setDbState(data.state);

      if (!res.ok) {
        setTxBanner({
          type: 'error',
          message: data.error || 'Only database admin roles can modify SQL privileges',
          sql: data.auditEntry?.sqlStatement,
        });
        return;
      }

      setSqlInput(data.auditEntry?.sqlStatement || '');
      setTxBanner({
        type: 'success',
        message: `SQL Permission Updated (txid #${data.auditEntry?.txid}): ${data.auditEntry?.summary}`,
        sql: data.auditEntry?.sqlStatement,
      });
    } catch (err) {
      setTxBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Privilege update failed',
      });
    }
  };

  // Execute custom SQL statement in SQL Console
  const handleRunSql = async (e?: React.FormEvent, customStmt?: string) => {
    if (e) e.preventDefault();
    const stmtToRun = customStmt ?? sqlInput;
    if (!stmtToRun.trim()) return;

    try {
      const res = await fetch('/api/db/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleName: activeSessionRole,
          workstation: activeWorkstation,
          sql: stmtToRun,
        }),
      });

      const data = await res.json();
      if (data.state) setDbState(data.state);

      if (!res.ok) {
        setSqlResult({
          ok: false,
          message: data.error || 'SQL execution failed',
        });
        return;
      }

      setSqlResult({
        ok: true,
        commandTag: data.commandTag,
        message: data.message,
        rows: data.rows,
      });
    } catch (err) {
      setSqlResult({
        ok: false,
        message: err instanceof Error ? err.message : 'SQL execution failed',
      });
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    try {
      const res = await fetch('/api/db/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executingRole: activeSessionRole,
          roleName: newRoleName.trim(),
          displayLabel: newRoleLabel.trim() || newRoleName.trim(),
          tier: newRoleTier,
        }),
      });
      const data = await res.json();
      if (data.state) setDbState(data.state);
      if (res.ok) {
        setNewRoleName('');
        setNewRoleLabel('');
        setIsCreatingRole(false);
        setTxBanner({
          type: 'success',
          message: data.auditEntry?.summary || 'Created new database role',
          sql: data.auditEntry?.sqlStatement,
        });
      } else {
        setTxBanner({
          type: 'error',
          message: data.error || 'Failed to create role',
        });
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Control Plane Bar: Active Database Role Simulator + Instant Refresh Trigger */}
      <section className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="space-y-1">
            <div className="text-xs font-mono text-teal-400">
              Zero-Sync Direct PostGIS Architecture · Instant SQL Commits · Role-Based Access Control
            </div>
            <h2 className="text-lg font-semibold text-white">
              Live Spatial Database &amp; SQL Permission Control Plane
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl">
              Edits in QGIS write directly to the database the instant you save your edit session—no file syncing required. Switch your active SQL role below to test how <strong className="text-slate-200">Admins</strong>, <strong className="text-slate-200">Editors</strong>, and <strong className="text-slate-200">Read-Only Viewers</strong> interact with the live tables.
            </p>
          </div>

          {/* Active Session Role Selector & Instant Refresh Button */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-2.5">
              <span className="text-xs text-slate-400 whitespace-nowrap">Acting SQL Role:</span>
              <select
                value={activeSessionRole}
                onChange={(e) => {
                  setActiveSessionRole(e.target.value);
                  setTxBanner(null);
                }}
                aria-label="Acting SQL Role"
                className="bg-transparent text-xs font-mono font-semibold text-teal-300 focus:outline-none cursor-pointer"
              >
                {dbState?.roles.map((r) => (
                  <option key={r.roleName} value={r.roleName} className="bg-slate-950 text-white">
                    {r.roleName} ({r.tier.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => fetchDatabaseState(true)}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Live Canvas (txid #{dbState?.currentTxid || 1042})</span>
            </button>
          </div>
        </div>

        {/* Active Role Permission Telemetry Bar (Unboxed clean metadata with middle-dot separators) */}
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-2.5 font-mono">
            <span>
              Connected Role: <strong className="text-white">{activeSessionRole}</strong>
            </span>
            <span>·</span>
            <span>
              Tier:{' '}
              <strong
                className={
                  activeRoleObj?.tier === 'admin'
                    ? 'text-teal-400'
                    : activeRoleObj?.tier === 'editor'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }
              >
                {activeRoleObj?.tier.toUpperCase()}
              </strong>
            </span>
            <span>·</span>
            <span>
              Privileges on {selectedTable?.tableKey}:{' '}
              <strong className="text-slate-200">
                [{activeRoleTablePrivs.length > 0 ? activeRoleTablePrivs.join(', ') : 'NONE'}]
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-slate-500">
            <span>Workstation:</span>
            <input
              type="text"
              value={activeWorkstation}
              onChange={(e) => setActiveWorkstation(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-xs text-slate-300 w-48 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        {/* Instant SQL Transaction Status Banner */}
        {txBanner && (
          <div
            className={`rounded-lg p-3.5 border text-xs space-y-1.5 ${
              txBanner.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                : 'bg-rose-950/50 border-rose-800/80 text-rose-200'
            }`}
          >
            <div className="flex items-center justify-between font-medium">
              <span>{txBanner.message}</span>
              <button
                type="button"
                onClick={() => setTxBanner(null)}
                className="underline opacity-80 hover:opacity-100 cursor-pointer ml-4"
              >
                Dismiss
              </button>
            </div>
            {txBanner.sql && (
              <div className="font-mono text-[11px] bg-slate-950/80 px-2.5 py-1.5 rounded text-slate-300 break-all">
                SQL Executed: {txBanner.sql}
              </div>
            )}
          </div>
        )}

        {/* Sub-Navigation Tabs inside Live PostGIS Control Plane */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setSubView('live_tables')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              subView === 'live_tables'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-teal-400" />
            <span>1. Live Spatial Tables &amp; Real-Time Edit Audit Log</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('rbac_sql')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              subView === 'rbac_sql'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-teal-400" />
            <span>2. Visual Role Manager &amp; SQL GRANT/REVOKE Console</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('qgis_export')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              subView === 'qgis_export'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-teal-400" />
            <span>3. One-Click QGIS PostGIS XML &amp; pg_service Exporter</span>
          </button>
        </div>
      </section>

      {/* =====================================================================
          SUB-VIEW 1: LIVE SPATIAL TABLES & REAL-TIME EDIT AUDIT STREAM
         ===================================================================== */}
      {subView === 'live_tables' && selectedTable && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 7 Columns: Live Spatial Table & Instant Direct Edit Tester */}
          <div className="lg:col-span-7 bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div>
                <div className="text-xs font-mono text-slate-400">
                  PostGIS Relation · SRID:{selectedTable.srid} · Geometry:{selectedTable.geometryType}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <select
                    value={selectedTableKey}
                    onChange={(e) => {
                      setSelectedTableKey(e.target.value);
                      setEditingFid(null);
                    }}
                    aria-label="Select Spatial Table"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono font-semibold text-white focus:outline-none focus:border-teal-500"
                  >
                    {dbState?.tables.map((t) => (
                      <option key={t.tableKey} value={t.tableKey}>
                        {t.tableKey} ({t.rows.length} rows)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInsertNewFeature}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert Feature (Direct SQL INSERT)</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              {selectedTable.description}. Try editing or inserting a row below while acting as{' '}
              <code className="font-mono text-teal-300">{activeSessionRole}</code>—if you switch to{' '}
              <code className="font-mono text-amber-300">external_viewer</code> at the top, PostgreSQL will block your write immediately!
            </p>

            {/* Spatial Rows Table */}
            <div className="overflow-x-auto border border-slate-800/90 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/90 border-b border-slate-800 text-xs text-slate-400 font-mono">
                    <th className="py-2.5 px-3 font-medium">fid</th>
                    {selectedTable.columns.map((c) => (
                      <th key={c.name} className="py-2.5 px-3 font-medium">
                        {c.name}
                      </th>
                    ))}
                    <th className="py-2.5 px-3 font-medium">Last Commit</th>
                    <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {selectedTable.rows.map((row) => {
                    const isEditing = editingFid === row.fid;
                    return (
                      <tr key={row.fid} className="hover:bg-slate-900/60 align-middle">
                        <td className="py-3 px-3 font-mono font-semibold text-teal-400 tabular-nums">
                          {row.fid}
                        </td>
                        {selectedTable.columns.map((c) => (
                          <td key={c.name} className="py-3 px-3 font-mono text-slate-200">
                            {isEditing ? (
                              <input
                                type="text"
                                value={String(editAttributes[c.name] ?? '')}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const isNumCol =
                                    c.dataType.includes('numeric') || c.dataType.includes('integer');
                                  setEditAttributes((prev) => ({
                                    ...prev,
                                    [c.name]:
                                      isNumCol && raw !== '' && !Number.isNaN(Number(raw))
                                        ? Number(raw)
                                        : raw,
                                  }));
                                }}
                                className="bg-slate-950 border border-teal-500 rounded px-2 py-1 text-xs font-mono text-white w-28 focus:outline-none"
                              />
                            ) : (
                              <span>{String(row.attributes[c.name] ?? '')}</span>
                            )}
                          </td>
                        ))}
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          <div>txid #{row.txid}</div>
                          <div className="text-slate-500">{row.updatedByRole}</div>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap space-x-2.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleCommitRowUpdate(row.fid)}
                                className="px-2.5 py-1 text-xs font-semibold bg-teal-400 text-slate-950 rounded hover:bg-teal-300 cursor-pointer"
                              >
                                Commit SQL
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingFid(null)}
                                className="text-slate-400 hover:text-white cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEditRow(row.fid, row.attributes)}
                                className="text-teal-400 hover:underline font-medium cursor-pointer"
                              >
                                Edit Row
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFeature(row.fid)}
                                title="Delete feature row"
                                className="text-slate-500 hover:text-rose-400 cursor-pointer inline-flex items-center align-middle"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="text-slate-400 truncate">
                Live QGIS GeoJSON Endpoint:{' '}
                <span className="text-teal-300">
                  {serverOrigin}/api/db/layers/{selectedTable.tableKey}/geojson?role={activeSessionRole}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    'geojson-url',
                    `${serverOrigin}/api/db/layers/${selectedTable.tableKey}/geojson?role=${activeSessionRole}`
                  )
                }
                className="text-teal-400 hover:underline shrink-0 cursor-pointer"
              >
                {copiedKey === 'geojson-url' ? 'Copied URL' : 'Copy Layer URL'}
              </button>
            </div>
          </div>

          {/* Right 5 Columns: Real-Time Edit Audit Log with Instant Refresh */}
          <div className="lg:col-span-5 bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3.5">
              <div>
                <div className="text-xs font-mono text-teal-400">LISTEN / NOTIFY Audit Stream</div>
                <h3 className="text-base font-semibold text-white mt-0.5">
                  Real-Time Database Transaction &amp; Security Log
                </h3>
              </div>
              <button
                type="button"
                onClick={() => fetchDatabaseState(true)}
                className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="divide-y divide-slate-800/70 max-h-[520px] overflow-y-auto pr-1">
              {dbState?.auditLog.map((entry) => (
                <div key={entry.txid} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2 font-mono">
                    <span
                      className={
                        entry.status === 'PERMISSION_DENIED'
                          ? 'text-rose-400 font-semibold'
                          : entry.operation === 'GRANT' || entry.operation === 'REVOKE'
                          ? 'text-amber-300 font-semibold'
                          : 'text-teal-400 font-semibold'
                      }
                    >
                      txid #{entry.txid} · {entry.operation} · {entry.status}
                    </span>
                    <span className="text-slate-500">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="text-slate-200">{entry.summary}</div>

                  <div className="text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-800/80 rounded px-2.5 py-1.5 break-all">
                    {entry.sqlStatement}
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono">
                    Role: {entry.roleName} · Workstation: {entry.workstation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 2: VISUAL ROLE MANAGER & LIVE SQL GRANT/REVOKE CONSOLE
         ===================================================================== */}
      {subView === 'rbac_sql' && dbState && (
        <div className="space-y-8">
          {/* Visual Role & Table Privilege Matrix */}
          <section className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Visual PostgreSQL Role &amp; Table Permission Matrix
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Toggle exact <code className="font-mono text-slate-200">SELECT</code>,{' '}
                  <code className="font-mono text-slate-200">INSERT</code>,{' '}
                  <code className="font-mono text-slate-200">UPDATE</code>, and{' '}
                  <code className="font-mono text-slate-200">DELETE</code> privileges for each user role. Every toggle executes a real <code className="font-mono text-teal-300">GRANT</code> or <code className="font-mono text-amber-300">REVOKE</code> SQL statement. (Ensure <code className="font-mono text-teal-300">postgres_admin</code> is selected at the top to modify grants.)
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsCreatingRole(!isCreatingRole)}
                className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create SQL Role</span>
              </button>
            </div>

            {isCreatingRole && (
              <form
                onSubmit={handleCreateRole}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Role Identifier (SQL)</label>
                  <input
                    type="text"
                    required
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. contractor_viewer"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Display Label</label>
                  <input
                    type="text"
                    value={newRoleLabel}
                    onChange={(e) => setNewRoleLabel(e.target.value)}
                    placeholder="e.g. External Survey Partner"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Default Access Tier</label>
                  <select
                    value={newRoleTier}
                    onChange={(e) => setNewRoleTier(e.target.value as 'admin' | 'editor' | 'viewer')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                  >
                    <option value="viewer">Viewer (Read-Only SELECT)</option>
                    <option value="editor">Editor (SELECT, INSERT, UPDATE, DELETE)</option>
                    <option value="admin">Admin / Superuser</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-semibold bg-teal-400 text-slate-950 rounded-lg hover:bg-teal-300 cursor-pointer whitespace-nowrap"
                  >
                    Execute CREATE ROLE
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingRole(false)}
                    className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto border border-slate-800/90 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/90 border-b border-slate-800 text-xs text-slate-400">
                    <th className="py-3 px-4 font-medium">Database Role &amp; Tier</th>
                    {dbState.tables.map((tbl) => (
                      <th key={tbl.tableKey} className="py-3 px-4 font-medium font-mono">
                        {tbl.tableKey}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {dbState.roles.map((role) => (
                    <tr key={role.roleName} className="hover:bg-slate-900/50 align-top">
                      <td className="py-4 px-4">
                        <div className="font-mono font-semibold text-white">{role.roleName}</div>
                        <div className="text-slate-400 mt-0.5">{role.displayLabel}</div>
                        <div className="text-[11px] font-mono text-slate-500 mt-1">
                          {role.isSuperuser ? 'SUPERUSER (Bypass ACL)' : `Tier: ${role.tier.toUpperCase()}`}
                        </div>
                      </td>

                      {dbState.tables.map((tbl) => {
                        const granted = dbState.grants[role.roleName]?.[tbl.tableKey] || [];
                        return (
                          <td key={tbl.tableKey} className="py-4 px-4">
                            <div className="grid grid-cols-2 gap-2">
                              {ALL_PRIVILEGES.map((priv) => {
                                const isChecked = role.isSuperuser || granted.includes(priv);
                                return (
                                  <label
                                    key={priv}
                                    className={`flex items-center gap-1.5 font-mono text-[11px] select-none ${
                                      role.isSuperuser
                                        ? 'opacity-70 cursor-not-allowed'
                                        : 'cursor-pointer'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={role.isSuperuser}
                                      checked={isChecked}
                                      onChange={() =>
                                        handleTogglePrivilege(
                                          role.roleName,
                                          tbl.tableKey,
                                          priv,
                                          isChecked
                                        )
                                      }
                                      className="rounded border-slate-700 bg-slate-950 text-teal-400"
                                    />
                                    <span
                                      className={
                                        isChecked ? 'text-teal-300 font-medium' : 'text-slate-500'
                                      }
                                    >
                                      {priv}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Interactive Live SQL GRANT / REVOKE & Query Console */}
          <section className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Interactive SQL Permission &amp; Query Console
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage user permissions or query spatial tables directly with standard PostgreSQL syntax.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">Quick SQL Templates:</span>
                <button
                  type="button"
                  onClick={() => {
                    const s =
                      'REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM external_viewer;';
                    setSqlInput(s);
                    handleRunSql(undefined, s);
                  }}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded font-mono text-amber-300 hover:border-amber-500/50 cursor-pointer"
                >
                  Lock Viewer to Read-Only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const s =
                      'GRANT SELECT, INSERT, UPDATE ON TABLE public.hydro_sub_basins TO external_viewer;';
                    setSqlInput(s);
                    handleRunSql(undefined, s);
                  }}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded font-mono text-teal-300 hover:border-teal-500/50 cursor-pointer"
                >
                  Grant Viewer Edit on Sub-Basins
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const s = 'SELECT * FROM public.hydro_sub_basins;';
                    setSqlInput(s);
                    handleRunSql(undefined, s);
                  }}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded font-mono text-slate-300 hover:border-slate-700 cursor-pointer"
                >
                  SELECT Sub-Basins
                </button>
              </div>
            </div>

            <form onSubmit={(e) => handleRunSql(e)} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <textarea
                  rows={3}
                  value={sqlInput}
                  onChange={(e) => setSqlInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3.5 text-xs font-mono text-teal-200 focus:outline-none focus:border-teal-500"
                  placeholder="GRANT SELECT ON ALL TABLES IN SCHEMA public TO external_viewer;"
                />
                <button
                  type="submit"
                  className="px-5 py-3 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <Play className="w-4 h-4" />
                  <span>Execute SQL ({activeSessionRole})</span>
                </button>
              </div>
            </form>

            {sqlResult && (
              <div
                className={`rounded-lg p-4 border text-xs font-mono space-y-3 ${
                  sqlResult.ok
                    ? 'bg-slate-950 border-slate-800 text-slate-200'
                    : 'bg-rose-950/40 border-rose-800 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={sqlResult.ok ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                    {sqlResult.commandTag ? `[${sqlResult.commandTag}] ` : ''}
                    {sqlResult.message}
                  </span>
                </div>

                {sqlResult.rows && sqlResult.rows.length > 0 && (
                  <div className="overflow-x-auto border border-slate-800 rounded">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-400">
                          {Object.keys(sqlResult.rows[0]).map((k) => (
                            <th key={k} className="py-2 px-3">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {sqlResult.rows.map((r, i) => (
                          <tr key={i}>
                            {Object.values(r).map((v, j) => (
                              <td key={j} className="py-2 px-3 text-slate-300">
                                {String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 3: ONE-CLICK QGIS POSTGIS CONNECTION XML & PG_SERVICE EXPORTER
         ===================================================================== */}
      {subView === 'qgis_export' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 5 Columns: Connection Parameters & Role Selection */}
          <div className="lg:col-span-5 bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-5">
            <div>
              <div className="text-xs font-mono text-teal-400">Zero-Sync QGIS Provisioning</div>
              <h3 className="text-base font-semibold text-white mt-0.5">
                Configure QGIS PostGIS &amp; Live Bridge Credentials
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Generate connection files for yourself (<code className="font-mono text-slate-200">postgres_admin</code>) or for teammates (<code className="font-mono text-slate-200">gis_editor_team</code> / <code className="font-mono text-slate-200">external_viewer</code>) so their QGIS Desktop connects directly to the live database.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  Target Database Role (Determines Admin vs Viewer Access in QGIS)
                </label>
                <select
                  value={exportRole}
                  onChange={(e) => setExportRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-teal-300 focus:outline-none focus:border-teal-500"
                >
                  {dbState?.roles.map((r) => (
                    <option key={r.roleName} value={r.roleName}>
                      {r.roleName} — {r.displayLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-400 mb-1">PostGIS Host</label>
                  <input
                    type="text"
                    value={pgHost}
                    onChange={(e) => setPgHost(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Port</label>
                  <input
                    type="text"
                    value={pgPort}
                    onChange={(e) => setPgPort(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Database Name</label>
                  <input
                    type="text"
                    value={pgDatabase}
                    onChange={(e) => setPgDatabase(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">pg_service Name</label>
                  <input
                    type="text"
                    value={pgService}
                    onChange={(e) => setPgService(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-white"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <button
                type="button"
                onClick={() =>
                  handleDownloadFile(
                    `qgis_postgis_${exportRole}.xml`,
                    postgisXmlContent
                  )
                }
                className="w-full py-2.5 px-4 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download QGIS PostGIS Connection XML ({exportRole})</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleDownloadFile('pg_service.conf', pgServiceContent)}
                  className="py-2 px-3 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download pg_service.conf</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleDownloadFile(
                      `Meridian_Live_PostGIS_${exportRole}.qgs`,
                      liveQgsContent
                    )
                  }
                  className="py-2 px-3 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Live .QGS</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right 7 Columns: Generated Connection Artifact Viewer */}
          <div className="lg:col-span-7 bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSelectedExportTab('pyqgis_bridge')}
                  className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                    selectedExportTab === 'pyqgis_bridge'
                      ? 'bg-slate-800 text-teal-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  meridian_zerosync_bridge.py
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedExportTab('connections_xml')}
                  className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                    selectedExportTab === 'connections_xml'
                      ? 'bg-slate-800 text-teal-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  qgis_pg_connections.xml
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedExportTab('pg_service')}
                  className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                    selectedExportTab === 'pg_service'
                      ? 'bg-slate-800 text-teal-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  pg_service.conf
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedExportTab('live_qgs')}
                  className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                    selectedExportTab === 'live_qgs'
                      ? 'bg-slate-800 text-teal-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Meridian_Live.qgs
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const content =
                    selectedExportTab === 'pyqgis_bridge'
                      ? zeroSyncPyQgisScript
                      : selectedExportTab === 'connections_xml'
                      ? postgisXmlContent
                      : selectedExportTab === 'pg_service'
                      ? pgServiceContent
                      : liveQgsContent;
                  handleCopy(selectedExportTab, content);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {copiedKey === selectedExportTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            <pre className="bg-slate-950 border border-slate-800/90 rounded-lg p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[520px] leading-relaxed">
              {selectedExportTab === 'pyqgis_bridge'
                ? zeroSyncPyQgisScript
                : selectedExportTab === 'connections_xml'
                ? postgisXmlContent
                : selectedExportTab === 'pg_service'
                ? pgServiceContent
                : liveQgsContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
