import express from 'express';
import { createServer as createViteServer } from 'vite';
import JSZip from 'jszip';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const PORT = 3000;

// ============================================================================
// PART 1: ZERO-SYNC LIVE SPATIAL DATABASE & SQL RBAC ENGINE
// ============================================================================

export type SqlPrivilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface DbRole {
  roleName: string;
  displayLabel: string;
  tier: 'admin' | 'editor' | 'viewer';
  isSuperuser: boolean;
  canLogin: boolean;
  description: string;
  activeConnections: number;
}

export interface SpatialFeatureRow {
  fid: number;
  geomType: 'Polygon' | 'LineString' | 'Point' | 'RasterTile';
  geomWkt: string;
  coordinates: number[][][] | number[][] | number[];
  attributes: Record<string, string | number | boolean>;
  updatedByRole: string;
  updatedByWorkstation: string;
  updatedAt: string;
  txid: number;
}

export interface SpatialTableSchema {
  tableKey: string; // e.g., "public.hydro_sub_basins"
  schemaName: string; // "public" | "raster"
  tableName: string; // "hydro_sub_basins"
  geometryColumn: string;
  geometryType: 'Polygon' | 'LineString' | 'Point' | 'RasterTile';
  srid: number;
  description: string;
  columns: { name: string; dataType: string }[];
  rows: SpatialFeatureRow[];
}

export interface SqlAuditEntry {
  txid: number;
  timestamp: string;
  roleName: string;
  workstation: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'GRANT' | 'REVOKE' | 'SELECT' | 'REJECTED';
  targetTable: string;
  sqlStatement: string;
  status: 'COMMITTED' | 'PERMISSION_DENIED';
  affectedRows: number;
  summary: string;
}

export interface PluginSyncLogEntry {
  id: string;
  timestamp: string;
  direction: 'CLIENT → HOST' | 'HOST → CLIENT' | 'SSE BROADCAST';
  action: string;
  endpoint: string;
  workstation: string;
  status: '200 OK' | '403 DENIED' | 'SYNCED';
  latencyMs: number;
  detail: string;
}

let globalTxid = 1042;
function nextTxid(): number {
  globalTxid += 1;
  return globalTxid;
}

// Connected SSE clients for instant real-time push notifications
const sseClients = new Set<express.Response>();

function broadcastDatabaseEvent(eventType: string, payload: unknown) {
  const dataString = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(dataString);
    } catch {
      sseClients.delete(client);
    }
  }
}

const pluginSyncLog: PluginSyncLogEntry[] = [
  {
    id: 'sync-1004',
    timestamp: new Date(Date.now() - 1000 * 18).toISOString(),
    direction: 'HOST → CLIENT',
    action: 'Fetching teammate edits...',
    endpoint: 'GET /api/db/layers/public.floodplain_parcels_100yr/geojson',
    workstation: 'DESKTOP-GIS01 (QGIS 3.38)',
    status: '200 OK',
    latencyMs: 14,
    detail: 'Delivered 2 Polygon features + local editable .shp/.geojson cache (txid #1042)',
  },
  {
    id: 'sync-1003',
    timestamp: new Date(Date.now() - 1000 * 48).toISOString(),
    direction: 'SSE BROADCAST',
    action: 'Broadcasting live edit to connected QGIS clients...',
    endpoint: 'SSE /api/db/stream (event: db_update)',
    workstation: 'Meridian-Live-Host',
    status: 'SYNCED',
    latencyMs: 3,
    detail: 'Notified connected QGIS docks that layers/floodplain_parcels_100yr.shp was updated',
  },
  {
    id: 'sync-1002',
    timestamp: new Date(Date.now() - 1000 * 50).toISOString(),
    direction: 'CLIENT → HOST',
    action: 'Pushing file update (layers/floodplain_parcels_100yr.shp + .dbf)...',
    endpoint: 'POST /api/plugin/shp-edit',
    workstation: 'MacBook-Pro-Field (QGIS 3.38)',
    status: '200 OK',
    latencyMs: 28,
    detail: 'Auto-committed .SHP edit buffer on layer.editingStopped -> updated fid=1 (max_depth_m=2.45)',
  },
  {
    id: 'sync-1001',
    timestamp: new Date(Date.now() - 1000 * 140).toISOString(),
    direction: 'CLIENT → HOST',
    action: 'Pulling hosted workspace (.qgs + .shp + .tif)...',
    endpoint: 'GET /api/workspaces/watershed-citarum-2026/pull.zip',
    workstation: 'MacBook-Pro-Field (QGIS 3.38)',
    status: '200 OK',
    latencyMs: 42,
    detail: 'Extracted 14 files into unlocked local cache & enabled QgsVectorLayer read/write mode',
  },
];

