import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CloudDownload,
  CloudUpload,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Lock,
  Unlock,
  Trash2,
  FileCode,
  Layers,
  HardDrive,
  Terminal,
  History,
  Link2,
} from 'lucide-react';
import {
  CloudWorkspaceSummary,
  CloudFileSummary,
  generateCloudLinkPyQgisScript,
} from '../utils/qgisEngine';

interface MirroredTableRow {
  fid: number;
  geomType: string;
  geomWkt: string;
  attributes: Record<string, string | number | boolean>;
  updatedByRole: string;
  updatedByWorkstation: string;
  updatedAt: string;
  txid: number;
}

interface MirroredTableSummary {
  tableKey: string;
  geometryType: string;
  srid: number;
  featureCount: number;
  latestTxid: number;
  privileges: string[];
  columns: { name: string; dataType: string }[];
  rows: MirroredTableRow[];
}

type ExtendedWorkspaceSummary = CloudWorkspaceSummary & {
  mirroredTables?: Record<string, MirroredTableSummary>;
  defaultHostAccessRole?: string;
};

interface CloudRepositoryViewProps {
  onOpenSanitizerWithXml?: (fileName: string, xmlContent: string) => void;
  onSwitchToLivePostgis?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function CloudRepositoryView({
  onOpenSanitizerWithXml,
  onSwitchToLivePostgis,
}: CloudRepositoryViewProps) {
  const [workspaces, setWorkspaces] = useState<ExtendedWorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('watershed-citarum-2026');
  const [cloudLinkInput, setCloudLinkInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [pushing, setPushing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Two-Way Live .SHP <-> PostGIS Inline Editor State
  const [editingShpGroup, setEditingShpGroup] = useState<string>('hydro_sub_basins');
  const [editingFid, setEditingFid] = useState<number>(1);
  const [editingAttrs, setEditingAttrs] = useState<Record<string, string | number>>({});
  const [editingWkt, setEditingWkt] = useState<string>('');
  const [isCommittingShpTx, setIsCommittingShpTx] = useState<boolean>(false);

  // Push / Upload Form State
  const [authorMachine, setAuthorMachine] = useState<string>('DESKTOP-GIS01 (Windows 11)');
  const [commitMessage, setCommitMessage] = useState<string>(
    'Updated Shapefile geometries, raster layers, and saved QGIS project'
  );
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Create New Workspace Form State
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState<boolean>(false);
  const [newWsName, setNewWsName] = useState<string>('');
  const [newWsDesc, setNewWsDesc] = useState<string>('');
  const [newWsCrs, setNewWsCrs] = useState<string>('EPSG:4326 (WGS 84)');

  // Sub-view toggle: 'files' vs 'migration' vs 'pyqgis' vs 'history'
  const [subTab, setSubTab] = useState<'files' | 'migration' | 'pyqgis' | 'history'>('files');
  const [migrationMethod, setMigrationMethod] = useState<'qgis_gui' | 'cli_tools' | 'sql_ddl'>(
    'qgis_gui'
  );
  const [selectedMigrationShp, setSelectedMigrationShp] = useState<string>('hydro_sub_basins');

  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const fetchWorkspaces = async (targetId?: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/workspaces');
      if (!res.ok) throw new Error('Failed to load cloud workspaces');
      const data = await res.json();
      const list: ExtendedWorkspaceSummary[] = data.workspaces || [];
      setWorkspaces(list);
      if (targetId && list.some((w) => w.id === targetId)) {
        setSelectedWorkspaceId(targetId);
      } else if (data.activeWorkspaceId && list.some((w) => w.id === data.activeWorkspaceId)) {
        setSelectedWorkspaceId(data.activeWorkspaceId);
      } else if (list.length > 0 && !list.some((w) => w.id === selectedWorkspaceId)) {
        setSelectedWorkspaceId(list[0].id);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to reach Cloud GIS API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
    let evSource: EventSource | null = null;
    try {
      evSource = new EventSource('/api/db/stream');
      evSource.addEventListener('db_update', () => {
        fetchWorkspaces();
      });
      evSource.onerror = () => {
        evSource?.close();
      };
    } catch {
      // ignore
    }
    return () => {
      evSource?.close();
    };
  }, []);

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || workspaces[0] || null;
  }, [workspaces, selectedWorkspaceId]);

  // Synchronize inline .SHP <-> PostGIS editor form with selected shapefile and FID
  const activeMirroredTable = useMemo(() => {
    if (!activeWorkspace?.mirroredTables) return null;
    return (
      activeWorkspace.mirroredTables[editingShpGroup] ||
      Object.values(activeWorkspace.mirroredTables)[0] ||
      null
    );
  }, [activeWorkspace, editingShpGroup]);

  useEffect(() => {
    if (!activeMirroredTable) return;
    const row =
      activeMirroredTable.rows.find((r) => r.fid === editingFid) ||
      activeMirroredTable.rows[0];
    if (row) {
      setEditingFid(row.fid);
      const next: Record<string, string | number> = {};
      Object.entries(row.attributes).forEach(([k, v]) => {
        next[k] = typeof v === 'boolean' ? String(v) : v;
      });
      setEditingAttrs(next);
      setEditingWkt(row.geomWkt);
    }
  }, [activeMirroredTable, editingFid]);

  const handleShpMirrorTransaction = async (
    operation: 'UPDATE' | 'INSERT' | 'DELETE',
    targetFid?: number
  ) => {
    if (!activeMirroredTable) return;
    setIsCommittingShpTx(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const defaultInsertAttrs: Record<string, string | number> = {};
      activeMirroredTable.columns.forEach((col) => {
        if (col.dataType.includes('numeric') || col.dataType.includes('int')) {
          defaultInsertAttrs[col.name] = 115.5;
        } else {
          defaultInsertAttrs[col.name] = `New_${editingShpGroup}_${Date.now().toString().slice(-3)}`;
        }
      });

      const res = await fetch('/api/db/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleName: 'zero_auth_default',
          workstation: authorMachine,
          operation,
          tableKey: activeMirroredTable.tableKey,
          fid: targetFid ?? editingFid,
          attributes: operation === 'INSERT' ? defaultInsertAttrs : editingAttrs,
          geomWkt:
            operation === 'INSERT'
              ? 'POLYGON((107.55 -6.95, 107.55 -6.90, 107.61 -6.90, 107.61 -6.95, 107.55 -6.95))'
              : editingWkt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error ||
            'SQL Permission Denied (42501): Switch Host Mode to Admin or Editor to edit .SHP & PostGIS layers.'
        );
      }
      await fetchWorkspaces(activeWorkspace?.id);
      setStatusMessage(
        `[Two-Way Mirror Committed · txid #${data.auditEntry?.txid}] ${operation} applied to ${activeMirroredTable.tableKey} AND recompiled binary ./layers/${editingShpGroup}.shp (.shx/.dbf)!`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to commit two-way .SHP edit');
    } finally {
      setIsCommittingShpTx(false);
    }
  };

  const activeCloudLink = useMemo(() => {
    const id = activeWorkspace?.id || selectedWorkspaceId;
    return `${serverOrigin}/api/workspaces/${id}`;
  }, [serverOrigin, activeWorkspace, selectedWorkspaceId]);

  useEffect(() => {
    if (activeCloudLink) {
      setCloudLinkInput(activeCloudLink);
    }
  }, [activeCloudLink]);

  // Group Shapefile sidecars (.shp, .shx, .dbf, .prj, .cpg) by groupName
  const shapefileGroups = useMemo(() => {
    if (!activeWorkspace) return [];
    const groups = new Map<string, CloudFileSummary[]>();
    for (const f of activeWorkspace.files) {
      if (f.category === 'shapefile') {
        const existing = groups.get(f.groupName) || [];
        existing.push(f);
        groups.set(f.groupName, existing);
      }
    }
    return Array.from(groups.entries()).map(([groupName, files]) => {
      const exts = new Set(files.map((f) => f.extension));
      const hasMandatory = exts.has('.shp') && exts.has('.shx') && exts.has('.dbf');
      const totalBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
      const latestUpdate = files.reduce(
        (latest, f) => (f.updatedAt > latest ? f.updatedAt : latest),
        files[0]?.updatedAt || ''
      );
      return {
        groupName,
        files,
        exts: Array.from(exts),
        hasMandatory,
        hasPrj: exts.has('.prj'),
        totalBytes,
        latestUpdate,
        updatedBy: files[0]?.updatedBy || 'Unknown',
      };
    });
  }, [activeWorkspace]);

  // Automatically switch editingShpGroup & selectedMigrationShp when switching to another Cloud Workspace
  useEffect(() => {
    if (shapefileGroups.length === 0) return;
    const existsInWorkspace = shapefileGroups.some((g) => g.groupName === editingShpGroup);
    if (!existsInWorkspace) {
      const firstGroup = shapefileGroups[0].groupName;
      setEditingShpGroup(firstGroup);
      setSelectedMigrationShp(firstGroup);
      setEditingFid(1);
    }
  }, [activeWorkspace?.id, shapefileGroups, editingShpGroup]);

  const rasterAndOtherFiles = useMemo(() => {
    if (!activeWorkspace) return [];
    return activeWorkspace.files.filter((f) => f.category !== 'shapefile');
  }, [activeWorkspace]);

  const pyQgisConnectorScript = useMemo(() => {
    return generateCloudLinkPyQgisScript(
      serverOrigin,
      activeWorkspace?.id || 'watershed-citarum-2026'
    );
  }, [serverOrigin, activeWorkspace]);

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleSwitchWorkspace = async (targetWorkspaceId: string) => {
    setErrorMessage(null);
    setSelectedWorkspaceId(targetWorkspaceId);
    try {
      const res = await fetch('/api/plugin/active-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: targetWorkspaceId }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchWorkspaces(data.activeWorkspaceId || targetWorkspaceId);
        setStatusMessage(
          `Connected to Active Cloud Workspace "${data.workspace?.name || targetWorkspaceId}" — loaded ${
            data.workspace?.layerTableKeys?.length || 0
          } spatial layers`
        );
      }
    } catch {
      // ignore
    }
  };

  const handleConnectByCloudLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = cloudLinkInput.trim();
    if (!raw) return;
    // Extract workspace ID if full URL pasted
    const match = raw.match(/\/api\/workspaces\/([^/?#]+)/i);
    const targetId = match ? match[1] : raw.replace(/^https?:\/\/[^/]+\/?/i, '').replace(/^\/+|\/+$/g, '');
    await handleSwitchWorkspace(targetId);
  };

  const handlePullCompleteZip = () => {
    if (!activeWorkspace) return;
    const url = `/api/workspaces/${activeWorkspace.id}/pull.zip`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeWorkspace.id}_r${activeWorkspace.revision}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePullSingleFile = (relativePath: string, fileName: string) => {
    if (!activeWorkspace) return;
    const url = `/api/workspaces/${activeWorkspace.id}/file?path=${encodeURIComponent(relativePath)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleInspectProjectInSanitizer = async (relativePath: string, fileName: string) => {
    if (!activeWorkspace || !onOpenSanitizerWithXml) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/file?path=${encodeURIComponent(relativePath)}`
      );
      const xmlText = await res.text();
      onOpenSanitizerWithXml(fileName, xmlText);
    } catch {
      // ignore
    }
  };

  const handleStageFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setStagedFiles((prev) => [...prev, ...selected]);
  };

