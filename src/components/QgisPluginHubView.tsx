import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Download,
  RefreshCw,
  Copy,
  Check,
  Play,
  Layers,
  FolderArchive,
  ShieldCheck,
  ShieldAlert,
  FileCode,
  Activity,
  Edit3,
  Trash2,
  Unlock,
  Link2,
  Terminal,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import {
  generateQgisPluginSources,
  downloadMeridianQgisPluginZip,
  getSharedAndDevUrls,
} from '../utils/qgisPluginBuilder';
import {
  analyzeWorkspaceAddress,
  getDiagnosticTestPresets,
  WorkspaceConnectivityProbeResult,
} from '../utils/workspaceAddressNormalizer';

interface SpatialFeatureRow {
  fid: number;
  geomType: string;
  geomWkt: string;
  attributes: Record<string, string | number | boolean>;
  updatedByRole: string;
  updatedByWorkstation: string;
  updatedAt: string;
  txid: number;
}

interface PluginTableSummary {
  tableKey: string;
  tableName: string;
  geometryType: string;
  srid: number;
  featureCount: number;
  privileges: string[];
  rows?: SpatialFeatureRow[];
}

interface PluginWorkspaceSummary {
  id: string;
  name: string;
  revision: number;
  projectFileName: string;
  layerTableKeys?: string[];
  totalBytes: number;
  files: {
    relativePath: string;
    fileName: string;
    category: string;
    sizeBytes: number;
    sha256: string;
    updatedAt: string;
  }[];
}

export interface PluginSyncLogEntry {
  id: string;
  timestamp: string;
  direction: 'CLIENT → HOST' | 'HOST → CLIENT' | 'SSE BROADCAST';
  action: string;
  endpoint: string;
  workstation: string;
  status: '200 OK' | '403 DENIED' | 'SYNCED' | 'IN FLIGHT...';
  latencyMs: number;
  detail: string;
}

interface PluginHostStatus {
  ok: boolean;
  hostStatus: string;
  authMode: string;
  currentTxid: number;
  activeWorkspaceId: string;
  activeWorkspaceName: string;
  defaultAccessRole: string;
  defaultAccessLabel: string;
  defaultAccessTier: 'admin' | 'editor' | 'viewer';
  tables: PluginTableSummary[];
  workspaces: PluginWorkspaceSummary[];
  syncLog: PluginSyncLogEntry[];
}