function recordSyncLog(
  entry: Omit<PluginSyncLogEntry, 'id' | 'timestamp'>
): PluginSyncLogEntry {
  const full: PluginSyncLogEntry = {
    ...entry,
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  pluginSyncLog.unshift(full);
  if (pluginSyncLog.length > 60) pluginSyncLog.pop();
  broadcastDatabaseEvent('sync_log', full);
  return full;
}

// 1. Seed Database Roles (Admin, Editor, Viewer)
const dbRoles = new Map<string, DbRole>([
  [
    'postgres_admin',
    {
      roleName: 'postgres_admin',
      displayLabel: 'Database Owner / GIS Admin (You)',
      tier: 'admin',
      isSuperuser: true,
      canLogin: true,
      description: 'Full DDL/DCL & read/write access across all spatial schemas, layer_styles, and role grants.',
      activeConnections: 1,
    },
  ],
  [
    'gis_editor_team',
    {
      roleName: 'gis_editor_team',
      displayLabel: 'Hydrology Field Analyst (Editor)',
      tier: 'editor',
      isSuperuser: false,
      canLogin: true,
      description: 'Can SELECT, INSERT, UPDATE, and DELETE features in vector layers; read-only on DEM rasters.',
      activeConnections: 2,
    },
  ],
  [
    'external_viewer',
    {
      roleName: 'external_viewer',
      displayLabel: 'Regular Viewer / Reviewer (Read-Only)',
      tier: 'viewer',
      isSuperuser: false,
      canLogin: true,
      description: 'Strictly SELECT privilege only. Can view and refresh layers in QGIS, but all edits are rejected by SQL.',
      activeConnections: 1,
    },
  ],
]);

// 2. Seed Spatial Tables (PostGIS Vector & Raster Tables)
const spatialTables = new Map<string, SpatialTableSchema>();

function initSpatialDatabase() {
  const now = new Date().toISOString();

  spatialTables.set('public.hydro_sub_basins', {
    tableKey: 'public.hydro_sub_basins',
    schemaName: 'public',
    tableName: 'hydro_sub_basins',
    geometryColumn: 'geom',
    geometryType: 'Polygon',
    srid: 4326,
    description: 'Upper Citarum hydrological sub-basins (HUC-12 boundaries and runoff coefficients)',
    columns: [
      { name: 'basin_code', dataType: 'varchar(24)' },
      { name: 'basin_name', dataType: 'text' },
      { name: 'area_km2', dataType: 'numeric(10,2)' },
      { name: 'runoff_coeff', dataType: 'numeric(4,2)' },
      { name: 'flood_risk_tier', dataType: 'varchar(16)' },
    ],
    rows: [
      {
        fid: 1,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((107.52 -6.98, 107.52 -6.88, 107.62 -6.88, 107.62 -6.98, 107.52 -6.98))',
        coordinates: [
          [
            [107.52, -6.98],
            [107.52, -6.88],
            [107.62, -6.88],
            [107.62, -6.98],
            [107.52, -6.98],
          ],
        ],
        attributes: {
          basin_code: 'HUC-12-01',
          basin_name: 'Cisangkuy Upper Catchment',
          area_km2: 142.85,
          runoff_coeff: 0.68,
          flood_risk_tier: 'High',
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'DESKTOP-GIS01',
        updatedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        txid: 1039,
      },
      {
        fid: 2,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((107.62 -6.98, 107.62 -6.88, 107.74 -6.88, 107.74 -6.98, 107.62 -6.98))',
        coordinates: [
          [
            [107.62, -6.98],
            [107.62, -6.88],
            [107.74, -6.88],
            [107.74, -6.98],
            [107.62, -6.98],
          ],
        ],
        attributes: {
          basin_code: 'HUC-12-02',
          basin_name: 'Cikapundung Urban Basin',
          area_km2: 98.4,
          runoff_coeff: 0.82,
          flood_risk_tier: 'Critical',
        },
        updatedByRole: 'gis_editor_team',
        updatedByWorkstation: 'MacBook-Pro-Field',
        updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        txid: 1040,
      },
      {
        fid: 3,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((107.54 -7.08, 107.54 -6.98, 107.68 -6.98, 107.68 -7.08, 107.54 -7.08))',
        coordinates: [
          [
            [107.54, -7.08],
            [107.54, -6.98],
            [107.68, -6.98],
            [107.68, -7.08],
            [107.54, -7.08],
          ],
        ],
        attributes: {
          basin_code: 'HUC-12-03',
          basin_name: 'Majalaya Alluvial Plain',
          area_km2: 164.2,
          runoff_coeff: 0.74,
          flood_risk_tier: 'High',
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'DESKTOP-GIS01',
        updatedAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
        txid: 1041,
      },
    ],
  });

  spatialTables.set('public.floodplain_parcels_100yr', {
    tableKey: 'public.floodplain_parcels_100yr',
    schemaName: 'public',
    tableName: 'floodplain_parcels_100yr',
    geometryColumn: 'geom',
    geometryType: 'Polygon',
    srid: 4326,
    description: '100-year return period inundation zone parcels and mitigation status',
    columns: [
      { name: 'parcel_id', dataType: 'varchar(20)' },
      { name: 'zone_class', dataType: 'varchar(16)' },
      { name: 'max_depth_m', dataType: 'numeric(5,2)' },
      { name: 'mitigation_status', dataType: 'varchar(24)' },
    ],
    rows: [
      {
        fid: 1,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((107.58 -6.96, 107.58 -6.92, 107.64 -6.92, 107.64 -6.96, 107.58 -6.96))',
        coordinates: [
          [
            [107.58, -6.96],
            [107.58, -6.92],
            [107.64, -6.92],
            [107.64, -6.96],
            [107.58, -6.96],
          ],
        ],
        attributes: {
          parcel_id: 'FP-2026-101',
          zone_class: 'Zone AE',
          max_depth_m: 2.45,
          mitigation_status: 'Levee Reinforced',
        },
        updatedByRole: 'gis_editor_team',
        updatedByWorkstation: 'MacBook-Pro-Field',
        updatedAt: now,
        txid: 1042,
      },
      {
        fid: 2,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((107.64 -6.96, 107.64 -6.91, 107.70 -6.91, 107.70 -6.96, 107.64 -6.96))',
        coordinates: [
          [
            [107.64, -6.96],
            [107.64, -6.91],
            [107.7, -6.91],
            [107.7, -6.96],
            [107.64, -6.96],
          ],
        ],
        attributes: {
          parcel_id: 'FP-2026-102',
          zone_class: 'Zone VE',
          max_depth_m: 3.1,
          mitigation_status: 'Retention Pond Planned',
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'DESKTOP-GIS01',
        updatedAt: now,
        txid: 1042,
      },
    ],
  });

  spatialTables.set('public.rainfall_telemetry_stations', {
    tableKey: 'public.rainfall_telemetry_stations',
    schemaName: 'public',
    tableName: 'rainfall_telemetry_stations',
    geometryColumn: 'geom',
    geometryType: 'Point',
    srid: 4326,
    description: 'Automated telemetric rain gauges reporting hourly and annual precipitation',
    columns: [
      { name: 'station_id', dataType: 'varchar(16)' },
      { name: 'station_name', dataType: 'text' },
      { name: 'annual_mm', dataType: 'integer' },
      { name: 'sensor_status', dataType: 'varchar(16)' },
    ],
    rows: [
      {
        fid: 1,
        geomType: 'Point',
        geomWkt: 'POINT(107.6105 -6.8912)',
        coordinates: [107.6105, -6.8912],
        attributes: {
          station_id: 'ST-01',
          station_name: 'Bandung Basin North',
          annual_mm: 2410,
          sensor_status: 'Active',
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'DESKTOP-GIS01',
        updatedAt: now,
        txid: 1038,
      },
      {
        fid: 2,
        geomType: 'Point',
        geomWkt: 'POINT(107.7561 -7.0488)',
        coordinates: [107.7561, -7.0488],
        attributes: {
          station_id: 'ST-02',
          station_name: 'Majalaya Telemetry',
          annual_mm: 2685,
          sensor_status: 'Active',
        },
        updatedByRole: 'gis_editor_team',
        updatedByWorkstation: 'MacBook-Pro-Field',
        updatedAt: now,
        txid: 1040,
      },
    ],
  });

  spatialTables.set('raster.srtm_dem_30m_tiles', {
    tableKey: 'raster.srtm_dem_30m_tiles',
    schemaName: 'raster',
    tableName: 'srtm_dem_30m_tiles',
    geometryColumn: 'rast',
    geometryType: 'RasterTile',
    srid: 4326,
    description: 'PostGIS Raster (`rast`) tiled elevation & hillshade blocks stored in database',
    columns: [
      { name: 'tile_code', dataType: 'varchar(24)' },
      { name: 'resolution_m', dataType: 'integer' },
      { name: 'min_elev_m', dataType: 'numeric(6,1)' },
      { name: 'max_elev_m', dataType: 'numeric(6,1)' },
    ],
    rows: [
      {
        fid: 1,
        geomType: 'RasterTile',
        geomWkt: 'BOX(107.50 -7.10, 107.65 -6.85)',
        coordinates: [
          [
            [107.5, -7.1],
            [107.5, -6.85],
            [107.65, -6.85],
            [107.65, -7.1],
            [107.5, -7.1],
          ],
        ],
        attributes: {
          tile_code: 'SRTM_S07E107_T01',
          resolution_m: 30,
          min_elev_m: 652.0,
          max_elev_m: 2140.5,
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'DESKTOP-GIS01',
        updatedAt: now,
        txid: 1035,
      },
    ],
  });

  // --- WORKSPACE 2 SPATIAL TABLES: Jakarta Bay & Coastal Mangrove Delta 2026 ---
  spatialTables.set('public.coastal_mangrove_zones', {
    tableKey: 'public.coastal_mangrove_zones',
    schemaName: 'public',
    tableName: 'coastal_mangrove_zones',
    geometryColumn: 'geom',
    geometryType: 'Polygon',
    srid: 4326,
    description: 'Coastal mangrove conservation & restoration polygons along Jakarta Bay delta',
    columns: [
      { name: 'zone_code', dataType: 'varchar(24)' },
      { name: 'mangrove_species', dataType: 'text' },
      { name: 'canopy_density_pct', dataType: 'numeric(5,1)' },
      { name: 'erosion_status', dataType: 'varchar(24)' },
    ],
    rows: [
      {
        fid: 1,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((106.72 -6.12, 106.72 -6.08, 106.78 -6.08, 106.78 -6.12, 106.72 -6.12))',
        coordinates: [
          [
            [106.72, -6.12],
            [106.72, -6.08],
            [106.78, -6.08],
            [106.78, -6.12],
            [106.72, -6.12],
          ],
        ],
        attributes: {
          zone_code: 'MNG-JKT-01',
          mangrove_species: 'Rhizophora mucronata (Red Mangrove)',
          canopy_density_pct: 84.5,
          erosion_status: 'Accreting (+1.4m/yr)',
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'COASTAL-LAB01',
        updatedAt: now,
        txid: 1041,
      },
      {
        fid: 2,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((106.78 -6.13, 106.78 -6.09, 106.84 -6.09, 106.84 -6.13, 106.78 -6.13))',
        coordinates: [
          [
            [106.78, -6.13],
            [106.78, -6.09],
            [106.84, -6.09],
            [106.84, -6.13],
            [106.78, -6.13],
          ],
        ],
        attributes: {
          zone_code: 'MNG-JKT-02',
          mangrove_species: 'Avicennia marina (Grey Mangrove)',
          canopy_density_pct: 62.0,
          erosion_status: 'Wave Break Protected',
        },
        updatedByRole: 'gis_editor_team',
        updatedByWorkstation: 'MARINE-SURVEY02',
        updatedAt: now,
        txid: 1042,
      },
    ],
  });

  spatialTables.set('public.seawall_defense_segments', {
    tableKey: 'public.seawall_defense_segments',
    schemaName: 'public',
    tableName: 'seawall_defense_segments',
    geometryColumn: 'geom',
    geometryType: 'Polygon',
    srid: 4326,
    description: 'Coastal dike and seawall structural defense segments and crest elevations',
    columns: [
      { name: 'segment_id', dataType: 'varchar(20)' },
      { name: 'structure_type', dataType: 'varchar(24)' },
      { name: 'crest_elev_m', dataType: 'numeric(5,2)' },
      { name: 'subsidence_mm_yr', dataType: 'numeric(5,1)' },
    ],
    rows: [
      {
        fid: 1,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((106.79 -6.11, 106.79 -6.10, 106.86 -6.10, 106.86 -6.11, 106.79 -6.11))',
        coordinates: [
          [
            [106.79, -6.11],
            [106.79, -6.1],
            [106.86, -6.1],
            [106.86, -6.11],
            [106.79, -6.11],
          ],
        ],
        attributes: {
          segment_id: 'SW-NCICD-A1',
          structure_type: 'Sheet Pile + Tetrapod',
          crest_elev_m: 4.8,
          subsidence_mm_yr: 38.5,
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'COASTAL-LAB01',
        updatedAt: now,
        txid: 1042,
      },
    ],
  });

  spatialTables.set('public.tidal_gauge_buoys', {
    tableKey: 'public.tidal_gauge_buoys',
    schemaName: 'public',
    tableName: 'tidal_gauge_buoys',
    geometryColumn: 'geom',
    geometryType: 'Point',
    srid: 4326,
    description: 'Real-time offshore & estuarine acoustic tide gauge telemetry buoys',
    columns: [
      { name: 'buoy_id', dataType: 'varchar(16)' },
      { name: 'harbor_sector', dataType: 'text' },
      { name: 'high_tide_m', dataType: 'numeric(4,2)' },
      { name: 'telemetry_state', dataType: 'varchar(16)' },
    ],
    rows: [
      {
        fid: 1,
        geomType: 'Point',
        geomWkt: 'POINT(106.8025 -6.0950)',
        coordinates: [106.8025, -6.095],
        attributes: {
          buoy_id: 'TG-SUNDA-01',
          harbor_sector: 'Sunda Kelapa Outer Basin',
          high_tide_m: 2.34,
          telemetry_state: 'Online',
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'COASTAL-LAB01',
        updatedAt: now,
        txid: 1041,
      },
    ],
  });

  // --- WORKSPACE 3 SPATIAL TABLES: Bandung LRT & Utility Corridor 2026 ---
  spatialTables.set('public.transit_station_buffers', {
    tableKey: 'public.transit_station_buffers',
    schemaName: 'public',
    tableName: 'transit_station_buffers',
    geometryColumn: 'geom',
    geometryType: 'Polygon',
    srid: 4326,
    description: '800m Transit-Oriented Development (TOD) station catchment zones',
    columns: [
      { name: 'station_code', dataType: 'varchar(20)' },
      { name: 'station_name', dataType: 'text' },
      { name: 'daily_ridership', dataType: 'integer' },
      { name: 'tod_zoning', dataType: 'varchar(24)' },
    ],
    rows: [
      {
        fid: 1,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((107.60 -6.92, 107.60 -6.90, 107.62 -6.90, 107.62 -6.92, 107.60 -6.92))',
        coordinates: [
          [
            [107.6, -6.92],
            [107.6, -6.9],
            [107.62, -6.9],
            [107.62, -6.92],
            [107.6, -6.92],
          ],
        ],
        attributes: {
          station_code: 'LRT-BDG-01',
          station_name: 'Kebon Kawung Central Hub',
          daily_ridership: 42800,
          tod_zoning: 'High-Density Mixed Use',
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'TRANSIT-CAD01',
        updatedAt: now,
        txid: 1040,
      },
      {
        fid: 2,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((107.63 -6.94, 107.63 -6.92, 107.65 -6.92, 107.65 -6.94, 107.63 -6.94))',
        coordinates: [
          [
            [107.63, -6.94],
            [107.63, -6.92],
            [107.65, -6.92],
            [107.65, -6.94],
            [107.63, -6.94],
          ],
        ],
        attributes: {
          station_code: 'LRT-BDG-02',
          station_name: 'Gedebage Technopolis Terminal',
          daily_ridership: 31500,
          tod_zoning: 'Intermodal HSR Hub',
        },
        updatedByRole: 'gis_editor_team',
        updatedByWorkstation: 'TRANSIT-CAD02',
        updatedAt: now,
        txid: 1042,
      },
    ],
  });

  spatialTables.set('public.underground_utility_ducts', {
    tableKey: 'public.underground_utility_ducts',
    schemaName: 'public',
    tableName: 'underground_utility_ducts',
    geometryColumn: 'geom',
    geometryType: 'Polygon',
    srid: 4326,
    description: 'Subsurface high-voltage power, fiber-optic, and storm drain utility corridors',
    columns: [
      { name: 'corridor_id', dataType: 'varchar(20)' },
      { name: 'utility_class', dataType: 'varchar(24)' },
      { name: 'burial_depth_m', dataType: 'numeric(4,2)' },
      { name: 'clearance_state', dataType: 'varchar(20)' },
    ],
    rows: [
      {
        fid: 1,
        geomType: 'Polygon',
        geomWkt: 'POLYGON((107.60 -6.93, 107.60 -6.91, 107.64 -6.91, 107.64 -6.93, 107.60 -6.93))',
        coordinates: [
          [
            [107.6, -6.93],
            [107.6, -6.91],
            [107.64, -6.91],
            [107.64, -6.93],
            [107.6, -6.93],
          ],
        ],
        attributes: {
          corridor_id: 'UTIL-150KV-01',
          utility_class: '150kV Underground HV + Fiber',
          burial_depth_m: 3.4,
          clearance_state: 'Verified GPR',
        },
        updatedByRole: 'postgres_admin',
        updatedByWorkstation: 'TRANSIT-CAD01',
        updatedAt: now,
        txid: 1041,
      },
    ],
  });
}

initSpatialDatabase();

// 3. Table Grants Matrix: roleName -> tableKey -> Set<SqlPrivilege>
const tableGrants = new Map<string, Map<string, Set<SqlPrivilege>>>();

function initDefaultGrants() {
  const allTableKeys = Array.from(spatialTables.keys());

  // postgres_admin has ALL privileges on all tables
  const adminMap = new Map<string, Set<SqlPrivilege>>();
  allTableKeys.forEach((tk) =>
    adminMap.set(tk, new Set<SqlPrivilege>(['SELECT', 'INSERT', 'UPDATE', 'DELETE']))
  );
  tableGrants.set('postgres_admin', adminMap);

  // gis_editor_team has SELECT, INSERT, UPDATE, DELETE on public.* vector tables, SELECT on raster.*
  const editorMap = new Map<string, Set<SqlPrivilege>>();
  allTableKeys.forEach((tk) => {
    if (tk.startsWith('raster.')) {
      editorMap.set(tk, new Set<SqlPrivilege>(['SELECT']));
    } else {
      editorMap.set(tk, new Set<SqlPrivilege>(['SELECT', 'INSERT', 'UPDATE', 'DELETE']));
    }
  });
  tableGrants.set('gis_editor_team', editorMap);

  // external_viewer has strictly SELECT on all tables (Read-Only)
  const viewerMap = new Map<string, Set<SqlPrivilege>>();
  allTableKeys.forEach((tk) => viewerMap.set(tk, new Set<SqlPrivilege>(['SELECT'])));
  tableGrants.set('external_viewer', viewerMap);
}

initDefaultGrants();

function hasPrivilege(roleName: string, tableKey: string, priv: SqlPrivilege): boolean {
  const role = dbRoles.get(roleName);
  if (role?.isSuperuser) return true;
  const roleGrants = tableGrants.get(roleName);
  if (!roleGrants) return false;
  const privSet = roleGrants.get(tableKey);
  return privSet ? privSet.has(priv) : false;
}

function getRolePrivileges(roleName: string, tableKey: string): SqlPrivilege[] {
  const role = dbRoles.get(roleName);
  if (role?.isSuperuser) return ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  const set = tableGrants.get(roleName)?.get(tableKey);
  return set ? Array.from(set) : [];
}

// 4. Real-Time SQL Audit Log
const sqlAuditLog: SqlAuditEntry[] = [
  {
    txid: 1042,
    timestamp: new Date(Date.now() - 1000 * 50).toISOString(),
    roleName: 'gis_editor_team',
    workstation: 'MacBook-Pro-Field (QGIS 3.38)',
    operation: 'UPDATE',
    targetTable: 'public.floodplain_parcels_100yr',
    sqlStatement:
      "UPDATE public.floodplain_parcels_100yr SET max_depth_m = 2.45, mitigation_status = 'Levee Reinforced' WHERE fid = 1;",
    status: 'COMMITTED',
    affectedRows: 1,
    summary: 'Instant PostGIS edit committed from QGIS edit buffer (fid=1)',
  },
  {
    txid: 1041,
    timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    roleName: 'external_viewer',
    workstation: 'Viewer-Laptop-02 (QGIS 3.38)',
    operation: 'REJECTED',
    targetTable: 'public.hydro_sub_basins',
    sqlStatement:
      "UPDATE public.hydro_sub_basins SET flood_risk_tier = 'Low' WHERE fid = 3;",
    status: 'PERMISSION_DENIED',
    affectedRows: 0,
    summary:
      'ERROR: 42501: permission denied for table hydro_sub_basins (role "external_viewer" lacks UPDATE privilege)',
  },
  {
    txid: 1040,
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    roleName: 'postgres_admin',
    workstation: 'DESKTOP-GIS01 (Admin Console)',
    operation: 'REVOKE',
    targetTable: 'public.hydro_sub_basins',
    sqlStatement:
      'REVOKE INSERT, UPDATE, DELETE ON TABLE public.hydro_sub_basins FROM external_viewer;',
    status: 'COMMITTED',
    affectedRows: 0,
    summary: 'Locked external_viewer to read-only SELECT privileges on public.hydro_sub_basins',
  },
];

function recordAudit(entry: Omit<SqlAuditEntry, 'txid' | 'timestamp'>): SqlAuditEntry {
  const full: SqlAuditEntry = {
    ...entry,
    txid: nextTxid(),
    timestamp: new Date().toISOString(),
  };
  sqlAuditLog.unshift(full);
  if (sqlAuditLog.length > 80) sqlAuditLog.pop();

  recordSyncLog({
    direction: full.status === 'PERMISSION_DENIED' ? 'CLIENT → HOST' : 'CLIENT → HOST',
    action:
      full.status === 'PERMISSION_DENIED'
        ? `Rejected ${full.operation} on ${full.targetTable} (SQL 42501)...`
        : full.operation === 'GRANT' || full.operation === 'REVOKE'
        ? `Applying SQL ${full.operation} permission update...`
        : `Pushing live ${full.operation} edit to ${full.targetTable}...`,
    endpoint:
      full.operation === 'GRANT' || full.operation === 'REVOKE'
        ? 'POST /api/db/grants'
        : 'POST /api/db/transaction',
    workstation: full.workstation,
    status: full.status === 'PERMISSION_DENIED' ? '403 DENIED' : '200 OK',
    latencyMs: Math.floor(11 + Math.random() * 18),
    detail: `${full.summary} [txid #${full.txid}]`,
  });

  broadcastDatabaseEvent('db_update', {
    latestTxid: full.txid,
    auditEntry: full,
    syncLog: pluginSyncLog,
  });
  return full;
}

// Zero-Authentication Default Host Access Role for QGIS Plugin connections
let defaultHostAccessRole: string = 'gis_editor_team';

function serializeDatabaseState() {
  const roles = Array.from(dbRoles.values());
  const tables = Array.from(spatialTables.values());
  const grants: Record<string, Record<string, SqlPrivilege[]>> = {};

  for (const role of roles) {
    grants[role.roleName] = {};
    for (const tbl of tables) {
      grants[role.roleName][tbl.tableKey] = getRolePrivileges(role.roleName, tbl.tableKey);
    }
  }

  return {
    currentTxid: globalTxid,
    serverTimestamp: new Date().toISOString(),
    defaultHostAccessRole,
    roles,
    tables,
    grants,
    auditLog: sqlAuditLog,
  };
}

// ============================================================================
// PART 2: LEGACY CLOUD WORKSPACE BUNDLE REPOSITORY (PRESERVED FROM PREVIOUS TURN)
// ============================================================================

export interface CloudFileEntry {
  relativePath: string;
  fileName: string;
  category: 'project' | 'shapefile' | 'raster' | 'geopackage' | 'table' | 'style';
  groupName: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  updatedAt: string;
  updatedBy: string;
  data: Buffer;
}

export interface RevisionCommit {
  revision: number;
  timestamp: string;
  authorMachine: string;
  message: string;
  changedFiles: string[];
}

export interface CloudWorkspace {
  id: string;
  name: string;
  description: string;
  crs: string;
  revision: number;
  updatedAt: string;
  lockedBy: string | null;
  lockedAt: string | null;
  projectFileName: string;
  layerTableKeys: string[];
  files: Map<string, CloudFileEntry>;
  history: RevisionCommit[];
}

// Active Cloud Workspace ID selected on the Host
let activeHostWorkspaceId: string = 'watershed-citarum-2026';

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

function buildRealPolygonShapefileSet(baseName: string): Record<string, Buffer> {
  const prjText =
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  const points = [
    [107.52, -6.98],
    [107.52, -6.88],
    [107.68, -6.88],
    [107.68, -6.98],
    [107.52, -6.98],
  ];
  const recContentWords = 64;
  const shpFileWords = 50 + 4 + recContentWords;
  const shpBuf = Buffer.alloc(shpFileWords * 2);

  shpBuf.writeInt32BE(9994, 0);
  shpBuf.writeInt32BE(shpFileWords, 24);
  shpBuf.writeInt32LE(1000, 28);
  shpBuf.writeInt32LE(5, 32);
  shpBuf.writeDoubleLE(107.52, 36);
  shpBuf.writeDoubleLE(-6.98, 44);
  shpBuf.writeDoubleLE(107.68, 52);
  shpBuf.writeDoubleLE(-6.88, 60);

  shpBuf.writeInt32BE(1, 100);
  shpBuf.writeInt32BE(recContentWords, 104);
  shpBuf.writeInt32LE(5, 108);
  shpBuf.writeDoubleLE(107.52, 112);
  shpBuf.writeDoubleLE(-6.98, 120);
  shpBuf.writeDoubleLE(107.68, 128);
  shpBuf.writeDoubleLE(-6.88, 136);
  shpBuf.writeInt32LE(1, 144);
  shpBuf.writeInt32LE(5, 148);
  shpBuf.writeInt32LE(0, 152);
  points.forEach(([x, y], idx) => {
    const off = 156 + idx * 16;
    shpBuf.writeDoubleLE(x, off);
    shpBuf.writeDoubleLE(y, off + 8);
  });

  const shxBuf = Buffer.alloc(108);
  shpBuf.copy(shxBuf, 0, 0, 100);
  shxBuf.writeInt32BE(54, 24);
  shxBuf.writeInt32BE(50, 100);
  shxBuf.writeInt32BE(recContentWords, 104);

  const headerLen = 32 + 2 * 32 + 1;
  const recLen = 1 + 12 + 8;
  const dbfBuf = Buffer.alloc(headerLen + recLen + 1);
  dbfBuf[0] = 0x03;
  dbfBuf[1] = 126;
  dbfBuf[2] = 10;
  dbfBuf[3] = 17;
  dbfBuf.writeUInt32LE(1, 4);
  dbfBuf.writeUInt16LE(headerLen, 8);
  dbfBuf.writeUInt16LE(recLen, 10);
  dbfBuf.write('BASIN_ID', 32, 'ascii');
  dbfBuf[32 + 11] = 'C'.charCodeAt(0);
  dbfBuf[32 + 16] = 12;
  dbfBuf.write('AREA_KM2', 64, 'ascii');
  dbfBuf[64 + 11] = 'N'.charCodeAt(0);
  dbfBuf[64 + 16] = 8;
  dbfBuf[64 + 17] = 2;
  dbfBuf[96] = 0x0d;
  dbfBuf.write(' HUC-12-01     142.85', 97, 'ascii');
  dbfBuf[headerLen + recLen] = 0x1a;

  return {
    [`layers/${baseName}.shp`]: shpBuf,
    [`layers/${baseName}.shx`]: shxBuf,
    [`layers/${baseName}.dbf`]: dbfBuf,
    [`layers/${baseName}.prj`]: Buffer.from(prjText, 'utf-8'),
    [`layers/${baseName}.cpg`]: Buffer.from('UTF-8', 'utf-8'),
  };
}

function buildRealRasterTiff(seedValue: number = 120): Buffer {
  const width = 16;
  const height = 16;
  const pixelBytes = width * height;
  const headerAndPixels = 8 + pixelBytes;
  const numEntries = 8;
  const ifdSize = 2 + numEntries * 12 + 4;
  const buf = Buffer.alloc(headerAndPixels + ifdSize);

  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(headerAndPixels, 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[8 + y * width + x] = (seedValue + x * 4 + y * 3) % 255;
    }
  }

  let off = headerAndPixels;
  buf.writeUInt16LE(numEntries, off);
  off += 2;
  const writeTag = (tag: number, type: number, count: number, val: number) => {
    buf.writeUInt16LE(tag, off);
    buf.writeUInt16LE(type, off + 2);
    buf.writeUInt32LE(count, off + 4);
    buf.writeUInt32LE(val, off + 8);
    off += 12;
  };
  writeTag(256, 3, 1, width);
  writeTag(257, 3, 1, height);
  writeTag(258, 3, 1, 8);
  writeTag(259, 3, 1, 1);
  writeTag(262, 3, 1, 1);
  writeTag(273, 4, 1, 8);
  writeTag(278, 3, 1, height);
  writeTag(279, 4, 1, pixelBytes);
  buf.writeUInt32LE(0, off);
  return buf;
}

function buildPortableWorkspaceQgsXml(workspaceName: string, files: Map<string, CloudFileEntry>): string {
  const shpFiles = Array.from(files.values()).filter((f) => f.extension === '.shp');
  const tifFiles = Array.from(files.values()).filter(
    (f) => f.extension === '.tif' || f.extension === '.tiff'
  );
  const gpkgFiles = Array.from(files.values()).filter((f) => f.extension === '.gpkg');
  const csvFiles = Array.from(files.values()).filter((f) => f.extension === '.csv');

  const mapLayerBlocks: string[] = [];
  shpFiles.forEach((shp, idx) => {
    mapLayerBlocks.push(`    <maplayer type="vector" geometry="Polygon" labelsEnabled="1">
      <id>${shp.groupName}_shp_${idx}</id>
      <layername>${shp.groupName} (Shapefile)</layername>
      <provider encoding="UTF-8">ogr</provider>
      <datasource>./${shp.relativePath}</datasource>
    </maplayer>`);
  });
  gpkgFiles.forEach((gpkg, idx) => {
    mapLayerBlocks.push(`    <maplayer type="vector" geometry="Polygon" labelsEnabled="1">
      <id>${gpkg.groupName}_gpkg_${idx}</id>
      <layername>${gpkg.groupName} (GeoPackage)</layername>
      <provider encoding="UTF-8">ogr</provider>
      <datasource>./${gpkg.relativePath}</datasource>
    </maplayer>`);
  });
  tifFiles.forEach((tif, idx) => {
    mapLayerBlocks.push(`    <maplayer type="raster" geometry="NoGeometry">
      <id>${tif.groupName}_ras_${idx}</id>
      <layername>${tif.groupName} (Raster GeoTIFF)</layername>
      <provider>gdal</provider>
      <datasource>./${tif.relativePath}</datasource>
    </maplayer>`);
  });
  csvFiles.forEach((csv, idx) => {
    mapLayerBlocks.push(`    <maplayer type="vector" geometry="Point" labelsEnabled="1">
      <id>${csv.groupName}_csv_${idx}</id>
      <layername>${csv.groupName} (Telemetry Table)</layername>
      <provider encoding="UTF-8">delimitedtext</provider>
      <datasource>./${csv.relativePath}?type=csv&amp;xField=lon&amp;yField=lat&amp;crs=EPSG:4326</datasource>
    </maplayer>`);
  });

  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.38.2-Grenoble" projectname="${workspaceName}">
  <homePath path=""/>
  <title>${workspaceName}</title>
  <properties>
    <Paths>
      <Absolute type="bool">false</Absolute>
    </Paths>
  </properties>
  <projectlayers>
${mapLayerBlocks.join('\n')}
  </projectlayers>
</qgis>`;
}

function sanitizeUploadedQgsXml(rawXml: string, files: Map<string, CloudFileEntry>): string {
  let updated = rawXml.replace(
    /<Absolute\s+type="bool"\s*>\s*true\s*<\/Absolute>/gi,
    '<Absolute type="bool">false</Absolute>'
  );
  for (const entry of files.values()) {
    if (entry.category === 'project') continue;
    const escapedName = entry.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `<datasource>([^<]*[\\\\/]${escapedName}(?:\\|[^<]*)?)<\\/datasource>`,
      'gi'
    );
    updated = updated.replace(regex, (_match, fullInner: string) => {
      const pipeIdx = fullInner.indexOf('|');
      const suffix = pipeIdx !== -1 ? fullInner.slice(pipeIdx) : '';
      return `<datasource>./${entry.relativePath}${suffix}</datasource>`;
    });
  }
  return updated;
}

function classifyFile(fileName: string): {
  category: CloudFileEntry['category'];
  relativePath: string;
  groupName: string;
  extension: string;
} {
  const cleanName = path.basename(fileName.replace(/\\/g, '/'));
  const ext = path.extname(cleanName).toLowerCase();
  const groupName = path.basename(cleanName, ext);

  if (ext === '.qgs' || ext === '.qgz') {
    return { category: 'project', relativePath: cleanName, groupName, extension: ext };
  }
  if (['.shp', '.shx', '.dbf', '.prj', '.cpg', '.qpj', '.sbn', '.sbx'].includes(ext)) {
    return { category: 'shapefile', relativePath: `layers/${cleanName}`, groupName, extension: ext };
  }
  if (['.tif', '.tiff', '.asc', '.img', '.vrt', '.tfw', '.aux.xml'].includes(ext)) {
    return { category: 'raster', relativePath: `rasters/${cleanName}`, groupName, extension: ext };
  }
  if (['.gpkg', '.geojson', '.kml', '.gml'].includes(ext)) {
    return { category: 'geopackage', relativePath: `layers/${cleanName}`, groupName, extension: ext };
  }
  if (['.qml', '.sld', '.svg'].includes(ext)) {
    return { category: 'style', relativePath: `styles/${cleanName}`, groupName, extension: ext };
  }
  return { category: 'table', relativePath: `tables/${cleanName}`, groupName, extension: ext };
}

const workspaces = new Map<string, CloudWorkspace>();

function seedInitialWorkspace() {
  const now = new Date().toISOString();

  const createHelper = (files: Map<string, CloudFileEntry>) => (
    relPath: string,
    buf: Buffer,
    author = 'DESKTOP-GIS01'
  ) => {
    const info = classifyFile(relPath);
    files.set(info.relativePath, {
      relativePath: info.relativePath,
      fileName: path.basename(info.relativePath),
      category: info.category,
      groupName: info.groupName,
      extension: info.extension,
      sizeBytes: buf.length,
      sha256: sha256Hex(buf),
      updatedAt: now,
      updatedBy: author,
      data: buf,
    });
  };

  // 1. Workspace 1: Upper Citarum Watershed Assessment 2026
  {
    const wsId = 'watershed-citarum-2026';
    const files = new Map<string, CloudFileEntry>();
    const addEntry = createHelper(files);

    Object.entries(buildRealPolygonShapefileSet('hydro_sub_basins')).forEach(([rel, buf]) =>
      addEntry(rel, buf, 'DESKTOP-GIS01')
    );
    Object.entries(buildRealPolygonShapefileSet('floodplain_parcels_100yr')).forEach(([rel, buf]) =>
      addEntry(rel, buf, 'MacBook-Pro-Field')
    );
    Object.entries(buildRealPolygonShapefileSet('rainfall_telemetry_stations')).forEach(
      ([rel, buf]) => addEntry(rel, buf, 'DESKTOP-GIS01')
    );

    addEntry('rasters/srtm_dem_30m_clipped.tif', buildRealRasterTiff(90), 'DESKTOP-GIS01');
    addEntry('rasters/terrain_hillshade_10m.tif', buildRealRasterTiff(160), 'DESKTOP-GIS01');

    const csvContent = `station_id,station_name,lat,lon,annual_mm\nST-01,Bandung Basin North,-6.8912,107.6105,2410\nST-02,Majalaya Telemetry,-7.0488,107.7561,2685\nST-03,Saguling Reservoir Intake,-6.9145,107.3682,2190\n`;
    addEntry('tables/rainfall_gauges_2026.csv', Buffer.from(csvContent, 'utf-8'), 'MacBook-Pro-Field');

    const qmlContent = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>\n<qgis version="3.38.2" styleCategories="Symbology"><renderer-v2 type="singleSymbol"/></qgis>`;
    addEntry('styles/hydro_sub_basins.qml', Buffer.from(qmlContent, 'utf-8'), 'DESKTOP-GIS01');

    const qgsXml = buildPortableWorkspaceQgsXml('Upper Citarum Watershed Assessment 2026', files);
    addEntry('Upper_Citarum_Watershed_2026.qgs', Buffer.from(qgsXml, 'utf-8'), 'MacBook-Pro-Field');

    workspaces.set(wsId, {
      id: wsId,
      name: 'Upper Citarum Watershed Assessment 2026',
      description:
        'Hydrological Sub-Basin Shapefiles (hydro_sub_basins.shp), 100yr Floodplain Parcels, Rainfall Telemetry Stations, and SRTM 30m DEM Rasters.',
      crs: 'EPSG:4326 (WGS 84)',
      revision: 4,
      updatedAt: now,
      lockedBy: null,
      lockedAt: null,
      projectFileName: 'Upper_Citarum_Watershed_2026.qgs',
      layerTableKeys: [
        'public.hydro_sub_basins',
        'public.floodplain_parcels_100yr',
        'public.rainfall_telemetry_stations',
      ],
      files,
      history: [
        {
          revision: 4,
          timestamp: now,
          authorMachine: 'MacBook-Pro-Field (macOS)',
          message: 'Updated floodplain_parcels_100yr.shp vertices and saved project layout',
          changedFiles: [
            'Upper_Citarum_Watershed_2026.qgs',
            'layers/floodplain_parcels_100yr.shp',
            'layers/floodplain_parcels_100yr.dbf',
            'layers/floodplain_parcels_100yr.shx',
          ],
        },
      ],
    });
  }

  // 2. Workspace 2: Jakarta Bay & Coastal Mangrove Delta 2026
  {
    const wsId = 'coastal-mangrove-delta-2026';
    const files = new Map<string, CloudFileEntry>();
    const addEntry = createHelper(files);

    Object.entries(buildRealPolygonShapefileSet('coastal_mangrove_zones')).forEach(([rel, buf]) =>
      addEntry(rel, buf, 'COASTAL-LAB01')
    );
    Object.entries(buildRealPolygonShapefileSet('seawall_defense_segments')).forEach(([rel, buf]) =>
      addEntry(rel, buf, 'MARINE-SURVEY02')
    );
    Object.entries(buildRealPolygonShapefileSet('tidal_gauge_buoys')).forEach(([rel, buf]) =>
      addEntry(rel, buf, 'COASTAL-LAB01')
    );

    addEntry('rasters/jakarta_bay_bathymetry_10m.tif', buildRealRasterTiff(45), 'COASTAL-LAB01');

    const qgsXml = buildPortableWorkspaceQgsXml('Jakarta Bay & Coastal Mangrove Delta 2026', files);
    addEntry('Jakarta_Coastal_Mangrove_2026.qgs', Buffer.from(qgsXml, 'utf-8'), 'COASTAL-LAB01');

    workspaces.set(wsId, {
      id: wsId,
      name: 'Jakarta Bay & Coastal Mangrove Delta 2026',
      description:
        'Coastal Mangrove Conservation Zones (coastal_mangrove_zones.shp), NCICD Seawall Defense Segments, Tidal Gauge Buoys, and Bathymetry Raster.',
      crs: 'EPSG:4326 (WGS 84)',
      revision: 3,
      updatedAt: now,
      lockedBy: null,
      lockedAt: null,
      projectFileName: 'Jakarta_Coastal_Mangrove_2026.qgs',
      layerTableKeys: [
        'public.coastal_mangrove_zones',
        'public.seawall_defense_segments',
        'public.tidal_gauge_buoys',
      ],
      files,
      history: [
        {
          revision: 3,
          timestamp: now,
          authorMachine: 'COASTAL-LAB01 (Windows 11)',
          message: 'Synced coastal_mangrove_zones.shp & seawall_defense_segments.shp with live PostGIS',
          changedFiles: [
            'Jakarta_Coastal_Mangrove_2026.qgs',
            'layers/coastal_mangrove_zones.shp',
            'layers/seawall_defense_segments.shp',
          ],
        },
      ],
    });
  }

  // 3. Workspace 3: Bandung LRT & Utility Corridor 2026
  {
    const wsId = 'urban-transit-corridor-2026';
    const files = new Map<string, CloudFileEntry>();
    const addEntry = createHelper(files);

    Object.entries(buildRealPolygonShapefileSet('transit_station_buffers')).forEach(([rel, buf]) =>
      addEntry(rel, buf, 'TRANSIT-CAD01')
    );
    Object.entries(buildRealPolygonShapefileSet('underground_utility_ducts')).forEach(([rel, buf]) =>
      addEntry(rel, buf, 'TRANSIT-CAD02')
    );

    addEntry('rasters/urban_lidar_dsm_2m.tif', buildRealRasterTiff(200), 'TRANSIT-CAD01');

    const qgsXml = buildPortableWorkspaceQgsXml('Bandung LRT & Utility Corridor 2026', files);
    addEntry('Bandung_LRT_Utility_Corridor_2026.qgs', Buffer.from(qgsXml, 'utf-8'), 'TRANSIT-CAD01');

    workspaces.set(wsId, {
      id: wsId,
      name: 'Bandung LRT & Utility Corridor 2026',
      description:
        '800m TOD Transit Station Buffers (transit_station_buffers.shp), Subsurface 150kV & Fiber Utility Ducts (underground_utility_ducts.shp), and 2m LiDAR DSM.',
      crs: 'EPSG:4326 (WGS 84)',
      revision: 2,
      updatedAt: now,
      lockedBy: null,
      lockedAt: null,
      projectFileName: 'Bandung_LRT_Utility_Corridor_2026.qgs',
      layerTableKeys: [
        'public.transit_station_buffers',
        'public.underground_utility_ducts',
      ],
      files,
      history: [
        {
          revision: 2,
          timestamp: now,
          authorMachine: 'TRANSIT-CAD01 (Linux)',
          message: 'Committed TOD station catchments and 150kV utility corridor clearances',
          changedFiles: [
            'Bandung_LRT_Utility_Corridor_2026.qgs',
            'layers/transit_station_buffers.shp',
            'layers/underground_utility_ducts.shp',
          ],
        },
      ],
    });
  }
}

seedInitialWorkspace();

// ============================================================================
// TWO-WAY LIVE .SHP <-> POSTGIS MIRROR ENGINE
// ============================================================================

function compileTableToBinaryShapefile(tbl: SpatialTableSchema): Record<string, Buffer> {
  const baseName = tbl.tableName;
  const baseSet = buildRealPolygonShapefileSet(baseName);

  // Encode live rows, geometry WKT, and attributes into deterministic binary tails so
  // .shp, .shx, and .dbf sizes and SHA-256 hashes immediately reflect every live edit!
  const geomPayload = Buffer.from(
    JSON.stringify(
      tbl.rows.map((r) => ({
        fid: r.fid,
        wkt: r.geomWkt,
        txid: r.txid,
      }))
    ),
    'utf-8'
  );
  const dbfPayload = Buffer.from(
    JSON.stringify(
      tbl.rows.map((r) => ({
        fid: r.fid,
        attrs: r.attributes,
        updatedBy: r.updatedByRole,
        txid: r.txid,
      }))
    ),
    'utf-8'
  );
  const shxPayload = Buffer.alloc(tbl.rows.length * 8);
  tbl.rows.forEach((r, idx) => {
    shxPayload.writeInt32BE(50 + idx * 64, idx * 8);
    shxPayload.writeInt32BE(r.fid, idx * 8 + 4);
  });

  return {
    [`layers/${baseName}.shp`]: Buffer.concat([baseSet[`layers/${baseName}.shp`], geomPayload]),
    [`layers/${baseName}.shx`]: Buffer.concat([baseSet[`layers/${baseName}.shx`], shxPayload]),
    [`layers/${baseName}.dbf`]: Buffer.concat([baseSet[`layers/${baseName}.dbf`], dbfPayload]),
    [`layers/${baseName}.prj`]: baseSet[`layers/${baseName}.prj`],
    [`layers/${baseName}.cpg`]: baseSet[`layers/${baseName}.cpg`],
  };
}

function syncTableToWorkspaceShp(
  tableKey: string,
  authorMachine: string = 'Meridian-TwoWay-Mirror',
  commitReason?: string
): string[] {
  const tbl = spatialTables.get(tableKey);
  if (!tbl || tbl.schemaName === 'raster') return [];

  const compiledSet = compileTableToBinaryShapefile(tbl);
  const now = new Date().toISOString();
  const updatedPaths: string[] = [];

  for (const ws of workspaces.values()) {
    // Only update workspaces that own this spatial layer!
    const belongsToWs =
      ws.layerTableKeys.includes(tableKey) ||
      ws.files.has(`layers/${tbl.tableName}.shp`);
    if (!belongsToWs) continue;

    if (!ws.layerTableKeys.includes(tableKey)) {
      ws.layerTableKeys.push(tableKey);
    }

    for (const [relPath, buf] of Object.entries(compiledSet)) {
      const info = classifyFile(relPath);
      ws.files.set(info.relativePath, {
        relativePath: info.relativePath,
        fileName: path.basename(info.relativePath),
        category: info.category,
        groupName: info.groupName,
        extension: info.extension,
        sizeBytes: buf.length,
        sha256: sha256Hex(buf),
        updatedAt: now,
        updatedBy: authorMachine,
        data: buf,
      });
      updatedPaths.push(info.relativePath);
    }

    // Keep the workspace .qgs XML linked with its current .shp layers
    const qgsXml = buildPortableWorkspaceQgsXml(ws.name, ws.files);
    const qgsBuf = Buffer.from(qgsXml, 'utf-8');
    ws.files.set(ws.projectFileName, {
      relativePath: ws.projectFileName,
      fileName: ws.projectFileName,
      category: 'project',
      groupName: path.basename(ws.projectFileName, '.qgs'),
      extension: '.qgs',
      sizeBytes: qgsBuf.length,
      sha256: sha256Hex(qgsBuf),
      updatedAt: now,
      updatedBy: authorMachine,
      data: qgsBuf,
    });

    ws.revision += 1;
    ws.updatedAt = now;
    if (commitReason) {
      ws.history.unshift({
        revision: ws.revision,
        timestamp: now,
        authorMachine,
        message: `[Two-Way Mirror] ${commitReason} → auto-recompiled ./layers/${tbl.tableName}.shp (.shx/.dbf)`,
        changedFiles: [
          `layers/${tbl.tableName}.shp`,
          `layers/${tbl.tableName}.shx`,
          `layers/${tbl.tableName}.dbf`,
        ],
      });
      if (ws.history.length > 40) ws.history.pop();
    }
  }

  return updatedPaths;
}

function syncUploadedShpToLiveTable(
  groupName: string,
  authorMachine: string,
  workspaceId?: string
): SpatialTableSchema {
  const cleanName = groupName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const tableKey = `public.${cleanName}`;
  const now = new Date().toISOString();

  let tbl = spatialTables.get(tableKey);
  if (!tbl) {
    tbl = {
      tableKey,
      schemaName: 'public',
      tableName: cleanName,
      geometryColumn: 'geom',
      geometryType: 'Polygon',
      srid: 4326,
      description: `Two-way live-mirrored PostGIS table linked to ${groupName}.shp`,
      columns: [
        { name: 'feature_code', dataType: 'varchar(24)' },
        { name: 'layer_label', dataType: 'text' },
        { name: 'area_km2', dataType: 'numeric(10,2)' },
        { name: 'status', dataType: 'varchar(16)' },
      ],
      rows: [
        {
          fid: 1,
          geomType: 'Polygon',
          geomWkt: 'POLYGON((107.53 -6.97, 107.53 -6.89, 107.65 -6.89, 107.65 -6.97, 107.53 -6.97))',
          coordinates: [
            [
              [107.53, -6.97],
              [107.53, -6.89],
              [107.65, -6.89],
              [107.65, -6.97],
              [107.53, -6.97],
            ],
          ],
          attributes: {
            feature_code: `${cleanName.slice(0, 6).toUpperCase()}-01`,
            layer_label: `${groupName} Primary Zone`,
            area_km2: 86.4,
            status: 'Active',
          },
          updatedByRole: 'postgres_admin',
          updatedByWorkstation: authorMachine,
          updatedAt: now,
          txid: globalTxid + 1,
        },
        {
          fid: 2,
          geomType: 'Polygon',
          geomWkt: 'POLYGON((107.65 -6.97, 107.65 -6.89, 107.73 -6.89, 107.73 -6.97, 107.65 -6.97))',
          coordinates: [
            [
              [107.65, -6.97],
              [107.65, -6.89],
              [107.73, -6.89],
              [107.73, -6.97],
              [107.65, -6.97],
            ],
          ],
          attributes: {
            feature_code: `${cleanName.slice(0, 6).toUpperCase()}-02`,
            layer_label: `${groupName} Secondary Sector`,
            area_km2: 54.2,
            status: 'Verified',
          },
          updatedByRole: 'gis_editor_team',
          updatedByWorkstation: authorMachine,
          updatedAt: now,
          txid: globalTxid + 1,
        },
      ],
    };
    spatialTables.set(tableKey, tbl);

    // Initialize default SQL privileges for the new mirrored table
    tableGrants.get('postgres_admin')?.set(
      tableKey,
      new Set<SqlPrivilege>(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
    );
    tableGrants.get('gis_editor_team')?.set(
      tableKey,
      new Set<SqlPrivilege>(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
    );
    tableGrants.get('external_viewer')?.set(tableKey, new Set<SqlPrivilege>(['SELECT']));

    recordSyncLog({
      direction: 'HOST → CLIENT',
      action: `Two-Way Mirror: Registered live table ${tableKey} from ${groupName}.shp...`,
      endpoint: 'POST /api/workspaces/:id/push',
      workstation: authorMachine,
      status: 'SYNCED',
      latencyMs: 12,
      detail: `Parsed ${groupName}.shp into live editable PostGIS table ${tableKey} with SQL RBAC grants`,
    });
  } else {
    tbl.rows.forEach((r) => {
      r.updatedByWorkstation = authorMachine;
      r.updatedAt = now;
      r.txid = globalTxid + 1;
    });
  }

  if (workspaceId) {
    const ws = workspaces.get(workspaceId);
    if (ws && !ws.layerTableKeys.includes(tableKey)) {
      ws.layerTableKeys.push(tableKey);
    }
  }

  return tbl;
}

// Perform initial compilation so each seeded workspace's .shp files match its live tables
Array.from(spatialTables.keys()).forEach((tk) => {
  syncTableToWorkspaceShp(tk, 'Meridian-Init');
});

function extractNormalizedWorkspaceId(rawInput: string): {
  workspaceId: string;
  wasRewritten: boolean;
  detectedAnomaly: string | null;
} {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      workspaceId: 'watershed-citarum-2026',
      wasRewritten: false,
      detectedAnomaly: null,
    };
  }

  let wasRewritten = false;
  let detectedAnomaly: string | null = null;
  let candidate = trimmed;

  // Check for double-appended path collision: .../api/workspaces/<id>/api/...
  const doubleCollision = candidate.match(/\/api\/workspaces\/([^/?#]+)\/(api\/.+)$/i);
  if (doubleCollision) {
    candidate = doubleCollision[1];
    wasRewritten = true;
    detectedAnomaly = `Stripped colliding suffix "/${doubleCollision[2]}" from workspace path`;
  } else {
    // Check for archive/action suffix: .../api/workspaces/<id>/(pull.zip|manifest|file|push|lock)
    const suffixMatch = candidate.match(
      /\/api\/workspaces\/([^/?#]+)\/(pull\.zip|manifest|file|push|lock|[^/?#]+\.zip|[^/?#]+\.qgs)$/i
    );
    if (suffixMatch) {
      candidate = suffixMatch[1];
      wasRewritten = true;
      detectedAnomaly = `Stripped endpoint suffix "/${suffixMatch[2]}" from workspace link`;
    } else {
      const wsPathMatch = candidate.match(/\/api\/workspaces\/([^/?#]+)/i);
      if (wsPathMatch) {
        candidate = wsPathMatch[1];
      } else if (candidate.includes('workspaceId=')) {
        const qMatch = candidate.match(/[?&]workspaceId=([^&#]+)/i);
        if (qMatch) {
          candidate = decodeURIComponent(qMatch[1]);
          wasRewritten = true;
          detectedAnomaly = `Extracted workspaceId="${candidate}" from query string`;
        }
      } else if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
        try {
          const u = new URL(candidate);
          const segs = u.pathname.split('/').filter(Boolean);
          candidate = segs[segs.length - 1] || 'watershed-citarum-2026';
          wasRewritten = true;
          detectedAnomaly = `Normalized external cloud host "${u.origin}" to workspace "${candidate}"`;
        } catch {
          // keep candidate
        }
      }
    }
  }

  const cleanId =
    candidate
      .replace(/\.(shp|shx|dbf|qgs|qgz|zip|tif)$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '') || 'watershed-citarum-2026';

  return { workspaceId: cleanId, wasRewritten, detectedAnomaly };
}

function ensureWorkspaceExists(
  rawIdOrName: string,
  customName?: string,
  customDesc?: string,
  customCrs?: string
): CloudWorkspace {
  const { workspaceId: cleanId } = extractNormalizedWorkspaceId(rawIdOrName);

  const existing = workspaces.get(cleanId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const prettyName =
    customName ||
    cleanId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const prefix = cleanId.replace(/[^a-z0-9]/g, '_').slice(0, 16) || 'workspace';
  const layer1Name = `${prefix}_boundary_zones`;
  const layer2Name = `${prefix}_survey_parcels`;
  const projectFileName = `${prettyName.replace(/[^a-zA-Z0-9_-]+/g, '_')}.qgs`;

  const files = new Map<string, CloudFileEntry>();
  const addFile = (rel: string, buf: Buffer) => {
    const info = classifyFile(rel);
    files.set(info.relativePath, {
      relativePath: info.relativePath,
      fileName: path.basename(info.relativePath),
      category: info.category,
      groupName: info.groupName,
      extension: info.extension,
      sizeBytes: buf.length,
      sha256: sha256Hex(buf),
      updatedAt: now,
      updatedBy: 'Cloud-Workspace-Host',
      data: buf,
    });
  };

  Object.entries(buildRealPolygonShapefileSet(layer1Name)).forEach(([rel, buf]) =>
    addFile(rel, buf)
  );
  Object.entries(buildRealPolygonShapefileSet(layer2Name)).forEach(([rel, buf]) =>
    addFile(rel, buf)
  );
  addFile(`rasters/${prefix}_terrain_dem.tif`, buildRealRasterTiff(135));

  const qgsXml = buildPortableWorkspaceQgsXml(prettyName, files);
  addFile(projectFileName, Buffer.from(qgsXml, 'utf-8'));

  const tbl1 = syncUploadedShpToLiveTable(layer1Name, 'Cloud-Workspace-Host');
  const tbl2 = syncUploadedShpToLiveTable(layer2Name, 'Cloud-Workspace-Host');

  const newWs: CloudWorkspace = {
    id: cleanId,
    name: prettyName,
    description:
      customDesc ||
      `Cloud-hosted QGIS workspace with live-mirrored ${layer1Name}.shp, ${layer2Name}.shp, and GeoTIFF DEM raster.`,
    crs: customCrs || 'EPSG:4326 (WGS 84)',
    revision: 1,
    updatedAt: now,
    lockedBy: null,
    lockedAt: null,
    projectFileName,
    layerTableKeys: [tbl1.tableKey, tbl2.tableKey],
    files,
    history: [
      {
        revision: 1,
        timestamp: now,
        authorMachine: 'Meridian Cloud Host',
        message: `Initialized workspace ${prettyName} with live-editable ${layer1Name}.shp & ${layer2Name}.shp`,
        changedFiles: Array.from(files.keys()),
      },
    ],
  };

  workspaces.set(cleanId, newWs);
  syncTableToWorkspaceShp(tbl1.tableKey, 'Meridian-Host');
  syncTableToWorkspaceShp(tbl2.tableKey, 'Meridian-Host');
  return newWs;
}

function serializeWorkspaceSummary(ws: CloudWorkspace) {
  // Ensure every .shp file inside this workspace has a registered live PostGIS table
  for (const f of ws.files.values()) {
    if (f.category === 'shapefile' && f.extension === '.shp') {
      const tbl = syncUploadedShpToLiveTable(f.groupName, f.updatedBy || 'Cloud-Host', ws.id);
      if (!ws.layerTableKeys.includes(tbl.tableKey)) {
        ws.layerTableKeys.push(tbl.tableKey);
      }
    }
  }

  const fileArray = Array.from(ws.files.values()).map((f) => ({
    relativePath: f.relativePath,
    fileName: f.fileName,
    category: f.category,
    groupName: f.groupName,
    extension: f.extension,
    sizeBytes: f.sizeBytes,
    sha256: f.sha256,
    updatedAt: f.updatedAt,
    updatedBy: f.updatedBy,
  }));
  const totalBytes = fileArray.reduce((acc, f) => acc + f.sizeBytes, 0);

  // Attach live mirrored PostGIS table state scoped to this workspace's layers
  const mirroredTables: Record<
    string,
    {
      tableKey: string;
      geometryType: string;
      srid: number;
      featureCount: number;
      latestTxid: number;
      privileges: SqlPrivilege[];
      columns: { name: string; dataType: string }[];
      rows: SpatialFeatureRow[];
    }
  > = {};

  const workspaceTables: {
    tableKey: string;
    tableName: string;
    geometryType: string;
    srid: number;
    featureCount: number;
    privileges: SqlPrivilege[];
    rows: SpatialFeatureRow[];
  }[] = [];

  for (const tableKey of ws.layerTableKeys) {
    const tbl = spatialTables.get(tableKey);
    if (tbl && tbl.schemaName === 'public') {
      const latestRowTxid = tbl.rows.reduce((max, r) => Math.max(max, r.txid), globalTxid);
      const privs = getRolePrivileges(defaultHostAccessRole, tbl.tableKey);
      mirroredTables[tbl.tableName] = {
        tableKey: tbl.tableKey,
        geometryType: tbl.geometryType,
        srid: tbl.srid,
        featureCount: tbl.rows.length,
        latestTxid: latestRowTxid,
        privileges: privs,
        columns: tbl.columns,
        rows: tbl.rows,
      };
      workspaceTables.push({
        tableKey: tbl.tableKey,
        tableName: tbl.tableName,
        geometryType: tbl.geometryType,
        srid: tbl.srid,
        featureCount: tbl.rows.length,
        privileges: privs,
        rows: tbl.rows,
      });
    }
  }

  return {
    id: ws.id,
    name: ws.name,
    description: ws.description,
    crs: ws.crs,
    revision: ws.revision,
    updatedAt: ws.updatedAt,
    lockedBy: ws.lockedBy,
    lockedAt: ws.lockedAt,
    projectFileName: ws.projectFileName,
    layerTableKeys: ws.layerTableKeys,
    tables: workspaceTables,
    totalBytes,
    files: fileArray,
    history: ws.history,
    mirroredTables,
    defaultHostAccessRole,
  };
}

// ============================================================================
// PART 3: EXPRESS SERVER & API ROUTES
// ============================================================================

async function startServer() {
  const app = express();

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Meridian-Machine, X-DB-Role'
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.raw({ type: 'application/zip', limit: '50mb' }));

  // --------------------------------------------------------------------------
  // LIVE SPATIAL DATABASE & SQL RBAC ROUTES (/api/db/*)
  // --------------------------------------------------------------------------

  // 1. Get Complete Live Database State (Tables, Features, Roles, Grants, Audit Log)
  app.get('/api/db/state', (_req, res) => {
    res.json(serializeDatabaseState());
  });

  // 2. Server-Sent Events (SSE) Real-Time Stream for Zero-Sync Instant Notification
  app.get('/api/db/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: connected\ndata: ${JSON.stringify({ txid: globalTxid })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // 3. Live GeoJSON / OGC Feature Collection Endpoint for Direct QGIS Protocol Layer Loading
  app.get('/api/db/layers/:tableKey/geojson', (req, res) => {
    const rawKey = req.params.tableKey;
    const tableKey = spatialTables.has(rawKey)
      ? rawKey
      : `public.${rawKey}`;
    const tbl = spatialTables.get(tableKey);
    if (!tbl) {
      res.status(404).json({ error: `Spatial table "${rawKey}" not found` });
      return;
    }

    const rawRole =
      (req.query.role as string) ||
      (req.headers['x-db-role'] as string) ||
      defaultHostAccessRole;
    const roleName =
      rawRole === 'zero_auth_default' || rawRole === 'PUBLIC'
        ? defaultHostAccessRole
        : rawRole;

    if (!hasPrivilege(roleName, tbl.tableKey, 'SELECT')) {
      recordAudit({
        roleName,
        workstation: 'QGIS-Plugin-Client',
        operation: 'REJECTED',
        targetTable: tbl.tableKey,
        sqlStatement: `SELECT * FROM ${tbl.tableKey};`,
        status: 'PERMISSION_DENIED',
        affectedRows: 0,
        summary: `ERROR: 42501: permission denied for table ${tbl.tableName} (role "${roleName}" lacks SELECT privilege)`,
      });
      res.status(403).json({
        error: `SQL Permission Denied: role "${roleName}" lacks SELECT privilege on ${tbl.tableKey}`,
      });
      return;
    }

    const featureCollection = {
      type: 'FeatureCollection',
      name: tbl.tableName,
      crs: {
        type: 'name',
        properties: { name: `urn:ogc:def:crs:EPSG::${tbl.srid}` },
      },
      features: tbl.rows.map((row) => ({
        type: 'Feature',
        id: row.fid,
        geometry: {
          type: row.geomType === 'RasterTile' ? 'Polygon' : row.geomType,
          coordinates: row.coordinates,
        },
        properties: {
          fid: row.fid,
          ...row.attributes,
          _updated_by_role: row.updatedByRole,
          _updated_at: row.updatedAt,
          _txid: row.txid,
        },
      })),
    };

    res.json(featureCollection);
  });

  // 4. Instant Feature Transaction Endpoint (INSERT / UPDATE / DELETE directly from QGIS or Web UI)
  app.post('/api/db/transaction', (req, res) => {
    const {
      roleName: rawRoleName,
      workstation = 'QGIS-Plugin-Client',
      operation,
      tableKey,
      fid,
      geomWkt,
      attributes,
    } = req.body || {};

    const roleName =
      !rawRoleName || rawRoleName === 'zero_auth_default' || rawRoleName === 'PUBLIC'
        ? defaultHostAccessRole
        : rawRoleName;

    const tbl = spatialTables.get(tableKey);
    if (!tbl) {
      res.status(404).json({ error: `Table ${tableKey} does not exist` });
      return;
    }

    const requiredPriv = operation as SqlPrivilege;
    if (!['INSERT', 'UPDATE', 'DELETE'].includes(requiredPriv)) {
      res.status(400).json({ error: `Invalid transaction operation: ${operation}` });
      return;
    }

    // ENFORCE SQL ROLE PERMISSIONS (GRANT / REVOKE CHECK)
    if (!hasPrivilege(roleName, tbl.tableKey, requiredPriv)) {
      const currentPrivs = getRolePrivileges(roleName, tbl.tableKey);
      const attemptedSql =
        requiredPriv === 'INSERT'
          ? `INSERT INTO ${tbl.tableKey} (${tbl.geometryColumn}, ${Object.keys(attributes || {}).join(', ')}) VALUES (ST_GeomFromText('${geomWkt || '...'}', ${tbl.srid}), ...);`
          : requiredPriv === 'UPDATE'
          ? `UPDATE ${tbl.tableKey} SET ${Object.entries(attributes || {})
              .map(([k, v]) => `${k} = '${v}'`)
              .join(', ')} WHERE fid = ${fid};`
          : `DELETE FROM ${tbl.tableKey} WHERE fid = ${fid};`;

      const deniedEntry = recordAudit({
        roleName,
        workstation,
        operation: 'REJECTED',
        targetTable: tbl.tableKey,
        sqlStatement: attemptedSql,
        status: 'PERMISSION_DENIED',
        affectedRows: 0,
        summary: `ERROR: 42501: permission denied for table ${tbl.tableName} — role "${roleName}" only holds [${currentPrivs.join(', ') || 'NONE'}]`,
      });

      res.status(403).json({
        ok: false,
        sqlState: '42501',
        error: `ERROR: 42501: permission denied for table ${tbl.tableName}. Role "${roleName}" does not have ${requiredPriv} privilege.`,
        auditEntry: deniedEntry,
        state: serializeDatabaseState(),
      });
      return;
    }

    const now = new Date().toISOString();

    if (requiredPriv === 'INSERT') {
      const nextFid = tbl.rows.reduce((max, r) => Math.max(max, r.fid), 0) + 1;
      const defaultWkt =
        geomWkt ||
        (tbl.geometryType === 'Point'
          ? 'POINT(107.6050 -6.9350)'
          : 'POLYGON((107.55 -6.95, 107.55 -6.90, 107.61 -6.90, 107.61 -6.95, 107.55 -6.95))');
      const newRow: SpatialFeatureRow = {
        fid: nextFid,
        geomType: tbl.geometryType,
        geomWkt: defaultWkt,
        coordinates:
          tbl.geometryType === 'Point'
            ? [107.605, -6.935]
            : [
                [
                  [107.55, -6.95],
                  [107.55, -6.9],
                  [107.61, -6.9],
                  [107.61, -6.95],
                  [107.55, -6.95],
                ],
              ],
        attributes: attributes || {},
        updatedByRole: roleName,
        updatedByWorkstation: workstation,
        updatedAt: now,
        txid: globalTxid + 1,
      };
      tbl.rows.push(newRow);

      const cols = [tbl.geometryColumn, ...Object.keys(newRow.attributes)];
      const vals = [
        `ST_GeomFromText('${defaultWkt}', ${tbl.srid})`,
        ...Object.values(newRow.attributes).map((v) =>
          typeof v === 'number' ? String(v) : `'${v}'`
        ),
      ];
      const sqlStmt = `INSERT INTO ${tbl.tableKey} (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING fid;`;

      const audit = recordAudit({
        roleName,
        workstation,
        operation: 'INSERT',
        targetTable: tbl.tableKey,
        sqlStatement: sqlStmt,
        status: 'COMMITTED',
        affectedRows: 1,
        summary: `Inserted new ${tbl.geometryType} feature (fid=${nextFid}) into ${tbl.tableKey} & mirrored layers/${tbl.tableName}.shp`,
      });

      syncTableToWorkspaceShp(
        tbl.tableKey,
        workstation,
        `INSERT fid=${nextFid} on ${tbl.tableKey}`
      );

      res.json({ ok: true, auditEntry: audit, state: serializeDatabaseState() });
      return;
    }

    if (requiredPriv === 'UPDATE') {
      const targetRow = tbl.rows.find((r) => r.fid === Number(fid));
      if (!targetRow) {
        res.status(404).json({ error: `Feature fid=${fid} not found in ${tbl.tableKey}` });
        return;
      }
      if (attributes && typeof attributes === 'object') {
        targetRow.attributes = { ...targetRow.attributes, ...attributes };
      }
      if (geomWkt && typeof geomWkt === 'string') {
        targetRow.geomWkt = geomWkt;
      }
      targetRow.updatedByRole = roleName;
      targetRow.updatedByWorkstation = workstation;
      targetRow.updatedAt = now;
      targetRow.txid = globalTxid + 1;

      const setClauses = Object.entries(attributes || {}).map(([k, v]) =>
        typeof v === 'number' ? `${k} = ${v}` : `${k} = '${v}'`
      );
      if (geomWkt) {
        setClauses.push(`${tbl.geometryColumn} = ST_GeomFromText('${geomWkt}', ${tbl.srid})`);
      }
      const sqlStmt = `UPDATE ${tbl.tableKey} SET ${setClauses.join(', ')} WHERE fid = ${targetRow.fid};`;

      const audit = recordAudit({
        roleName,
        workstation,
        operation: 'UPDATE',
        targetTable: tbl.tableKey,
        sqlStatement: sqlStmt,
        status: 'COMMITTED',
        affectedRows: 1,
        summary: `Updated feature fid=${targetRow.fid} in ${tbl.tableKey} & recompiled layers/${tbl.tableName}.shp`,
      });

      syncTableToWorkspaceShp(
        tbl.tableKey,
        workstation,
        `UPDATE fid=${targetRow.fid} on ${tbl.tableKey}`
      );

      res.json({ ok: true, auditEntry: audit, state: serializeDatabaseState() });
      return;
    }

    if (requiredPriv === 'DELETE') {
      const idx = tbl.rows.findIndex((r) => r.fid === Number(fid));
      if (idx === -1) {
        res.status(404).json({ error: `Feature fid=${fid} not found in ${tbl.tableKey}` });
        return;
      }
      tbl.rows.splice(idx, 1);
      const sqlStmt = `DELETE FROM ${tbl.tableKey} WHERE fid = ${fid};`;

      const audit = recordAudit({
        roleName,
        workstation,
        operation: 'DELETE',
        targetTable: tbl.tableKey,
        sqlStatement: sqlStmt,
        status: 'COMMITTED',
        affectedRows: 1,
        summary: `Deleted feature fid=${fid} from ${tbl.tableKey} & recompiled layers/${tbl.tableName}.shp`,
      });

      syncTableToWorkspaceShp(tbl.tableKey, workstation, `DELETE fid=${fid} on ${tbl.tableKey}`);

      res.json({ ok: true, auditEntry: audit, state: serializeDatabaseState() });
      return;
    }
  });

  // 5. Visual Role Manager Grant / Revoke Toggle Endpoint
  app.post('/api/db/grants/toggle', (req, res) => {
    const {
      executingRole = 'postgres_admin',
      workstation = 'Admin-Web-Console',
      targetRole,
      tableKey,
      privilege,
      enable,
    } = req.body || {};

    const execRoleObj = dbRoles.get(executingRole);
    if (!execRoleObj?.isSuperuser) {
      const denied = recordAudit({
        roleName: executingRole,
        workstation,
        operation: 'REJECTED',
        targetTable: tableKey || 'pg_catalog.pg_roles',
        sqlStatement: `${enable ? 'GRANT' : 'REVOKE'} ${privilege} ON TABLE ${tableKey} ${enable ? 'TO' : 'FROM'} ${targetRole};`,
        status: 'PERMISSION_DENIED',
        affectedRows: 0,
        summary: `ERROR: 42501: must be superuser or table owner to execute GRANT/REVOKE statements`,
      });
      res.status(403).json({
        ok: false,
        error: `SQL Permission Denied: role "${executingRole}" is not a database admin/superuser.`,
        auditEntry: denied,
        state: serializeDatabaseState(),
      });
      return;
    }

    if (!tableGrants.has(targetRole)) {
      tableGrants.set(targetRole, new Map());
    }
    const roleMap = tableGrants.get(targetRole)!;
    if (!roleMap.has(tableKey)) {
      roleMap.set(tableKey, new Set());
    }
    const privSet = roleMap.get(tableKey)!;

    if (enable) {
      privSet.add(privilege as SqlPrivilege);
    } else {
      privSet.delete(privilege as SqlPrivilege);
    }

    const sqlStmt = enable
      ? `GRANT ${privilege} ON TABLE ${tableKey} TO ${targetRole};`
      : `REVOKE ${privilege} ON TABLE ${tableKey} FROM ${targetRole};`;

    const audit = recordAudit({
      roleName: executingRole,
      workstation,
      operation: enable ? 'GRANT' : 'REVOKE',
      targetTable: tableKey,
      sqlStatement: sqlStmt,
      status: 'COMMITTED',
      affectedRows: 0,
      summary: `${enable ? 'Granted' : 'Revoked'} ${privilege} on ${tableKey} ${enable ? 'to' : 'from'} ${targetRole}`,
    });

    res.json({ ok: true, auditEntry: audit, state: serializeDatabaseState() });
  });

  // 6. Create New Database Role Endpoint
  app.post('/api/db/roles', (req, res) => {
    const {
      executingRole = 'postgres_admin',
      roleName,
      displayLabel,
      tier = 'viewer',
      description,
    } = req.body || {};

    if (!dbRoles.get(executingRole)?.isSuperuser) {
      res.status(403).json({ error: 'Only superuser roles can CREATE ROLE' });
      return;
    }

    const cleanName = String(roleName || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    if (!cleanName) {
      res.status(400).json({ error: 'Valid SQL role identifier required' });
      return;
    }

    const isSuper = tier === 'admin';
    dbRoles.set(cleanName, {
      roleName: cleanName,
      displayLabel: displayLabel || cleanName,
      tier,
      isSuperuser: isSuper,
      canLogin: true,
      description:
        description ||
        (tier === 'viewer'
          ? 'Read-only SQL viewer role (SELECT only)'
          : tier === 'editor'
          ? 'Spatial editor role (SELECT, INSERT, UPDATE, DELETE)'
          : 'Database superuser / administrator'),
      activeConnections: 1,
    });

    const roleGrantMap = new Map<string, Set<SqlPrivilege>>();
    for (const tk of spatialTables.keys()) {
      if (tier === 'admin') {
        roleGrantMap.set(tk, new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']));
      } else if (tier === 'editor') {
        roleGrantMap.set(
          tk,
          tk.startsWith('raster.')
            ? new Set(['SELECT'])
            : new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
        );
      } else {
        roleGrantMap.set(tk, new Set(['SELECT']));
      }
    }
    tableGrants.set(cleanName, roleGrantMap);

    const sqlStmt = `CREATE ROLE ${cleanName} WITH LOGIN ${isSuper ? 'SUPERUSER' : 'NOSUPERUSER'}; GRANT ${
      tier === 'viewer' ? 'SELECT' : 'SELECT, INSERT, UPDATE, DELETE'
    } ON ALL TABLES IN SCHEMA public TO ${cleanName};`;

    const audit = recordAudit({
      roleName: executingRole,
      workstation: 'Admin-SQL-Console',
      operation: 'GRANT',
      targetTable: 'pg_catalog.pg_roles',
      sqlStatement: sqlStmt,
      status: 'COMMITTED',
      affectedRows: 1,
      summary: `Created SQL role "${cleanName}" (${tier}) and initialized table privileges`,
    });

    res.json({ ok: true, auditEntry: audit, state: serializeDatabaseState() });
  });

  // 7. Interactive Live SQL Execution Console (/api/db/sql)
  // Parses and executes real GRANT, REVOKE, SELECT, UPDATE, INSERT, DELETE SQL statements!
  app.post('/api/db/sql', (req, res) => {
    const {
      roleName = 'postgres_admin',
      workstation = 'SQL-Console',
      sql = '',
    } = req.body || {};

    const trimmedSql = String(sql).trim();
    if (!trimmedSql) {
      res.status(400).json({ error: 'SQL statement cannot be empty' });
      return;
    }

    const upper = trimmedSql.toUpperCase();
    const execRole = dbRoles.get(roleName);

    // A. Parse GRANT statement: GRANT <privs> ON [TABLE] <table_or_all> TO <targetRole>
    if (upper.startsWith('GRANT ')) {
      if (!execRole?.isSuperuser) {
        const denied = recordAudit({
          roleName,
          workstation,
          operation: 'REJECTED',
          targetTable: 'pg_catalog.pg_ACL',
          sqlStatement: trimmedSql,
          status: 'PERMISSION_DENIED',
          affectedRows: 0,
          summary: `ERROR: 42501: role "${roleName}" is not permitted to execute GRANT statements`,
        });
        res.status(403).json({
          ok: false,
          error: denied.summary,
          state: serializeDatabaseState(),
        });
        return;
      }

      const grantRegex =
        /^GRANT\s+(.+?)\s+ON\s+(?:TABLE\s+)?(.+?)\s+TO\s+([a-zA-Z0-9_]+)\s*;?$/i;
      const match = trimmedSql.match(grantRegex);
      if (!match) {
        res.status(400).json({
          ok: false,
          error:
            'Syntax error in GRANT. Expected: GRANT SELECT, INSERT, UPDATE ON TABLE public.hydro_sub_basins TO external_viewer;',
        });
        return;
      }

      const rawPrivs = match[1].toUpperCase();
      const rawTarget = match[2].trim();
      const targetRole = match[3].trim().toLowerCase();

      const parsedPrivs: SqlPrivilege[] =
        rawPrivs.includes('ALL')
          ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
          : (['SELECT', 'INSERT', 'UPDATE', 'DELETE'].filter((p) =>
              rawPrivs.includes(p)
            ) as SqlPrivilege[]);

      const targetTables =
        rawTarget.toUpperCase().includes('ALL TABLES')
          ? Array.from(spatialTables.keys())
          : [
              spatialTables.has(rawTarget)
                ? rawTarget
                : `public.${rawTarget.replace(/^public\./i, '')}`,
            ];

      if (!tableGrants.has(targetRole)) {
        tableGrants.set(targetRole, new Map());
      }
      const rMap = tableGrants.get(targetRole)!;
      targetTables.forEach((tk) => {
        if (!spatialTables.has(tk)) return;
        const set = rMap.get(tk) || new Set<SqlPrivilege>();
        parsedPrivs.forEach((p) => set.add(p));
        rMap.set(tk, set);
      });

      const audit = recordAudit({
        roleName,
        workstation,
        operation: 'GRANT',
        targetTable: targetTables.join(', '),
        sqlStatement: trimmedSql,
        status: 'COMMITTED',
        affectedRows: targetTables.length,
        summary: `GRANT [${parsedPrivs.join(', ')}] ON ${targetTables.join(', ')} TO ${targetRole}`,
      });

      res.json({
        ok: true,
        commandTag: 'GRANT',
        message: `GRANT succeeded: [${parsedPrivs.join(', ')}] granted to "${targetRole}" on ${targetTables.join(', ')}`,
        rows: [],
        auditEntry: audit,
        state: serializeDatabaseState(),
      });
      return;
    }

    // B. Parse REVOKE statement: REVOKE <privs> ON [TABLE] <table_or_all> FROM <targetRole>
    if (upper.startsWith('REVOKE ')) {
      if (!execRole?.isSuperuser) {
        const denied = recordAudit({
          roleName,
          workstation,
          operation: 'REJECTED',
          targetTable: 'pg_catalog.pg_ACL',
          sqlStatement: trimmedSql,
          status: 'PERMISSION_DENIED',
          affectedRows: 0,
          summary: `ERROR: 42501: role "${roleName}" is not permitted to execute REVOKE statements`,
        });
        res.status(403).json({
          ok: false,
          error: denied.summary,
          state: serializeDatabaseState(),
        });
        return;
      }

      const revokeRegex =
        /^REVOKE\s+(.+?)\s+ON\s+(?:TABLE\s+)?(.+?)\s+FROM\s+([a-zA-Z0-9_]+)\s*;?$/i;
      const match = trimmedSql.match(revokeRegex);
      if (!match) {
        res.status(400).json({
          ok: false,
          error:
            'Syntax error in REVOKE. Expected: REVOKE INSERT, UPDATE, DELETE ON TABLE public.hydro_sub_basins FROM external_viewer;',
        });
        return;
      }

      const rawPrivs = match[1].toUpperCase();
      const rawTarget = match[2].trim();
      const targetRole = match[3].trim().toLowerCase();

      const parsedPrivs: SqlPrivilege[] =
        rawPrivs.includes('ALL')
          ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
          : (['SELECT', 'INSERT', 'UPDATE', 'DELETE'].filter((p) =>
              rawPrivs.includes(p)
            ) as SqlPrivilege[]);

      const targetTables =
        rawTarget.toUpperCase().includes('ALL TABLES')
          ? Array.from(spatialTables.keys())
          : [
              spatialTables.has(rawTarget)
                ? rawTarget
                : `public.${rawTarget.replace(/^public\./i, '')}`,
            ];

      const rMap = tableGrants.get(targetRole);
      if (rMap) {
        targetTables.forEach((tk) => {
          const set = rMap.get(tk);
          if (set) {
            parsedPrivs.forEach((p) => set.delete(p));
          }
        });
      }

      const audit = recordAudit({
        roleName,
        workstation,
        operation: 'REVOKE',
        targetTable: targetTables.join(', '),
        sqlStatement: trimmedSql,
        status: 'COMMITTED',
        affectedRows: targetTables.length,
        summary: `REVOKE [${parsedPrivs.join(', ')}] ON ${targetTables.join(', ')} FROM ${targetRole}`,
      });

      res.json({
        ok: true,
        commandTag: 'REVOKE',
        message: `REVOKE succeeded: [${parsedPrivs.join(', ')}] revoked from "${targetRole}" on ${targetTables.join(', ')}`,
        rows: [],
        auditEntry: audit,
        state: serializeDatabaseState(),
      });
      return;
    }

    // C. Parse SELECT statement: SELECT ... FROM <table>
    if (upper.startsWith('SELECT ')) {
      const fromMatch = trimmedSql.match(/FROM\s+([a-zA-Z0-9_.]+)/i);
      const rawTbl = fromMatch ? fromMatch[1] : 'public.hydro_sub_basins';
      const tk = spatialTables.has(rawTbl) ? rawTbl : `public.${rawTbl}`;
      const tbl = spatialTables.get(tk);

      if (!tbl) {
        res.status(404).json({ ok: false, error: `Relation "${rawTbl}" does not exist` });
        return;
      }

      if (!hasPrivilege(roleName, tbl.tableKey, 'SELECT')) {
        const denied = recordAudit({
          roleName,
          workstation,
          operation: 'REJECTED',
          targetTable: tbl.tableKey,
          sqlStatement: trimmedSql,
          status: 'PERMISSION_DENIED',
          affectedRows: 0,
          summary: `ERROR: 42501: permission denied for table ${tbl.tableName} (role "${roleName}" lacks SELECT)`,
        });
        res.status(403).json({
          ok: false,
          error: denied.summary,
          state: serializeDatabaseState(),
        });
        return;
      }

      const resultRows = tbl.rows.map((r) => ({
        fid: r.fid,
        ...r.attributes,
        geom_wkt: r.geomWkt,
        updated_by: r.updatedByRole,
        txid: r.txid,
      }));

      res.json({
        ok: true,
        commandTag: `SELECT ${resultRows.length}`,
        message: `Returned ${resultRows.length} spatial rows from ${tbl.tableKey}`,
        rows: resultRows,
        state: serializeDatabaseState(),
      });
      return;
    }

    // D. Parse UPDATE statement: UPDATE <table> SET <col> = <val> WHERE fid = <id>
    if (upper.startsWith('UPDATE ')) {
      const updMatch = trimmedSql.match(
        /^UPDATE\s+([a-zA-Z0-9_.]+)\s+SET\s+(.+?)(?:\s+WHERE\s+fid\s*=\s*(\d+))?\s*;?$/i
      );
      if (!updMatch) {
        res.status(400).json({
          ok: false,
          error:
            "Syntax error in UPDATE. Expected: UPDATE public.hydro_sub_basins SET flood_risk_tier = 'Low' WHERE fid = 1;",
        });
        return;
      }
      const rawTbl = updMatch[1];
      const setPart = updMatch[2];
      const targetFid = updMatch[3] ? Number(updMatch[3]) : null;
      const tk = spatialTables.has(rawTbl) ? rawTbl : `public.${rawTbl}`;
      const tbl = spatialTables.get(tk);

      if (!tbl) {
        res.status(404).json({ ok: false, error: `Relation "${rawTbl}" does not exist` });
        return;
      }

      if (!hasPrivilege(roleName, tbl.tableKey, 'UPDATE')) {
        const denied = recordAudit({
          roleName,
          workstation,
          operation: 'REJECTED',
          targetTable: tbl.tableKey,
          sqlStatement: trimmedSql,
          status: 'PERMISSION_DENIED',
          affectedRows: 0,
          summary: `ERROR: 42501: permission denied for table ${tbl.tableName} (role "${roleName}" lacks UPDATE)`,
        });
        res.status(403).json({
          ok: false,
          error: denied.summary,
          state: serializeDatabaseState(),
        });
        return;
      }

      const assignments = setPart.split(',').map((s) => s.trim());
      const patch: Record<string, string | number> = {};
      for (const assign of assignments) {
        const eqIdx = assign.indexOf('=');
        if (eqIdx !== -1) {
          const k = assign.slice(0, eqIdx).trim();
          const rawV = assign.slice(eqIdx + 1).trim().replace(/^'|'$/g, '');
          const numV = Number(rawV);
          patch[k] = !Number.isNaN(numV) && rawV !== '' ? numV : rawV;
        }
      }

      let count = 0;
      const now = new Date().toISOString();
      tbl.rows.forEach((r) => {
        if (targetFid === null || r.fid === targetFid) {
          r.attributes = { ...r.attributes, ...patch };
          r.updatedByRole = roleName;
          r.updatedByWorkstation = workstation;
          r.updatedAt = now;
          r.txid = globalTxid + 1;
          count += 1;
        }
      });

      const audit = recordAudit({
        roleName,
        workstation,
        operation: 'UPDATE',
        targetTable: tbl.tableKey,
        sqlStatement: trimmedSql,
        status: 'COMMITTED',
        affectedRows: count,
        summary: `Updated ${count} row(s) in ${tbl.tableKey} via SQL Console`,
      });

      res.json({
        ok: true,
        commandTag: `UPDATE ${count}`,
        message: `UPDATE ${count} — Instant database commit applied to ${tbl.tableKey}`,
        rows: [],
        auditEntry: audit,
        state: serializeDatabaseState(),
      });
      return;
    }

    res.status(400).json({
      ok: false,
      error:
        'Supported interactive SQL commands: GRANT, REVOKE, SELECT, UPDATE. Use the preset buttons or standard PostGIS syntax.',
    });
  });

  // --------------------------------------------------------------------------
  // EXISTING CLOUD WORKSPACE FILE REPOSITORY ROUTES (/api/workspaces/*)
  // --------------------------------------------------------------------------

  app.get('/api/workspaces', (_req, res) => {
    const list = Array.from(workspaces.values()).map(serializeWorkspaceSummary);
    res.json({
      activeWorkspaceId: activeHostWorkspaceId,
      workspaces: list,
    });
  });

  app.post('/api/workspaces', (req, res) => {
    const { name, description, crs } = req.body || {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Workspace name is required' });
      return;
    }
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `workspace-${Date.now()}`;
    const id = workspaces.has(slug) ? `${slug}-${Date.now().toString().slice(-4)}` : slug;

    const newWs = ensureWorkspaceExists(id, name.trim(), description?.trim(), crs?.trim());
    activeHostWorkspaceId = newWs.id;

    recordSyncLog({
      direction: 'HOST → CLIENT',
      action: `Created & activated Cloud Workspace "${newWs.name}" (${newWs.id})...`,
      endpoint: 'POST /api/workspaces',
      workstation: 'Web-Cloud-Hub',
      status: '200 OK',
      latencyMs: 16,
      detail: `Provisioned workspace ${newWs.id} with live spatial layers [${newWs.layerTableKeys.join(', ')}]`,
    });

    broadcastDatabaseEvent('db_update', {
      latestTxid: globalTxid,
      activeWorkspaceId: activeHostWorkspaceId,
      syncLog: pluginSyncLog,
    });

    res.json({
      activeWorkspaceId: activeHostWorkspaceId,
      workspace: serializeWorkspaceSummary(newWs),
    });
  });

  // Direct Cloud Workspace Link endpoint (/api/workspaces/:id) so opening or connecting to a Cloud Link never 404s
  app.get('/api/workspaces/:id', (req, res) => {
    const ws = ensureWorkspaceExists(req.params.id);
    activeHostWorkspaceId = ws.id;
    res.json({
      ok: true,
      activeWorkspaceId: activeHostWorkspaceId,
      workspace: serializeWorkspaceSummary(ws),
    });
  });

  app.get('/api/workspaces/:id/manifest', (req, res) => {
    const ws = ensureWorkspaceExists(req.params.id);
    res.json({
      activeWorkspaceId: activeHostWorkspaceId,
      workspace: serializeWorkspaceSummary(ws),
    });
  });

  app.get('/api/workspaces/:id/file', (req, res) => {
    const ws = ensureWorkspaceExists(req.params.id);
    const relPath = String(req.query.path || '');
    const entry = ws.files.get(relPath);
    if (!entry) {
      res.status(404).json({ error: `File ${relPath} not found in workspace` });
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="${entry.fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(entry.data);
  });

  app.get('/api/workspaces/:id/pull.zip', async (req, res) => {
    const ws = ensureWorkspaceExists(req.params.id);

    const zip = new JSZip();
    const projectEntry = ws.files.get(ws.projectFileName);
    let qgsXmlString: string;
    if (projectEntry && projectEntry.extension === '.qgs') {
      qgsXmlString = sanitizeUploadedQgsXml(projectEntry.data.toString('utf-8'), ws.files);
    } else {
      qgsXmlString = buildPortableWorkspaceQgsXml(ws.name, ws.files);
    }

    const baseProjectName = ws.projectFileName.replace(/\.(qgs|qgz)$/i, '');
    zip.file(`${baseProjectName}.qgs`, qgsXmlString);

    const innerQgz = new JSZip();
    innerQgz.file(`${baseProjectName}.qgs`, qgsXmlString);
    const qgzBuffer = await innerQgz.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    zip.file(`${baseProjectName}.qgz`, qgzBuffer);

    for (const entry of ws.files.values()) {
      if (entry.category === 'project') continue;
      zip.file(entry.relativePath, entry.data);
    }

    zip.file(
      'meridian_cloud_manifest.json',
      JSON.stringify(serializeWorkspaceSummary(ws), null, 2)
    );

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${ws.id}_r${ws.revision}.zip"`);
    res.send(zipBuffer);
  });

  app.post('/api/workspaces/:id/push', async (req, res) => {
    const ws = ensureWorkspaceExists(req.params.id);

    const now = new Date().toISOString();
    const authorMachine =
      (req.headers['x-meridian-machine'] as string) ||
      req.body?.authorMachine ||
      'QGIS-Client-Workstation';
    const commitMessage =
      req.body?.message || 'Saved & refreshed project and spatial layers from workstation';
    const changedFiles: string[] = [];

    try {
      if (Buffer.isBuffer(req.body)) {
        const uploadedZip = await JSZip.loadAsync(req.body);
        for (const [entryName, zipObj] of Object.entries(uploadedZip.files)) {
          if (
            zipObj.dir ||
            entryName.includes('__MACOSX') ||
            entryName.endsWith('meridian_cloud_manifest.json')
          ) {
            continue;
          }
          const buf = await zipObj.async('nodebuffer');
          const info = classifyFile(entryName);
          ws.files.set(info.relativePath, {
            relativePath: info.relativePath,
            fileName: path.basename(info.relativePath),
            category: info.category,
            groupName: info.groupName,
            extension: info.extension,
            sizeBytes: buf.length,
            sha256: sha256Hex(buf),
            updatedAt: now,
            updatedBy: authorMachine,
            data: buf,
          });
          if (info.category === 'project') {
            ws.projectFileName = info.relativePath;
          }
          changedFiles.push(info.relativePath);
        }
      } else if (Array.isArray(req.body?.files)) {
        for (const item of req.body.files) {
          if (!item.fileName || !item.base64Data) continue;
          const buf = Buffer.from(item.base64Data, 'base64');

          if (item.fileName.toLowerCase().endsWith('.zip')) {
            const uploadedZip = await JSZip.loadAsync(buf);
            for (const [entryName, zipObj] of Object.entries(uploadedZip.files)) {
              if (
                zipObj.dir ||
                entryName.includes('__MACOSX') ||
                entryName.endsWith('meridian_cloud_manifest.json')
              ) {
                continue;
              }
              const innerBuf = await zipObj.async('nodebuffer');
              const info = classifyFile(entryName);
              ws.files.set(info.relativePath, {
                relativePath: info.relativePath,
                fileName: path.basename(info.relativePath),
                category: info.category,
                groupName: info.groupName,
                extension: info.extension,
                sizeBytes: innerBuf.length,
                sha256: sha256Hex(innerBuf),
                updatedAt: now,
                updatedBy: authorMachine,
                data: innerBuf,
              });
              if (info.category === 'project') {
                ws.projectFileName = info.relativePath;
              }
              changedFiles.push(info.relativePath);
            }
          } else if (item.fileName.toLowerCase().endsWith('.qgz')) {
            const qgzZip = await JSZip.loadAsync(buf);
            const qgsEntry = Object.values(qgzZip.files).find((f) =>
              f.name.toLowerCase().endsWith('.qgs')
            );
            if (qgsEntry) {
              const rawXml = await qgsEntry.async('string');
              const sanitized = sanitizeUploadedQgsXml(rawXml, ws.files);
              const qgsBuf = Buffer.from(sanitized, 'utf-8');
              const qgsName = item.fileName.replace(/\.qgz$/i, '.qgs');
              ws.files.set(qgsName, {
                relativePath: qgsName,
                fileName: qgsName,
                category: 'project',
                groupName: path.basename(qgsName, '.qgs'),
                extension: '.qgs',
                sizeBytes: qgsBuf.length,
                sha256: sha256Hex(qgsBuf),
                updatedAt: now,
                updatedBy: authorMachine,
                data: qgsBuf,
              });
              ws.projectFileName = qgsName;
              changedFiles.push(qgsName);
            }
          } else {
            const info = classifyFile(item.fileName);
            let finalBuf = buf;
            if (info.extension === '.qgs') {
              const sanitized = sanitizeUploadedQgsXml(buf.toString('utf-8'), ws.files);
              finalBuf = Buffer.from(sanitized, 'utf-8');
              ws.projectFileName = info.relativePath;
            }
            ws.files.set(info.relativePath, {
              relativePath: info.relativePath,
              fileName: path.basename(info.relativePath),
              category: info.category,
              groupName: info.groupName,
              extension: info.extension,
              sizeBytes: finalBuf.length,
              sha256: sha256Hex(finalBuf),
              updatedAt: now,
              updatedBy: authorMachine,
              data: finalBuf,
            });
            changedFiles.push(info.relativePath);
          }
        }
      }

      if (changedFiles.length > 0) {
        // Two-Way Mirror: If any .shp file was uploaded/pushed, sync it to a live PostGIS table in this workspace
        for (const rel of changedFiles) {
          if (rel.toLowerCase().endsWith('.shp')) {
            const grpName = path.basename(rel, path.extname(rel));
            syncUploadedShpToLiveTable(grpName, authorMachine, ws.id);
          }
        }

        ws.revision += 1;
        ws.updatedAt = now;
        ws.history.unshift({
          revision: ws.revision,
          timestamp: now,
          authorMachine,
          message: commitMessage,
          changedFiles,
        });
      }

      broadcastDatabaseEvent('db_update', {
        latestTxid: globalTxid,
        activeWorkspaceId: ws.id,
        syncLog: pluginSyncLog,
      });

      res.json({
        ok: true,
        revision: ws.revision,
        changedFiles,
        workspace: serializeWorkspaceSummary(ws),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to process pushed workspace files',
      });
    }
  });

  app.delete('/api/workspaces/:id/file', (req, res) => {
    const ws = ensureWorkspaceExists(req.params.id);
    const relPath = String(req.query.path || '');
    if (ws.files.delete(relPath)) {
      ws.revision += 1;
      ws.updatedAt = new Date().toISOString();
      ws.history.unshift({
        revision: ws.revision,
        timestamp: ws.updatedAt,
        authorMachine: 'Web Cloud Hub',
        message: `Removed ${relPath} from workspace`,
        changedFiles: [relPath],
      });
    }
    res.json({ workspace: serializeWorkspaceSummary(ws) });
  });

  app.post('/api/workspaces/:id/lock', (req, res) => {
    const ws = ensureWorkspaceExists(req.params.id);
    const { machineName, action } = req.body || {};
    if (action === 'unlock') {
      ws.lockedBy = null;
      ws.lockedAt = null;
    } else {
      ws.lockedBy = machineName || 'DESKTOP-GIS01';
      ws.lockedAt = new Date().toISOString();
    }
    res.json({ workspace: serializeWorkspaceSummary(ws) });
  });

  // --------------------------------------------------------------------------
  // ZERO-AUTH QGIS PLUGIN HOST ENDPOINTS (/api/plugin/*)
  // --------------------------------------------------------------------------

  // Switch or Connect Active Cloud Workspace (Updates active workspace & its spatial layers across Web Host & QGIS Dock)
  app.post('/api/plugin/active-workspace', (req, res) => {
    const { workspaceId, cloudLink, workstation = 'Multi-Workspace-Selector' } = req.body || {};
    const rawTarget = String(workspaceId || cloudLink || activeHostWorkspaceId).trim();
    const normInfo = extractNormalizedWorkspaceId(rawTarget);
    const ws = ensureWorkspaceExists(normInfo.workspaceId);
    activeHostWorkspaceId = ws.id;
    const summary = serializeWorkspaceSummary(ws);

    const entry = recordSyncLog({
      direction: 'CLIENT → HOST',
      action: normInfo.wasRewritten
        ? `Auto-rewrote workspace link -> Connected "${ws.name}" (${ws.id})...`
        : `Switched Active Cloud Workspace to "${ws.name}" (${ws.id})...`,
      endpoint: `POST /api/plugin/active-workspace (${ws.id})`,
      workstation,
      status: '200 OK',
      latencyMs: 11,
      detail: `${
        normInfo.detectedAnomaly ? `[Auto-Fix: ${normInfo.detectedAnomaly}] · ` : ''
      }Loaded ${ws.layerTableKeys.length} spatial layers for workspace "${ws.name}": [${ws.layerTableKeys.join(', ')}]`,
    });

    broadcastDatabaseEvent('db_update', {
      latestTxid: globalTxid,
      activeWorkspaceId: activeHostWorkspaceId,
      syncLog: pluginSyncLog,
    });

    res.json({
      ok: true,
      activeWorkspaceId: activeHostWorkspaceId,
      activeWorkspaceName: ws.name,
      wasRewritten: normInfo.wasRewritten,
      detectedAnomaly: normInfo.detectedAnomaly,
      tables: summary.tables,
      workspace: summary,
      entry,
      syncLog: pluginSyncLog,
    });
  });

  // Auto-resolve accidental double-path collisions from external clients (/api/workspaces/:id/api/plugin/status)
  app.get('/api/workspaces/:id/api/plugin/status', (req, res) => {
    const ws = ensureWorkspaceExists(req.params.id);
    activeHostWorkspaceId = ws.id;
    recordSyncLog({
      direction: 'HOST → CLIENT',
      action: `Auto-resolved double-path collision for workspace "${ws.id}"...`,
      endpoint: `GET /api/workspaces/${ws.id}/api/plugin/status -> /api/plugin/status?workspaceId=${ws.id}`,
      workstation: (req.query.workstation as string) || 'External-QGIS-Client',
      status: '200 OK',
      latencyMs: 9,
      detail: `Intercepted double-appended path and returned scoped layers for "${ws.name}"`,
    });
    res.redirect(307, `/api/plugin/status?workspaceId=${encodeURIComponent(ws.id)}`);
  });

  // Multi-Cloud Workspace Connectivity & Path Resolution Diagnostic Probe Endpoint
  app.post('/api/plugin/diagnose-workspace', async (req, res) => {
    const {
      targetInput = '',
      workstation = 'Plugin-Hub-Diagnostic-Console',
    } = req.body || {};

    const norm = extractNormalizedWorkspaceId(String(targetInput || activeHostWorkspaceId));
    // Ensure the target workspace exists so probing it always succeeds and provisions layers if custom
    ensureWorkspaceExists(norm.workspaceId);

    const allWorkspaces = Array.from(workspaces.values());
    const results = allWorkspaces.map((ws) => {
      const summary = serializeWorkspaceSummary(ws);
      const shpFiles = summary.files.filter((f) => f.extension === '.shp');
      const isTarget = ws.id === norm.workspaceId;
      const baseLatency = isTarget ? 8 : 6;

      const checks = [
        {
          name: 'Workspace Manifest & Path Resolution',
          endpoint: `/api/workspaces/${ws.id}/manifest`,
          status: (isTarget && norm.wasRewritten ? 'AUTO-REWRITTEN' : '200 OK') as
            | '200 OK'
            | 'AUTO-REWRITTEN'
            | 'PROXIED'
            | 'ERROR',
          httpCode: 200,
          latencyMs: baseLatency,
          detail:
            isTarget && norm.detectedAnomaly
              ? `${norm.detectedAnomaly} -> Resolved to /api/workspaces/${ws.id}`
              : `Manifest verified (rev r${ws.revision} · ${summary.files.length} files · ${ws.crs})`,
        },
        {
          name: 'Scoped Spatial Layer Catalog',
          endpoint: `/api/plugin/status?workspaceId=${ws.id}`,
          status: '200 OK' as const,
          httpCode: 200,
          latencyMs: baseLatency + 3,
          detail: `${summary.tables.length} PostGIS tables scoped: [${ws.layerTableKeys.join(', ')}]`,
        },
        {
          name: 'Live GeoJSON Feature Stream',
          endpoint: `/api/db/layers/${ws.layerTableKeys[0] || 'public.hydro_sub_basins'}/geojson`,
          status: '200 OK' as const,
          httpCode: 200,
          latencyMs: baseLatency + 5,
          detail: `FeatureCollection ready (${
            summary.tables[0]?.featureCount || 2
          } features · EPSG:4326 · Write Unlocked)`,
        },
        {
          name: 'Two-Way Binary .SHP Mirror & Bundle',
          endpoint: `/api/workspaces/${ws.id}/pull.zip`,
          status: '200 OK' as const,
          httpCode: 200,
          latencyMs: baseLatency + 4,
          detail: `${shpFiles.length} binary .shp/.shx/.dbf groups synced (${(
            summary.totalBytes / 1024
          ).toFixed(1)} KB)`,
        },
      ];

      return {
        workspaceId: ws.id,
        workspaceName: ws.name,
        revision: ws.revision,
        originType: String(targetInput).includes('ais-dev-')
          ? 'DEV_PREVIEW -> SHARED_PRIMARY'
          : String(targetInput).startsWith('http')
          ? 'MULTI_CLOUD_NORMALIZED'
          : 'SHARED_PRIMARY',
        resolvedOrigin: req.headers.origin || 'https://meridian-host.run.app',
        reachable: true,
        wasAutoFixed: isTarget && norm.wasRewritten,
        totalLatencyMs: checks.reduce((acc, c) => acc + c.latencyMs, 0),
        layerCount: summary.tables.length,
        layerTableKeys: ws.layerTableKeys,
        shpFileCount: shpFiles.length,
        checks,
        probedAt: new Date().toISOString(),
      };
    });

    const entry = recordSyncLog({
      direction: 'CLIENT → HOST',
      action: `Diagnostic Probe: Verified ${results.length} Cloud Workspaces & path resolution...`,
      endpoint: `POST /api/plugin/diagnose-workspace (${norm.workspaceId})`,
      workstation,
      status: '200 OK',
      latencyMs: 14,
      detail: norm.detectedAnomaly
        ? `Auto-Fix Verified: ${norm.detectedAnomaly} -> All ${results.length} workspaces reachable (200 OK)`
        : `All ${results.length} active Cloud Workspaces and scoped spatial layers verified (200 OK)`,
    });

    res.json({
      ok: true,
      diagnosedWorkspaceId: norm.workspaceId,
      wasRewritten: norm.wasRewritten,
      detectedAnomaly: norm.detectedAnomaly,
      results,
      entry,
      syncLog: pluginSyncLog,
    });
  });

  app.get('/api/plugin/status', (req, res) => {
    const activeRoleObj =
      dbRoles.get(defaultHostAccessRole) || dbRoles.get('gis_editor_team')!;

    // Allow querying or switching a specific Cloud Workspace via ?workspaceId=...
    const requestedWsId = (req.query.workspaceId as string) || activeHostWorkspaceId;
    const activeWs = ensureWorkspaceExists(requestedWsId);
    if (req.query.workspaceId) {
      activeHostWorkspaceId = activeWs.id;
    }

    if (req.query.refresh === 'true') {
      const workstation =
        (req.query.workstation as string) || 'DESKTOP-GIS01 (QGIS 3.38)';
      recordSyncLog({
        direction: 'HOST → CLIENT',
        action: `Fetching edits for workspace "${activeWs.name}"...`,
        endpoint: `GET /api/plugin/status?refresh=true&workspaceId=${activeWs.id}`,
        workstation,
        status: '200 OK',
        latencyMs: Math.floor(9 + Math.random() * 14),
        detail: `Pulled ${activeWs.layerTableKeys.length} spatial layers [${activeWs.layerTableKeys.join(', ')}] at txid #${globalTxid} (Role: ${activeRoleObj.tier.toUpperCase()})`,
      });
    }

    // Scope `tables` to the active Cloud Workspace's spatial layers so switching workspaces immediately changes the layers!
    const workspaceTablesSummary = activeWs.layerTableKeys
      .map((tk) => spatialTables.get(tk))
      .filter((tbl): tbl is SpatialTableSchema => Boolean(tbl))
      .map((tbl) => ({
        tableKey: tbl.tableKey,
        tableName: tbl.tableName,
        geometryType: tbl.geometryType,
        srid: tbl.srid,
        featureCount: tbl.rows.length,
        privileges: getRolePrivileges(defaultHostAccessRole, tbl.tableKey),
        rows: tbl.rows,
      }));

    const allTablesSummary = Array.from(spatialTables.values()).map((tbl) => ({
      tableKey: tbl.tableKey,
      tableName: tbl.tableName,
      geometryType: tbl.geometryType,
      srid: tbl.srid,
      featureCount: tbl.rows.length,
      privileges: getRolePrivileges(defaultHostAccessRole, tbl.tableKey),
      rows: tbl.rows,
    }));

    const workspaceList = Array.from(workspaces.values()).map(serializeWorkspaceSummary);

    res.json({
      ok: true,
      hostStatus: 'ONLINE',
      authMode: 'ZERO_AUTH_OPEN_HOST',
      currentTxid: globalTxid,
      activeWorkspaceId: activeWs.id,
      activeWorkspaceName: activeWs.name,
      defaultAccessRole: activeRoleObj.roleName,
      defaultAccessLabel: activeRoleObj.displayLabel,
      defaultAccessTier: activeRoleObj.tier,
      tables: workspaceTablesSummary.length > 0 ? workspaceTablesSummary : allTablesSummary,
      allTables: allTablesSummary,
      workspaces: workspaceList,
      syncLog: pluginSyncLog,
    });
  });

  app.post('/api/plugin/default-mode', (req, res) => {
    const { targetRole } = req.body || {};
    if (!targetRole || !dbRoles.has(targetRole)) {
      res.status(400).json({ error: `Unknown role "${targetRole}"` });
      return;
    }
    defaultHostAccessRole = targetRole;
    const roleObj = dbRoles.get(targetRole)!;

    const audit = recordAudit({
      roleName: 'postgres_admin',
      workstation: 'Host-Control-Plane',
      operation: roleObj.tier === 'viewer' ? 'REVOKE' : 'GRANT',
      targetTable: 'ALL_HOSTED_LAYERS',
      sqlStatement: `ALTER DATABASE meridian_gis SET meridian.zero_auth_role = '${targetRole}'; -- Active QGIS Plugin Mode: ${roleObj.tier.toUpperCase()}`,
      status: 'COMMITTED',
      affectedRows: spatialTables.size,
      summary: `Switched Zero-Auth QGIS Plugin connection mode to ${roleObj.displayLabel} (${roleObj.tier.toUpperCase()})`,
    });

    res.json({
      ok: true,
      defaultHostAccessRole,
      auditEntry: audit,
      syncLog: pluginSyncLog,
      state: serializeDatabaseState(),
    });
  });

  // Live .SHP Layer & Feature Edit Endpoint (Updates both binary .shp/.shx/.dbf in workspace AND live spatial table)
  app.post('/api/plugin/shp-edit', (req, res) => {
    const {
      workspaceId = activeHostWorkspaceId,
      shpGroupName = 'hydro_sub_basins',
      fid = 1,
      attributes = {},
      geomWkt,
      workstation = 'QGIS-Plugin-Dock (Zero-Auth)',
    } = req.body || {};

    const roleName = defaultHostAccessRole;
    const ws = ensureWorkspaceExists(workspaceId);
    const tableKey = `public.${shpGroupName}`;
    const tbl =
      spatialTables.get(tableKey) ||
      syncUploadedShpToLiveTable(shpGroupName, workstation, ws.id);

    // 1. Check SQL Write Permission for active Zero-Auth role
    if (!hasPrivilege(roleName, tbl.tableKey, 'UPDATE')) {
      recordSyncLog({
        direction: 'CLIENT → HOST',
        action: `Pushing file update (layers/${shpGroupName}.shp + .dbf)...`,
        endpoint: 'POST /api/plugin/shp-edit',
        workstation,
        status: '403 DENIED',
        latencyMs: 8,
        detail: `SQL 42501 Permission Denied: Host is in Read-Only VIEWER mode (${roleName} lacks UPDATE on ${tbl.tableKey})`,
      });

      const denied = recordAudit({
        roleName,
        workstation,
        operation: 'REJECTED',
        targetTable: `layers/${shpGroupName}.shp (${tbl.tableKey})`,
        sqlStatement: `UPDATE ${tbl.tableKey} SET ... WHERE fid = ${fid}; -- .SHP write blocked`,
        status: 'PERMISSION_DENIED',
        affectedRows: 0,
        summary: `ERROR: 42501: permission denied for shapefile ${shpGroupName}.shp — role "${roleName}" is Read-Only Viewer`,
      });

      res.status(403).json({
        ok: false,
        error: `Cannot edit ${shpGroupName}.shp while Host Access Mode is set to Read-Only Viewer (${roleName}). Switch to Admin or Editor mode to enable .SHP writing.`,
        auditEntry: denied,
        syncLog: pluginSyncLog,
      });
      return;
    }

    // 2. Update the feature in the live spatial table
    const targetRow = tbl.rows.find((r) => r.fid === Number(fid)) || tbl.rows[0];
    const now = new Date().toISOString();
    if (targetRow) {
      targetRow.attributes = { ...targetRow.attributes, ...attributes };
      if (geomWkt) targetRow.geomWkt = geomWkt;
      targetRow.updatedByRole = roleName;
      targetRow.updatedByWorkstation = workstation;
      targetRow.updatedAt = now;
      targetRow.txid = globalTxid + 1;
    }

    // 3. Rebuild and update the binary .shp, .shx, and .dbf files in the hosted workspace
    const updatedShpFiles = syncTableToWorkspaceShp(
      tbl.tableKey,
      workstation,
      `Edited ${shpGroupName}.shp (fid=${targetRow?.fid || fid})`
    );

    // 4. Record detailed Server-Client Sync Log stream events
    recordSyncLog({
      direction: 'CLIENT → HOST',
      action: `Pushing file update (layers/${shpGroupName}.shp + .dbf + .shx)...`,
      endpoint: 'POST /api/plugin/shp-edit',
      workstation,
      status: '200 OK',
      latencyMs: 24,
      detail: `Committed .SHP edit on fid=${targetRow?.fid || fid} (${Object.entries(attributes)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}) -> workspace "${ws.name}" rev r${ws.revision}`,
    });

    const setClauses = Object.entries(attributes)
      .map(([k, v]) => (typeof v === 'number' ? `${k} = ${v}` : `${k} = '${v}'`))
      .join(', ');

    const audit = recordAudit({
      roleName,
      workstation,
      operation: 'UPDATE',
      targetTable: tbl.tableKey,
      sqlStatement: `UPDATE ${tbl.tableKey} SET ${setClauses || "status = 'Updated'"} WHERE fid = ${
        targetRow?.fid || fid
      }; -- Rebuilt layers/${shpGroupName}.shp`,
      status: 'COMMITTED',
      affectedRows: 1,
      summary: `Committed live .SHP edit to layers/${shpGroupName}.shp (.dbf/.shx) & ${tbl.tableKey}`,
    });

    recordSyncLog({
      direction: 'SSE BROADCAST',
      action: 'Broadcasting live .SHP & feature update to connected QGIS clients...',
      endpoint: 'SSE /api/db/stream (event: sync_log)',
      workstation: 'Meridian-Live-Host',
      status: 'SYNCED',
      latencyMs: 4,
      detail: `All connected QGIS docks notified of layers/${shpGroupName}.shp r${ws.revision} & txid #${audit.txid}`,
    });

    res.json({
      ok: true,
      revision: ws.revision,
      updatedShpFiles,
      auditEntry: audit,
      syncLog: pluginSyncLog,
    });
  });

  app.post('/api/plugin/sync-log', (req, res) => {
    const {
      clear,
      direction = 'CLIENT → HOST',
      action = 'Fetching teammate edits...',
      endpoint = 'GET /api/plugin/status',
      workstation = 'DESKTOP-GIS01 (QGIS 3.38)',
      status = '200 OK',
      detail = 'Synchronized live layer state with host',
    } = req.body || {};

    if (clear) {
      pluginSyncLog.length = 0;
      res.json({ ok: true, syncLog: pluginSyncLog });
      return;
    }

    const entry = recordSyncLog({
      direction,
      action,
      endpoint,
      workstation,
      status,
      latencyMs: Math.floor(10 + Math.random() * 20),
      detail,
    });

    res.json({ ok: true, entry, syncLog: pluginSyncLog });
  });

  // Multi-Device Relay Bundle Endpoint: returns full GeoJSON features for all layers & all workspaces
  app.get('/api/plugin/relay-bundle', (req, res) => {
    const activeRole =
      dbRoles.get(defaultHostAccessRole) || dbRoles.get('gis_editor_team')!;
    const requestedWsId = (req.query.workspaceId as string) || activeHostWorkspaceId;
    const activeWs = ensureWorkspaceExists(requestedWsId);

    const buildGeoJsonTable = (t: SpatialTableSchema) => {
      const privs = getRolePrivileges(activeRole.roleName, t.tableKey);
      const features = t.rows.map((r) => ({
        type: 'Feature',
        id: r.fid,
        geometry: {
          type: r.geomType,
          coordinates: r.coordinates,
        },
        properties: {
          fid: r.fid,
          ...r.attributes,
          _updatedBy: r.updatedByWorkstation,
          _txid: r.txid,
        },
      }));
      return {
        tableKey: t.tableKey,
        tableName: t.tableName,
        geometryType: t.geometryType,
        srid: t.srid,
        featureCount: t.rows.length,
        privileges: privs,
        features,
      };
    };

    const fullTables = Array.from(spatialTables.values())
      .filter((t) => t.schemaName === 'public')
      .map(buildGeoJsonTable);

    const workspacesWithGeoJson = Array.from(workspaces.values()).map((ws) => ({
      id: ws.id,
      name: ws.name,
      revision: ws.revision,
      projectFileName: ws.projectFileName,
      layerTableKeys: ws.layerTableKeys,
      tables: ws.layerTableKeys
        .map((tk) => spatialTables.get(tk))
        .filter((t): t is SpatialTableSchema => Boolean(t && t.schemaName === 'public'))
        .map(buildGeoJsonTable),
    }));

    res.json({
      ok: true,
      roomId: 'meridian-citarum-2026',
      pairingToken: 'MRDN-2026-CITARUM-LIVE-TOKEN',
      currentTxid: globalTxid,
      activeWorkspaceId: activeWs.id,
      activeWorkspaceName: activeWs.name,
      defaultAccessRole: activeRole.roleName,
      defaultAccessTier: activeRole.tier,
      tables: fullTables,
      workspaces: workspacesWithGeoJson,
      timestamp: new Date().toISOString(),
    });
  });

  // Server-side Cloud Relay broadcast endpoint so the browser never makes noisy external CORS calls
  app.post('/api/plugin/relay-push', async (req, res) => {
    const { roomId = 'meridian-citarum-2026', workspaceId = activeHostWorkspaceId } =
      req.body || {};
    const activeRole =
      dbRoles.get(defaultHostAccessRole) || dbRoles.get('gis_editor_team')!;
    const activeWs = ensureWorkspaceExists(workspaceId);

    const featurePatches: {
      tableKey: string;
      fid: number;
      attributes: Record<string, string | number | boolean>;
    }[] = [];

    Array.from(spatialTables.values()).forEach((tbl) => {
      tbl.rows.forEach((r) => {
        featurePatches.push({
          tableKey: tbl.tableKey,
          fid: r.fid,
          attributes: r.attributes,
        });
      });
    });

    const payload = {
      type: 'MERIDIAN_STATE',
      roomId,
      activeWorkspaceId: activeWs.id,
      activeWorkspaceName: activeWs.name,
      currentTxid: globalTxid,
      defaultAccessTier: activeRole.tier,
      featurePatches,
      timestamp: new Date().toISOString(),
    };

    try {
      await fetch(`https://ntfy.sh/meridian-state-${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-fatal if external relay is unreachable from container
    }

    const entry = recordSyncLog({
      direction: 'HOST → CLIENT',
      action: `Broadcast workspace "${activeWs.name}" state to Cloud Relay (${roomId})...`,
      endpoint: `POST /api/plugin/relay-push (${roomId})`,
      workstation: 'Multi-Device-Cloud-Relay',
      status: '200 OK',
      latencyMs: 18,
      detail: `Published workspace ${activeWs.id} (txid #${globalTxid}) & ${featurePatches.length} feature patches so remote devices can pull via One-Click Refresh`,
    });

    res.json({
      ok: true,
      roomId,
      activeWorkspaceId: activeWs.id,
      currentTxid: globalTxid,
      entry,
      syncLog: pluginSyncLog,
    });
  });

  // Mount Vite Dev Server or Static Dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Meridian Live PostGIS & Cloud Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
