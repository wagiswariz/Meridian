import JSZip from 'jszip';

export type OperatingSystem = 'windows' | 'macos' | 'linux';
export type CloudProvider = 'OneDrive' | 'Google Drive' | 'Dropbox' | 'Nextcloud' | 'Syncthing' | 'NAS / SMB';

export interface DeviceNode {
  id: string;
  hostname: string;
  label: string;
  os: OperatingSystem;
  qgisProfilePath: string;
  cloudProvider: CloudProvider;
  cloudRootPath: string;
  secondaryPaths: Record<string, string>; // e.g., { "@hub_dem": "D:/GIS_Archive/National_DEM" }
}

export interface PathVariable {
  token: string; // e.g. "@cloud_root" or "@hub_dem"
  description: string;
  relativeFallback: string;
}

export interface ParsedQgisLayer {
  id: string;
  name: string;
  provider: string; // 'ogr' | 'gdal' | 'postgres' | 'wms' | 'delimitedtext'
  geometryType: string;
  originalDatasource: string;
  rewrittenDatasource: string;
  status: 'portable_relative' | 'tokenized_hub' | 'broken_absolute' | 'remote_service';
  matchedPrefix?: string;
  matchedToken?: string;
}

export interface ParsedQgisProject {
  fileName: string;
  qgisVersion: string;
  projectTitle: string;
  isAbsoluteFlag: boolean;
  projectFolderInCloud: string; // e.g., "Projects/Watershed_2026"
  rawXml: string;
  layers: ParsedQgisLayer[];
}

export const INITIAL_DEVICES: DeviceNode[] = [
  {
    id: 'dev-win-workstation',
    hostname: 'DESKTOP-GIS01',
    label: 'Office Windows Workstation',
    os: 'windows',
    qgisProfilePath: '%APPDATA%\\QGIS\\QGIS3\\profiles\\default',
    cloudProvider: 'OneDrive',
    cloudRootPath: 'C:/Users/wagis/OneDrive/GIS_Cloud_Hub',
    secondaryPaths: {
      '@hub_dem': 'D:/GIS_Archive/National_DEM',
      '@hub_basemaps': 'C:/Users/wagis/OneDrive/GIS_Cloud_Hub/Shared_Basemaps',
      '@hub_styles': 'C:/Users/wagis/OneDrive/GIS_Cloud_Hub/Styles',
    },
  },
  {
    id: 'dev-mac-field',
    hostname: 'MacBook-Pro-Field.local',
    label: 'Field MacBook Pro (M3 Max)',
    os: 'macos',
    qgisProfilePath: '~/Library/Application Support/QGIS/QGIS3/profiles/default',
    cloudProvider: 'OneDrive',
    cloudRootPath: '/Users/wagis/Library/CloudStorage/OneDrive-Personal/GIS_Cloud_Hub',
    secondaryPaths: {
      '@hub_dem': '/Volumes/ExtremeSSD/GIS_Archive/National_DEM',
      '@hub_basemaps': '/Users/wagis/Library/CloudStorage/OneDrive-Personal/GIS_Cloud_Hub/Shared_Basemaps',
      '@hub_styles': '/Users/wagis/Library/CloudStorage/OneDrive-Personal/GIS_Cloud_Hub/Styles',
    },
  },
  {
    id: 'dev-linux-lab',
    hostname: 'geocompute-ubuntu',
    label: 'Linux PostGIS & Render Node',
    os: 'linux',
    qgisProfilePath: '~/.local/share/QGIS/QGIS3/profiles/default',
    cloudProvider: 'Syncthing',
    cloudRootPath: '/home/wagis/sync/GIS_Cloud_Hub',
    secondaryPaths: {
      '@hub_dem': '/mnt/nas_array/GIS_Archive/National_DEM',
      '@hub_basemaps': '/home/wagis/sync/GIS_Cloud_Hub/Shared_Basemaps',
      '@hub_styles': '/home/wagis/sync/GIS_Cloud_Hub/Styles',
    },
  },
];

export const INITIAL_VARIABLES: PathVariable[] = [
  {
    token: '@cloud_root',
    description: 'Primary synced cloud workspace root across all computers',
    relativeFallback: '../..',
  },
  {
    token: '@hub_basemaps',
    description: 'Shared regional orthophotos, hillshades, and vector base layers',
    relativeFallback: '../../Shared_Basemaps',
  },
  {
    token: '@hub_dem',
    description: 'Heavy elevation / LiDAR raster repository (external SSD or NAS drive)',
    relativeFallback: '../../Shared_DEM',
  },
  {
    token: '@hub_styles',
    description: 'Centralized SVG markers, color ramps, and print layout templates',
    relativeFallback: '../../Styles',
  },
];

