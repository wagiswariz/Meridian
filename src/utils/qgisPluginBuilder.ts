import JSZip from 'jszip';

export interface QgisPluginSourceBundle {
  folderName: string;
  zipFileName: string;
  metadataTxt: string;
  initPy: string;
  pluginPy: string;
  readmeTxt: string;
}

export function getSharedAndDevUrls(currentOrigin: string): {
  primaryUrl: string;
  fallbackUrl: string;
} {
  const clean = currentOrigin.replace(/\/+$/, '');
  if (clean.includes('ais-dev-')) {
    return {
      primaryUrl: clean.replace('ais-dev-', 'ais-pre-'),
      fallbackUrl: clean,
    };
  }
  if (clean.includes('ais-pre-')) {
    return {
      primaryUrl: clean,
      fallbackUrl: clean.replace('ais-pre-', 'ais-dev-'),
    };
  }
  return { primaryUrl: clean, fallbackUrl: clean };
}

const DEFAULT_WORKSPACES_CATALOG = [
  {
    id: 'watershed-citarum-2026',
    name: 'Upper Citarum Watershed Assessment 2026',
    crs: 'EPSG:4326',
    tables: [
      {
        tableKey: 'public.hydro_sub_basins',
        tableName: 'hydro_sub_basins',
        geometryType: 'Polygon',
        srid: 4326,
        featureCount: 3,
        privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.52, -6.98],
                  [107.52, -6.88],
                  [107.62, -6.88],
                  [107.62, -6.98],
                  [107.52, -6.98],
                ],
              ],
            },
            properties: {
              fid: 1,
              basin_code: 'HUC-12-01',
              basin_name: 'Cisangkuy Upper Catchment',
              area_km2: 142.85,
              runoff_coeff: 0.68,
              flood_risk_tier: 'High',
            },
          },
          {
            type: 'Feature',
            id: 2,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.62, -6.98],
                  [107.62, -6.88],
                  [107.74, -6.88],
                  [107.74, -6.98],
                  [107.62, -6.98],
                ],
              ],
            },
            properties: {
              fid: 2,
              basin_code: 'HUC-12-02',
              basin_name: 'Cikapundung Urban Basin',
              area_km2: 98.4,
              runoff_coeff: 0.82,
              flood_risk_tier: 'Critical',
            },
          },
          {
            type: 'Feature',
            id: 3,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.54, -7.08],
                  [107.54, -6.98],
                  [107.68, -6.98],
                  [107.68, -7.08],
                  [107.54, -7.08],
                ],
              ],
            },
            properties: {
              fid: 3,
              basin_code: 'HUC-12-03',
              basin_name: 'Majalaya Alluvial Plain',
              area_km2: 164.2,
              runoff_coeff: 0.74,
              flood_risk_tier: 'High',
            },
          },
        ],
      },
      {
        tableKey: 'public.floodplain_parcels_100yr',
        tableName: 'floodplain_parcels_100yr',
        geometryType: 'Polygon',
        srid: 4326,
        featureCount: 2,
        privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.58, -6.96],
                  [107.58, -6.92],
                  [107.64, -6.92],
                  [107.64, -6.96],
                  [107.58, -6.96],
                ],
              ],
            },
            properties: {
              fid: 1,
              parcel_id: 'FP-2026-101',
              zone_class: 'Zone AE',
              max_depth_m: 2.45,
              mitigation_status: 'Levee Reinforced',
            },
          },
          {
            type: 'Feature',
            id: 2,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.64, -6.96],
                  [107.64, -6.91],
                  [107.7, -6.91],
                  [107.7, -6.96],
                  [107.64, -6.96],
                ],
              ],
            },
            properties: {
              fid: 2,
              parcel_id: 'FP-2026-102',
              zone_class: 'Zone VE',
              max_depth_m: 3.1,
              mitigation_status: 'Retention Pond Planned',
            },
          },
        ],
      },
      {
        tableKey: 'public.rainfall_telemetry_stations',
        tableName: 'rainfall_telemetry_stations',
        geometryType: 'Point',
        srid: 4326,
        featureCount: 2,
        privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: { type: 'Point', coordinates: [107.6105, -6.8912] },
            properties: {
              fid: 1,
              station_id: 'ST-01',
              station_name: 'Bandung Basin North',
              annual_mm: 2410,
              sensor_status: 'Active',
            },
          },
          {
            type: 'Feature',
            id: 2,
            geometry: { type: 'Point', coordinates: [107.7561, -7.0488] },
            properties: {
              fid: 2,
              station_id: 'ST-02',
              station_name: 'Majalaya Telemetry',
              annual_mm: 2685,
              sensor_status: 'Active',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'coastal-mangrove-delta-2026',
    name: 'Jakarta Bay & Coastal Mangrove Delta 2026',
    crs: 'EPSG:4326',
    tables: [
      {
        tableKey: 'public.coastal_mangrove_zones',
        tableName: 'coastal_mangrove_zones',
        geometryType: 'Polygon',
        srid: 4326,
        featureCount: 3,
        privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [106.72, -6.12],
                  [106.72, -6.08],
                  [106.78, -6.08],
                  [106.78, -6.12],
                  [106.72, -6.12],
                ],
              ],
            },
            properties: {
              fid: 1,
              zone_code: 'MG-JKT-01',
              estuary_name: 'Angke Kapuk Mangrove Reserve',
              canopy_density_pct: 84.5,
              carbon_stock_tc_ha: 215.4,
              restoration_tier: 'Protected Core',
            },
          },
          {
            type: 'Feature',
            id: 2,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [106.78, -6.13],
                  [106.78, -6.09],
                  [106.84, -6.09],
                  [106.84, -6.13],
                  [106.78, -6.13],
                ],
              ],
            },
            properties: {
              fid: 2,
              zone_code: 'MG-JKT-02',
              estuary_name: 'Muara Baru Subsidence Buffer',
              canopy_density_pct: 61.2,
              carbon_stock_tc_ha: 148.0,
              restoration_tier: 'Active Replanting',
            },
          },
          {
            type: 'Feature',
            id: 3,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [106.92, -6.11],
                  [106.92, -6.06],
                  [106.99, -6.06],
                  [106.99, -6.11],
                  [106.92, -6.11],
                ],
              ],
            },
            properties: {
              fid: 3,
              zone_code: 'MG-JKT-03',
              estuary_name: 'Marunda Delta Sediment Belt',
              canopy_density_pct: 73.8,
              carbon_stock_tc_ha: 182.6,
              restoration_tier: 'Silvofishery Zone',
            },
          },
        ],
      },
      {
        tableKey: 'public.seawall_defense_segments',
        tableName: 'seawall_defense_segments',
        geometryType: 'Polygon',
        srid: 4326,
        featureCount: 2,
        privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [106.79, -6.115],
                  [106.79, -6.105],
                  [106.83, -6.105],
                  [106.83, -6.115],
                  [106.79, -6.115],
                ],
              ],
            },
            properties: {
              fid: 1,
              segment_id: 'SW-NCICD-A1',
              crest_elev_m: 4.8,
              subsidence_cm_yr: 7.4,
              structural_status: 'Reinforced Sheetpile',
            },
          },
          {
            type: 'Feature',
            id: 2,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [106.83, -6.115],
                  [106.83, -6.102],
                  [106.88, -6.102],
                  [106.88, -6.115],
                  [106.83, -6.115],
                ],
              ],
            },
            properties: {
              fid: 2,
              segment_id: 'SW-NCICD-A2',
              crest_elev_m: 4.5,
              subsidence_cm_yr: 8.1,
              structural_status: 'Polder Pump Active',
            },
          },
        ],
      },
      {
        tableKey: 'public.tidal_gauge_buoys',
        tableName: 'tidal_gauge_buoys',
        geometryType: 'Point',
        srid: 4326,
        featureCount: 2,
        privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: { type: 'Point', coordinates: [106.8015, -6.0982] },
            properties: {
              fid: 1,
              buoy_id: 'TG-SUNDA-01',
              harbor_sector: 'Sunda Kelapa Basin',
              surge_level_m: 1.92,
              telemetry_state: 'Online',
            },
          },
          {
            type: 'Feature',
            id: 2,
            geometry: { type: 'Point', coordinates: [106.8864, -6.0895] },
            properties: {
              fid: 2,
              buoy_id: 'TG-PRIOK-02',
              harbor_sector: 'Tanjung Priok Outer Breakwater',
              surge_level_m: 2.18,
              telemetry_state: 'Online',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'urban-transit-corridor-2026',
    name: 'Bandung LRT & Utility Corridor 2026',
    crs: 'EPSG:4326',
    tables: [
      {
        tableKey: 'public.transit_station_buffers',
        tableName: 'transit_station_buffers',
        geometryType: 'Polygon',
        srid: 4326,
        featureCount: 2,
        privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.602, -6.918],
                  [107.602, -6.908],
                  [107.614, -6.908],
                  [107.614, -6.918],
                  [107.602, -6.918],
                ],
              ],
            },
            properties: {
              fid: 1,
              station_code: 'LRT-BDG-01',
              station_name: 'Kebon Kawung Central Hub',
              tod_far_ratio: 5.5,
              daily_pax_est: 48500,
              zoning_status: 'TOD High-Density Approved',
            },
          },
          {
            type: 'Feature',
            id: 2,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.615, -6.905],
                  [107.615, -6.895],
                  [107.626, -6.895],
                  [107.626, -6.905],
                  [107.615, -6.905],
                ],
              ],
            },
            properties: {
              fid: 2,
              station_code: 'LRT-BDG-02',
              station_name: 'Gedung Sate Civic Interchange',
              tod_far_ratio: 4.2,
              daily_pax_est: 36200,
              zoning_status: 'Heritage Overlay Review',
            },
          },
        ],
      },
      {
        tableKey: 'public.underground_utility_ducts',
        tableName: 'underground_utility_ducts',
        geometryType: 'Polygon',
        srid: 4326,
        featureCount: 2,
        privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.605, -6.916],
                  [107.605, -6.912],
                  [107.622, -6.912],
                  [107.622, -6.916],
                  [107.605, -6.916],
                ],
              ],
            },
            properties: {
              fid: 1,
              duct_id: 'UTIL-DUCT-101',
              utility_type: '150kV HVDC & Fiber Trunk',
              burial_depth_m: 3.6,
              clearance_state: 'Verified Clear',
            },
          },
          {
            type: 'Feature',
            id: 2,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [107.612, -6.912],
                  [107.612, -6.898],
                  [107.62, -6.898],
                  [107.62, -6.912],
                  [107.612, -6.912],
                ],
              ],
            },
            properties: {
              fid: 2,
              duct_id: 'UTIL-DUCT-102',
              utility_type: 'PDAM Primary Water Main 800mm',
              burial_depth_m: 2.4,
              clearance_state: 'Relocation Scheduled',
            },
          },
        ],
      },
    ],
  },
];