  const handlePushStagedFiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || stagedFiles.length === 0) return;
    setPushing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const encodedFiles = await Promise.all(
        stagedFiles.map(async (f) => ({
          fileName: f.name,
          base64Data: await fileToBase64(f),
        }))
      );

      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Meridian-Machine': authorMachine,
        },
        body: JSON.stringify({
          authorMachine,
          message: commitMessage,
          files: encodedFiles,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload files to cloud workspace');
      }

      const data = await res.json();
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === activeWorkspace.id ? data.workspace : w))
      );
      setStagedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setStatusMessage(
        `Saved & refreshed ${data.changedFiles?.length || encodedFiles.length} file(s) to Cloud Revision r${data.revision}`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  const handleSimulateLiveSaveRefresh = async () => {
    if (!activeWorkspace) return;
    setPushing(true);
    setErrorMessage(null);
    try {
      const csvUpdate = `station_id,station_name,lat,lon,annual_mm\nST-01,Bandung Basin North,-6.8912,107.6105,${2400 + Math.floor(Math.random() * 150)}\nST-02,Majalaya Telemetry,-7.0488,107.7561,${2650 + Math.floor(Math.random() * 150)}\nST-03,Saguling Intake,-6.9145,107.3682,${2150 + Math.floor(Math.random() * 150)}\nST-04,Cisangkuy Headwaters,-7.1204,107.5412,2890\n`;
      const b64 = btoa(csvUpdate);
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Meridian-Machine': authorMachine,
        },
        body: JSON.stringify({
          authorMachine,
          message: `Hot-swap save & refresh from ${authorMachine}: updated layer attributes & project state`,
          files: [
            {
              fileName: 'rainfall_gauges_2026.csv',
              base64Data: b64,
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.workspace) {
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === activeWorkspace.id ? data.workspace : w))
        );
        setStatusMessage(
          `Cloud Workspace refreshed to Revision r${data.revision} (${new Date().toLocaleTimeString()})`
        );
      }
    } catch {
      setErrorMessage('Failed to simulate cloud refresh');
    } finally {
      setPushing(false);
    }
  };

  const handleToggleLock = async () => {
    if (!activeWorkspace) return;
    const action = activeWorkspace.lockedBy ? 'unlock' : 'lock';
    const res = await fetch(`/api/workspaces/${activeWorkspace.id}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineName: authorMachine, action }),
    });
    const data = await res.json();
    if (data.workspace) {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === activeWorkspace.id ? data.workspace : w))
      );
    }
  };

  const handleDeleteFile = async (relativePath: string) => {
    if (!activeWorkspace) return;
    const res = await fetch(
      `/api/workspaces/${activeWorkspace.id}/file?path=${encodeURIComponent(relativePath)}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (data.workspace) {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === activeWorkspace.id ? data.workspace : w))
      );
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newWsName.trim(),
        description: newWsDesc.trim(),
        crs: newWsCrs.trim(),
      }),
    });
    const data = await res.json();
    if (data.workspace) {
      setWorkspaces((prev) => [...prev, data.workspace]);
      setSelectedWorkspaceId(data.workspace.id);
      setNewWsName('');
      setNewWsDesc('');
      setIsCreatingWorkspace(false);
      setStatusMessage(`Created new Cloud Workspace: ${data.workspace.name}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Cloud Link Bar & Workspace Selector */}
      <section className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="space-y-1">
            <div className="text-xs font-mono text-teal-400">
              Full Cloud GIS Repository · Project (.QGS/.QGZ) + Shapefiles (.SHP/.DBF/.SHX/.PRJ) + Rasters (.TIF)
            </div>
            <h2 className="text-lg font-semibold text-white">
              Cloud Link Pull &amp; Save-Refresh Repository
            </h2>
            <p className="text-xs text-slate-400">
              Access this workspace from any computer via its Cloud Link to pull the complete project, vector Shapefiles, and GeoTIFF rasters—or upload &amp; refresh changes on save.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedWorkspaceId}
              onChange={(e) => handleSwitchWorkspace(e.target.value)}
              aria-label="Select Cloud Workspace"
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-teal-500"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} (r{w.revision})
                </option>
              ))}
            </select>

            <button
              onClick={() => setIsCreatingWorkspace(!isCreatingWorkspace)}
              className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Cloud Workspace</span>
            </button>

            <button
              onClick={() => fetchWorkspaces(selectedWorkspaceId)}
              className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh State</span>
            </button>
          </div>
        </div>

        {/* Create New Cloud Workspace Modal Form */}
        {isCreatingWorkspace && (
          <form
            onSubmit={handleCreateWorkspace}
            className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="text-sm font-semibold text-white">
              Create New Cloud GIS Workspace Repository
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Workspace / Project Name</label>
                <input
                  type="text"
                  required
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="e.g. Coastal Erosion Survey 2026"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Coordinate Reference System</label>
                <input
                  type="text"
                  value={newWsCrs}
                  onChange={(e) => setNewWsCrs(e.target.value)}
                  placeholder="EPSG:4326 (WGS 84)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                  placeholder="Shared Shapefiles, DEM rasters, and QGIS layout"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreatingWorkspace(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-teal-400 text-slate-950 rounded-lg hover:bg-teal-300 cursor-pointer"
              >
                Create &amp; Generate Cloud Link
              </button>
            </div>
          </form>
        )}

        {/* Cloud Link Endpoint Input & Pull/Push Action Strip */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <form onSubmit={handleConnectByCloudLink} className="lg:col-span-7 space-y-1.5">
            <label className="block text-xs text-slate-400">
              Active Cloud Workspace Link (Share this link across your computers or paste into QGIS)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2 className="w-3.5 h-3.5 text-teal-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cloudLinkInput}
                  onChange={(e) => setCloudLinkInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-teal-300 focus:outline-none focus:border-teal-500"
                />
              </div>
              <button
                type="button"
                onClick={() => handleCopy('cloud-link', activeCloudLink)}
                className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedKey === 'cloud-link' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied Link</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
              <button
                type="submit"
                className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Connect Link
              </button>
            </div>
          </form>

          {/* Primary Pull & Lock Controls */}
          <div className="lg:col-span-5 flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleToggleLock}
              className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeWorkspace?.lockedBy ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Locked by {activeWorkspace.lockedBy.split(' ')[0]} · Unlock</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Lock for Editing</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePullCompleteZip}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CloudDownload className="w-4 h-4" />
              <span>Pull Project + SHP + Rasters (.zip)</span>
            </button>
          </div>
        </div>

        {/* Workspace Telemetry Metadata Strip (Zero-pill clean text with separators) */}
        {activeWorkspace && (
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/70 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-2.5 font-mono">
              <span className="text-white font-semibold">Revision r{activeWorkspace.revision}</span>
              <span>·</span>
              <span>{activeWorkspace.files.length} Cloud Files</span>
              <span>·</span>
              <span>{shapefileGroups.length} Shapefile Bundles</span>
              <span>·</span>
              <span>Total Size: {formatBytes(activeWorkspace.totalBytes)}</span>
              <span>·</span>
              <span>CRS: {activeWorkspace.crs}</span>
            </div>
            <div className="text-slate-500 font-mono">
              Last Refreshed: {new Date(activeWorkspace.updatedAt).toLocaleString()}
            </div>
          </div>
        )}

        {statusMessage && (
          <div className="bg-emerald-950/50 border border-emerald-800/80 rounded-lg px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
            <span>{statusMessage}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-emerald-400 hover:underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-950/50 border border-rose-800/80 rounded-lg px-4 py-2.5 text-xs text-rose-200">
            {errorMessage}
          </div>
        )}
      </section>

      {/* Main Two-Column Cloud Repository Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Columns: Hosted Files (Project + Shapefile Groups + Rasters), PyQGIS Cloud Script, or Revision Log */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              <button
                onClick={() => setSubTab('files')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  subTab === 'files'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Hosted Project, SHP &amp; Rasters ({activeWorkspace?.files.length || 0})</span>
              </button>
              <button
                onClick={() => setSubTab('migration')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  subTab === 'migration'
                    ? 'bg-slate-800 text-teal-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-teal-400" />
                <span>Help Tip: SHP → PostGIS Migration Guide</span>
              </button>
              <button
                onClick={() => setSubTab('pyqgis')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  subTab === 'pyqgis'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>QGIS Auto-Pull &amp; Save-Push Script</span>
              </button>
              <button
                onClick={() => setSubTab('history')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  subTab === 'history'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Cloud Revision History ({activeWorkspace?.history.length || 0})</span>
              </button>
            </div>
          </div>

          {/* SUBTAB 1: HOSTED PROJECT, SHAPEFILE BUNDLES & RASTERS */}
          {subTab === 'files' && activeWorkspace && (
            <div className="space-y-6">
              {/* Section A: Shapefile (.shp + .shx + .dbf + .prj) Bundles */}
              <div className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Vector Shapefile Bundles (<code className="font-mono text-teal-400">./layers/*.shp</code>)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Automatically verifies that mandatory <code className="font-mono text-slate-300">.shp</code>,{' '}
                      <code className="font-mono text-slate-300">.shx</code>,{' '}
                      <code className="font-mono text-slate-300">.dbf</code>, and{' '}
                      <code className="font-mono text-slate-300">.prj</code> sidecar files stay synced together.
                    </p>
                  </div>
                </div>

                {/* Visual Help Tip & Migration Info Section: Why .SHP Cannot Be Edited Directly in Real-Time & How to Convert to PostGIS */}
                <div className="bg-slate-950/95 border border-teal-500/40 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
                    <div className="space-y-0.5">
                      <div className="text-[11px] font-mono text-teal-400 uppercase tracking-wider">
                        Help Tip &amp; Migration Info · Legacy File Format vs. Real-Time Spatial Database
                      </div>
                      <h4 className="text-sm font-semibold text-white">
                        Why Shapefiles (.shp) Cannot Be Edited Directly in Real-Time — And How to Convert Them to PostGIS
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSubTab('migration')}
                        className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Full Migration Guide
                      </button>
                      {onSwitchToLivePostgis && (
                        <button
                          type="button"
                          onClick={onSwitchToLivePostgis}
                          className="px-3 py-1.5 text-xs font-semibold bg-teal-400 hover:bg-teal-300 text-slate-950 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Open Live PostGIS Tables →
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Visual Side-by-Side Architecture Comparison: Legacy .SHP vs. Live PostGIS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-amber-300">
                          Legacy ESRI Shapefile (.shp + .shx + .dbf)
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          File-Based Archive
                        </span>
                      </div>
                      <ul className="space-y-1.5 text-[11px] text-slate-300">
                        <li>
                          • <strong className="text-white">3 Coupled Binary Files:</strong> Editing 1 vertex or attribute requires rewriting byte offsets across <code className="text-slate-200">.shp</code>, <code className="text-slate-200">.shx</code>, and <code className="text-slate-200">.dbf</code> simultaneously on local disk.
                        </li>
                        <li>
                          • <strong className="text-white">GDAL/OGR HTTP Read-Only Lock:</strong> Remote <code className="text-slate-200">.shp</code> streams (<code className="text-slate-200">/vsicurl/</code>) cannot be modified in-place over HTTP; QGIS disables direct streaming edits.
                        </li>
                        <li>
                          • <strong className="text-white">No Concurrent Editing or RBAC:</strong> Whole-file saves overwrite teammates&apos; edits and lack SQL <code className="text-slate-200">GRANT / REVOKE</code> permissions.
                        </li>
                      </ul>
                    </div>

                    <div className="p-3.5 bg-teal-950/20 border border-teal-500/40 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-teal-300">
                          Live PostGIS Spatial Table (public.*)
                        </span>
                        <span className="text-[11px] font-mono text-teal-400">
                          Zero-Sync Real-Time
                        </span>
                      </div>
                      <ul className="space-y-1.5 text-[11px] text-slate-300">
                        <li>
                          • <strong className="text-white">Instant Row-Level SQL Commits:</strong> Saving in QGIS sends an atomic <code className="text-teal-300">INSERT</code>, <code className="text-teal-300">UPDATE</code>, or <code className="text-teal-300">DELETE</code> for that single feature (<code className="text-slate-200">fid</code>) in milliseconds.
                        </li>
                        <li>
                          • <strong className="text-white">Instant Multi-User Refresh:</strong> Teammates simply click <strong className="text-white">Refresh</strong> in the QGIS Plugin Dock to see new edits immediately without downloading ZIPs.
                        </li>
                        <li>
                          • <strong className="text-white">Granular SQL Access Control:</strong> Enforce <code className="text-teal-300">Admin</code>, <code className="text-teal-300">Editor</code>, and <code className="text-teal-300">Read-Only Viewer</code> roles per table via SQL.
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Interactive Step-by-Step Conversion Guide (3 Workflows) */}
                  <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-white">
                        How to Convert a Shapefile (.shp) to a Live PostGIS Table:
                      </div>
                      <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono">
                        <button
                          type="button"
                          onClick={() => setMigrationMethod('qgis_gui')}
                          className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                            migrationMethod === 'qgis_gui'
                              ? 'bg-slate-800 text-teal-300 font-semibold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          1. QGIS DB Manager (GUI)
                        </button>
                        <button
                          type="button"
                          onClick={() => setMigrationMethod('cli_tools')}
                          className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                            migrationMethod === 'cli_tools'
                              ? 'bg-slate-800 text-teal-300 font-semibold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          2. shp2pgsql / ogr2ogr CLI
                        </button>
                        <button
                          type="button"
                          onClick={() => setMigrationMethod('sql_ddl')}
                          className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                            migrationMethod === 'sql_ddl'
                              ? 'bg-slate-800 text-teal-300 font-semibold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          3. PostGIS SQL Schema
                        </button>
                      </div>
                    </div>

                    {migrationMethod === 'qgis_gui' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] text-slate-300">
                        <div className="p-2.5 bg-slate-950 border border-slate-800/90 rounded">
                          <div className="font-mono text-teal-400 font-semibold mb-0.5">
                            Step 1 · Open DB Manager
                          </div>
                          In QGIS Desktop, go to <strong className="text-white">Database → DB Manager → PostGIS</strong> and expand your live database connection (<code className="text-slate-200">public</code> schema).
                        </div>
                        <div className="p-2.5 bg-slate-950 border border-slate-800/90 rounded">
                          <div className="font-mono text-teal-400 font-semibold mb-0.5">
                            Step 2 · Import Layer / File
                          </div>
                          Click <strong className="text-white">Import Layer/File...</strong> in the top toolbar, select your <code className="text-slate-200">.shp</code> layer, and set <strong className="text-white">Primary key:</strong> <code className="text-teal-300">fid</code> and <strong className="text-white">Geometry column:</strong> <code className="text-teal-300">geom</code>.
                        </div>
                        <div className="p-2.5 bg-slate-950 border border-slate-800/90 rounded">
                          <div className="font-mono text-teal-400 font-semibold mb-0.5">
                            Step 3 · Enable Spatial Index
                          </div>
                          Check <strong className="text-white">&quot;Create spatial index&quot;</strong> and click <strong className="text-white">OK</strong>. Your <code className="text-slate-200">.shp</code> is now a live multi-user PostGIS table!
                        </div>
                      </div>
                    )}

                    {migrationMethod === 'cli_tools' && (
                      <div className="space-y-2 text-[11px] font-mono">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded p-2.5">
                          <div className="text-slate-200 break-all">
                            <span className="text-teal-400"># Option A (PostGIS Loader):</span>{' '}
                            shp2pgsql -I -s 4326 ./layers/{selectedMigrationShp}.shp public.{selectedMigrationShp} | psql -h localhost -U postgres_admin -d meridian_gis
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                'shp2pgsql-cmd',
                                `shp2pgsql -I -s 4326 ./layers/${selectedMigrationShp}.shp public.${selectedMigrationShp} | psql -h localhost -U postgres_admin -d meridian_gis`
                              )
                            }
                            className="text-teal-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {copiedKey === 'shp2pgsql-cmd' ? 'Copied' : 'Copy shp2pgsql'}
                          </button>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded p-2.5">
                          <div className="text-slate-200 break-all">
                            <span className="text-teal-400"># Option B (GDAL ogr2ogr):</span>{' '}
                            ogr2ogr -f &quot;PostgreSQL&quot; PG:&quot;dbname=meridian_gis user=postgres_admin&quot; ./layers/{selectedMigrationShp}.shp -nln public.{selectedMigrationShp} -lco FID=fid -lco GEOMETRY_NAME=geom
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                'ogr2ogr-cmd',
                                `ogr2ogr -f "PostgreSQL" PG:"dbname=meridian_gis user=postgres_admin" ./layers/${selectedMigrationShp}.shp -nln public.${selectedMigrationShp} -lco FID=fid -lco GEOMETRY_NAME=geom`
                              )
                            }
                            className="text-teal-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {copiedKey === 'ogr2ogr-cmd' ? 'Copied' : 'Copy ogr2ogr'}
                          </button>
                        </div>
                      </div>
                    )}

                    {migrationMethod === 'sql_ddl' && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded p-2.5 text-[11px] font-mono">
                        <div className="text-slate-200 break-all">
                          CREATE TABLE public.{selectedMigrationShp} (fid SERIAL PRIMARY KEY, geom geometry(Polygon, 4326)); CREATE INDEX ON public.{selectedMigrationShp} USING GIST (geom); GRANT SELECT, INSERT, UPDATE, DELETE ON public.{selectedMigrationShp} TO gis_editor_team;
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              'sql-ddl-cmd',
                              `CREATE TABLE public.${selectedMigrationShp} (fid SERIAL PRIMARY KEY, geom geometry(Polygon, 4326));\nCREATE INDEX ON public.${selectedMigrationShp} USING GIST (geom);\nGRANT SELECT, INSERT, UPDATE, DELETE ON public.${selectedMigrationShp} TO gis_editor_team;`
                            )
                          }
                          className="text-teal-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {copiedKey === 'sql-ddl-cmd' ? 'Copied SQL' : 'Copy PostGIS DDL'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs text-slate-400">
                        <th className="py-2.5 pr-4 font-medium">Shapefile Layer &amp; Live PostGIS Mirror</th>
                        <th className="py-2.5 px-4 font-medium">Synced Sidecar Files (SHA-256)</th>
                        <th className="py-2.5 px-4 font-medium">Two-Way Mirror Status</th>
                        <th className="py-2.5 px-4 font-medium text-right">Bundle Size</th>
                        <th className="py-2.5 pl-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {shapefileGroups.map((grp) => {
                        const mirrored = activeWorkspace?.mirroredTables?.[grp.groupName];
                        const isEditingThis = editingShpGroup === grp.groupName;
                        return (
                          <tr
                            key={grp.groupName}
                            className={`transition-colors ${
                              isEditingThis ? 'bg-teal-950/20' : 'hover:bg-slate-900/60'
                            }`}
                          >
                            <td className="py-3.5 pr-4">
                              <div className="font-mono font-medium text-white flex items-center gap-2">
                                <span>./layers/{grp.groupName}.shp</span>
                                <span className="text-teal-400">⇄</span>
                                <span className="text-teal-300">
                                  {mirrored?.tableKey || `public.${grp.groupName}`}
                                </span>
                              </div>
                              <div className="text-slate-500 mt-0.5 font-mono text-[11px]">
                                {mirrored
                                  ? `${mirrored.featureCount} live features · txid #${mirrored.latestTxid} · Updated by ${grp.updatedBy}`
                                  : `Updated by ${grp.updatedBy}`}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-300">
                              {grp.files.map((f, i) => (
                                <React.Fragment key={f.relativePath}>
                                  {i > 0 && <span className="text-slate-600"> · </span>}
                                  <button
                                    type="button"
                                    onClick={() => handlePullSingleFile(f.relativePath, f.fileName)}
                                    title={`Download ${f.fileName} (${formatBytes(f.sizeBytes)} · SHA-256: ${f.sha256})`}
                                    className="hover:text-teal-300 underline decoration-slate-700 cursor-pointer"
                                  >
                                    {f.extension} ({f.sha256.slice(0, 6)})
                                  </button>
                                </React.Fragment>
                              ))}
                            </td>
                            <td className="py-3.5 px-4 font-mono">
                              {grp.hasMandatory ? (
                                <span className="text-emerald-400">
                                  Two-Way Live Mirror Active
                                </span>
                              ) : (
                                <span className="text-amber-400">
                                  Incomplete Sidecars (Needs .shp/.shx/.dbf)
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-300 text-right tabular-nums">
                              {formatBytes(grp.totalBytes)}
                            </td>
                            <td className="py-3.5 pl-4 text-right whitespace-nowrap space-x-3">
                              <button
                                type="button"
                                onClick={() => setEditingShpGroup(grp.groupName)}
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                                  isEditingThis
                                    ? 'bg-teal-400 text-slate-950'
                                    : 'bg-slate-800 hover:bg-slate-700 text-teal-300'
                                }`}
                              >
                                {isEditingThis ? 'Editing Live .SHP' : 'Live Edit .SHP ⇄ PostGIS'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const mainShp =
                                    grp.files.find((f) => f.extension === '.shp') || grp.files[0];
                                  if (mainShp)
                                    handlePullSingleFile(mainShp.relativePath, mainShp.fileName);
                                }}
                                className="text-teal-400 hover:underline font-medium cursor-pointer"
                              >
                                Pull .SHP
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {shapefileGroups.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-500">
                            No Shapefile layers uploaded yet. Use the Save / Upload panel on the right to push .shp/.shx/.dbf/.prj files.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Inline Two-Way Live .SHP <-> PostGIS Feature Editor Drawer */}
                {activeMirroredTable && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4 mt-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div>
                        <div className="text-[11px] font-mono text-teal-400">
                          Two-Way Live .SHP ⇄ PostGIS Mirror Editor · Instant Binary .SHP/.DBF/.SHX Recompilation
                        </div>
                        <h4 className="text-sm font-semibold text-white mt-0.5">
                          Editing <code className="font-mono text-teal-300">./layers/{editingShpGroup}.shp</code>{' '}
                          ⇄ <code className="font-mono text-teal-300">{activeMirroredTable.tableKey}</code>{' '}
                          <span className="font-mono text-xs text-slate-400">
                            ({activeMirroredTable.featureCount} features · txid #{activeMirroredTable.latestTxid})
                          </span>
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isCommittingShpTx}
                          onClick={() => handleShpMirrorTransaction('INSERT')}
                          className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 rounded-lg cursor-pointer"
                        >
                          + Add Feature (INSERT)
                        </button>
                        <button
                          type="button"
                          disabled={isCommittingShpTx || activeMirroredTable.rows.length <= 1}
                          onClick={() => handleShpMirrorTransaction('DELETE', editingFid)}
                          className="px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-rose-950/60 text-rose-300 border border-slate-800 rounded-lg cursor-pointer disabled:opacity-40"
                        >
                          Delete fid={editingFid}
                        </button>
                      </div>
                    </div>

                    {/* Feature Selector Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono">Select Feature Row:</span>
                      {activeMirroredTable.rows.map((r) => (
                        <button
                          key={r.fid}
                          type="button"
                          onClick={() => setEditingFid(r.fid)}
                          className={`px-2.5 py-1 text-xs font-mono rounded border cursor-pointer transition-colors ${
                            editingFid === r.fid
                              ? 'bg-teal-950/50 border-teal-400 text-teal-300 font-semibold'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          fid={r.fid} ·{' '}
                          {String(
                            Object.values(r.attributes)[1] ||
                              Object.values(r.attributes)[0] ||
                              `Row #${r.fid}`
                          )}{' '}
                          (txid #{r.txid})
                        </button>
                      ))}
                    </div>

                    {/* Attribute & Geometry WKT Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {Object.entries(editingAttrs).map(([k, v]) => (
                        <div key={k}>
                          <label className="block text-[11px] font-mono text-slate-400 mb-1">
                            .DBF / SQL Column: <span className="text-slate-200">{k}</span>
                          </label>
                          <input
                            type={typeof v === 'number' ? 'number' : 'text'}
                            step="any"
                            value={v}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const num = Number(raw);
                              setEditingAttrs((prev) => ({
                                ...prev,
                                [k]:
                                  typeof v === 'number' && !Number.isNaN(num) && raw !== ''
                                    ? num
                                    : raw,
                              }));
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-teal-400"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                      <div className="flex-1">
                        <label className="block text-[11px] font-mono text-slate-400 mb-1">
                          .SHP / PostGIS Geometry (WKT)
                        </label>
                        <input
                          type="text"
                          value={editingWkt}
                          onChange={(e) => setEditingWkt(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-400"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={isCommittingShpTx}
                        onClick={() => handleShpMirrorTransaction('UPDATE', editingFid)}
                        className="px-4 py-2 bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isCommittingShpTx
                          ? 'Syncing .SHP ⇄ PostGIS...'
                          : `Save & Sync fid=${editingFid} (.SHP ⇄ PostGIS)`}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Section B: QGIS Project File (.qgs/.qgz), Rasters (.tif), GeoPackages & Tables */}
              <div className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      QGIS Project File, GeoTIFF Rasters (<code className="font-mono text-teal-400">./rasters/*.tif</code>) &amp; Tables
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      All layers are automatically linked inside <code className="font-mono text-slate-200">{activeWorkspace.projectFileName}</code> using relative paths so any computer can open them immediately.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs text-slate-400">
                        <th className="py-2.5 pr-4 font-medium">Relative Cloud Path</th>
                        <th className="py-2.5 px-4 font-medium">Layer Type</th>
                        <th className="py-2.5 px-4 font-medium">SHA-256 Checksum</th>
                        <th className="py-2.5 px-4 font-medium text-right">Size</th>
                        <th className="py-2.5 pl-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {rasterAndOtherFiles.map((file) => (
                        <tr key={file.relativePath} className="hover:bg-slate-900/60">
                          <td className="py-3.5 pr-4">
                            <div className="font-mono font-medium text-white">
                              ./{file.relativePath}
                            </div>
                            <div className="text-slate-500 mt-0.5">
                              Pushed by {file.updatedBy}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-300 capitalize">
                            {file.category} ({file.extension})
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-400">
                            {file.sha256}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-300 text-right tabular-nums">
                            {formatBytes(file.sizeBytes)}
                          </td>
                          <td className="py-3.5 pl-4 text-right whitespace-nowrap space-x-3">
                            {file.category === 'project' && onOpenSanitizerWithXml && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleInspectProjectInSanitizer(file.relativePath, file.fileName)
                                }
                                className="text-slate-300 hover:text-white underline cursor-pointer"
                              >
                                Inspect XML
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handlePullSingleFile(file.relativePath, file.fileName)}
                              className="text-teal-400 hover:underline font-medium cursor-pointer"
                            >
                              Pull File
                            </button>
                            {file.category !== 'project' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(file.relativePath)}
                                title="Remove file from cloud workspace"
                                className="text-slate-500 hover:text-rose-400 cursor-pointer inline-flex items-center align-middle"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SUBTAB 2: VISUAL HELP TIP & SHP -> POSTGIS MIGRATION GUIDE */}
          {subTab === 'migration' && (
            <div className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div>
                  <div className="text-xs font-mono text-teal-400">
                    Architecture &amp; Migration Guide · Legacy ESRI Shapefile (.shp) → Live PostGIS Table
                  </div>
                  <h3 className="text-base font-semibold text-white mt-0.5">
                    Why Shapefiles Cannot Be Edited Directly in Real-Time &amp; How to Convert to PostGIS
                  </h3>
                </div>
                {onSwitchToLivePostgis && (
                  <button
                    type="button"
                    onClick={onSwitchToLivePostgis}
                    className="px-4 py-2 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start"
                  >
                    Open Live PostGIS Tables →
                  </button>
                )}
              </div>

              {/* 1. Visual Comparison Table: Why .SHP Blocks Real-Time Editing */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-white">
                  1. Architectural Comparison: Why .SHP Files Cannot Stream Real-Time Edits
                </div>
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-4 font-medium">Capability</th>
                        <th className="py-2.5 px-4 font-medium text-amber-300">
                          ESRI Shapefile (.shp + .shx + .dbf)
                        </th>
                        <th className="py-2.5 px-4 font-medium text-teal-300">
                          PostGIS Spatial Table (public.*)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 bg-slate-950/60">
                      <tr>
                        <td className="py-3 px-4 font-medium text-white">Storage Format</td>
                        <td className="py-3 px-4 text-slate-300">
                          3+ coupled binary disk files (<code className="font-mono text-slate-200">.shp</code>, <code className="font-mono text-slate-200">.shx</code>, <code className="font-mono text-slate-200">.dbf</code>, <code className="font-mono text-slate-200">.prj</code>) with fixed header byte offsets
                        </td>
                        <td className="py-3 px-4 text-slate-200">
                          Single indexed relational spatial table (<code className="font-mono text-teal-300">geometry(Polygon, 4326)</code>)
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium text-white">Network / HTTP Stream Editing</td>
                        <td className="py-3 px-4 text-amber-200/90">
                          Blocked — GDAL/OGR opens remote <code className="font-mono">.shp</code> links as strictly Read-Only; requires full download &amp; re-upload
                        </td>
                        <td className="py-3 px-4 text-teal-300">
                          Native Real-Time — Instant <code className="font-mono">INSERT</code>, <code className="font-mono">UPDATE</code>, <code className="font-mono">DELETE</code> over TCP/HTTP on save
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium text-white">Multi-User Concurrency</td>
                        <td className="py-3 px-4 text-slate-300">
                          Whole-file lock — simultaneous saves overwrite the entire <code className="font-mono">.shp/.dbf</code> file
                        </td>
                        <td className="py-3 px-4 text-slate-200">
                          Row-level MVCC transactions (<code className="font-mono text-teal-300">txid</code>) — multiple users edit different features safely
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium text-white">Permissions &amp; Security</td>
                        <td className="py-3 px-4 text-slate-300">
                          OS file system read/write flag only
                        </td>
                        <td className="py-3 px-4 text-slate-200">
                          Granular SQL <code className="font-mono text-teal-300">GRANT / REVOKE</code> per role (<code className="font-mono">Admin</code>, <code className="font-mono">Editor</code>, <code className="font-mono">Viewer</code>)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Interactive Layer-Specific Conversion Command Generator */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-white">
                    2. Select a Hosted Shapefile to Generate Its PostGIS Conversion Commands
                  </div>
                  <select
                    value={selectedMigrationShp}
                    onChange={(e) => setSelectedMigrationShp(e.target.value)}
                    aria-label="Select Shapefile to Convert"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-teal-300 focus:outline-none focus:border-teal-400"
                  >
                    {shapefileGroups.map((g) => (
                      <option key={g.groupName} value={g.groupName}>
                        ./layers/{g.groupName}.shp → public.{g.groupName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="font-mono text-teal-400 font-semibold">
                      Method A · QGIS DB Manager (GUI)
                    </div>
                    <ol className="space-y-1.5 text-[11px] text-slate-300 list-decimal list-inside">
                      <li>
                        Open <strong className="text-white">Database → DB Manager → PostGIS</strong> in QGIS.
                      </li>
                      <li>
                        Click <strong className="text-white">Import Layer/File...</strong> and choose <code className="font-mono text-slate-200">{selectedMigrationShp}.shp</code>.
                      </li>
                      <li>
                        Set Table to <code className="font-mono text-teal-300">{selectedMigrationShp}</code>, Primary Key <code className="font-mono">fid</code>, Geometry <code className="font-mono">geom</code>, and check <strong className="text-white">Create spatial index</strong>.
                      </li>
                    </ol>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="font-mono text-teal-400 font-semibold">
                      Method B · QGIS Toolbox (Export to PostgreSQL)
                    </div>
                    <ol className="space-y-1.5 text-[11px] text-slate-300 list-decimal list-inside">
                      <li>
                        Open <strong className="text-white">Processing → Toolbox</strong> and search <code className="font-mono text-slate-200">Export to PostgreSQL</code>.
                      </li>
                      <li>
                        Select <code className="font-mono text-slate-200">{selectedMigrationShp}.shp</code> as Input Layer and schema <code className="font-mono text-teal-300">public</code>.
                      </li>
                      <li>
                        Click <strong className="text-white">Run</strong> to automatically migrate geometry and all <code className="font-mono">.dbf</code> fields.
                      </li>
                    </ol>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-teal-400 font-semibold">
                        Method C · PostGIS CLI (shp2pgsql)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            'mig-cli',
                            `shp2pgsql -I -s 4326 ./layers/${selectedMigrationShp}.shp public.${selectedMigrationShp} | psql -h localhost -U postgres_admin -d meridian_gis`
                          )
                        }
                        className="text-[11px] font-mono text-teal-300 hover:underline cursor-pointer"
                      >
                        {copiedKey === 'mig-cli' ? 'Copied' : 'Copy CLI'}
                      </button>
                    </div>
                    <pre className="bg-slate-900 border border-slate-800 rounded p-2.5 text-[11px] font-mono text-slate-200 overflow-x-auto leading-relaxed">
                      {`shp2pgsql -I -s 4326 \\
  ./layers/${selectedMigrationShp}.shp \\
  public.${selectedMigrationShp} \\
  | psql -U postgres_admin -d meridian_gis`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUBTAB 3: PYQGIS CLOUD LINK AUTO-PULL & SAVE-PUSH CONNECTOR */}
          {subTab === 'pyqgis' && (
            <div className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    PyQGIS Cloud Link Connector (<code className="font-mono text-teal-400">meridian_cloud_connector.py</code>)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Paste this script into <strong className="text-slate-200">QGIS → Plugins → Python Console</strong> on any computer. It pulls the project, <code className="font-mono">.shp</code> layers, and <code className="font-mono">.tif</code> rasters from your Cloud Link—and automatically uploads &amp; refreshes the cloud whenever you press <strong className="text-slate-200">Ctrl+S (Save)</strong> in QGIS!
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy('pyqgis-cloud', pyQgisConnectorScript)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === 'pyqgis-cloud' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied Script</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Python Script for QGIS</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[520px] leading-relaxed">
                {pyQgisConnectorScript}
              </pre>
            </div>
          )}

          {/* SUBTAB 3: CLOUD REVISION HISTORY */}
          {subTab === 'history' && activeWorkspace && (
            <div className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-white">
                Cloud Save &amp; Refresh Revision Log
              </h3>
              <div className="divide-y divide-slate-800/70">
                {activeWorkspace.history.map((item) => (
                  <div key={item.revision} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="font-mono text-teal-400 font-semibold">
                        Revision r{item.revision} · {item.authorMachine}
                      </div>
                      <div className="font-mono text-slate-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs text-slate-200">{item.message}</div>
                    <div className="text-[11px] font-mono text-slate-400 break-all">
                      Refreshed files: {item.changedFiles.join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right 4 Columns: Save / Upload & Refresh Panel */}
        <div className="lg:col-span-4 space-y-6">
          <form
            onSubmit={handlePushStagedFiles}
            className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-5"
          >
            <div className="border-b border-slate-800/80 pb-3.5">
              <div className="text-xs font-mono text-teal-400">Cloud Push &amp; Auto-Relink</div>
              <h3 className="text-base font-semibold text-white mt-0.5">
                Save, Upload &amp; Refresh Workspace Files
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Upload edited <code className="font-mono text-slate-200">.qgs/.qgz</code> projects,{' '}
                <code className="font-mono text-slate-200">.shp/.shx/.dbf/.prj</code> Shapefile sets,{' '}
                <code className="font-mono text-slate-200">.tif</code> rasters, or a <code className="font-mono text-slate-200">.zip</code> bundle. The cloud server automatically updates the files, re-links relative paths in the project XML, and increments the revision.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Your Computer / Workstation Identifier
                </label>
                <input
                  type="text"
                  value={authorMachine}
                  onChange={(e) => setAuthorMachine(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Save / Refresh Note</label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* File Picker Drop Area */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".qgs,.qgz,.shp,.shx,.dbf,.prj,.cpg,.qpj,.tif,.tiff,.gpkg,.geojson,.csv,.qml,.zip"
                  onChange={handleStageFiles}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border border-dashed border-slate-700 hover:border-teal-400 bg-slate-950/70 rounded-xl p-5 text-center transition-colors cursor-pointer space-y-1.5"
                >
                  <CloudUpload className="w-5 h-5 text-teal-400 mx-auto" />
                  <div className="text-xs font-medium text-white">
                    Select .QGS, .SHP (.dbf/.shx/.prj), .TIF, or .ZIP
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Multiple files supported — automatically sorted into ./layers/ and ./rasters/
                  </div>
                </button>
              </div>

              {/* Staged Files List */}
              {stagedFiles.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Staged for Cloud Upload ({stagedFiles.length})</span>
                    <button
                      type="button"
                      onClick={() => setStagedFiles([])}
                      className="text-rose-400 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 text-xs font-mono text-slate-300">
                    {stagedFiles.map((f, idx) => (
                      <div key={`${f.name}-${idx}`} className="flex items-center justify-between">
                        <span className="truncate max-w-[200px]">{f.name}</span>
                        <span className="text-slate-500">{formatBytes(f.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={pushing || stagedFiles.length === 0}
                className="w-full py-2.5 px-4 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 disabled:opacity-40 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <CloudUpload className="w-4 h-4" />
                <span>
                  {pushing
                    ? 'Uploading & Refreshing Cloud...'
                    : `Upload & Refresh Cloud (${stagedFiles.length} File${stagedFiles.length === 1 ? '' : 's'})`}
                </span>
              </button>
            </div>

            {/* Instant Test Action for Demoing Save & Refresh */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <div className="text-xs text-slate-400">
                Want to test how a QGIS save-refresh updates the cloud revision in real time?
              </div>
              <button
                type="button"
                onClick={handleSimulateLiveSaveRefresh}
                disabled={pushing}
                className="w-full py-2 px-3 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pushing ? 'animate-spin' : ''}`} />
                <span>Simulate QGIS Save &amp; Cloud Refresh</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