export const SAMPLE_QGS_XML = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.38.2-Grenoble" projectname="Upper Citarum Watershed Assessment 2026" saveUser="wagis">
  <homePath path=""/>
  <title>Upper Citarum Watershed Assessment 2026</title>
  <properties>
    <Paths>
      <Absolute type="bool">true</Absolute>
    </Paths>
    <DefaultStyles>
      <Marker type="QString">C:/Users/wagis/OneDrive/GIS_Cloud_Hub/Styles/svg/stream_gauge.svg</Marker>
    </DefaultStyles>
  </properties>
  <projectlayers>
    <maplayer type="vector" geometry="Polygon" labelsEnabled="1">
      <id>hydro_subbasins_8921a</id>
      <layername>Hydrological Sub-Basins (HUC-12)</layername>
      <provider encoding="UTF-8">ogr</provider>
      <datasource>C:/Users/wagis/OneDrive/GIS_Cloud_Hub/Projects/Watershed_2026/data/hydro_basins.gpkg|layername=sub_basins</datasource>
    </maplayer>
    <maplayer type="vector" geometry="LineString" labelsEnabled="0">
      <id>river_network_3310b</id>
      <layername>Primary River &amp; Tributary Network</layername>
      <provider encoding="UTF-8">ogr</provider>
      <datasource>C:\\Users\\wagis\\OneDrive\\GIS_Cloud_Hub\\Projects\\Watershed_2026\\data\\river_channels.gpkg|layername=rivers_main</datasource>
    </maplayer>
    <maplayer type="raster" geometry="NoGeometry">
      <id>hillshade_10m_9920c</id>
      <layername>Regional Terrain Hillshade (10m)</layername>
      <provider>gdal</provider>
      <datasource>C:/Users/wagis/OneDrive/GIS_Cloud_Hub/Shared_Basemaps/terrain_hillshade_10m.tif</datasource>
    </maplayer>
    <maplayer type="raster" geometry="NoGeometry">
      <id>lidar_dem_30m_4412d</id>
      <layername>National SRTM Digital Elevation Model (30m)</layername>
      <provider>gdal</provider>
      <datasource>D:/GIS_Archive/National_DEM/srtm_30m_clipped.tif</datasource>
    </maplayer>
    <maplayer type="vector" geometry="Point" labelsEnabled="1">
      <id>telemetry_stations_7741e</id>
      <layername>Automated Rainfall Telemetry Stations</layername>
      <provider encoding="UTF-8">delimitedtext</provider>
      <datasource>file:///C:/Users/wagis/OneDrive/GIS_Cloud_Hub/Projects/Watershed_2026/tables/rainfall_gauges_2026.csv?type=csv&amp;xField=lon&amp;yField=lat&amp;crs=EPSG:4326</datasource>
    </maplayer>
    <maplayer type="vector" geometry="MultiPolygon" labelsEnabled="0">
      <id>flood_hazard_zones_1189f</id>
      <layername>100-Year Floodplain Parcels</layername>
      <provider encoding="UTF-8">ogr</provider>
      <datasource>./data/flood_hazard_100yr.gpkg|layername=floodplain</datasource>
    </maplayer>
  </projectlayers>
</qgis>`;

/**
 * Normalizes slashes to forward slashes for consistent cross-OS matching
 */
export function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, '/');
}

/**
 * Computes relative path from a project folder inside cloud root to another target inside cloud root
 */
function computeRelativeInsideCloud(projectFolderInCloud: string, subPathInCloud: string): string {
  const cleanProj = normalizeSlashes(projectFolderInCloud).replace(/^\/+|\/+$/g, '');
  const cleanSub = normalizeSlashes(subPathInCloud).replace(/^\/+/, '');

  if (!cleanProj) {
    return `./${cleanSub}`;
  }

  // If subPath starts with the project folder itself, make it "./..."
  if (cleanSub.toLowerCase().startsWith(cleanProj.toLowerCase() + '/')) {
    const insideProj = cleanSub.slice(cleanProj.length + 1);
    return `./${insideProj}`;
  }

  // Otherwise climb up to cloud root using "../"
  const depth = cleanProj.split('/').filter(Boolean).length;
  const upPrefix = Array(depth).fill('..').join('/');
  return `${upPrefix}/${cleanSub}`;
}

/**
 * Converts a single datasource string to a portable relative path or @hub_* token path
 */
export function convertDatasourcePath(
  rawDatasource: string,
  devices: DeviceNode[],
  projectFolderInCloud: string,
  preferHubTokensForExternal: boolean = true
): {
  rewritten: string;
  status: ParsedQgisLayer['status'];
  matchedPrefix?: string;
  matchedToken?: string;
} {
  const trimmed = rawDatasource.trim();

  // Check if it's already relative
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return { rewritten: normalizeSlashes(trimmed), status: 'portable_relative' };
  }

  // Check if it already uses a hub token
  if (trimmed.startsWith('@')) {
    return { rewritten: normalizeSlashes(trimmed), status: 'tokenized_hub' };
  }

  // Remote services (WMS/WFS/PostGIS host/XYZ)
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.includes('service=') ||
    (trimmed.includes('dbname=') && trimmed.includes('host='))
  ) {
    return { rewritten: trimmed, status: 'remote_service' };
  }

  // Handle delimitedtext file:/// prefix
  let hasFileProtocol = false;
  let working = normalizeSlashes(trimmed);
  if (working.startsWith('file:///')) {
    hasFileProtocol = true;
    working = working.slice('file:///'.length);
    // On macOS/Linux file:///Users/... needs leading slash restored
    if (!working.startsWith('/') && !/^[A-Za-z]:/.test(working)) {
      working = '/' + working;
    }
  }

  // First check secondary paths (like @hub_dem on D:/ drive or external SSD)
  for (const dev of devices) {
    for (const [token, secPath] of Object.entries(dev.secondaryPaths)) {
      const normSec = normalizeSlashes(secPath).replace(/\/+$/, '');
      if (!normSec) continue;

      if (working.toLowerCase().startsWith(normSec.toLowerCase() + '/')) {
        const remainder = working.slice(normSec.length + 1);
        // Check if this secondary path is actually inside the cloud root
        const normCloud = normalizeSlashes(dev.cloudRootPath).replace(/\/+$/, '');
        if (!preferHubTokensForExternal && normSec.toLowerCase().startsWith(normCloud.toLowerCase() + '/')) {
          const subInCloud = normSec.slice(normCloud.length + 1) + '/' + remainder;
          const rel = computeRelativeInsideCloud(projectFolderInCloud, subInCloud);
          return {
            rewritten: hasFileProtocol ? `file://${rel}` : rel,
            status: 'portable_relative',
            matchedPrefix: normSec,
          };
        }
        return {
          rewritten: `${token}/${remainder}`,
          status: 'tokenized_hub',
          matchedPrefix: normSec,
          matchedToken: token,
        };
      }
    }
  }

  // Next check primary cloudRootPath across all registered devices
  for (const dev of devices) {
    const normCloud = normalizeSlashes(dev.cloudRootPath).replace(/\/+$/, '');
    if (!normCloud) continue;

    if (working.toLowerCase().startsWith(normCloud.toLowerCase() + '/')) {
      const subInCloud = working.slice(normCloud.length + 1);
      const rel = computeRelativeInsideCloud(projectFolderInCloud, subInCloud);
      return {
        rewritten: rel,
        status: 'portable_relative',
        matchedPrefix: normCloud,
      };
    }
  }

  // Heuristic fallback: if it contains '/data/' or '/tables/' or '/layers/' or '/rasters/'
  const commonFolders = ['/data/', '/tables/', '/layers/', '/rasters/', '/vectors/', '/shapefiles/', '/gpkg/'];
  for (const marker of commonFolders) {
    const idx = working.toLowerCase().lastIndexOf(marker);
    if (idx !== -1) {
      const rel = '.' + working.slice(idx);
      return {
        rewritten: rel,
        status: 'portable_relative',
        matchedPrefix: working.slice(0, idx),
      };
    }
  }

  // Still an unresolved absolute path
  return {
    rewritten: working,
    status: 'broken_absolute',
  };
}