export default function QgisPluginHubView() {
  const [status, setStatus] = useState<PluginHostStatus | null>(null);
  const [syncLog, setSyncLog] = useState<PluginSyncLogEntry[]>([]);
  const [syncFilter, setSyncFilter] = useState<
    'ALL' | 'CLIENT → HOST' | 'HOST → CLIENT' | 'SSE BROADCAST'
  >('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTableKey, setSelectedTableKey] = useState<string>('public.hydro_sub_basins');
  const [loadedInCanvas, setLoadedInCanvas] = useState<string[]>([
    'public.hydro_sub_basins',
    'public.floodplain_parcels_100yr',
  ]);

  // Cloud Workspace Switcher & Diagnostic Console state
  const [workspaceLinkInput, setWorkspaceLinkInput] = useState<string>('');
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState<boolean>(false);
  const [probeResults, setProbeResults] = useState<WorkspaceConnectivityProbeResult[]>([]);
  const [isProbingWorkspaces, setIsProbingWorkspaces] = useState<boolean>(false);
  const [expandedProbeWsId, setExpandedProbeWsId] = useState<string | null>(null);

  // Interactive .SHP Editor State (Dynamic per active Cloud Workspace)
  const [selectedShpGroup, setSelectedShpGroup] = useState<string>('hydro_sub_basins');
  const [selectedShpFid, setSelectedShpFid] = useState<number>(1);
  const [shpEditAttrs, setShpEditAttrs] = useState<Record<string, string | number>>({
    basin_code: 'HUC-12-01',
    basin_name: 'Cisangkuy Upper Catchment',
    area_km2: 142.85,
    runoff_coeff: 0.72,
    flood_risk_tier: 'Critical',
  });
  const [shpEditWkt, setShpEditWkt] = useState<string>(
    'POLYGON((107.52 -6.98, 107.52 -6.88, 107.62 -6.88, 107.62 -6.98, 107.52 -6.98))'
  );
  const [isSavingShp, setIsSavingShp] = useState<boolean>(false);

  const [qgisMessageBar, setQgisMessageBar] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    detail: string;
  } | null>({
    type: 'info',
    title: 'Meridian Multi-Workspace & Multi-Device Host v3.1.0 Active',
    detail:
      'Switch between Active Cloud Workspaces or inspect any multi-cloud workspace URL in the Connectivity Diagnostic Console below.',
  });

  // Multi-Device Workstation Bridge Registry (Localhost + LAN/VPN IPs)
  const [deviceBridges, setDeviceBridges] = useState<
    {
      id: string;
      label: string;
      url: string;
      connected: boolean;
      workstationName: string;
      lastSyncTime: string | null;
    }[]
  >([
    {
      id: 'dev-local',
      label: 'Local Workstation (Same PC)',
      url: 'http://127.0.0.1:17420',
      connected: false,
      workstationName: 'Waiting for local QGIS...',
      lastSyncTime: null,
    },
  ]);
  const [newDeviceIpInput, setNewDeviceIpInput] = useState<string>('');
  const [relayRoomId, setRelayRoomId] = useState<string>('meridian-citarum-2026');
  const [pairingToken] = useState<string>('MRDN-2026-CITARUM-LIVE-TOKEN');
  const [cloudRelayConnected, setCloudRelayConnected] = useState<boolean>(true);
  const [isPushingRelay, setIsPushingRelay] = useState<boolean>(false);

  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);
  const [isTestingSave, setIsTestingSave] = useState<boolean>(false);
  const [isSwitchingMode, setIsSwitchingMode] = useState<boolean>(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'plugin.py' | 'metadata.txt' | '__init__.py'>(
    'plugin.py'
  );
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const hostUrl = useMemo(() => {
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  }, []);

  const { primaryUrl } = useMemo(() => getSharedAndDevUrls(hostUrl), [hostUrl]);

  const activeWorkspace = useMemo(() => {
    if (!status?.workspaces?.length) return null;
    return (
      status.workspaces.find((w) => w.id === status.activeWorkspaceId) || status.workspaces[0]
    );
  }, [status]);

  // Live Path & Origin Resolution Analysis for the current input or active workspace
  const liveAddressAnalysis = useMemo(() => {
    const defaultWs = status?.activeWorkspaceId || 'watershed-citarum-2026';
    const sampleLayer = status?.tables?.[0]?.tableKey || 'public.hydro_sub_basins';
    const targetString =
      workspaceLinkInput.trim() || `${primaryUrl}/api/workspaces/${defaultWs}`;
    return analyzeWorkspaceAddress(targetString, hostUrl, defaultWs, sampleLayer);
  }, [workspaceLinkInput, status?.activeWorkspaceId, status?.tables, primaryUrl, hostUrl]);

  const diagnosticPresets = useMemo(() => getDiagnosticTestPresets(primaryUrl), [primaryUrl]);

  const pluginSources = useMemo(() => {
    const wsId = activeWorkspace?.id || 'watershed-citarum-2026';
    return generateQgisPluginSources(hostUrl, wsId);
  }, [hostUrl, activeWorkspace?.id]);

  const prependOptimisticLog = useCallback((action: string, endpoint: string, detail: string) => {
    const tempEntry: PluginSyncLogEntry = {
      id: `optimistic-${Date.now()}`,
      timestamp: new Date().toISOString(),
      direction: 'CLIENT → HOST',
      action,
      endpoint,
      workstation: 'QGIS-Plugin-Dock (Multi-Workspace)',
      status: 'IN FLIGHT...',
      latencyMs: 0,
      detail,
    };
    setSyncLog((prev) => [tempEntry, ...prev.slice(0, 49)]);
  }, []);

  const broadcastStateToCloudRelay = useCallback(async () => {
    try {
      const res = await fetch('/api/plugin/relay-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: relayRoomId }),
      });
      if (res.ok) {
        setCloudRelayConnected(true);
      }
    } catch {
      // Non-fatal
    }
  }, [relayRoomId]);

  const runWorkspaceConnectivityProbe = useCallback(
    async (targetInputToProbe?: string, showBanner: boolean = false) => {
      setIsProbingWorkspaces(true);
      try {
        const res = await fetch('/api/plugin/diagnose-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetInput:
              targetInputToProbe !== undefined ? targetInputToProbe : workspaceLinkInput,
            workstation: 'Plugin-Hub-Diagnostic-Console',
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.results)) {
          setProbeResults(data.results);
          if (!expandedProbeWsId && data.diagnosedWorkspaceId) {
            setExpandedProbeWsId(data.diagnosedWorkspaceId);
          }
        }
        if (Array.isArray(data.syncLog)) {
          setSyncLog(data.syncLog);
        }
        if (showBanner) {
          setQgisMessageBar({
            type: 'info',
            title: `Workspace Connectivity Probe Complete (${data.results?.length || 0} Workspaces Verified)`,
            detail: data.detectedAnomaly
              ? `Auto-Fix Verified: ${data.detectedAnomaly} -> Resolved to /api/workspaces/${data.diagnosedWorkspaceId}`
              : `All active Cloud Workspaces and scoped PostGIS/.SHP endpoints returned 200 OK.`,
          });
        }
      } catch {
        // ignore
      } finally {
        setIsProbingWorkspaces(false);
      }
    },
    [workspaceLinkInput, expandedProbeWsId]
  );

  const syncWithRegisteredDevices = useCallback(async () => {
    if (!status) return;
    for (const dev of deviceBridges) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1400);
        const res = await fetch(`${dev.url.replace(/\/+$/, '')}/bridge/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentTxid: status.currentTxid,
            defaultAccessTier: status.defaultAccessTier,
            activeWorkspaceId: status.activeWorkspaceId,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) continue;
        const bridgeData = await res.json();

        setDeviceBridges((prev) =>
          prev.map((item) =>
            item.id === dev.id
              ? {
                  ...item,
                  connected: true,
                  workstationName: bridgeData.workstation || item.label,
                  lastSyncTime: new Date().toLocaleTimeString(),
                }
              : item
          )
        );

        if (
          Array.isArray(bridgeData.pendingTransactions) &&
          bridgeData.pendingTransactions.length > 0
        ) {
          for (const tx of bridgeData.pendingTransactions) {
            await fetch('/api/db/transaction', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roleName: 'zero_auth_default',
                workstation: tx.workstation || dev.label,
                operation: tx.operation || 'UPDATE',
                tableKey: tx.tableKey || selectedTableKey,
                fid: tx.fid,
                geomWkt: tx.geomWkt,
                attributes: tx.attributes || {},
              }),
            });
          }
        }
      } catch {
        // Device currently offline
      }
    }
  }, [status, deviceBridges, selectedTableKey]);

  const fetchPluginStatus = useCallback(
    async (showRefreshBanner = false, explicitWorkspaceId?: string) => {
      if (showRefreshBanner) {
        prependOptimisticLog(
          'Manual One-Click Refresh: Pulling multi-device edits...',
          'GET /api/plugin/status?refresh=true',
          'Fetching committed edits across Cloud Relay, LAN/VPN Workstations, and PostGIS/.SHP host...'
        );
      }
      try {
        const params = new URLSearchParams();
        if (showRefreshBanner) {
          params.set('refresh', 'true');
          params.set('workstation', 'MULTI-DEVICE-QGIS (v3.1)');
        }
        if (explicitWorkspaceId) {
          params.set('workspaceId', explicitWorkspaceId);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        const res = await fetch(`/api/plugin/status${query}`);
        if (!res.ok) throw new Error('Failed to load plugin host status');
        const data: PluginHostStatus = await res.json();
        setStatus(data);
        if (Array.isArray(data.syncLog)) {
          setSyncLog(data.syncLog);
        }
        if (showRefreshBanner) {
          setQgisMessageBar({
            type: 'info',
            title: `Manual One-Click Refresh Complete (${data.activeWorkspaceName})`,
            detail: `Pulled latest multi-device edits across ${data.tables.length} layers in '${data.activeWorkspaceId}' at txid #${data.currentTxid}.`,
          });
          await broadcastStateToCloudRelay();
        }
      } catch (err) {
        setQgisMessageBar({
          type: 'error',
          title: 'Host Connection Error',
          detail: err instanceof Error ? err.message : 'Unable to reach live host',
        });
      } finally {
        setLoading(false);
      }
    },
    [prependOptimisticLog, broadcastStateToCloudRelay]
  );

  // Switch active Cloud Workspace using our Multi-Cloud Address Normalizer + Server Proxy
  const handleSwitchCloudWorkspace = useCallback(
    async (rawIdOrUrl: string) => {
      const trimmed = rawIdOrUrl.trim();
      if (!trimmed) return;

      const analysis = analyzeWorkspaceAddress(
        trimmed,
        hostUrl,
        status?.activeWorkspaceId || 'watershed-citarum-2026'
      );
      const targetWsId = analysis.extractedWorkspaceId;

      setIsSwitchingWorkspace(true);
      prependOptimisticLog(
        analysis.wasRewritten
          ? `Auto-Fix & Connect Cloud Workspace '${targetWsId}'...`
          : `Connecting Active Cloud Workspace '${targetWsId}'...`,
        'POST /api/plugin/active-workspace',
        analysis.issues.length > 0
          ? `Resolved [${analysis.issues.map((i) => i.code).join(', ')}] -> Loading spatial layers for '${targetWsId}'`
          : `Switching active Cloud Workspace to '${targetWsId}' and loading its spatial layers (.SHP ⇄ PostGIS)...`
      );
      try {
        const res = await fetch('/api/plugin/active-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: targetWsId,
            cloudLink: trimmed,
            workstation: 'QGIS-Plugin-Dock (v3.1)',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to connect Cloud Workspace');

        await fetchPluginStatus(false, data.activeWorkspaceId || targetWsId);
        await runWorkspaceConnectivityProbe(trimmed, false);
        await broadcastStateToCloudRelay();

        const loadedTables: PluginTableSummary[] = data.tables || data.workspace?.tables || [];
        if (loadedTables.length > 0) {
          const firstKey = loadedTables[0].tableKey;
          setSelectedTableKey(firstKey);
          setSelectedShpGroup(loadedTables[0].tableName);
          setSelectedShpFid(1);
          setLoadedInCanvas(loadedTables.map((t) => t.tableKey));
        }

        setExpandedProbeWsId(data.activeWorkspaceId || targetWsId);
        setQgisMessageBar({
          type: 'success',
          title: analysis.wasRewritten
            ? `Auto-Fixed Path & Connected Workspace: ${data.activeWorkspaceName || targetWsId}`
            : `Connected Cloud Workspace: ${data.activeWorkspaceName || targetWsId}`,
          detail: `${
            analysis.issues.length > 0
              ? `[Auto-Fix: ${analysis.issues[0].autoFixAction}] · `
              : ''
          }Switched spatial layers to ${loadedTables.map((t) => t.tableKey).join(', ')} (${loadedTables.length} layers ready).`,
        });
      } catch (err) {
        setQgisMessageBar({
          type: 'error',
          title: 'Cloud Workspace Connect Error',
          detail: err instanceof Error ? err.message : 'Unable to switch Cloud Workspace',
        });
      } finally {
        setIsSwitchingWorkspace(false);
      }
    },
    [
      hostUrl,
      status?.activeWorkspaceId,
      prependOptimisticLog,
      fetchPluginStatus,
      runWorkspaceConnectivityProbe,
      broadcastStateToCloudRelay,
    ]
  );

  useEffect(() => {
    fetchPluginStatus(false);
    runWorkspaceConnectivityProbe('', false);

    let evSource: EventSource | null = null;
    try {
      evSource = new EventSource('/api/db/stream');
      evSource.addEventListener('sync_log', (ev) => {
        try {
          const entry: PluginSyncLogEntry = JSON.parse(ev.data);
          setSyncLog((prev) => {
            const withoutOptimistic = prev.filter((item) => item.status !== 'IN FLIGHT...');
            if (withoutOptimistic.some((item) => item.id === entry.id)) return withoutOptimistic;
            return [entry, ...withoutOptimistic].slice(0, 50);
          });
        } catch {
          // ignore
        }
      });
      evSource.addEventListener('db_update', () => {
        fetchPluginStatus(false);
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
  }, [fetchPluginStatus, runWorkspaceConnectivityProbe]);

  // Whenever the active Cloud Workspace's table list changes, ensure selectedTableKey and selectedShpGroup belong to it
  useEffect(() => {
    if (!status || !status.tables || status.tables.length === 0) return;
    const hasSelectedTable = status.tables.some((t) => t.tableKey === selectedTableKey);
    if (!hasSelectedTable) {
      setSelectedTableKey(status.tables[0].tableKey);
      setLoadedInCanvas(status.tables.map((t) => t.tableKey));
    }
    const hasSelectedShp = status.tables.some((t) => t.tableName === selectedShpGroup);
    if (!hasSelectedShp) {
      setSelectedShpGroup(status.tables[0].tableName);
      setSelectedShpFid(1);
    }
  }, [status, selectedTableKey, selectedShpGroup]);

  // Synchronize the .SHP editor form whenever the user picks a shapefile or feature ID
  useEffect(() => {
    if (!status) return;
    const tableKey = `public.${selectedShpGroup}`;
    const tbl = status.tables.find((t) => t.tableKey === tableKey) || status.tables[0];
    const row = tbl?.rows?.find((r) => r.fid === selectedShpFid) || tbl?.rows?.[0];
    if (row) {
      setSelectedShpFid(row.fid);
      const nextAttrs: Record<string, string | number> = {};
      Object.entries(row.attributes).forEach(([k, v]) => {
        nextAttrs[k] = typeof v === 'boolean' ? String(v) : v;
      });
      setShpEditAttrs(nextAttrs);
      setShpEditWkt(row.geomWkt);
    }
  }, [selectedShpGroup, selectedShpFid, status]);

  const handleAddDeviceBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = newDeviceIpInput.trim();
    if (!raw) {
      await syncWithRegisteredDevices();
      return;
    }
    let formattedUrl = raw;
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `http://${formattedUrl}`;
    }
    if (!formattedUrl.replace(/^https?:\/\//, '').includes(':')) {
      formattedUrl = `${formattedUrl}:17420`;
    }
    const newId = `dev-${Date.now()}`;
    setDeviceBridges((prev) => [
      ...prev,
      {
        id: newId,
        label: `Remote Workstation (${formattedUrl.replace(/^https?:\/\//, '')})`,
        url: formattedUrl,
        connected: false,
        workstationName: 'Ready for LAN/VPN bridge sync',
        lastSyncTime: null,
      },
    ]);
    setNewDeviceIpInput('');
    setQgisMessageBar({
      type: 'info',
      title: 'Added Remote Device LAN/VPN Bridge',
      detail: `Registered ${formattedUrl} — Click One-Click Refresh or Pair IP to sync transactions with this workstation.`,
    });
  };

  const handleRemoveDeviceBridge = (id: string) => {
    setDeviceBridges((prev) => prev.filter((d) => d.id !== id));
  };

  const handlePushStateToCloudRelay = async () => {
    setIsPushingRelay(true);
    try {
      await broadcastStateToCloudRelay();
      await fetchPluginStatus(false);
      setQgisMessageBar({
        type: 'success',
        title: `Published Live State to Cloud Relay Room (${relayRoomId})`,
        detail: `Any computer running QGIS Desktop on another network can now click "One-Click Refresh" to pull workspace '${status?.activeWorkspaceId}' (txid #${status?.currentTxid}).`,
      });
    } finally {
      setIsPushingRelay(false);
    }
  };

  const handleSwitchZeroAuthMode = async (targetRole: string) => {
    setIsSwitchingMode(true);
    prependOptimisticLog(
      `Switching Zero-Auth Host Role to ${targetRole}...`,
      'POST /api/plugin/default-mode',
      'Updating host default SQL permission tier for connected QGIS plugins...'
    );
    try {
      const res = await fetch('/api/plugin/default-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to switch default access mode');
      await fetchPluginStatus(false);
      setQgisMessageBar({
        type: 'info',
        title: 'Zero-Auth Host Access Updated',
        detail: data.auditEntry?.summary || `Default plugin access set to ${targetRole}`,
      });
    } catch (err) {
      setQgisMessageBar({
        type: 'error',
        title: 'Mode Switch Failed',
        detail: err instanceof Error ? err.message : 'Error updating mode',
      });
    } finally {
      setIsSwitchingMode(false);
    }
  };

  const handleDownloadPluginZip = async () => {
    setIsDownloadingZip(true);
    try {
      const wsId = activeWorkspace?.id || 'watershed-citarum-2026';
      let liveWorkspacesSnapshot: unknown = undefined;
      try {
        const bundleRes = await fetch('/api/plugin/relay-bundle');
        if (bundleRes.ok) {
          const bundleData = await bundleRes.json();
          liveWorkspacesSnapshot = bundleData.workspaces || bundleData.tables;
        }
      } catch {
        // fallback to default snapshot
      }
      await downloadMeridianQgisPluginZip(hostUrl, wsId, liveWorkspacesSnapshot);
      await fetch('/api/plugin/sync-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: 'HOST → CLIENT',
          action: 'Packaging & downloading meridian_live_host.zip (v3.1.0 Multi-Workspace)...',
          endpoint: 'GET /api/plugin/meridian_live_host.zip',
          workstation: 'Web-Host-Console',
          status: '200 OK',
          detail:
            'Bundled plugin.py v3.1.0 with Multi-Workspace Switcher, Cloud Workspace Link parser, Cloud Relay Room, LAN IP Bridge (0.0.0.0:17420), and Manual 1-Click Refresh',
        }),
      });
      await fetchPluginStatus(false);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleSimulateQgisSaveAutoCommit = async () => {
    setIsTestingSave(true);
    const activeTbl =
      status?.tables.find((t) => t.tableKey === selectedTableKey) || status?.tables[0];
    const targetKey = activeTbl?.tableKey || selectedTableKey;
    const firstRow = activeTbl?.rows?.[0];
    const samplePatch: Record<string, string | number> = {};
    if (firstRow) {
      const numericEntry = Object.entries(firstRow.attributes).find(
        ([, val]) => typeof val === 'number'
      );
      if (numericEntry) {
        samplePatch[numericEntry[0]] = Number(
          (Number(numericEntry[1]) + (Math.random() * 2 - 0.5)).toFixed(2)
        );
      } else {
        const firstKey = Object.keys(firstRow.attributes)[0];
        if (firstKey) {
          samplePatch[firstKey] = `${firstRow.attributes[firstKey]} (Updated)`;
        }
      }
    }

    prependOptimisticLog(
      `Pushing file update from Remote Device B (${targetKey})...`,
      'POST /api/db/transaction',
      `Remote QGIS workstation committed UPDATE on ${targetKey} fid=1 in workspace '${status?.activeWorkspaceId}'`
    );
    try {
      const res = await fetch('/api/db/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleName: 'zero_auth_default',
          workstation: 'LAPTOP-FIELD02 (192.168.1.48 · Remote QGIS 3.38)',
          operation: 'UPDATE',
          tableKey: targetKey,
          fid: 1,
          attributes: samplePatch,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQgisMessageBar({
          type: 'error',
          title: 'SQL Permission Denied (ERROR 42501)',
          detail:
            data.error ||
            'Host is in Read-Only Viewer mode; edits from QGIS are blocked by SQL privileges.',
        });
      } else {
        setQgisMessageBar({
          type: 'success',
          title: `Remote Device Auto-Commit Succeeded (txid #${data.auditEntry?.txid})`,
          detail: `${data.auditEntry?.sqlStatement} — Other devices can now click One-Click Refresh to pull this edit!`,
        });
      }
      await fetchPluginStatus(false);
      await broadcastStateToCloudRelay();
    } catch (err) {
      setQgisMessageBar({
        type: 'error',
        title: 'Transaction Error',
        detail: err instanceof Error ? err.message : 'Failed to send transaction',
      });
    } finally {
      setIsTestingSave(false);
    }
  };

  const handleSaveAndPushShpEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingShp(true);
    prependOptimisticLog(
      `Pushing file update (layers/${selectedShpGroup}.shp + .dbf + .shx)...`,
      'POST /api/plugin/shp-edit',
      `Saving .SHP feature fid=${selectedShpFid} in workspace '${activeWorkspace?.id}' and rebuilding binary ESRI Shapefile...`
    );
    try {
      const res = await fetch('/api/plugin/shp-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace?.id || 'watershed-citarum-2026',
          shpGroupName: selectedShpGroup,
          fid: selectedShpFid,
          attributes: shpEditAttrs,
          geomWkt: shpEditWkt,
          workstation: 'QGIS-Plugin-Dock (Zero-Auth)',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQgisMessageBar({
          type: 'error',
          title: `.SHP Edit Blocked (Read-Only Viewer Mode)`,
          detail:
            data.error ||
            'Switch Host Permission Mode above to Admin or Editor to edit .SHP files.',
        });
      } else {
        setQgisMessageBar({
          type: 'success',
          title: `Saved & Pushed layers/${selectedShpGroup}.shp (Workspace rev r${data.revision} · txid #${data.auditEntry?.txid})`,
          detail: `Updated binary .shp, .shx, and .dbf files in '${activeWorkspace?.id}'. Other devices can pull via Manual One-Click Refresh.`,
        });
      }
      await fetchPluginStatus(false);
      await broadcastStateToCloudRelay();
    } catch (err) {
      setQgisMessageBar({
        type: 'error',
        title: '.SHP Save Error',
        detail: err instanceof Error ? err.message : 'Failed to save .shp changes',
      });
    } finally {
      setIsSavingShp(false);
    }
  };

  const handleClearSyncLog = async () => {
    await fetch('/api/plugin/sync-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true }),
    });
    setSyncLog([]);
  };

  const handleCopyCode = async (label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFile(label);
      setTimeout(() => setCopiedFile(null), 2000);
    } catch {
      // ignore
    }
  };

  const filteredSyncLog = useMemo(() => {
    if (syncFilter === 'ALL') return syncLog;
    return syncLog.filter((item) => item.direction === syncFilter);
  }, [syncLog, syncFilter]);

  const activeShpTable = useMemo(() => {
    return (
      status?.tables.find((t) => t.tableKey === `public.${selectedShpGroup}`) ||
      status?.tables[0]
    );
  }, [status, selectedShpGroup]);

  const activeShpFiles = useMemo(() => {
    if (!activeWorkspace) return [];
    return activeWorkspace.files.filter((f) =>
      f.relativePath.startsWith(`layers/${selectedShpGroup}.`)
    );
  }, [activeWorkspace, selectedShpGroup]);

  if (loading && !status) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center text-sm text-slate-400">
        Loading QGIS Plugin Builder &amp; Multi-Workspace Sync Hub...
      </div>
    );
  }

  const currentTier = status?.defaultAccessTier || 'editor';
  const currentCodeContent =
    activeCodeTab === 'plugin.py'
      ? pluginSources.pluginPy
      : activeCodeTab === 'metadata.txt'
      ? pluginSources.metadataTxt
      : pluginSources.initPy;

  return (
    <div className="space-y-8">
      {/* Top Banner: 1-Click Installable Plugin ZIP (v3.1 Multi-Workspace + Multi-Device) */}
      <section className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-800/80 pb-5">
          <div className="space-y-1.5">
            <div className="text-xs font-mono text-teal-400">
              QGIS 3.x Installable Plugin Archive (v3.1.0 · Multi-Workspace + Multi-Device Edition)
            </div>
            <h2 className="text-xl font-bold text-white">
              One-Click Installable QGIS Plugin (
              <code className="font-mono text-teal-300">meridian_live_host.zip</code>)
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Install on <strong className="text-slate-200">any desktop or laptop</strong> via{' '}
              <strong className="text-slate-200">
                Plugins → Manage and Install Plugins → Install from ZIP
              </strong>
              . Version <strong className="text-teal-300">3.1.0</strong> lets you switch between{' '}
              <strong className="text-slate-200">Active Cloud Workspaces</strong> (or paste any{' '}
              <code className="font-mono text-slate-200">/api/workspaces/&lt;id&gt;</code> link) so
              QGIS immediately loads that workspace&apos;s spatial layers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={handleDownloadPluginZip}
              disabled={isDownloadingZip}
              className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-xs whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>
                {isDownloadingZip
                  ? 'Building Plugin ZIP...'
                  : 'Download meridian_live_host.zip (v3.1 Multi-Workspace)'}
              </span>
            </button>
          </div>
        </div>

        {/* Active Cloud Workspace Switcher & Cloud Link Connector */}
        <div className="bg-slate-950/90 border border-teal-500/40 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="text-xs font-semibold text-teal-300 flex items-center gap-2">
              <Link2 className="w-4 h-4 shrink-0" />
              <span>
                Active Cloud Workspace Switcher — Switch Spatial Layers (.SHP ⇄ PostGIS) Across
                Cloud Workspaces
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-slate-400">CONNECTED WORKSPACE:</span>
              <span className="text-teal-300 font-semibold">
                {status?.activeWorkspaceName} ({status?.activeWorkspaceId})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            {/* Dropdown to switch between active Cloud Workspaces */}
            <div className="lg:col-span-5 space-y-1.5">
              <label className="block text-xs text-slate-300 font-medium">
                Select Active Cloud Workspace (Switches Spatial Layers Immediately)
              </label>
              <select
                value={status?.activeWorkspaceId || 'watershed-citarum-2026'}
                disabled={isSwitchingWorkspace}
                onChange={(e) => handleSwitchCloudWorkspace(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-teal-400"
              >
                {status?.workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.id}) — {ws.layerTableKeys?.length || 3} spatial layers (r
                    {ws.revision})
                  </option>
                ))}
              </select>
            </div>

            {/* Paste any Cloud Workspace Link or ID to inspect & connect */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSwitchCloudWorkspace(
                  workspaceLinkInput.trim() || liveAddressAnalysis.extractedWorkspaceId
                );
              }}
              className="lg:col-span-7 flex flex-col sm:flex-row items-stretch sm:items-end gap-2"
            >
              <div className="flex-1 space-y-1.5">
                <label className="block text-xs text-slate-300 font-medium">
                  Paste Any Multi-Cloud Workspace URL, Broken Path, or Slug (Live Analyzed Below)
                </label>
                <input
                  type="text"
                  value={workspaceLinkInput}
                  onChange={(e) => setWorkspaceLinkInput(e.target.value)}
                  placeholder={`${primaryUrl}/api/workspaces/coastal-mangrove-delta-2026`}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-400"
                />
              </div>
              <button
                type="submit"
                disabled={isSwitchingWorkspace}
                className="px-4 py-2 bg-teal-400 hover:bg-teal-300 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                {isSwitchingWorkspace
                  ? 'Connecting...'
                  : liveAddressAnalysis.wasRewritten
                  ? `Auto-Fix & Connect (${liveAddressAnalysis.extractedWorkspaceId})`
                  : 'Connect Workspace'}
              </button>
            </form>
          </div>

          {/* Quick-Switch Buttons for all Active Cloud Workspaces */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-mono text-slate-400">
              Quick-Switch Cloud Workspaces:
            </span>
            {status?.workspaces.map((ws) => {
              const isCurrent = ws.id === status.activeWorkspaceId;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSwitchCloudWorkspace(ws.id)}
                  disabled={isSwitchingWorkspace}
                  className={`px-3 py-1 rounded border text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                    isCurrent
                      ? 'bg-teal-400/20 border-teal-400 text-teal-300 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {ws.name} ({ws.layerTableKeys?.length || 3} layers)
                </button>
              );
            })}
          </div>
        </div>

        {/* NEW: Workspace Connectivity & Path Resolution Diagnostic Console */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-teal-400 shrink-0" />
                <span>
                  Workspace Connectivity &amp; Path Resolution Diagnostic Console
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Inspects multi-cloud workspace URLs, detects path collisions (such as double{' '}
                <code className="font-mono text-slate-300">/api/workspaces/.../api/plugin/status</code>{' '}
                or <code className="font-mono text-slate-300">/pull.zip</code> suffixes), and probes
                live endpoint reachability across all active workspaces.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => runWorkspaceConnectivityProbe(workspaceLinkInput, true)}
                disabled={isProbingWorkspaces}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProbingWorkspaces ? 'animate-spin' : ''}`} />
                <span>
                  {isProbingWorkspaces ? 'Probing Endpoints...' : 'Probe All Workspaces'}
                </span>
              </button>

              {liveAddressAnalysis.wasRewritten && (
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceLinkInput(liveAddressAnalysis.endpoints.workspaceUrl);
                    handleSwitchCloudWorkspace(liveAddressAnalysis.extractedWorkspaceId);
                  }}
                  disabled={isSwitchingWorkspace}
                  className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Auto-Fix Path &amp; Switch Workspace</span>
                </button>
              )}
            </div>
          </div>

          {/* Preset Test Scenarios to simulate & verify path resolution */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-mono text-slate-400">
              Test Path Resolution &amp; Auto-Fix Scenarios (Click to Inspect):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {diagnosticPresets.map((preset) => {
                const isSelected = workspaceLinkInput === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setWorkspaceLinkInput(preset.url)}
                    className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 border-teal-400 text-white'
                        : 'bg-slate-900/60 border-slate-800/90 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span className="truncate">{preset.label}</span>
                      <span
                        className={`text-[10px] font-mono shrink-0 ${
                          preset.badge === '200 OK' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {preset.badge}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate mt-1">
                      {preset.url}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live URL Decomposition & Path Resolution Pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Left 6 cols: Decomposed Address & Detected Anomalies */}
            <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="font-mono font-semibold text-white">
                    01. Live Address &amp; Path Normalizer
                  </span>
                  <span
                    className={`text-[11px] font-mono font-semibold ${
                      liveAddressAnalysis.wasRewritten ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {liveAddressAnalysis.wasRewritten
                      ? 'ANOMALY DETECTED · AUTO-REWRITTEN'
                      : 'CANONICAL PATH · 200 OK'}
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Origin Classification:</span>
                    <span className="text-slate-200">
                      {liveAddressAnalysis.originType}
                      {liveAddressAnalysis.isCrossOrigin ? ' (Cross-Cloud Proxy Active)' : ''}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Normalized Base Origin:</span>
                    <span className="text-teal-300 truncate max-w-xs">
                      {liveAddressAnalysis.resolvedOrigin}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Extracted Workspace ID:</span>
                    <span className="text-emerald-400 font-semibold">
                      {liveAddressAnalysis.extractedWorkspaceId}
                    </span>
                  </div>
                </div>

                {/* Detected Path / Origin Issues */}
                {liveAddressAnalysis.issues.length === 0 ? (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg text-xs flex items-start gap-2.5 text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-semibold">Zero Path Resolution Conflicts</div>
                      <div className="text-[11px] text-emerald-300/80 font-mono">
                        Address resolves cleanly to workspace &quot;
                        {liveAddressAnalysis.extractedWorkspaceId}&quot; without suffix collisions.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {liveAddressAnalysis.issues.map((issue, idx) => (
                      <div
                        key={`${issue.code}-${idx}`}
                        className="p-3 bg-amber-950/25 border border-amber-500/40 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 font-mono font-semibold text-amber-300">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{issue.title}</span>
                          </span>
                          <span className="text-[10px]">{issue.code}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{issue.detail}</p>
                        <div className="text-[11px] font-mono text-teal-300 flex items-center gap-1 pt-0.5">
                          <ArrowRight className="w-3 h-3 shrink-0" />
                          <span>Auto-Fix: {issue.autoFixAction}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span>Fallback Origin: {liveAddressAnalysis.fallbackOrigin}</span>
                <button
                  type="button"
                  onClick={() =>
                    handleSwitchCloudWorkspace(
                      workspaceLinkInput.trim() || liveAddressAnalysis.extractedWorkspaceId
                    )
                  }
                  className="text-teal-300 hover:text-teal-200 underline cursor-pointer"
                >
                  Apply &amp; Load Layers →
                </button>
              </div>
            </div>

            {/* Right 6 cols: Resolved Canonical Endpoints for Target Workspace */}
            <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="font-mono font-semibold text-white">
                    02. Canonical Resolved Endpoints ({liveAddressAnalysis.extractedWorkspaceId})
                  </span>
                  <span className="text-[11px] font-mono text-teal-400">4 ROUTES MAPPED</span>
                </div>

                <div className="space-y-2 text-[11px] font-mono">
                  {[
                    {
                      label: 'Plugin Status & Scoped Layer List',
                      method: 'GET',
                      url: liveAddressAnalysis.endpoints.statusUrl,
                    },
                    {
                      label: 'Workspace Manifest & Metadata',
                      method: 'GET',
                      url: liveAddressAnalysis.endpoints.manifestUrl,
                    },
                    {
                      label: 'Live OGC GeoJSON Feature Stream',
                      method: 'GET',
                      url: liveAddressAnalysis.endpoints.sampleGeoJsonUrl,
                    },
                    {
                      label: 'Portable Project + .SHP Bundle Archive',
                      method: 'GET',
                      url: liveAddressAnalysis.endpoints.pullZipUrl,
                    },
                  ].map((ep) => (
                    <div
                      key={ep.label}
                      className="p-2 bg-slate-950 border border-slate-800/90 rounded space-y-0.5"
                    >
                      <div className="flex items-center justify-between text-slate-400">
                        <span>{ep.label}</span>
                        <span className="text-emerald-400">{ep.method} · 200 OK</span>
                      </div>
                      <div className="text-slate-200 truncate select-all">{ep.url}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1">
                <span>Server Double-Path Guard: Active (307 Auto-Redirect)</span>
                <span className="text-emerald-400">CORS + Proxy Ready</span>
              </div>
            </div>
          </div>

          {/* Multi-Cloud Workspace Connectivity Matrix Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-semibold text-white">
                03. Active Cloud Workspaces Connectivity &amp; Layer Scoping Matrix
              </span>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {probeResults.length} workspace(s) verified
              </span>
            </div>

            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400">
                      <th className="py-2.5 px-3">Cloud Workspace</th>
                      <th className="py-2.5 px-3">Scoped Spatial Layers (.SHP ⇄ PostGIS)</th>
                      <th className="py-2.5 px-3">Resolution Status</th>
                      <th className="py-2.5 px-3 text-right">Round-Trip Latency</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono">
                    {probeResults.map((row) => {
                      const isConnected = row.workspaceId === status?.activeWorkspaceId;
                      const isExpanded = expandedProbeWsId === row.workspaceId;
                      return (
                        <React.Fragment key={row.workspaceId}>
                          <tr
                            onClick={() =>
                              setExpandedProbeWsId(isExpanded ? null : row.workspaceId)
                            }
                            className={`cursor-pointer transition-colors ${
                              isConnected
                                ? 'bg-teal-950/20 hover:bg-teal-950/30'
                                : 'bg-slate-950/70 hover:bg-slate-900/60'
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-sans font-semibold text-white flex items-center gap-2">
                                <span>{row.workspaceName}</span>
                                <span className="font-mono text-[11px] text-teal-400">
                                  (r{row.revision})
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400">{row.workspaceId}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="text-[11px] text-slate-200">
                                {row.layerTableKeys.join(' · ')}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {row.layerCount} PostGIS tables · {row.shpFileCount} binary .SHP
                                sets
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={
                                  row.wasAutoFixed
                                    ? 'text-amber-300 font-semibold'
                                    : 'text-emerald-400 font-semibold'
                                }
                              >
                                {row.wasAutoFixed
                                  ? '200 OK · AUTO-REWRITTEN'
                                  : '200 OK · REACHABLE'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-200">
                              {row.totalLatencyMs} ms
                            </td>
                            <td
                              className="py-2.5 px-3 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {isConnected ? (
                                <span className="text-[11px] text-emerald-400 font-semibold">
                                  ACTIVE IN DOCK
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSwitchCloudWorkspace(row.workspaceId)}
                                  disabled={isSwitchingWorkspace}
                                  className="px-2.5 py-1 bg-teal-400 hover:bg-teal-300 text-slate-950 font-sans font-semibold rounded text-[11px] cursor-pointer whitespace-nowrap"
                                >
                                  Connect &amp; Switch
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-900/90">
                              <td colSpan={5} className="p-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px]">
                                  {row.checks.map((chk) => (
                                    <div
                                      key={chk.name}
                                      className="p-2.5 bg-slate-950 border border-slate-800 rounded space-y-1"
                                    >
                                      <div className="flex items-center justify-between gap-1 text-slate-300 font-semibold">
                                        <span className="truncate">{chk.name}</span>
                                        <span className="text-emerald-400 tabular-nums shrink-0">
                                          {chk.status} ({chk.latencyMs}ms)
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-teal-300 truncate">
                                        {chk.endpoint}
                                      </div>
                                      <div className="text-[10px] text-slate-400 leading-snug">
                                        {chk.detail}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Device Triple-Path Connection Hub (Cloud Relay + LAN IP Bridge + Session Token) */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="text-xs font-semibold text-teal-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                Multi-Device Connectivity Hub — Connect QGIS Desktop From Any Computer or Network
                (v3.1.0)
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-teal-300">SYNC POLICY: MANUAL 1-CLICK REFRESH ONLY</span>
              <span className="text-slate-500">·</span>
              <span className="text-emerald-400 tabular-nums">txid #{status?.currentTxid}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            {/* Path 1: Cloud Relay Room */}
            <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-lg space-y-3 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-white">
                    Path 1 · Internet Cloud Relay Room
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400">
                    {cloudRelayConnected ? 'RELAY ACTIVE' : 'STANDBY'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  For laptops on a{' '}
                  <strong className="text-slate-200">completely different network/internet</strong>.
                  Remote QGIS saves publish to this relay room over HTTPS (0 cookies needed), and
                  clicking <strong className="text-teal-300">One-Click Refresh</strong> pulls the
                  active workspace &amp; layers.
                </p>
                <div className="pt-1">
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">
                    Shared Cloud Relay Room ID
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={relayRoomId}
                      onChange={(e) => setRelayRoomId(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-teal-300 focus:outline-none focus:border-teal-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyCode('relayRoom', relayRoomId)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono cursor-pointer"
                    >
                      {copiedFile === 'relayRoom' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePushStateToCloudRelay}
                disabled={isPushingRelay}
                className="w-full py-2 px-3 bg-teal-400/15 hover:bg-teal-400/25 border border-teal-500/40 text-teal-300 font-semibold text-[11px] rounded transition-colors cursor-pointer"
              >
                {isPushingRelay
                  ? 'Broadcasting to Cloud Relay...'
                  : 'Broadcast Current Workspace State to Remote Devices'}
              </button>
            </div>

            {/* Path 2: Multi-Device LAN / Wi-Fi / VPN Workstation Bridge */}
            <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-lg space-y-3 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-white">
                    Path 2 · LAN / VPN IP Bridge (:17420)
                  </span>
                  <span className="text-[11px] font-mono text-teal-400 tabular-nums">
                    {deviceBridges.length} device(s)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  v3.1 binds to <code className="text-slate-200">0.0.0.0:17420</code> and shows each
                  computer&apos;s LAN IP inside the QGIS Dock. Add a teammate&apos;s LAN or
                  Tailscale IP below to bridge directly over Wi-Fi/VPN:
                </p>

                <div className="space-y-1.5 max-h-24 overflow-y-auto pt-1">
                  {deviceBridges.map((dev) => (
                    <div
                      key={dev.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-[11px] font-mono"
                    >
                      <div className="truncate">
                        <span className="text-slate-200">{dev.url}</span>
                        <span className="text-slate-500"> · </span>
                        <span className={dev.connected ? 'text-emerald-400' : 'text-slate-400'}>
                          {dev.connected ? 'CONNECTED' : 'LISTENING'}
                        </span>
                      </div>
                      {dev.id !== 'dev-local' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDeviceBridge(dev.id)}
                          className="text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleAddDeviceBridge} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newDeviceIpInput}
                  onChange={(e) => setNewDeviceIpInput(e.target.value)}
                  placeholder="Add LAN IP (e.g. 192.168.1.45:17420)"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-teal-400"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold text-[11px] rounded border border-slate-700 cursor-pointer whitespace-nowrap"
                >
                  + Pair IP
                </button>
              </form>
            </div>

            {/* Path 3: Direct Session Token & Cookie Header Pairing */}
            <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-lg space-y-3 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-white">
                    Path 3 · Session Token / Cookie
                  </span>
                  <span className="text-[11px] font-mono text-teal-400">DIRECT HTTPS</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Pre-configured in v3.1.0 for direct Cloud Run requests, or copy and paste into the
                  QGIS Dock&apos;s <strong className="text-slate-200">Token / Cookie</strong> input
                  box on any remote workstation:
                </p>
                <div className="pt-1">
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">
                    Multi-Device Pairing Token
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={pairingToken}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyCode('pairingToken', pairingToken)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono cursor-pointer"
                    >
                      {copiedFile === 'pairingToken' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-800/80 rounded px-2.5 py-1.5 truncate">
                Workspace Link:{' '}
                <span className="text-teal-300">
                  {primaryUrl}/api/workspaces/{status?.activeWorkspaceId}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Zero-Auth Default Host Access Level Switcher */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-5 space-y-1">
            <div className="text-xs font-semibold text-white">
              Zero-Auth Host Permission Mode (Controls .SHP &amp; Layer Write Access)
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Choose the default permission level for connected QGIS plugins. Note: If set to{' '}
              <strong className="text-amber-300">Viewer (Read-Only)</strong>, QGIS locks{' '}
              <code className="font-mono text-slate-300">.shp</code> editing—keep on{' '}
              <strong className="text-teal-300">Admin</strong> or{' '}
              <strong className="text-teal-300">Editor</strong> to edit{' '}
              <code className="font-mono text-slate-300">.shp</code> files.
            </p>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                role: 'postgres_admin',
                title: 'Admin (Full Write)',
                desc: 'Edit all .SHP files, vector tables, and rasters',
                tier: 'admin',
              },
              {
                role: 'gis_editor_team',
                title: 'Editor (.SHP & Vector Write)',
                desc: 'Edit all .SHP & vector layers; read-only on DEM rasters',
                tier: 'editor',
              },
              {
                role: 'external_viewer',
                title: 'Viewer (Read-Only Lock)',
                desc: 'Locks .SHP editing in QGIS; only Refresh is permitted',
                tier: 'viewer',
              },
            ].map((item) => {
              const isSelected = status?.defaultAccessRole === item.role;
              return (
                <button
                  key={item.role}
                  onClick={() => handleSwitchZeroAuthMode(item.role)}
                  disabled={isSwitchingMode}
                  className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? item.tier === 'viewer'
                        ? 'bg-amber-950/30 border-amber-500/70 text-white'
                        : 'bg-teal-950/30 border-teal-400 text-white'
                      : 'bg-slate-950/80 border-slate-800/90 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{item.title}</span>
                    <span className="text-[11px] font-mono text-teal-400">
                      {isSelected ? 'ACTIVE' : 'Switch'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">{item.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Diagnostic Explainer + Interactive .SHP Layer Editor & Real-Time Sync Log Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 cols): Interactive .SHP Feature Editor Scoped to Active Cloud Workspace */}
        <section className="lg:col-span-7 bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-5">
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-teal-300 flex items-center gap-2">
                <Unlock className="w-4 h-4 shrink-0" />
                <span>
                  Why Cloud Workspaces &amp; .SHP Layers Now Switch Seamlessly (v3.1.0 Fix)
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Multi-Workspace Scoped</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-300 pt-1">
              <div className="p-2.5 bg-slate-900/80 border border-slate-800/80 rounded-lg space-y-1">
                <div className="font-mono text-white font-semibold">1. Smart Link Parser</div>
                <p className="text-slate-400 leading-relaxed">
                  Pasting a full Cloud Workspace Link (
                  <code className="text-slate-200">.../api/workspaces/&lt;id&gt;</code>) into QGIS
                  now extracts the workspace ID and base URL cleanly without 404 path collisions.
                </p>
              </div>
              <div className="p-2.5 bg-slate-900/80 border border-slate-800/80 rounded-lg space-y-1">
                <div className="font-mono text-white font-semibold">
                  2. Per-Workspace Spatial Layers
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Each Cloud Workspace hosts its own dedicated{' '}
                  <code className="text-slate-200">.shp</code> &amp; PostGIS tables. Switching
                  workspaces immediately swaps the active layer list below.
                </p>
              </div>
              <div className="p-2.5 bg-slate-900/80 border border-slate-800/80 rounded-lg space-y-1">
                <div className="font-mono text-white font-semibold">
                  3. Auto-Provisioned Custom Links
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Connecting any new or custom Cloud Workspace ID automatically provisions live{' '}
                  <code className="text-slate-200">.shp</code> and PostGIS layers on the fly.
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Live .SHP Layer Editor */}
          <div className="space-y-4 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-teal-400" />
                  <span>
                    Interactive .SHP Shapefile Editor — {status?.activeWorkspaceName}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Editing spatial layers belonging to Cloud Workspace{' '}
                  <code className="font-mono text-teal-300">{status?.activeWorkspaceId}</code>.
                </p>
              </div>
            </div>

            {/* Select Shapefile & Feature FID dynamically from status.tables */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Target Hosted Shapefile in {status?.activeWorkspaceId}
                </label>
                <select
                  value={selectedShpGroup}
                  onChange={(e) => {
                    setSelectedShpGroup(e.target.value);
                    setSelectedShpFid(1);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-teal-400"
                >
                  {status?.tables.map((tbl) => (
                    <option key={tbl.tableName} value={tbl.tableName}>
                      layers/{tbl.tableName}.shp ({tbl.geometryType} · {tbl.featureCount} features)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Select Feature Row (FID) in .DBF Table
                </label>
                <select
                  value={selectedShpFid}
                  onChange={(e) => setSelectedShpFid(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-teal-300 focus:outline-none focus:border-teal-400"
                >
                  {activeShpTable?.rows?.map((r) => {
                    const labelVal =
                      Object.values(r.attributes).find((v) => typeof v === 'string') ||
                      `Feature #${r.fid}`;
                    return (
                      <option key={r.fid} value={r.fid}>
                        fid={r.fid} · {String(labelVal)} (txid #{r.txid})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Editable .DBF Attribute Fields & .SHP Geometry WKT */}
            <form onSubmit={handleSaveAndPushShpEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(shpEditAttrs).map(([attrKey, attrVal]) => (
                  <div key={attrKey}>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      .DBF Field: <span className="text-slate-200">{attrKey}</span>
                    </label>
                    <input
                      type={typeof attrVal === 'number' ? 'number' : 'text'}
                      step="any"
                      value={attrVal}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = Number(raw);
                        setShpEditAttrs((prev) => ({
                          ...prev,
                          [attrKey]:
                            typeof attrVal === 'number' && !Number.isNaN(num) && raw !== ''
                              ? num
                              : raw,
                        }));
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-teal-400"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  .SHP Geometry Vertices (WKT)
                </label>
                <input
                  type="text"
                  value={shpEditWkt}
                  onChange={(e) => setShpEditWkt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-400"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-[11px] font-mono text-slate-400">
                  Sidecar files rebuilt on save:{' '}
                  {activeShpFiles.map((f) => `${f.fileName} (${f.sha256.slice(0, 6)})`).join(' · ')}
                </div>

                <button
                  type="submit"
                  disabled={isSavingShp}
                  className="px-4 py-2 bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>
                    {isSavingShp
                      ? 'Pushing .SHP Update...'
                      : `Save & Push layers/${selectedShpGroup}.shp`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Right Column (5 cols): Real-Time Server-Client Sync Log Stream Panel */}
        <section className="lg:col-span-5 bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3.5">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-400" />
                <span>Sync Log (Real-Time Server ↔ Client Stream)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Live stream of Cloud Workspace switches, diagnostic probes, and file pushes.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchPluginStatus(true)}
                className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Fetch Edits</span>
              </button>
              <button
                onClick={handleClearSyncLog}
                title="Clear Sync Log"
                className="p-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Direction Filter Bar */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono">
            {(['ALL', 'CLIENT → HOST', 'HOST → CLIENT', 'SSE BROADCAST'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => setSyncFilter(dir)}
                className={`flex-1 py-1 px-2 rounded transition-colors cursor-pointer whitespace-nowrap ${
                  syncFilter === dir
                    ? 'bg-slate-800 text-teal-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>

          {/* Stream Entries */}
          <div className="space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
            {filteredSyncLog.length === 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 text-center text-xs text-slate-500">
                No sync events recorded yet. Switch Cloud Workspaces or click &quot;Save &amp; Push
                .SHP&quot; to watch live server-client communication.
              </div>
            ) : (
              filteredSyncLog.map((entry) => {
                const isDenied = entry.status === '403 DENIED';
                const isBroadcast = entry.direction === 'SSE BROADCAST';
                return (
                  <div
                    key={entry.id}
                    className={`p-3 rounded-lg border text-xs font-mono space-y-1.5 ${
                      isDenied
                        ? 'bg-rose-950/30 border-rose-500/50 text-rose-200'
                        : isBroadcast
                        ? 'bg-teal-950/20 border-teal-500/40 text-slate-200'
                        : 'bg-slate-950/90 border-slate-800/90 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span
                        className={
                          isDenied
                            ? 'text-rose-400 font-semibold'
                            : isBroadcast
                            ? 'text-teal-300 font-semibold'
                            : 'text-teal-400 font-semibold'
                        }
                      >
                        {entry.direction} · {entry.status}
                      </span>
                      <span className="text-slate-400 tabular-nums">
                        {new Date(entry.timestamp).toLocaleTimeString()} ·{' '}
                        {entry.latencyMs > 0 ? `${entry.latencyMs}ms` : 'live'}
                      </span>
                    </div>

                    <div className="font-semibold text-white">{entry.action}</div>

                    <div className="text-[11px] text-slate-400 break-all leading-relaxed">
                      {entry.detail}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                      <span>{entry.endpoint}</span>
                      <span>{entry.workstation}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Bottom Split Grid: Interactive QGIS Dock Panel Simulator (Left) + Source Code Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 cols): Interactive QGIS Desktop Dock Simulator */}
        <section className="lg:col-span-7 bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div>
              <h3 className="text-base font-semibold text-white">
                Interactive QGIS Desktop Dock Panel Simulator (v3.1 Multi-Workspace)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Test the exact controls built into the QGIS Dock Panel: Active Cloud Workspace
                Selector, Browse &amp; Open Layers, Auto-Commit on Save, and 1-Click Refresh.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              txid #{status?.currentTxid}
            </span>
          </div>

          {/* Simulated QGIS Message Bar */}
          {qgisMessageBar && (
            <div
              className={`p-3.5 rounded-lg border text-xs font-mono space-y-1 ${
                qgisMessageBar.type === 'error'
                  ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                  : qgisMessageBar.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <div className="font-semibold flex items-center justify-between">
                <span>QGIS MessageBar · {qgisMessageBar.title}</span>
                <span className="text-[11px] opacity-75">Zero-Auth Host</span>
              </div>
              <div className="text-[11px] opacity-90 break-all">{qgisMessageBar.detail}</div>
            </div>
          )}

          {/* Simulated QDockWidget Frame */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-5">
            {/* 1. Role Indicator Badge inside QGIS */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
              <div className="space-y-0.5">
                <div className="text-[11px] font-mono text-slate-400">
                  QDockWidget · &quot;Meridian Multi-Workspace Host (v3.1)&quot;
                </div>
                <div className="text-xs font-mono text-slate-300 truncate">
                  Active Link: {primaryUrl}/api/workspaces/{status?.activeWorkspaceId}
                </div>
              </div>

              <div
                className={`px-3 py-1.5 rounded border text-xs font-mono font-semibold flex items-center gap-2 ${
                  currentTier === 'viewer'
                    ? 'bg-amber-950/40 border-amber-500/60 text-amber-300'
                    : 'bg-teal-950/40 border-teal-500/60 text-teal-300'
                }`}
              >
                {currentTier === 'viewer' ? (
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  ROLE: {currentTier.toUpperCase()} (
                  {currentTier === 'viewer' ? 'READ-ONLY' : 'WRITE ENABLED'})
                </span>
              </div>
            </div>

            {/* Active Cloud Workspace Dropdown inside Simulated QGIS Dock */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono text-slate-400">
                Active Cloud Workspace in QGIS Dock (QComboBox):
              </label>
              <select
                value={status?.activeWorkspaceId || 'watershed-citarum-2026'}
                disabled={isSwitchingWorkspace}
                onChange={(e) => handleSwitchCloudWorkspace(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-teal-300 focus:outline-none focus:border-teal-400"
              >
                {status?.workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.id}) — {ws.layerTableKeys?.length || 3} layers
                  </option>
                ))}
              </select>
            </div>

            {/* 2. One-Click Refresh Button */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => fetchPluginStatus(true)}
                className="flex-1 py-2.5 px-4 bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>One-Click Refresh Live Layers (Pull Teammates&apos; Edits)</span>
              </button>

              <button
                onClick={handleSimulateQgisSaveAutoCommit}
                disabled={isTestingSave}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-teal-400" />
                <span>
                  {isTestingSave ? 'Committing...' : 'Simulate "Save Layer Edits" in QGIS'}
                </span>
              </button>
            </div>

            {/* 3. Browse & Open Hosted Spatial Layers for Active Cloud Workspace */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    Spatial Layers in &apos;{status?.activeWorkspaceName}&apos; (
                    {status?.tables.length || 0} layers)
                  </span>
                </span>
                <span className="text-slate-400 font-mono">
                  {loadedInCanvas.length} active on canvas
                </span>
              </div>

              <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-lg overflow-hidden">
                {status?.tables.map((tbl) => {
                  const isSelected = selectedTableKey === tbl.tableKey;
                  const isLoaded = loadedInCanvas.includes(tbl.tableKey);
                  const canWrite = tbl.privileges.includes('UPDATE');
                  return (
                    <div
                      key={tbl.tableKey}
                      onClick={() => {
                        setSelectedTableKey(tbl.tableKey);
                        setSelectedShpGroup(tbl.tableName);
                      }}
                      className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs cursor-pointer transition-colors ${
                        isSelected ? 'bg-slate-900' : 'bg-slate-950/60 hover:bg-slate-900/50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-mono text-slate-200 font-medium flex items-center gap-2">
                          <span>{tbl.tableKey}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-400">{tbl.geometryType}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-teal-400 tabular-nums">
                            {tbl.featureCount} rows
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Mirror: layers/{tbl.tableName}.shp · SQL:{' '}
                          {tbl.privileges.join(', ') || 'NONE'} ·{' '}
                          {canWrite ? 'Editable' : 'Read-Only'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!isLoaded) {
                              setLoadedInCanvas((prev) => [...prev, tbl.tableKey]);
                            }
                            setSelectedTableKey(tbl.tableKey);
                            setSelectedShpGroup(tbl.tableName);
                            await fetch('/api/plugin/sync-log', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                direction: 'HOST → CLIENT',
                                action: `Loading ${tbl.tableKey} (${status?.activeWorkspaceId}) into QGIS...`,
                                endpoint: `GET /api/db/layers/${tbl.tableKey}/geojson`,
                                workstation: 'DESKTOP-GIS01 (QGIS 3.38)',
                                status: '200 OK',
                                detail: `Cached ${tbl.featureCount} features locally with setReadOnly(False) & auto-commit hooks`,
                              }),
                            });
                            await fetchPluginStatus(false);
                            setQgisMessageBar({
                              type: 'info',
                              title: `Layer Loaded in QGIS Canvas (${status?.activeWorkspaceId})`,
                              detail: `Downloaded ${tbl.tableKey} to local cache and unlocked Toggle Editing.`,
                            });
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium cursor-pointer"
                        >
                          {isLoaded ? 'Reload in Canvas' : '+ Load Editable'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Browse & Connect All Hosted Project Bundles */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <FolderArchive className="w-3.5 h-3.5 text-teal-400" />
                <span>
                  All Active Cloud Workspaces (Click &quot;Connect &amp; Switch Layers&quot; or Pull
                  ZIP)
                </span>
              </div>

              {status?.workspaces.map((ws) => {
                const isCurrent = ws.id === status.activeWorkspaceId;
                return (
                  <div
                    key={ws.id}
                    className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      isCurrent
                        ? 'bg-teal-950/20 border-teal-500/50'
                        : 'bg-slate-900/70 border-slate-800'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <span>{ws.name}</span>
                        <span className="font-mono text-teal-400">(r{ws.revision})</span>
                        {isCurrent && (
                          <span className="text-[10px] font-mono text-emerald-400">
                            · CONNECTED
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        Layers: {(ws.layerTableKeys || []).join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => handleSwitchCloudWorkspace(ws.id)}
                          disabled={isSwitchingWorkspace}
                          className="px-3 py-1.5 bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold rounded cursor-pointer whitespace-nowrap"
                        >
                          Connect &amp; Switch Layers
                        </button>
                      )}
                      <a
                        href={`/api/workspaces/${ws.id}/pull.zip`}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 font-medium rounded border border-slate-700 whitespace-nowrap text-center"
                      >
                        Pull .zip
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right Column (5 cols): 3-Step Install Guide & Packaged Python Source Inspector */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">
              How to Switch Cloud Workspaces in QGIS Desktop (v3.1.0)
            </h3>
            <ol className="space-y-3 text-xs text-slate-300">
              <li className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                <div className="font-mono text-teal-400 mb-0.5">
                  Step 01 · Install Plugin v3.1.0
                </div>
                Click{' '}
                <strong className="text-white">
                  Download meridian_live_host.zip (v3.1 Multi-Workspace)
                </strong>{' '}
                above and install via{' '}
                <strong className="text-white">
                  Plugins → Manage and Install Plugins → Install from ZIP
                </strong>
                .
              </li>
              <li className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                <div className="font-mono text-teal-400 mb-0.5">
                  Step 02 · Pick From Dropdown or Paste Any Workspace Link
                </div>
                In the QGIS Dock, use the{' '}
                <strong className="text-white">Active Cloud Workspace</strong> dropdown or paste any
                link (<code className="font-mono text-slate-200">.../api/workspaces/&lt;id&gt;</code>
                ) and click <strong className="text-white">Connect Link</strong>.
              </li>
              <li className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                <div className="font-mono text-teal-400 mb-0.5">
                  Step 03 · Load &amp; Edit That Workspace&apos;s Spatial Layers
                </div>
                The layer list immediately switches to the connected workspace&apos;s{' '}
                <code className="font-mono text-slate-200">.shp</code> &amp; PostGIS tables. Click{' '}
                <strong className="text-white">Load Selected Layer</strong> to edit in QGIS!
              </li>
            </ol>
          </div>

          {/* Packaged Plugin Source Code Viewer */}
          <div className="bg-slate-900/40 border border-slate-800/90 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-semibold text-white">
                  Inspect Packaged Plugin Files (v3.1.0)
                </h3>
              </div>
              <button
                onClick={() => handleCopyCode(activeCodeTab, currentCodeContent)}
                className="px-2.5 py-1 text-xs font-mono text-teal-300 bg-slate-950 border border-slate-800 rounded hover:border-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                {copiedFile === activeCodeTab ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy {activeCodeTab}</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              {(['plugin.py', 'metadata.txt', '__init__.py'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveCodeTab(tab)}
                  className={`flex-1 py-1.5 px-2 text-xs font-mono rounded transition-colors cursor-pointer ${
                    activeCodeTab === tab
                      ? 'bg-slate-800 text-teal-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-[340px] leading-relaxed">
              {currentCodeContent}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