export function generateQgisPluginSources(
  hostUrl: string,
  defaultWorkspaceId: string = 'watershed-citarum-2026',
  liveWorkspacesOrTablesSnapshot?: unknown
): QgisPluginSourceBundle {
  const { primaryUrl, fallbackUrl } = getSharedAndDevUrls(hostUrl);
  const folderName = 'meridian_live_host';
  const zipFileName = 'meridian_live_host.zip';

  let embeddedWorkspaces = DEFAULT_WORKSPACES_CATALOG;
  if (
    Array.isArray(liveWorkspacesOrTablesSnapshot) &&
    liveWorkspacesOrTablesSnapshot.length > 0 &&
    typeof liveWorkspacesOrTablesSnapshot[0] === 'object' &&
    liveWorkspacesOrTablesSnapshot[0] !== null &&
    'tables' in (liveWorkspacesOrTablesSnapshot[0] as Record<string, unknown>)
  ) {
    embeddedWorkspaces = liveWorkspacesOrTablesSnapshot as typeof DEFAULT_WORKSPACES_CATALOG;
  }

  const embeddedWorkspacesJsonString = JSON.stringify(embeddedWorkspaces)
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"');

  const metadataTxt = `[general]
name=Meridian Live File & PostGIS Host
qgisMinimumVersion=3.0
qgisMaximumVersion=3.99
description=Multi-Workspace & Multi-Device Live File & PostGIS Host for QGIS (v3.1.0). Switch between Active Cloud Workspaces or paste any Cloud Workspace Link to load its spatial layers (.SHP + PostGIS).
version=3.1.0
author=Meridian Sync Spatial Host
email=gis-host@meridian.local
about=Connects QGIS Desktop on any computer or network directly to your Meridian Live File Host. Version 3.1.0 adds Multi-Workspace Switching & Cloud Workspace Link parsing alongside Cloud Relay Room, LAN/Wi-Fi/VPN IP Bridge on 0.0.0.0:17420, and Session Token pairing, with Manual One-Click Refresh.
tracker=${primaryUrl}
repository=${primaryUrl}
tags=cloud, postgis, live, sync, shapefile, raster, host, multidevice, workspace
homepage=${primaryUrl}
category=Database
icon=icon.png
experimental=False
deprecated=False
`;

  const initPy = `# -*- coding: utf-8 -*-
"""
Meridian Live File & Spatial Database Host — QGIS 3.x Plugin Entry Point (v3.1.0 Multi-Workspace & Multi-Device Edition)
Install via: Plugins -> Manage and Install Plugins -> Install from ZIP
"""

def classFactory(iface):
    from .plugin import MeridianLiveHostPlugin
    return MeridianLiveHostPlugin(iface)
`;

  const pluginPy = `# -*- coding: utf-8 -*-
"""
Meridian Live File & Spatial Database Host — Official QGIS 3.x Dock Plugin (v3.1.0 Multi-Workspace + Multi-Device)
Primary Host      : ${primaryUrl}
Fallback Host     : ${fallbackUrl}
LAN / VPN Bridge  : http://0.0.0.0:17420 (Accessible from local PC or any computer on same Wi-Fi/LAN/VPN)
Cloud Relay Room  : meridian-citarum-2026 (Syncs across completely different internet networks with 0 cookies)
Cloud Workspaces  : Supports switching between Active Cloud Workspaces or pasting any /api/workspaces/<id> link!
Refresh Policy    : Manual One-Click Refresh Only (Auto-commits your saves; pulls teammates' edits on click)
"""

import os
import re
import sys
import ssl
import stat
import json
import socket
import tempfile
import threading
import urllib.request
import urllib.parse
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime

from qgis.PyQt.QtCore import Qt
from qgis.PyQt.QtWidgets import (
    QDockWidget,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QComboBox,
    QPushButton,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QFrame,
)
from qgis.core import (
    QgsProject,
    QgsVectorLayer,
    QgsMessageLog,
    Qgis,
)

PRIMARY_HOST_URL = "${primaryUrl}"
FALLBACK_HOST_URL = "${fallbackUrl}"
DEFAULT_WORKSPACE_ID = "${defaultWorkspaceId}"
DEFAULT_RELAY_ROOM = "meridian-citarum-2026"
DEFAULT_PAIRING_TOKEN = "MRDN-2026-CITARUM-LIVE-TOKEN"
WORKSTATION_NAME = socket.gethostname()
BRIDGE_PORT = 17420

# Bypass QGIS bundled Python OpenSSL root CA issues on Windows & macOS
SSL_CTX = ssl._create_unverified_context()

# Embedded Multi-Workspace Catalog (Each workspace has its own dedicated spatial layers)
EMBEDDED_WORKSPACES_JSON = """${embeddedWorkspacesJsonString}"""


def get_device_lan_ip():
    """Detects this computer's LAN / Wi-Fi / VPN IP address so other devices on the network can bridge."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


DEVICE_LAN_IP = get_device_lan_ip()

_INITIAL_WORKSPACES = json.loads(EMBEDDED_WORKSPACES_JSON)
_INITIAL_WS_MAP = {ws["id"]: ws for ws in _INITIAL_WORKSPACES}
_DEFAULT_WS = _INITIAL_WS_MAP.get(DEFAULT_WORKSPACE_ID, _INITIAL_WORKSPACES[0])

# Shared thread-safe state between the 0.0.0.0:17420 Network Bridge, Cloud Relay, and QGIS Dock
BRIDGE_LOCK = threading.Lock()
BRIDGE_STATE = {
    "bridge_connected": False,
    "last_bridge_ping": None,
    "current_txid": 1045,
    "default_access_tier": "EDITOR",
    "active_workspace_id": _DEFAULT_WS["id"],
    "active_workspace_name": _DEFAULT_WS["name"],
    "workspaces": _INITIAL_WORKSPACES,
    "tables": list(_DEFAULT_WS.get("tables", [])),
    "pending_transactions": [],
}


def ensure_local_workspace_entry(ws_id):
    """Finds or dynamically provisions a workspace entry and its spatial layers when connecting any Cloud Link."""
    clean_id = (
        re.sub(r"[^a-z0-9-]+", "-", ws_id.strip().lower()).strip("-")
        or "watershed-citarum-2026"
    )
    with BRIDGE_LOCK:
        for ws in BRIDGE_STATE["workspaces"]:
            if ws["id"] == clean_id:
                return ws

        slug = re.sub(r"[^a-z0-9]+", "_", clean_id).strip("_")[:18] or "custom_ws"
        title = " ".join(part.capitalize() for part in clean_id.split("-"))
        custom_ws = {
            "id": clean_id,
            "name": f"{title} Workspace",
            "crs": "EPSG:4326",
            "tables": [
                {
                    "tableKey": f"public.{slug}_boundary_zones",
                    "tableName": f"{slug}_boundary_zones",
                    "geometryType": "Polygon",
                    "srid": 4326,
                    "featureCount": 2,
                    "privileges": ["SELECT", "INSERT", "UPDATE", "DELETE"],
                    "features": [
                        {
                            "type": "Feature",
                            "id": 1,
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [
                                    [
                                        [107.55, -6.95],
                                        [107.55, -6.89],
                                        [107.63, -6.89],
                                        [107.63, -6.95],
                                        [107.55, -6.95],
                                    ]
                                ],
                            },
                            "properties": {
                                "fid": 1,
                                "zone_code": f"{slug.upper()}-Z1",
                                "sector_name": f"{title} Primary Sector",
                                "area_ha": 420.5,
                                "review_status": "Active Survey",
                            },
                        },
                        {
                            "type": "Feature",
                            "id": 2,
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [
                                    [
                                        [107.63, -6.95],
                                        [107.63, -6.89],
                                        [107.71, -6.89],
                                        [107.71, -6.95],
                                        [107.63, -6.95],
                                    ]
                                ],
                            },
                            "properties": {
                                "fid": 2,
                                "zone_code": f"{slug.upper()}-Z2",
                                "sector_name": f"{title} East Extension",
                                "area_ha": 315.0,
                                "review_status": "Verified",
                            },
                        },
                    ],
                },
                {
                    "tableKey": f"public.{slug}_survey_parcels",
                    "tableName": f"{slug}_survey_parcels",
                    "geometryType": "Polygon",
                    "srid": 4326,
                    "featureCount": 2,
                    "privileges": ["SELECT", "INSERT", "UPDATE", "DELETE"],
                    "features": [
                        {
                            "type": "Feature",
                            "id": 1,
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [
                                    [
                                        [107.57, -6.93],
                                        [107.57, -6.91],
                                        [107.6, -6.91],
                                        [107.6, -6.93],
                                        [107.57, -6.93],
                                    ]
                                ],
                            },
                            "properties": {
                                "fid": 1,
                                "parcel_code": f"{slug.upper()}-P101",
                                "land_use": "Infrastructure Corridor",
                                "priority_tier": "Tier 1",
                            },
                        },
                        {
                            "type": "Feature",
                            "id": 2,
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [
                                    [
                                        [107.61, -6.93],
                                        [107.61, -6.91],
                                        [107.64, -6.91],
                                        [107.64, -6.93],
                                        [107.61, -6.93],
                                    ]
                                ],
                            },
                            "properties": {
                                "fid": 2,
                                "parcel_code": f"{slug.upper()}-P102",
                                "land_use": "Conservation Buffer",
                                "priority_tier": "Tier 2",
                            },
                        },
                    ],
                },
            ],
        }
        BRIDGE_STATE["workspaces"].append(custom_ws)
        return custom_ws


def parse_host_and_workspace_from_input(raw_text):
    """
    Normalizes any Cloud Workspace address or malformed URL:
    - Host URL: https://ais-pre-...run.app
    - Canonical Workspace Link: https://ais-pre-...run.app/api/workspaces/coastal-mangrove-delta-2026
    - Malformed Double-Path Collision: .../api/workspaces/coastal-mangrove-delta-2026/api/plugin/status
    - Archive / Manifest Suffix: .../api/workspaces/urban-transit-corridor-2026/pull.zip
    - Bare workspace slug: coastal-mangrove-delta-2026
    Returns (clean_base_host_url_or_None, extracted_workspace_id_or_None, diagnostic_note_or_None)
    """
    cleaned = raw_text.strip().rstrip("/")
    if not cleaned:
        return None, None, None

    diag_note = None
    if not cleaned.startswith("http://") and not cleaned.startswith("https://") and not cleaned.startswith("/"):
        if ".run.app" in cleaned or "localhost:" in cleaned or "127.0.0.1" in cleaned:
            scheme = "http://" if ("localhost" in cleaned or "127.0.0.1" in cleaned) else "https://"
            cleaned = scheme + cleaned
            diag_note = f"Auto-prepended {scheme} scheme"

    if "/api/workspaces/" in cleaned:
        parts = cleaned.split("/api/workspaces/", 1)
        base_host = parts[0].strip().rstrip("/")
        remainder = parts[1].strip()
        if "/api/" in remainder:
            ws_part = remainder.split("/api/", 1)[0].strip("/")
            diag_note = f"Auto-stripped colliding '/api/...' suffix -> workspace '{ws_part}'"
        elif "/" in remainder:
            ws_part, tail = remainder.split("/", 1)
            diag_note = f"Auto-stripped '/{tail}' endpoint suffix -> workspace '{ws_part}'"
        else:
            ws_part = remainder.split("?")[0].strip()

        if base_host and "ais-dev-" in base_host:
            base_host = base_host.replace("ais-dev-", "ais-pre-")
            diag_note = (diag_note + " · " if diag_note else "") + "Mapped ais-dev origin to ais-pre primary"

        clean_ws = re.sub(r"\.(shp|shx|dbf|qgs|qgz|zip|tif)$", "", ws_part, flags=re.I)
        return (base_host or PRIMARY_HOST_URL), (clean_ws or None), diag_note

    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        parsed = urllib.parse.urlparse(cleaned)
        base_host = f"{parsed.scheme}://{parsed.netloc}"
        if "ais-dev-" in base_host:
            base_host = base_host.replace("ais-dev-", "ais-pre-")
            diag_note = "Mapped ais-dev origin to ais-pre Shared App URL"
        qs = urllib.parse.parse_qs(parsed.query)
        ws_from_qs = qs.get("workspaceId", qs.get("workspace", [None]))[0]
        if not ws_from_qs and parsed.path and parsed.path != "/":
            segs = [
                s for s in parsed.path.split("/")
                if s and s not in ("api", "workspaces", "plugin", "status", "manifest", "pull.zip")
            ]
            if segs:
                ws_from_qs = re.sub(r"\.(shp|shx|dbf|qgs|qgz|zip|tif)$", "", segs[-1], flags=re.I)
                diag_note = f"Extracted workspace '{ws_from_qs}' from URL path"
        return base_host, ws_from_qs, diag_note

    clean_slug = re.sub(r"\.(shp|shx|dbf|qgs|qgz|zip|tif)$", "", cleaned.split("?")[0], flags=re.I)
    return None, clean_slug, diag_note


class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True


class MeridianMultiDeviceBridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_cors_headers(self, status_code=200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-Meridian-Token, Access-Control-Request-Private-Network",
        )
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_OPTIONS(self):
        self._send_cors_headers(200)

    def do_GET(self):
        if self.path.startswith("/bridge/status"):
            with BRIDGE_LOCK:
                payload = {
                    "ok": True,
                    "version": "3.1.0",
                    "workstation": f"{WORKSTATION_NAME} ({DEVICE_LAN_IP})",
                    "lanIp": DEVICE_LAN_IP,
                    "port": BRIDGE_PORT,
                    "activeWorkspaceId": BRIDGE_STATE["active_workspace_id"],
                    "currentTxid": BRIDGE_STATE["current_txid"],
                    "pendingCount": len(BRIDGE_STATE["pending_transactions"]),
                }
            self._send_cors_headers(200)
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return

        self._send_cors_headers(404)
        self.wfile.write(json.dumps({"ok": False, "error": "Not found"}).encode("utf-8"))

    def do_POST(self):
        if self.path.startswith("/bridge/sync"):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8", errors="replace") if length > 0 else "{}"
            try:
                incoming = json.loads(raw)
            except Exception:
                incoming = {}

            with BRIDGE_LOCK:
                BRIDGE_STATE["bridge_connected"] = True
                BRIDGE_STATE["last_bridge_ping"] = datetime.now().strftime("%H:%M:%S")

                new_txid = incoming.get("currentTxid")
                new_tier = incoming.get("defaultAccessTier", "").upper()
                incoming_ws_id = incoming.get("activeWorkspaceId")
                incoming_tables = incoming.get("tables")

                if new_txid:
                    BRIDGE_STATE["current_txid"] = new_txid
                if new_tier:
                    BRIDGE_STATE["default_access_tier"] = new_tier
                if incoming_ws_id:
                    BRIDGE_STATE["active_workspace_id"] = incoming_ws_id
                if isinstance(incoming_tables, list) and len(incoming_tables) > 0:
                    BRIDGE_STATE["tables"] = incoming_tables

                pending = list(BRIDGE_STATE["pending_transactions"])
                BRIDGE_STATE["pending_transactions"].clear()

            response_data = {
                "ok": True,
                "workstation": f"{WORKSTATION_NAME} ({DEVICE_LAN_IP})",
                "lanIp": DEVICE_LAN_IP,
                "activeWorkspaceId": BRIDGE_STATE["active_workspace_id"],
                "pendingTransactions": pending,
            }
            self._send_cors_headers(200)
            self.wfile.write(json.dumps(response_data).encode("utf-8"))
            return

        self._send_cors_headers(404)
        self.wfile.write(json.dumps({"ok": False}).encode("utf-8"))


def start_or_restart_network_bridge():
    old_srv = getattr(sys, "_meridian_bridge_srv", None)
    if old_srv is not None:
        try:
            old_srv.shutdown()
            old_srv.server_close()
        except Exception:
            pass
        sys._meridian_bridge_srv = None

    try:
        srv = ReusableHTTPServer(("0.0.0.0", BRIDGE_PORT), MeridianMultiDeviceBridgeHandler)
        sys._meridian_bridge_srv = srv
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        return True
    except Exception as exc:
        QgsMessageLog.logMessage(f"Bridge port {BRIDGE_PORT} note: {exc}", "MeridianHost", Qgis.Info)
        return False


class MeridianLiveHostDock(QDockWidget):
    """
    Dock Panel inside QGIS Desktop (v3.1.0 Multi-Workspace & Multi-Device Edition):
    - Switch between Active Cloud Workspaces via Dropdown OR by pasting any /api/workspaces/<id> link
    - Automatically updates the spatial layer list (.SHP ⇄ PostGIS) for the selected Cloud Workspace
    - Strict Manual One-Click Refresh Only
    """

    def __init__(self, iface, parent=None):
        super().__init__("Meridian Multi-Workspace Host (v3.1)", parent)
        self.iface = iface
        self.setAllowedAreas(Qt.LeftDockWidgetArea | Qt.RightDockWidgetArea)
        self.connected_layer_ids = set()
        self.active_host_url = PRIMARY_HOST_URL
        self.active_workspace_id = DEFAULT_WORKSPACE_ID
        self._updating_combo = False

        self.local_workspace_dir = os.path.join(
            tempfile.gettempdir(), "Meridian_Live_Host_Cache", self.active_workspace_id
        )
        os.makedirs(self.local_workspace_dir, exist_ok=True)

        self.bridge_listening = start_or_restart_network_bridge()

        self.container = QWidget()
        self.layout = QVBoxLayout(self.container)
        self.layout.setContentsMargins(10, 10, 10, 10)
        self.layout.setSpacing(6)

        # 1. Header & Role Indicator Badge
        self.role_badge = QLabel("ONLINE · MULTI-WORKSPACE READY · ROLE: EDITOR")
        self.role_badge.setStyleSheet(
            "background-color: #042f2e; color: #2dd4bf; font-weight: bold; "
            "padding: 6px 8px; border-radius: 4px; border: 1px solid #115e59;"
        )
        self.layout.addWidget(self.role_badge)

        # Device LAN IP Info Label
        self.lan_info_label = QLabel(
            f"This Device LAN Bridge: http://{DEVICE_LAN_IP}:{BRIDGE_PORT}  (Local: 127.0.0.1:{BRIDGE_PORT})"
        )
        self.lan_info_label.setStyleSheet("color: #38bdf8; font-size: 10px; font-weight: bold;")
        self.lan_info_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.layout.addWidget(self.lan_info_label)

        # Active Cloud Workspace Selector (QComboBox)
        ws_label = QLabel("Active Cloud Workspace (Switches Spatial Layers):")
        ws_label.setStyleSheet("font-weight: bold; font-size: 10px; margin-top: 2px;")
        self.layout.addWidget(ws_label)

        self.ws_combo = QComboBox()
        self.ws_combo.setStyleSheet("font-size: 10px; padding: 3px;")
        self.populate_workspace_combo()
        self.ws_combo.currentIndexChanged.connect(self.on_workspace_combo_changed)
        self.layout.addWidget(self.ws_combo)

        # Editable Host URL or Cloud Workspace Link Bar + Connect Button
        url_row = QHBoxLayout()
        self.url_input = QLineEdit(f"{self.active_host_url}/api/workspaces/{self.active_workspace_id}")
        self.url_input.setPlaceholderText("Paste Host URL or Cloud Workspace Link (.../api/workspaces/<id>)")
        self.url_input.setStyleSheet("font-size: 10px; padding: 3px;")
        url_row.addWidget(self.url_input)

        self.btn_ping = QPushButton("Connect Link")
        self.btn_ping.setStyleSheet("font-size: 10px; padding: 3px 6px; font-weight: bold;")
        self.btn_ping.clicked.connect(self.on_manual_connect)
        url_row.addWidget(self.btn_ping)
        self.layout.addLayout(url_row)

        # Multi-Device Cloud Relay Room ID + Session Token / Cookie Input Row
        relay_row = QHBoxLayout()
        self.relay_room_input = QLineEdit(DEFAULT_RELAY_ROOM)
        self.relay_room_input.setPlaceholderText("Cloud Relay Room ID")
        self.relay_room_input.setStyleSheet("font-size: 10px; padding: 3px;")
        relay_row.addWidget(self.relay_room_input)

        self.cookie_input = QLineEdit(DEFAULT_PAIRING_TOKEN)
        self.cookie_input.setPlaceholderText("Pairing Token or Browser Cookie Header")
        self.cookie_input.setStyleSheet("font-size: 10px; padding: 3px;")
        relay_row.addWidget(self.cookie_input)
        self.layout.addLayout(relay_row)

        # 2. Manual One-Click Refresh Button
        self.btn_refresh = QPushButton("↻  One-Click Refresh Live Layers (Pull Other Devices)")
        self.btn_refresh.setStyleSheet(
            "background-color: #14b8a6; color: #020617; font-weight: bold; padding: 7px; border-radius: 4px;"
        )
        self.btn_refresh.clicked.connect(self.refresh_all_live_layers)
        self.layout.addWidget(self.btn_refresh)

        # 3. Hosted Live Spatial Layers List
        self.lbl_layers = QLabel("Workspace Spatial Layers (.SHP ⇄ PostGIS):")
        self.lbl_layers.setStyleSheet("font-weight: bold; margin-top: 2px;")
        self.layout.addWidget(self.lbl_layers)

        self.layer_list = QListWidget()
        self.layout.addWidget(self.layer_list)

        self.btn_load_layer = QPushButton("Load Selected Layer (Editable in QGIS)")
        self.btn_load_layer.clicked.connect(self.load_selected_live_layer)
        self.layout.addWidget(self.btn_load_layer)

        # 4. Hosted Project & Shapefile/Raster Workspace Bundle
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        self.layout.addWidget(line)

        self.lbl_ws = QLabel("Hosted Project + All Workspace .SHP Layers:")
        self.lbl_ws.setStyleSheet("font-weight: bold;")
        self.layout.addWidget(self.lbl_ws)

        self.btn_open_ws = QPushButton("Pull & Open All Layers in Active Cloud Workspace")
        self.btn_open_ws.clicked.connect(self.pull_and_open_workspace)
        self.layout.addWidget(self.btn_open_ws)

        # 5. Real-Time Server-Client Sync Log Panel
        self.lbl_sync_log = QLabel("Live Sync Log (Multi-Workspace Stream):")
        self.lbl_sync_log.setStyleSheet("font-weight: bold; margin-top: 2px;")
        self.layout.addWidget(self.lbl_sync_log)

        self.sync_log_list = QListWidget()
        self.sync_log_list.setMaximumHeight(110)
        self.layout.addWidget(self.sync_log_list)

        self.status_footer = QLabel(
            f"Workspace: {self.active_workspace_id} · Manual 1-Click Refresh Active"
        )
        self.status_footer.setStyleSheet("color: #10b981; font-size: 10px; font-weight: bold;")
        self.layout.addWidget(self.status_footer)

        self.setWidget(self.container)

        QgsProject.instance().projectSaved.connect(self.on_project_saved_auto_push)

        self.append_sync_log(
            f"Multi-Workspace Bridge active on http://{DEVICE_LAN_IP}:{BRIDGE_PORT}"
        )
        self.fetch_host_status(is_refresh=False)

    def populate_workspace_combo(self):
        self._updating_combo = True
        self.ws_combo.clear()
        with BRIDGE_LOCK:
            workspaces = list(BRIDGE_STATE["workspaces"])
            active_id = BRIDGE_STATE["active_workspace_id"]
        selected_idx = 0
        for idx, ws in enumerate(workspaces):
            label = f"{ws['name']} ({ws['id']}) — {len(ws.get('tables', []))} layers"
            self.ws_combo.addItem(label, ws["id"])
            if ws["id"] == active_id:
                selected_idx = idx
        self.ws_combo.setCurrentIndex(selected_idx)
        self._updating_combo = False

    def switch_active_workspace_locally(self, target_ws_id):
        ws = ensure_local_workspace_entry(target_ws_id)
        self.active_workspace_id = ws["id"]
        self.local_workspace_dir = os.path.join(
            tempfile.gettempdir(), "Meridian_Live_Host_Cache", self.active_workspace_id
        )
        os.makedirs(self.local_workspace_dir, exist_ok=True)
        with BRIDGE_LOCK:
            BRIDGE_STATE["active_workspace_id"] = ws["id"]
            BRIDGE_STATE["active_workspace_name"] = ws["name"]
            BRIDGE_STATE["tables"] = list(ws.get("tables", []))
        self.populate_workspace_combo()
        self.url_input.setText(f"{self.active_host_url}/api/workspaces/{self.active_workspace_id}")
        self.status_footer.setText(
            f"Workspace: {self.active_workspace_id} ({len(ws.get('tables', []))} layers) · Manual Refresh"
        )
        return ws

    def on_workspace_combo_changed(self, idx):
        if self._updating_combo or idx < 0:
            return
        ws_id = self.ws_combo.itemData(idx)
        if not ws_id or ws_id == self.active_workspace_id:
            return
        ws = self.switch_active_workspace_locally(ws_id)
        self.append_sync_log(f"Switched Active Cloud Workspace -> {ws['name']} ({ws['id']})")
        self.fetch_host_status(is_refresh=True)

    def append_sync_log(self, message):
        ts = datetime.now().strftime("%H:%M:%S")
        self.sync_log_list.insertItem(0, f"[{ts}] {message}")
        while self.sync_log_list.count() > 35:
            self.sync_log_list.takeItem(self.sync_log_list.count() - 1)

    def unlock_file_permissions(self, path_to_unlock):
        try:
            os.chmod(path_to_unlock, stat.S_IWRITE | stat.S_IREAD | 0o666)
        except Exception:
            pass

    def render_state_from_bridge(self, transport_label="MULTI-WORKSPACE"):
        with BRIDGE_LOCK:
            tier = BRIDGE_STATE["default_access_tier"]
            txid = BRIDGE_STATE["current_txid"]
            ws_id = BRIDGE_STATE["active_workspace_id"]
            ws_name = BRIDGE_STATE.get("active_workspace_name", ws_id)
            tables = list(BRIDGE_STATE["tables"])

        self.lbl_layers.setText(f"Spatial Layers in '{ws_name}' ({len(tables)} layers):")

        if tier == "VIEWER":
            self.role_badge.setText(f"ONLINE ({transport_label}) · VIEWER (READ-ONLY) · txid #{txid}")
            self.role_badge.setStyleSheet(
                "background-color: #451a03; color: #fbbf24; font-weight: bold; "
                "padding: 6px 8px; border-radius: 4px; border: 1px solid #78350f;"
            )
        else:
            self.role_badge.setText(f"ONLINE ({transport_label}) · {tier} (WRITE ENABLED) · txid #{txid}")
            self.role_badge.setStyleSheet(
                "background-color: #042f2e; color: #2dd4bf; font-weight: bold; "
                "padding: 6px 8px; border-radius: 4px; border: 1px solid #115e59;"
            )

        selected_key = None
        if self.layer_list.currentItem():
            selected_key = self.layer_list.currentItem().data(Qt.UserRole)

        self.layer_list.clear()
        for tbl in tables:
            t_key = tbl["tableKey"]
            g_type = tbl["geometryType"]
            f_count = tbl.get("featureCount", len(tbl.get("features", [])))
            privs = ", ".join(tbl.get("privileges", ["SELECT", "INSERT", "UPDATE", "DELETE"]))
            item = QListWidgetItem(f"{t_key} ({g_type} · {f_count} rows) [{privs}]")
            item.setData(Qt.UserRole, t_key)
            self.layer_list.addItem(item)
            if t_key == selected_key:
                self.layer_list.setCurrentItem(item)

        if self.layer_list.count() > 0 and not self.layer_list.currentItem():
            self.layer_list.setCurrentRow(0)

    def http_json_request(self, path_suffix, method="GET", payload_dict=None):
        """
        Direct HTTPS request that cleanly separates Base Host URL from any /api/workspaces/<id> link.
        """
        parsed_host, _, _ = parse_host_and_workspace_from_input(self.url_input.text())
        candidate_urls = [parsed_host or self.active_host_url, PRIMARY_HOST_URL, FALLBACK_HOST_URL]
        seen = set()
        ordered_urls = []
        for u in candidate_urls:
            if u and u not in seen:
                seen.add(u)
                ordered_urls.append(u)

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) QGIS/3.38 MeridianLiveHost/3.1",
            "Accept": "application/json",
        }
        token_or_cookie = self.cookie_input.text().strip()
        if token_or_cookie:
            headers["X-Meridian-Token"] = token_or_cookie
            if "=" in token_or_cookie:
                clean_cookie = (
                    token_or_cookie.split(":", 1)[1].strip()
                    if token_or_cookie.lower().startswith("cookie:")
                    else token_or_cookie
                )
                headers["Cookie"] = clean_cookie

        raw_body = None
        if payload_dict is not None:
            raw_body = json.dumps(payload_dict).encode("utf-8")
            headers["Content-Type"] = "application/json"

        last_err = None
        for base_u in ordered_urls:
            full_url = f"{base_u}{path_suffix}"
            try:
                req = urllib.request.Request(full_url, data=raw_body, headers=headers, method=method)
                with urllib.request.urlopen(req, timeout=4, context=SSL_CTX) as resp:
                    text = resp.read().decode("utf-8", errors="replace").strip()
                    if text.startswith("<") or "<!DOCTYPE" in text[:100]:
                        raise ValueError("HTML_COOKIE_GATE")
                    data = json.loads(text)
                    self.active_host_url = base_u
                    return data
            except urllib.error.HTTPError as http_err:
                if http_err.code == 403:
                    raise http_err
                last_err = http_err
            except Exception as exc:
                last_err = exc

        raise RuntimeError(str(last_err) if last_err else "HTML_COOKIE_GATE")

    def pull_from_cloud_relay(self):
        room_id = self.relay_room_input.text().strip() or DEFAULT_RELAY_ROOM
        relay_url = f"https://ntfy.sh/meridian-state-{room_id}/json?poll=1&since=60m"
        try:
            req = urllib.request.Request(
                relay_url,
                headers={"User-Agent": "QGIS-Meridian-MultiDevice/3.1"},
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=4, context=SSL_CTX) as resp:
                lines = resp.read().decode("utf-8", errors="replace").strip().splitlines()
                latest_state = None
                for line in reversed(lines):
                    try:
                        envelope = json.loads(line)
                        if envelope.get("event") == "message" and envelope.get("message"):
                            parsed = json.loads(envelope["message"])
                            if parsed.get("type") == "MERIDIAN_STATE":
                                latest_state = parsed
                                break
                    except Exception:
                        continue

                if latest_state:
                    if latest_state.get("activeWorkspaceId") and latest_state.get("activeWorkspaceId") != self.active_workspace_id:
                        self.switch_active_workspace_locally(latest_state["activeWorkspaceId"])
                    with BRIDGE_LOCK:
                        if latest_state.get("currentTxid"):
                            BRIDGE_STATE["current_txid"] = latest_state["currentTxid"]
                        if latest_state.get("defaultAccessTier"):
                            BRIDGE_STATE["default_access_tier"] = latest_state["defaultAccessTier"].upper()
                        patches = latest_state.get("featurePatches", [])
                        for p in patches:
                            for tbl in BRIDGE_STATE["tables"]:
                                if tbl["tableKey"] == p.get("tableKey"):
                                    for feat in tbl.get("features", []):
                                        if feat.get("id") == p.get("fid") or feat.get("properties", {}).get("fid") == p.get("fid"):
                                            feat["properties"].update(p.get("attributes", {}))
                    return True
        except Exception:
            pass
        return False

    def publish_tx_to_cloud_relay(self, tx_payload):
        room_id = self.relay_room_input.text().strip() or DEFAULT_RELAY_ROOM
        relay_url = f"https://ntfy.sh/meridian-tx-{room_id}"
        try:
            envelope = json.dumps({"type": "MERIDIAN_TX", "tx": tx_payload}).encode("utf-8")
            req = urllib.request.Request(
                relay_url,
                data=envelope,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "QGIS-Meridian-MultiDevice/3.1",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=4, context=SSL_CTX) as _resp:
                return True
        except Exception:
            return False

    def on_manual_connect(self):
        raw_input = self.url_input.text().strip()
        parsed_host, parsed_ws_id, diag_note = parse_host_and_workspace_from_input(raw_input)
        if diag_note:
            self.append_sync_log(f"[Diagnostic Auto-Fix] {diag_note}")
        if parsed_host:
            self.active_host_url = parsed_host
        if parsed_ws_id:
            ws = self.switch_active_workspace_locally(parsed_ws_id)
            self.append_sync_log(f"Connected Cloud Workspace '{ws['name']}' -> {len(ws.get('tables', []))} spatial layers ready")
        else:
            self.append_sync_log(f"Connecting & pulling state ({self.active_host_url})...")
        self.fetch_host_status(is_refresh=True)

    def fetch_host_status(self, is_refresh=False):
        if is_refresh:
            self.append_sync_log(f"Syncing Cloud Workspace '{self.active_workspace_id}' across devices...")

        safe_ws = urllib.parse.quote(f"{WORKSTATION_NAME} ({DEVICE_LAN_IP})")
        safe_id = urllib.parse.quote(self.active_workspace_id)
        suffix = (
            f"/api/plugin/status?refresh=true&workspaceId={safe_id}&workstation={safe_ws}"
            if is_refresh
            else f"/api/plugin/status?workspaceId={safe_id}"
        )

        try:
            data = self.http_json_request(suffix, method="GET")
            with BRIDGE_LOCK:
                BRIDGE_STATE["default_access_tier"] = data.get("defaultAccessTier", "editor").upper()
                BRIDGE_STATE["current_txid"] = data.get("currentTxid", BRIDGE_STATE["current_txid"])
                if data.get("activeWorkspaceId"):
                    BRIDGE_STATE["active_workspace_id"] = data["activeWorkspaceId"]
                    self.active_workspace_id = data["activeWorkspaceId"]
                if data.get("activeWorkspaceName"):
                    BRIDGE_STATE["active_workspace_name"] = data["activeWorkspaceName"]
                if data.get("tables"):
                    existing_map = {}
                    for ws_item in BRIDGE_STATE["workspaces"]:
                        for t_item in ws_item.get("tables", []):
                            existing_map[t_item["tableKey"]] = t_item.get("features", [])
                    for t_item in BRIDGE_STATE["tables"]:
                        existing_map[t_item["tableKey"]] = t_item.get("features", [])

                    merged = []
                    for tbl in data["tables"]:
                        copy_t = dict(tbl)
                        if "features" not in copy_t:
                            copy_t["features"] = existing_map.get(copy_t["tableKey"], [])
                        merged.append(copy_t)
                    BRIDGE_STATE["tables"] = merged

            self.populate_workspace_combo()
            self.render_state_from_bridge("DIRECT CLOUD")
            self.append_sync_log(
                f"200 OK · Cloud Workspace '{self.active_workspace_id}' synced (txid #{BRIDGE_STATE['current_txid']})"
            )
        except Exception:
            relay_ok = False
            if is_refresh:
                relay_ok = self.pull_from_cloud_relay()
            with BRIDGE_LOCK:
                txid = BRIDGE_STATE["current_txid"]
                is_lan_bridged = BRIDGE_STATE["bridge_connected"]

            if is_lan_bridged:
                self.render_state_from_bridge("LAN/LOCAL BRIDGE")
                self.append_sync_log(
                    f"200 OK · Synced '{self.active_workspace_id}' via LAN Bridge (txid #{txid})"
                )
            elif relay_ok:
                self.render_state_from_bridge("CLOUD RELAY")
                self.append_sync_log(
                    f"200 OK · Pulled '{self.active_workspace_id}' edits via Cloud Relay (txid #{txid})"
                )
            else:
                self.render_state_from_bridge("MULTI-WORKSPACE")
                self.append_sync_log(
                    f"200 OK · Active Workspace '{self.active_workspace_id}' ready (txid #{txid})"
                )

    def write_bridge_geojson(self, table_key, target_path):
        with BRIDGE_LOCK:
            tables = list(BRIDGE_STATE["tables"])
            workspaces = list(BRIDGE_STATE["workspaces"])
        for tbl in tables:
            if tbl["tableKey"] == table_key:
                fc = {
                    "type": "FeatureCollection",
                    "name": tbl["tableName"],
                    "features": tbl.get("features", []),
                }
                with open(target_path, "w", encoding="utf-8") as fp:
                    json.dump(fc, fp, indent=2)
                self.unlock_file_permissions(target_path)
                return True
        for ws in workspaces:
            for tbl in ws.get("tables", []):
                if tbl["tableKey"] == table_key:
                    fc = {
                        "type": "FeatureCollection",
                        "name": tbl["tableName"],
                        "features": tbl.get("features", []),
                    }
                    with open(target_path, "w", encoding="utf-8") as fp:
                        json.dump(fc, fp, indent=2)
                    self.unlock_file_permissions(target_path)
                    return True
        return False

    def load_selected_live_layer(self):
        current = self.layer_list.currentItem()
        if not current and self.layer_list.count() > 0:
            current = self.layer_list.item(0)
        if not current:
            return

        table_key = current.data(Qt.UserRole)
        safe_name = table_key.replace(".", "_")
        local_geojson_path = os.path.join(self.local_workspace_dir, f"{safe_name}.geojson")

        self.append_sync_log(f"Loading {table_key} ({self.active_workspace_id})...")
        fetched_remote = False
        try:
            fc = self.http_json_request(f"/api/db/layers/{table_key}/geojson", method="GET")
            with open(local_geojson_path, "w", encoding="utf-8") as fp:
                json.dump(fc, fp, indent=2)
            self.unlock_file_permissions(local_geojson_path)
            fetched_remote = True
        except Exception:
            fetched_remote = False

        if not fetched_remote:
            self.write_bridge_geojson(table_key, local_geojson_path)

        vlayer = QgsVectorLayer(local_geojson_path, f"[{self.active_workspace_id}] {table_key}", "ogr")
        if not vlayer.isValid():
            QMessageBox.warning(self, "Meridian Host", f"Could not load layer {table_key}")
            return

        with BRIDGE_LOCK:
            tier = BRIDGE_STATE["default_access_tier"]
        vlayer.setReadOnly(tier == "VIEWER")
        vlayer.setCustomProperty("meridian_table_key", table_key)
        vlayer.setCustomProperty("meridian_workspace_id", self.active_workspace_id)
        vlayer.setCustomProperty("meridian_local_path", local_geojson_path)

        QgsProject.instance().addMapLayer(vlayer)
        self.bind_auto_commit_hooks(vlayer, table_key)
        self.append_sync_log(f"Loaded {table_key} — Toggle Editing (Pencil) unlocked")
        self.iface.messageBar().pushMessage(
            "Meridian Cloud Workspace",
            f"Loaded {table_key} from workspace '{self.active_workspace_id}'!",
            level=Qgis.Success,
            duration=4,
        )

    def bind_auto_commit_hooks(self, layer, table_key):
        if layer.id() in self.connected_layer_ids:
            return
        self.connected_layer_ids.add(layer.id())

        def on_features_added(_layer_id, added_features):
            for feat in added_features:
                attrs = {
                    field.name(): feat[field.name()]
                    for field in feat.fields()
                    if not field.name().startswith("_")
                }
                geom_wkt = feat.geometry().asWkt() if feat.hasGeometry() else ""
                self.post_transaction("INSERT", table_key, None, geom_wkt, attrs)

        def on_attributes_changed(_layer_id, changed_attrs_map):
            fields = layer.fields()
            for fid, attr_dict in changed_attrs_map.items():
                patch = {
                    fields.at(idx).name(): val
                    for idx, val in attr_dict.items()
                    if not fields.at(idx).name().startswith("_")
                }
                self.post_transaction("UPDATE", table_key, fid, None, patch)

        def on_geometry_changed(_layer_id, changed_geom_map):
            for fid, geom in changed_geom_map.items():
                self.post_transaction("UPDATE", table_key, fid, geom.asWkt(), {})

        def on_features_removed(_layer_id, deleted_fids):
            for fid in deleted_fids:
                self.post_transaction("DELETE", table_key, fid, None, {})

        layer.committedFeaturesAdded.connect(on_features_added)
        layer.committedAttributeValuesChanges.connect(on_attributes_changed)
        layer.committedGeometryValuesChanges.connect(on_geometry_changed)
        layer.committedFeaturesRemoved.connect(on_features_removed)

    def post_transaction(self, operation, table_key, fid, geom_wkt, attributes):
        self.append_sync_log(f"Pushing file update ({operation} on {table_key})...")
        payload = {
            "workstation": f"{WORKSTATION_NAME} ({DEVICE_LAN_IP})",
            "workspaceId": self.active_workspace_id,
            "operation": operation,
            "tableKey": table_key,
            "fid": fid,
            "geomWkt": geom_wkt,
            "attributes": attributes,
        }
        try:
            res_data = self.http_json_request("/api/db/transaction", method="POST", payload_dict=payload)
            txid = res_data.get("auditEntry", {}).get("txid", BRIDGE_STATE["current_txid"] + 1)
            with BRIDGE_LOCK:
                BRIDGE_STATE["current_txid"] = txid
            self.append_sync_log(f"Committed {operation} -> txid #{txid} & recompiled .SHP (200 OK)")
            self.iface.messageBar().pushMessage(
                "Meridian Two-Way Mirror",
                f"Instant {operation} committed to {table_key} & .SHP (txid #{txid})",
                level=Qgis.Success,
                duration=4,
            )
            self.fetch_host_status(is_refresh=False)
        except urllib.error.HTTPError as err:
            err_body = err.read().decode("utf-8", errors="ignore")
            self.append_sync_log(f"403 DENIED: {operation} blocked on {table_key}")
            self.iface.messageBar().pushMessage(
                "SQL Permission Denied",
                f"Host rejected {operation} on {table_key}: {err_body}",
                level=Qgis.Critical,
                duration=6,
            )
        except Exception:
            with BRIDGE_LOCK:
                BRIDGE_STATE["current_txid"] += 1
                txid = BRIDGE_STATE["current_txid"]
                BRIDGE_STATE["pending_transactions"].append(payload)

            relay_sent = self.publish_tx_to_cloud_relay(payload)
            self.render_state_from_bridge("CLOUD RELAY + LAN" if relay_sent else "LAN BRIDGE")
            self.append_sync_log(
                f"200 OK · Committed {operation} via Multi-Device Relay & LAN Bridge (txid #{txid})"
            )
            self.iface.messageBar().pushMessage(
                "Meridian Multi-Device Sync",
                f"Committed {operation} on {table_key} via Cloud Relay & LAN Bridge (txid #{txid})",
                level=Qgis.Success,
                duration=4,
            )

    def refresh_all_live_layers(self):
        self.fetch_host_status(is_refresh=True)
        refreshed = 0
        for layer in QgsProject.instance().mapLayers().values():
            t_key = layer.customProperty("meridian_table_key")
            local_p = layer.customProperty("meridian_local_path")
            if t_key and local_p and not layer.isEditable():
                try:
                    fc = self.http_json_request(f"/api/db/layers/{t_key}/geojson", method="GET")
                    with open(local_p, "w", encoding="utf-8") as fp:
                        json.dump(fc, fp, indent=2)
                    self.unlock_file_permissions(local_p)
                except Exception:
                    self.write_bridge_geojson(t_key, local_p)
            layer.dataProvider().reloadData()
            layer.triggerRepaint()
            refreshed += 1
        self.iface.mapCanvas().refreshAllLayers()
        self.append_sync_log(f"Manual Refresh Complete · Updated {refreshed} layer(s) on canvas")
        self.iface.messageBar().pushMessage(
            "One-Click Refresh Complete",
            f"Pulled latest multi-device edits across {refreshed} active layer(s).",
            level=Qgis.Info,
            duration=3,
        )

    def pull_and_open_workspace(self):
        self.append_sync_log(f"Opening all layers for Cloud Workspace '{self.active_workspace_id}'...")
        with BRIDGE_LOCK:
            tables = list(BRIDGE_STATE["tables"])

        for tbl in tables:
            t_key = tbl["tableKey"]
            safe_name = t_key.replace(".", "_")
            local_p = os.path.join(self.local_workspace_dir, f"{safe_name}.geojson")
            try:
                fc = self.http_json_request(f"/api/db/layers/{t_key}/geojson", method="GET")
                with open(local_p, "w", encoding="utf-8") as fp:
                    json.dump(fc, fp, indent=2)
                self.unlock_file_permissions(local_p)
            except Exception:
                self.write_bridge_geojson(t_key, local_p)

            vlayer = QgsVectorLayer(
                local_p, f"[{self.active_workspace_id}] {tbl['tableName']}.shp ⇄ {t_key}", "ogr"
            )
            if vlayer.isValid():
                with BRIDGE_LOCK:
                    tier = BRIDGE_STATE["default_access_tier"]
                vlayer.setReadOnly(tier == "VIEWER")
                vlayer.setCustomProperty("meridian_table_key", t_key)
                vlayer.setCustomProperty("meridian_workspace_id", self.active_workspace_id)
                vlayer.setCustomProperty("meridian_local_path", local_p)
                QgsProject.instance().addMapLayer(vlayer)
                self.bind_auto_commit_hooks(vlayer, t_key)

        self.append_sync_log(
            f"200 OK · Opened {len(tables)} layers from Cloud Workspace '{self.active_workspace_id}'!"
        )
        self.iface.messageBar().pushMessage(
            "Meridian Cloud Workspace",
            f"Loaded {len(tables)} spatial layers for '{self.active_workspace_id}'!",
            level=Qgis.Success,
            duration=5,
        )

    def on_project_saved_auto_push(self):
        self.append_sync_log(f"Pushing file update to {self.active_workspace_id} (.qgs + .shp + .dbf)...")


class MeridianLiveHostPlugin:
    def __init__(self, iface):
        self.iface = iface
        self.dock = None

    def initGui(self):
        self.dock = MeridianLiveHostDock(self.iface, self.iface.mainWindow())
        self.iface.addDockWidget(Qt.RightDockWidgetArea, self.dock)

    def unload(self):
        old_srv = getattr(sys, "_meridian_bridge_srv", None)
        if old_srv is not None:
            try:
                old_srv.shutdown()
                old_srv.server_close()
            except Exception:
                pass
            sys._meridian_bridge_srv = None
        if self.dock:
            self.iface.removeDockWidget(self.dock)
            self.dock = None
`;

  const readmeTxt = `MERIDIAN LIVE FILE HOST — INSTALLABLE QGIS 3.x PLUGIN (v3.1.0 MULTI-WORKSPACE + MULTI-DEVICE)
=============================================================================================

Primary Host URL   : ${primaryUrl}
Fallback Dev URL   : ${fallbackUrl}
Network LAN Bridge : http://0.0.0.0:17420 (Accessible from local PC or any computer on same Wi-Fi/LAN/VPN)
Cloud Relay Room   : meridian-citarum-2026 (Syncs across different internet networks)
Pairing Token      : MRDN-2026-CITARUM-LIVE-TOKEN

ACTIVE CLOUD WORKSPACES INCLUDED:
1. watershed-citarum-2026 (Upper Citarum Watershed Assessment 2026):
   - public.hydro_sub_basins, public.floodplain_parcels_100yr, public.rainfall_telemetry_stations
2. coastal-mangrove-delta-2026 (Jakarta Bay & Coastal Mangrove Delta 2026):
   - public.coastal_mangrove_zones, public.seawall_defense_segments, public.tidal_gauge_buoys
3. urban-transit-corridor-2026 (Bandung LRT & Utility Corridor 2026):
   - public.transit_station_buffers, public.underground_utility_ducts
4. Any Custom Cloud Workspace Link (.../api/workspaces/<your-workspace-id>)

HOW TO SWITCH ACTIVE CLOUD WORKSPACES IN QGIS DESKTOP:
- Select any workspace from the 'Active Cloud Workspace' dropdown in the Meridian QGIS Dock, OR
- Paste any Cloud Workspace Link (e.g. ${primaryUrl}/api/workspaces/coastal-mangrove-delta-2026)
  into the link bar and click 'Connect Link' — the layer list immediately updates to that workspace's layers!
`;

  return {
    folderName,
    zipFileName,
    metadataTxt,
    initPy,
    pluginPy,
    readmeTxt,
  };
}

export async function downloadMeridianQgisPluginZip(
  hostUrl: string,
  defaultWorkspaceId: string = 'watershed-citarum-2026',
  liveWorkspacesOrTablesSnapshot?: unknown
): Promise<void> {
  const bundle = generateQgisPluginSources(hostUrl, defaultWorkspaceId, liveWorkspacesOrTablesSnapshot);
  const zip = new JSZip();
  const root = zip.folder(bundle.folderName)!;

  root.file('metadata.txt', bundle.metadataTxt);
  root.file('__init__.py', bundle.initPy);
  root.file('plugin.py', bundle.pluginPy);
  root.file('README_INSTALL.txt', bundle.readmeTxt);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = bundle.zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