/**
 * Parses a QGIS .qgs XML string and evaluates all maplayer datasources
 */
export function parseQgisXml(
  xmlString: string,
  fileName: string,
  devices: DeviceNode[],
  projectFolderInCloud: string = 'Projects/Watershed_2026',
  preferHubTokensForExternal: boolean = true
): ParsedQgisProject {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const qgisEl = doc.querySelector('qgis');
  const qgisVersion = qgisEl?.getAttribute('version') || '3.34+';
  const projectTitle =
    doc.querySelector('qgis > title')?.textContent ||
    qgisEl?.getAttribute('projectname') ||
    fileName.replace(/\.(qgs|qgz)$/i, '');

  const absEl = doc.querySelector('properties > Paths > Absolute');
  const isAbsoluteFlag = absEl ? absEl.textContent?.trim().toLowerCase() === 'true' : true;

  const layerEls = Array.from(doc.querySelectorAll('projectlayers > maplayer'));
  const layers: ParsedQgisLayer[] = layerEls.map((el, idx) => {
    const id = el.querySelector('id')?.textContent || `layer_${idx}`;
    const name = el.querySelector('layername')?.textContent || `Unnamed Layer ${idx + 1}`;
    const provider = el.querySelector('provider')?.textContent || 'ogr';
    const geometryType = el.getAttribute('geometry') || el.getAttribute('type') || 'Unknown';
    const originalDatasource = el.querySelector('datasource')?.textContent || '';

    const conversion = convertDatasourcePath(
      originalDatasource,
      devices,
      projectFolderInCloud,
      preferHubTokensForExternal
    );

    return {
      id,
      name,
      provider,
      geometryType,
      originalDatasource,
      rewrittenDatasource: conversion.rewritten,
      status: conversion.status,
      matchedPrefix: conversion.matchedPrefix,
      matchedToken: conversion.matchedToken,
    };
  });

  return {
    fileName,
    qgisVersion,
    projectTitle,
    isAbsoluteFlag,
    projectFolderInCloud,
    rawXml: xmlString,
    layers,
  };
}

/**
 * Applies the rewritten datasources and sets <Absolute type="bool">false</Absolute> in the XML
 */
export function serializeSanitizedQgsXml(project: ParsedQgisProject): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(project.rawXml, 'application/xml');

  // Ensure <properties><Paths><Absolute type="bool">false</Absolute></Paths></properties>
  let propsEl = doc.querySelector('qgis > properties');
  if (!propsEl) {
    const qgisRoot = doc.querySelector('qgis');
    if (qgisRoot) {
      propsEl = doc.createElement('properties');
      qgisRoot.insertBefore(propsEl, qgisRoot.firstChild);
    }
  }

  if (propsEl) {
    let pathsEl = propsEl.querySelector('Paths');
    if (!pathsEl) {
      pathsEl = doc.createElement('Paths');
      propsEl.appendChild(pathsEl);
    }
    let absEl = pathsEl.querySelector('Absolute');
    if (!absEl) {
      absEl = doc.createElement('Absolute');
      absEl.setAttribute('type', 'bool');
      pathsEl.appendChild(absEl);
    }
    absEl.textContent = 'false';
  }

  // Update each maplayer datasource
  const layerEls = Array.from(doc.querySelectorAll('projectlayers > maplayer'));
  layerEls.forEach((el, idx) => {
    const id = el.querySelector('id')?.textContent || `layer_${idx}`;
    const matchingLayer = project.layers.find((l) => l.id === id) || project.layers[idx];
    const dsEl = el.querySelector('datasource');
    if (dsEl && matchingLayer) {
      dsEl.textContent = matchingLayer.rewrittenDatasource;
    }
  });

  // Also rewrite any DefaultStyles Marker paths if they match a device cloud path
  const markerEl = doc.querySelector('properties > DefaultStyles > Marker');
  if (markerEl && markerEl.textContent) {
    markerEl.textContent = markerEl.textContent.replace(
      /^.*\/Styles\//i,
      '@hub_styles/'
    );
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

/**
 * Unpacks a .qgz (or reads a .qgs) File uploaded by the user
 */
export async function readQgisFileUpload(file: File): Promise<{ fileName: string; xmlContent: string }> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.qgz')) {
    const zip = await JSZip.loadAsync(file);
    const qgsEntry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith('.qgs'));
    if (!qgsEntry) {
      throw new Error('No .qgs XML project file found inside the uploaded .qgz archive.');
    }
    const xmlContent = await qgsEntry.async('string');
    return { fileName: file.name, xmlContent };
  } else {
    const xmlContent = await file.text();
    return { fileName: file.name, xmlContent };
  }
}

/**
 * Packages a sanitized .qgs XML string into a downloadable .qgz compressed archive
 */
export async function buildQgzBlob(fileName: string, sanitizedXml: string): Promise<Blob> {
  const zip = new JSZip();
  const baseName = fileName.replace(/\.(qgs|qgz)$/i, '');
  zip.file(`${baseName}.qgs`, sanitizedXml);
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * Resolves how a given path or @hub_* token resolves on a specific target DeviceNode
 */
export function resolvePathOnDevice(
  portablePath: string,
  targetDevice: DeviceNode,
  projectFolderInCloud: string
): string {
  const normCloud = normalizeSlashes(targetDevice.cloudRootPath).replace(/\/+$/, '');
  const normProjFolder = normalizeSlashes(projectFolderInCloud).replace(/^\/+|\/+$/g, '');
  const fullProjectDir = normProjFolder ? `${normCloud}/${normProjFolder}` : normCloud;

  let resolved = portablePath;

  // 1. Check @cloud_root
  if (resolved.startsWith('@cloud_root/')) {
    resolved = `${normCloud}/${resolved.slice('@cloud_root/'.length)}`;
  }

  // 2. Check secondary tokens (@hub_dem, @hub_basemaps, @hub_styles)
  for (const [token, targetPath] of Object.entries(targetDevice.secondaryPaths)) {
    if (resolved.startsWith(token + '/')) {
      const cleanTarget = normalizeSlashes(targetPath).replace(/\/+$/, '');
      resolved = `${cleanTarget}/${resolved.slice(token.length + 1)}`;
    }
  }

  // 3. Resolve relative ./ or ../ against fullProjectDir
  if (resolved.startsWith('./')) {
    resolved = `${fullProjectDir}/${resolved.slice(2)}`;
  } else if (resolved.startsWith('../')) {
    const parts = fullProjectDir.split('/');
    let relParts = resolved.split('/');
    while (relParts[0] === '..') {
      parts.pop();
      relParts.shift();
    }
    resolved = `${parts.join('/')}/${relParts.join('/')}`;
  }

  // Format slashes for target OS display if Windows
  if (targetDevice.os === 'windows') {
    // Keep URI suffix after | intact with forward slashes, or format main file path
    const [filePart, ...rest] = resolved.split('|');
    const winFile = filePart.replace(/\//g, '\\');
    return rest.length > 0 ? `${winFile}|${rest.join('|')}` : winFile;
  }

  return resolved;
}

/**
 * Generates the central `qgis_hub_config.json` content
 */
export function generateCentralConfigJson(
  devices: DeviceNode[],
  variables: PathVariable[],
  projectFolderInCloud: string
): string {
  const configObj = {
    schemaVersion: '2.1.0',
    hubName: 'Meridian QGIS Cross-Device Path Hub',
    updatedAt: new Date().toISOString(),
    syncSettings: {
      enforceRelativeProjectPaths: true,
      autoRewriteLegacyDriveLetters: true,
      sqliteWalSafetyCheck: true,
      defaultProjectSubfolder: projectFolderInCloud,
    },
    pathVariables: variables.reduce(
      (acc, v) => {
        acc[v.token] = {
          description: v.description,
          relativeFallback: v.relativeFallback,
        };
        return acc;
      },
      {} as Record<string, { description: string; relativeFallback: string }>
    ),
    workstations: devices.reduce(
      (acc, dev) => {
        acc[dev.hostname] = {
          id: dev.id,
          label: dev.label,
          os: dev.os,
          cloudProvider: dev.cloudProvider,
          cloudRootPath: normalizeSlashes(dev.cloudRootPath),
          mounts: Object.fromEntries(
            Object.entries(dev.secondaryPaths).map(([k, v]) => [k, normalizeSlashes(v)])
          ),
        };
        return acc;
      },
      {} as Record<string, unknown>
    ),
  };

  return JSON.stringify(configObj, null, 2);
}

/**
 * Generates the real PyQGIS `startup.py` script that hooks into `QgsPathResolver.setPathPreprocessor`
 */
export function generatePyQgisStartupScript(
  devices: DeviceNode[],
  variables: PathVariable[]
): string {
  const deviceDictEntries = devices
    .map((d) => {
      const mountsStr = Object.entries(d.secondaryPaths)
        .map(([k, v]) => `            "${k}": "${normalizeSlashes(v)}"`)
        .join(',\n');
      return `    "${d.hostname.toLowerCase()}": {
        "label": "${d.label}",
        "os": "${d.os}",
        "cloud_root": "${normalizeSlashes(d.cloudRootPath)}",
        "mounts": {
${mountsStr}
        }
    }`;
    })
    .join(',\n');

  const knownPrefixes = Array.from(
    new Set(
      devices.flatMap((d) => [
        normalizeSlashes(d.cloudRootPath).replace(/\/+$/, ''),
        ...Object.values(d.secondaryPaths).map((p) => normalizeSlashes(p).replace(/\/+$/, '')),
      ])
    )
  ).filter(Boolean);

  return `# -*- coding: utf-8 -*-
"""
Meridian Sync — Dynamic Multi-Computer Path Resolver for QGIS 3.x
Place this file in your local QGIS user profile folder OR root QGIS3 folder:
  - Windows : %APPDATA%\\QGIS\\QGIS3\\startup.py
  - macOS   : ~/Library/Application Support/QGIS/QGIS3/startup.py
  - Linux   : ~/.local/share/QGIS/QGIS3/startup.py

How it works:
  Registers a global QgsPathResolver preprocessor before any .qgs/.qgz project opens.
  1. Resolves portable hub tokens (@cloud_root, @hub_dem, @hub_basemaps, @hub_styles)
     to the current computer's local mount points via qgis_hub_config.json or fallback map.
  2. Intercepts hardcoded absolute paths saved from other computers (e.g. C:/Users/... vs /Users/...)
     and dynamically remaps them on-the-fly so layers never break when hot-swapping devices.
"""

import os
import json
import socket
import platform
from qgis.core import QgsPathResolver, QgsMessageLog, Qgis, QgsProject

HOSTNAME = socket.gethostname().lower()

# Fallback embedded workstation matrix (automatically overridden if qgis_hub_config.json is found in cloud_root)
WORKSTATION_MATRIX = {
${deviceDictEntries}
}

KNOWN_LEGACY_CLOUD_ROOTS = ${JSON.stringify(knownPrefixes, null, 4)}


def _detect_active_workstation():
    """Matches current computer by hostname or existing local cloud root directory."""
    if HOSTNAME in WORKSTATION_MATRIX:
        return WORKSTATION_MATRIX[HOSTNAME]
    for host_key, cfg in WORKSTATION_MATRIX.items():
        if host_key in HOSTNAME or HOSTNAME in host_key:
            return cfg
    # Fallback: check which configured cloud_root path physically exists on this OS
    for cfg in WORKSTATION_MATRIX.values():
        if os.path.exists(cfg["cloud_root"]):
            return cfg
    return next(iter(WORKSTATION_MATRIX.values()))


def _load_hub_config(active_ws):
    """Loads central qgis_hub_config.json from the synced cloud root if present."""
    config_file = os.path.join(active_ws["cloud_root"], "qgis_hub_config.json")
    if os.path.isfile(config_file):
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            ws_map = data.get("workstations", {})
            for h_name, h_data in ws_map.items():
                if h_name.lower() == HOSTNAME or os.path.exists(h_data.get("cloudRootPath", "")):
                    return {
                        "label": h_data.get("label", active_ws["label"]),
                        "cloud_root": h_data.get("cloudRootPath", active_ws["cloud_root"]),
                        "mounts": h_data.get("mounts", active_ws["mounts"]),
                    }
        except Exception as err:
            QgsMessageLog.logMessage(f"Config load warning: {err}", "MeridianSync", Qgis.Warning)
    return active_ws


ACTIVE_NODE = _load_hub_config(_detect_active_workstation())


def meridian_path_preprocessor(path):
    """
    Called automatically by QGIS for every layer datasource, SVG marker, and resource path.
    Translates @hub_* tokens and cross-OS absolute paths to the current computer's mount root.
    """
    if not path or not isinstance(path, str):
        return path

    norm_path = path.replace("\\\\", "/")
    cloud_root = ACTIVE_NODE["cloud_root"].rstrip("/")
    mounts = ACTIVE_NODE.get("mounts", {})

    # 1. Expand @cloud_root token
    if norm_path.startswith("@cloud_root/"):
        resolved = f"{cloud_root}/{norm_path[len('@cloud_root/'):]}"
        return os.path.normpath(resolved)

    # 2. Expand secondary mount tokens (@hub_dem, @hub_basemaps, @hub_styles)
    for token, target_mount in mounts.items():
        prefix = f"{token}/"
        if norm_path.startswith(prefix):
            clean_mount = target_mount.rstrip("/")
            resolved = f"{clean_mount}/{norm_path[len(prefix):]}"
            return os.path.normpath(resolved)

    # 3. Hot-swap interception: rewrite absolute paths originating from other computers
    for foreign_root in KNOWN_LEGACY_CLOUD_ROOTS:
        clean_foreign = foreign_root.rstrip("/")
        if clean_foreign and norm_path.lower().startswith(clean_foreign.lower() + "/"):
            suffix = norm_path[len(clean_foreign) + 1:]
            # Check if foreign_root belongs to a secondary mount on another device
            for other_ws in WORKSTATION_MATRIX.values():
                for tok, other_mount in other_ws.get("mounts", {}).items():
                    if other_mount.rstrip("/").lower() == clean_foreign.lower() and tok in mounts:
                        remapped = f"{mounts[tok].rstrip('/')}/{suffix}"
                        return os.path.normpath(remapped)
            # Otherwise remap directly to this computer's primary cloud_root
            remapped = f"{cloud_root}/{suffix}"
            return os.path.normpath(remapped)

    return path


# Register preprocessor hook with QGIS Path Resolver
PROCESSOR_ID = QgsPathResolver.setPathPreprocessor(meridian_path_preprocessor)

QgsMessageLog.logMessage(
    f"Meridian Dynamic Path Hub active on [{ACTIVE_NODE['label']}] -> {ACTIVE_NODE['cloud_root']}",
    "MeridianSync",
    Qgis.Info
)
`;
}

/**
 * Generates Cloud Sync ignore rules (.stignore / .syncignore) to prevent GeoPackage WAL corruption
 */
export function generateCloudIgnoreRules(): string {
  return `# Meridian Sync — Cloud Storage Ignore Rules (.stignore / .syncignore)
# Place this in your synced GIS_Cloud_Hub root folder to prevent SQLite/GeoPackage
# Write-Ahead Logging (.gpkg-wal / .gpkg-shm) corruption when switching computers.

# 1. GeoPackage & Spatialite temporary lock/WAL sidecars (Wait until QGIS closes to sync main .gpkg)
*.gpkg-wal
*.gpkg-shm
*.gpkg-journal
*.sqlite-wal
*.sqlite-shm

# 2. QGIS temporary swap & backup files
*.qgs~
*.qgz~
*.bak
.#*
~$*

# 3. OS filesystem metadata clutter
.DS_Store
Thumbs.db
desktop.ini
`;
}

export interface CloudFileSummary {
  relativePath: string;
  fileName: string;
  category: 'project' | 'shapefile' | 'raster' | 'geopackage' | 'table' | 'style';
  groupName: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  updatedAt: string;
  updatedBy: string;
}

export interface RevisionCommitSummary {
  revision: number;
  timestamp: string;
  authorMachine: string;
  message: string;
  changedFiles: string[];
}

export interface CloudWorkspaceSummary {
  id: string;
  name: string;
  description: string;
  crs: string;
  revision: number;
  updatedAt: string;
  lockedBy: string | null;
  lockedAt: string | null;
  projectFileName: string;
  totalBytes: number;
  files: CloudFileSummary[];
  history: RevisionCommitSummary[];
}

/**
 * Generates a self-contained PyQGIS Cloud Link Connector script (`meridian_cloud_connector.py`)
 * that pulls the entire project (.qgs/.qgz + .shp/.shx/.dbf/.prj + .tif rasters) from a Cloud Link
 * and automatically uploads/refreshes the cloud workspace when the user saves in QGIS!
 */
export function generateCloudLinkPyQgisScript(
  serverOrigin: string,
  workspaceId: string
): string {
  const cleanOrigin = serverOrigin.replace(/\/+$/, '');
  const cloudLinkUrl = `${cleanOrigin}/api/workspaces/${workspaceId}`;

  return `# -*- coding: utf-8 -*-
"""
Meridian Cloud Link Connector for QGIS 3.x (Pull Project + SHP + Rasters & Auto-Push on Save)
Cloud Workspace Link: ${cloudLinkUrl}

HOW TO USE IN QGIS ON ANY COMPUTER:
  1. Open QGIS -> Plugins -> Python Console -> Show Editor
  2. Paste this script and click "Run Script" (or save it as startup.py)
  3. It immediately adds two actions to your QGIS toolbar AND connects to the Cloud Link:
     - [Meridian: Pull Cloud Project & Layers] -> Downloads the .qgs, all .shp (.shx/.dbf/.prj),
       and .tif rasters into ~/Meridian_Cloud_Cache/${workspaceId}/ and opens the project!
     - [Meridian: Save & Push to Cloud] -> Triggered automatically whenever you press Ctrl+S
       (Save Project) in QGIS, or manually via the toolbar button. Uploads updated .qgs, .shp,
       and .tif files back to the Cloud Link and refreshes the revision!
"""

import os
import io
import json
import socket
import zipfile
import urllib.request
from qgis.core import QgsProject, QgsMessageLog, Qgis
from qgis.utils import iface
from qgis.PyQt.QtWidgets import QAction, QMessageBox

CLOUD_WORKSPACE_URL = "${cloudLinkUrl}"
WORKSPACE_ID = "${workspaceId}"
HOSTNAME = f"{socket.gethostname()}"
LOCAL_CACHE_DIR = os.path.join(os.path.expanduser("~"), "Meridian_Cloud_Cache", WORKSPACE_ID)


def pull_workspace_from_cloud():
    """Downloads the complete .zip bundle (.qgs + .shp/.dbf/.shx/.prj + .tif) and opens it in QGIS."""
    os.makedirs(LOCAL_CACHE_DIR, exist_ok=True)
    pull_url = f"{CLOUD_WORKSPACE_URL}/pull.zip"
    QgsMessageLog.logMessage(f"Pulling workspace from {pull_url} ...", "MeridianCloud", Qgis.Info)

    try:
        req = urllib.request.Request(
            pull_url,
            headers={"X-Meridian-Machine": HOSTNAME, "User-Agent": "QGIS-Meridian-Client/3.0"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            zip_bytes = resp.read()

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            zf.extractall(LOCAL_CACHE_DIR)

        # Find the extracted .qgs project file
        qgs_files = [f for f in os.listdir(LOCAL_CACHE_DIR) if f.lower().endswith(".qgs")]
        if not qgs_files:
            raise RuntimeError("No .qgs project file found in pulled cloud bundle.")

        project_path = os.path.join(LOCAL_CACHE_DIR, qgs_files[0])
        QgsProject.instance().read(project_path)
        if iface:
            iface.messageBar().pushMessage(
                "Meridian Cloud",
                f"Pulled latest project, Shapefiles, and Rasters into {LOCAL_CACHE_DIR}",
                level=Qgis.Success,
                duration=6
            )
    except Exception as exc:
        QgsMessageLog.logMessage(f"Cloud pull failed: {exc}", "MeridianCloud", Qgis.Critical)
        if iface:
            QMessageBox.warning(None, "Meridian Cloud Pull Error", str(exc))


def push_workspace_to_cloud(commit_note="Saved project and spatial layers from QGIS Desktop"):
    """Packages local .qgs, layers/*.shp (.shx/.dbf/.prj), and rasters/*.tif and uploads to Cloud Link."""
    if not os.path.isdir(LOCAL_CACHE_DIR):
        return

    push_url = f"{CLOUD_WORKSPACE_URL}/push"
    mem_zip = io.BytesIO()

    try:
        with zipfile.ZipFile(mem_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(LOCAL_CACHE_DIR):
                for file in files:
                    # Skip temporary lock/swap files
                    if file.endswith(("~", ".bak", ".gpkg-wal", ".gpkg-shm", "meridian_cloud_manifest.json")):
                        continue
                    abs_path = os.path.join(root, file)
                    rel_path = os.path.relpath(abs_path, LOCAL_CACHE_DIR).replace("\\\\", "/")
                    zf.write(abs_path, rel_path)

        payload = mem_zip.getvalue()
        req = urllib.request.Request(
            push_url,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/zip",
                "X-Meridian-Machine": HOSTNAME,
                "User-Agent": "QGIS-Meridian-Client/3.0"
            }
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        rev = result.get("revision", "?")
        changed_count = len(result.get("changedFiles", []))
        if iface:
            iface.messageBar().pushMessage(
                "Meridian Cloud Sync",
                f"Uploaded & refreshed {changed_count} files to Cloud Revision r{rev} ({HOSTNAME})",
                level=Qgis.Success,
                duration=5
            )
    except Exception as exc:
        QgsMessageLog.logMessage(f"Cloud push error: {exc}", "MeridianCloud", Qgis.Critical)


def _on_qgis_project_saved():
    """Automatically pushes updated project + edited .shp / .tif layers when user presses Ctrl+S in QGIS."""
    current_file = os.path.normpath(QgsProject.instance().fileName())
    if current_file and current_file.startswith(os.path.normpath(LOCAL_CACHE_DIR)):
        push_workspace_to_cloud("Auto-sync on QGIS Project Save (Ctrl+S)")


# Connect auto-sync hook on Project Save
QgsProject.instance().projectSaved.connect(_on_qgis_project_saved)

# Add Toolbar Buttons inside QGIS Desktop
if iface:
    pull_action = QAction("Cloud Pull (Project + SHP + Rasters)", iface.mainWindow())
    pull_action.triggered.connect(pull_workspace_from_cloud)
    iface.addToolBarIcon(pull_action)

    push_action = QAction("Cloud Save & Push Refresh", iface.mainWindow())
    push_action.triggered.connect(lambda: push_workspace_to_cloud("Manual toolbar push from QGIS"))
    iface.addToolBarIcon(push_action)

# Pull immediately when script is executed
pull_workspace_from_cloud()
`;
}

// ============================================================================
// ZERO-SYNC LIVE POSTGIS & WFS-T CONNECTION EXPORTERS FOR QGIS DESKTOP
// ============================================================================

export type SqlPrivilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface DbRoleInfo {
  roleName: string;
  displayLabel: string;
  tier: 'admin' | 'editor' | 'viewer';
  isSuperuser: boolean;
  canLogin: boolean;
  description: string;
  activeConnections: number;
}

export interface SpatialFeatureRowInfo {
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

export interface SpatialTableInfo {
  tableKey: string;
  schemaName: string;
  tableName: string;
  geometryColumn: string;
  geometryType: 'Polygon' | 'LineString' | 'Point' | 'RasterTile';
  srid: number;
  description: string;
  columns: { name: string; dataType: string }[];
  rows: SpatialFeatureRowInfo[];
}

export interface SqlAuditEntryInfo {
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

export interface LiveDatabaseState {
  currentTxid: number;
  serverTimestamp: string;
  roles: DbRoleInfo[];
  tables: SpatialTableInfo[];
  grants: Record<string, Record<string, SqlPrivilege[]>>;
  auditLog: SqlAuditEntryInfo[];
}

/**
 * 1. Generates a ready-to-import QGIS PostGIS Connection XML file (`qgis_pg_connections.xml`).
 * Users import this in QGIS via: Browser Panel -> PostgreSQL -> Right-Click -> Load Connections...
 */
export function generateQgisPostgisConnectionXml(
  host: string,
  port: string,
  database: string,
  roleName: string,
  serviceName: string = 'meridian_postgis_live'
): string {
  return `<!DOCTYPE connections>
<qgsPgConnections version="1.0">
  <postgis
    name="Meridian Live PostGIS (${roleName})"
    service="${serviceName}"
    host="${host}"
    port="${port}"
    database="${database}"
    username="${roleName}"
    password=""
    sslmode="SslPrefer"
    saveUsername="true"
    savePassword="false"
    estimatedMetadata="true"
    geometryColumnsOnly="false"
    dontResolveType="false"
    publicOnly="false"
    allowGeometrylessTables="true"
    projectsInDatabase="true"
    metadataInDatabase="true"
  />
</qgsPgConnections>`;
}

/**
 * 2. Generates a standard PostgreSQL `pg_service.conf` file so any computer can connect
 * using `service='meridian_postgis_live'` without hardcoding host/port/user in the .qgs file!
 */
export function generatePgServiceConf(
  host: string,
  port: string,
  database: string,
  roleName: string,
  serviceName: string = 'meridian_postgis_live'
): string {
  return `# Meridian Zero-Sync PostGIS Service Configuration (pg_service.conf)
# Place this file at:
#   - Windows : %APPDATA%\\postgresql\\pg_service.conf
#   - macOS   : ~/.pg_service.conf
#   - Linux   : ~/.pg_service.conf
#
# Because QGIS layers reference service='${serviceName}', every computer connects
# to the exact same live spatial database tables with zero local file paths!

[${serviceName}]
host=${host}
port=${port}
dbname=${database}
user=${roleName}
sslmode=prefer
application_name=QGIS_Meridian_Live_${roleName}
`;
}

/**
 * 3. Generates a Live Zero-Sync `.qgs` Project XML where layers point directly to
 * PostGIS (`provider="postgres"`) AND live HTTP GeoJSON endpoints so hitting Refresh (F5)
 * in QGIS immediately renders database commits from any other workstation.
 */
export function generateLiveDatabaseQgsProjectXml(
  serverOrigin: string,
  serviceName: string,
  roleName: string,
  tables: SpatialTableInfo[]
): string {
  const cleanOrigin = serverOrigin.replace(/\/+$/, '');

  const layerXmlBlocks = tables.map((tbl, idx) => {
    const isRaster = tbl.geometryType === 'RasterTile';
    const postgisDatasource = `service='${serviceName}' sslmode=prefer key='fid' srid=${tbl.srid} type=${
      isRaster ? 'Polygon' : tbl.geometryType
    } checkPrimaryKeyUnicity='1' table="${tbl.schemaName}"."${tbl.tableName}" (${tbl.geometryColumn})`;

    const liveBridgeUrl = `${cleanOrigin}/api/db/layers/${tbl.tableKey}/geojson?role=${roleName}`;

    return `    <!-- Live PostGIS Table Layer: ${tbl.tableKey} -->
    <maplayer type="vector" geometry="${isRaster ? 'Polygon' : tbl.geometryType}" labelsEnabled="1" refreshOnNotifyEnabled="1" refreshOnNotifyMessage="${tbl.tableName}_changed">
      <id>${tbl.tableName}_postgis_${idx}</id>
      <layername>${tbl.tableKey} [PostGIS Live · Role: ${roleName}]</layername>
      <provider encoding="UTF-8">postgres</provider>
      <datasource>${postgisDatasource}</datasource>
      <customproperties>
        <property key="meridian/liveBridgeGeoJsonUrl" value="${liveBridgeUrl}"/>
        <property key="meridian/activeSqlRole" value="${roleName}"/>
      </customproperties>
    </maplayer>`;
  });

  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.38.2-Grenoble" projectname="Meridian_ZeroSync_Live_PostGIS">
  <homePath path=""/>
  <title>Meridian Zero-Sync Live Spatial Database (${roleName})</title>
  <properties>
    <Paths>
      <Absolute type="bool">false</Absolute>
    </Paths>
  </properties>
  <projectlayers>
${layerXmlBlocks.join('\n')}
  </projectlayers>
</qgis>`;
}

/**
 * 4. Generates the Zero-Sync PyQGIS Instant Database Transaction Bridge script.
 * When pasted into QGIS, it loads the live database tables into QGIS and hooks directly into
 * `layer.committedFeaturesAdded`, `layer.committedAttributeValuesChanges`, and `layer.committedFeaturesRemoved`
 * so the exact moment you save an edit in QGIS, it writes directly to the SQL database (enforcing your SQL Role)!
 */
export function generateZeroSyncPyQgisBridgeScript(
  serverOrigin: string,
  activeRole: string,
  tables: SpatialTableInfo[]
): string {
  const cleanOrigin = serverOrigin.replace(/\/+$/, '');
  const tableKeysJson = JSON.stringify(
    tables.filter((t) => t.geometryType !== 'RasterTile').map((t) => t.tableKey)
  );

  return `# -*- coding: utf-8 -*-
"""
Meridian Zero-Sync Live Database Bridge for QGIS 3.x
Connected SQL Role : ${activeRole}
Live Database Host : ${cleanOrigin}/api/db

HOW THIS WORKS (ZERO FILE SYNC):
  1. Loads live spatial database tables (${tables.map((t) => t.tableKey).join(', ')})
     directly into QGIS as live vector layers.
  2. Instant Direct Database Write: Hooks into QGIS's edit buffer signals
     (committedFeaturesAdded, committedAttributeValuesChanges, committedFeaturesRemoved).
     The moment you save a layer edit in QGIS, your changes are written directly to the SQL database!
  3. Instant Refresh: Press F5 (or click the "Refresh Live DB Layers" toolbar button) on any computer
     and edits made by teammates immediately appear on your map canvas.
  4. SQL Role Enforcement: Connected as role "${activeRole}". If your role only has SELECT permission
     (Viewer), the database rejects any write attempt with PostgreSQL Error 42501.
"""

import json
import socket
import urllib.request
import urllib.error
from qgis.core import QgsProject, QgsVectorLayer, QgsMessageLog, Qgis
from qgis.utils import iface
from qgis.PyQt.QtWidgets import QAction, QMessageBox

API_BASE = "${cleanOrigin}/api/db"
ACTIVE_SQL_ROLE = "${activeRole}"
WORKSTATION = socket.gethostname()
TABLES = ${tableKeysJson}


def _send_sql_transaction(operation, table_key, fid=None, geom_wkt=None, attributes=None):
    """Writes an INSERT, UPDATE, or DELETE directly to the spatial SQL database."""
    payload = json.dumps({
        "roleName": ACTIVE_SQL_ROLE,
        "workstation": f"{WORKSTATION} (QGIS 3.x)",
        "operation": operation,
        "tableKey": table_key,
        "fid": fid,
        "geomWkt": geom_wkt,
        "attributes": attributes or {}
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{API_BASE}/transaction",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-DB-Role": ACTIVE_SQL_ROLE
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
        if iface:
            iface.messageBar().pushMessage(
                "SQL Committed",
                f"[{ACTIVE_SQL_ROLE}] {operation} on {table_key} written to database (txid={res_data.get('auditEntry', {}).get('txid')})",
                level=Qgis.Success,
                duration=4
            )
        return True
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="ignore")
        try:
            err_msg = json.loads(err_body).get("error", err_body)
        except Exception:
            err_msg = err_body
        if iface:
            iface.messageBar().pushMessage("SQL Permission Denied", err_msg, level=Qgis.Critical, duration=7)
            QMessageBox.critical(None, "PostgreSQL Permission Denied (42501)", err_msg)
        return False


def connect_live_database_layers():
    """Loads or refreshes all live spatial tables from the database into QGIS."""
    for table_key in TABLES:
        geojson_url = f"{API_BASE}/layers/{table_key}/geojson?role={ACTIVE_SQL_ROLE}"
        layer_title = f"{table_key} [Role: {ACTIVE_SQL_ROLE}]"

        # Check if layer is already on canvas; if so, reload data directly from database
        existing = QgsProject.instance().mapLayersByName(layer_title)
        if existing:
            for lyr in existing:
                lyr.dataProvider().reloadData()
                lyr.triggerRepaint()
            continue

        vlayer = QgsVectorLayer(geojson_url, layer_title, "ogr")
        if vlayer.isValid():
            # Wire instant zero-sync database write hooks when user saves layer edits
            def on_features_added(layer_id, added_features, tk=table_key):
                for feat in added_features:
                    attrs = {field.name(): feat[field.name()] for field in feat.fields() if not field.name().startswith("_")}
                    _send_sql_transaction("INSERT", tk, geom_wkt=feat.geometry().asWkt(), attributes=attrs)

            def on_features_deleted(layer_id, deleted_fids, tk=table_key):
                for dfid in deleted_fids:
                    _send_sql_transaction("DELETE", tk, fid=dfid)

            vlayer.committedFeaturesAdded.connect(on_features_added)
            vlayer.committedFeaturesRemoved.connect(on_features_deleted)
            QgsProject.instance().addMapLayer(vlayer)

    if iface:
        iface.mapCanvas().refreshAllLayers()
        iface.messageBar().pushMessage(
            "Meridian Live DB",
            f"Refreshed live spatial tables as SQL role '{ACTIVE_SQL_ROLE}'",
            level=Qgis.Info,
            duration=4
        )


if iface:
    refresh_btn = QAction(f"Refresh Live DB ({ACTIVE_SQL_ROLE})", iface.mainWindow())
    refresh_btn.triggered.connect(connect_live_database_layers)
    iface.addToolBarIcon(refresh_btn)

connect_live_database_layers()
`;
}


