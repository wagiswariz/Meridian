export interface WorkspaceAddressIssue {
  code:
    | 'DOUBLE_PATH_COLLISION'
    | 'ARCHIVE_SUFFIX_STRIPPED'
    | 'LAYER_FILE_PATH_STRIPPED'
    | 'DEV_PREVIEW_COOKIE_GATE'
    | 'MISSING_SCHEME_NORMALIZED'
    | 'QUERY_PARAM_EXTRACTED'
    | 'EXTERNAL_CLOUD_PROXIED';
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  autoFixAction: string;
}

export interface WorkspaceAddressAnalysis {
  rawInput: string;
  isValid: boolean;
  wasRewritten: boolean;
  originType:
    | 'SHARED_PREVIEW'
    | 'DEV_PREVIEW'
    | 'LOCALHOST'
    | 'EXTERNAL_CLOUD'
    | 'RELATIVE_SLUG';
  inputOrigin: string;
  resolvedOrigin: string;
  fallbackOrigin: string;
  isCrossOrigin: boolean;
  extractedWorkspaceId: string;
  issues: WorkspaceAddressIssue[];
  endpoints: {
    statusUrl: string;
    workspaceUrl: string;
    manifestUrl: string;
    pullZipUrl: string;
    sampleGeoJsonUrl: string;
    proxyProbeUrl: string;
  };
}

export interface WorkspaceEndpointCheck {
  name: string;
  endpoint: string;
  status: '200 OK' | 'AUTO-REWRITTEN' | 'PROXIED' | 'ERROR';
  httpCode: number;
  latencyMs: number;
  detail: string;
}

export interface WorkspaceConnectivityProbeResult {
  workspaceId: string;
  workspaceName: string;
  revision: number;
  originType: string;
  resolvedOrigin: string;
  reachable: boolean;
  wasAutoFixed: boolean;
  totalLatencyMs: number;
  layerCount: number;
  layerTableKeys: string[];
  shpFileCount: number;
  checks: WorkspaceEndpointCheck[];
  probedAt: string;
}

export function normalizeOriginPair(origin: string): {
  primaryOrigin: string;
  fallbackOrigin: string;
} {
  const clean = origin.trim().replace(/\/+$/, '');
  if (clean.includes('ais-dev-')) {
    return {
      primaryOrigin: clean.replace('ais-dev-', 'ais-pre-'),
      fallbackOrigin: clean,
    };
  }
  if (clean.includes('ais-pre-')) {
    return {
      primaryOrigin: clean,
      fallbackOrigin: clean.replace('ais-pre-', 'ais-dev-'),
    };
  }
  return { primaryOrigin: clean, fallbackOrigin: clean };
}

export function analyzeWorkspaceAddress(
  rawInput: string,
  currentHostOrigin: string,
  defaultWorkspaceId: string = 'watershed-citarum-2026',
  sampleTableKey: string = 'public.hydro_sub_basins'
): WorkspaceAddressAnalysis {
  const cleanCurrentOrigin = currentHostOrigin.trim().replace(/\/+$/, '');
  const { primaryOrigin: hostPrimaryOrigin, fallbackOrigin: hostFallbackOrigin } =
    normalizeOriginPair(cleanCurrentOrigin);

  const trimmed = rawInput.trim();
  const issues: WorkspaceAddressIssue[] = [];
  let wasRewritten = false;

  if (!trimmed) {
    const wsId = defaultWorkspaceId;
    return {
      rawInput: `${hostPrimaryOrigin}/api/workspaces/${wsId}`,
      isValid: true,
      wasRewritten: false,
      originType: hostPrimaryOrigin.includes('ais-pre-')
        ? 'SHARED_PREVIEW'
        : hostPrimaryOrigin.includes('ais-dev-')
        ? 'DEV_PREVIEW'
        : 'LOCALHOST',
      inputOrigin: hostPrimaryOrigin,
      resolvedOrigin: hostPrimaryOrigin,
      fallbackOrigin: hostFallbackOrigin,
      isCrossOrigin: false,
      extractedWorkspaceId: wsId,
      issues: [],
      endpoints: {
        statusUrl: `${hostPrimaryOrigin}/api/plugin/status?workspaceId=${wsId}`,
        workspaceUrl: `${hostPrimaryOrigin}/api/workspaces/${wsId}`,
        manifestUrl: `${hostPrimaryOrigin}/api/workspaces/${wsId}/manifest`,
        pullZipUrl: `${hostPrimaryOrigin}/api/workspaces/${wsId}/pull.zip`,
        sampleGeoJsonUrl: `${hostPrimaryOrigin}/api/db/layers/${sampleTableKey}/geojson`,
        proxyProbeUrl: `/api/plugin/diagnose-workspace`,
      },
    };
  }

  let working = trimmed;
  let originType: WorkspaceAddressAnalysis['originType'] = 'RELATIVE_SLUG';
  let inputOrigin = cleanCurrentOrigin;
  let resolvedOrigin = hostPrimaryOrigin;
  let fallbackOrigin = hostFallbackOrigin;
  let isCrossOrigin = false;

  // 1. Check if input looks like a domain without http/https scheme
  if (
    !working.startsWith('http://') &&
    !working.startsWith('https://') &&
    !working.startsWith('/') &&
    (working.includes('.run.app') || working.includes('localhost:') || working.includes('127.0.0.1'))
  ) {
    const scheme = working.includes('localhost') || working.includes('127.0.0.1') ? 'http://' : 'https://';
    working = `${scheme}${working}`;
    wasRewritten = true;
    issues.push({
      code: 'MISSING_SCHEME_NORMALIZED',
      severity: 'warning',
      title: 'Missing URL Scheme Prepended',
      detail: `Input omitted protocol scheme; normalized with "${scheme}".`,
      autoFixAction: `Prepended ${scheme} to host address`,
    });
  }

  let pathname = working;
  let searchParams = new URLSearchParams();

  if (working.startsWith('http://') || working.startsWith('https://')) {
    try {
      const parsed = new URL(working);
      inputOrigin = `${parsed.protocol}//${parsed.host}`;
      pathname = parsed.pathname;
      searchParams = parsed.searchParams;

      if (inputOrigin.includes('ais-pre-')) {
        originType = 'SHARED_PREVIEW';
        const pair = normalizeOriginPair(inputOrigin);
        resolvedOrigin = pair.primaryOrigin;
        fallbackOrigin = pair.fallbackOrigin;
      } else if (inputOrigin.includes('ais-dev-')) {
        originType = 'DEV_PREVIEW';
        const pair = normalizeOriginPair(inputOrigin);
        resolvedOrigin = pair.primaryOrigin;
        fallbackOrigin = pair.fallbackOrigin;
        wasRewritten = true;
        issues.push({
          code: 'DEV_PREVIEW_COOKIE_GATE',
          severity: 'info',
          title: 'Dev Preview Origin Mapped to Shared Primary Origin',
          detail:
            'ais-dev-* URLs require browser session cookies from external clients. Paired with ais-pre-* Shared App URL + Multi-Device Relay.',
          autoFixAction: `Promoted primary origin to ${resolvedOrigin} with dev fallback`,
        });
      } else if (inputOrigin.includes('localhost') || inputOrigin.includes('127.0.0.1')) {
        originType = 'LOCALHOST';
        resolvedOrigin = inputOrigin;
        fallbackOrigin = hostPrimaryOrigin;
      } else {
        originType = 'EXTERNAL_CLOUD';
        resolvedOrigin = hostPrimaryOrigin;
        fallbackOrigin = inputOrigin;
      }

      const normInput = normalizeOriginPair(inputOrigin).primaryOrigin;
      if (normInput !== hostPrimaryOrigin && inputOrigin !== cleanCurrentOrigin) {
        isCrossOrigin = true;
        wasRewritten = true;
        issues.push({
          code: 'EXTERNAL_CLOUD_PROXIED',
          severity: 'warning',
          title: 'Cross-Cloud Host Origin Detected — Server Proxy Enabled',
          detail: `Origin "${inputOrigin}" differs from current host "${cleanCurrentOrigin}". Direct browser fetches would hit CORS/cookie gates; requests are routed via server proxy & normalized workspace state.`,
          autoFixAction: `Routed cross-cloud workspace via ${hostPrimaryOrigin}/api/plugin/active-workspace`,
        });
      }
    } catch {
      pathname = working;
    }
  } else if (working.includes('?')) {
    const [p, q] = working.split('?', 2);
    pathname = p;
    searchParams = new URLSearchParams(q);
  }

  let extractedWorkspaceId = '';

  // 2. Detect double-appended path collision: /api/workspaces/<id>/api/plugin/status or /api/workspaces/<id>/api/db/...
  const doubleApiCollisionMatch = pathname.match(
    /\/api\/workspaces\/([^/?#]+)\/(api\/.+)$/i
  );
  if (doubleApiCollisionMatch) {
    extractedWorkspaceId = doubleApiCollisionMatch[1];
    const collidedSuffix = `/${doubleApiCollisionMatch[2]}`;
    wasRewritten = true;
    issues.push({
      code: 'DOUBLE_PATH_COLLISION',
      severity: 'error',
      title: 'Double-Appended API Path Collision Detected',
      detail: `Appending "${collidedSuffix}" onto "/api/workspaces/${extractedWorkspaceId}" causes a 404 route mismatch.`,
      autoFixAction: `Separated base origin (${resolvedOrigin}) and extracted workspaceId="${extractedWorkspaceId}"`,
    });
  }

  // 3. Detect archive or manifest suffix on workspace URL: /api/workspaces/<id>/pull.zip or /manifest
  if (!extractedWorkspaceId) {
    const archiveSuffixMatch = pathname.match(
      /\/api\/workspaces\/([^/?#]+)\/(pull\.zip|manifest|push|lock|[^/?#]+\.zip|[^/?#]+\.qgs|[^/?#]+\.qgz)$/i
    );
    if (archiveSuffixMatch) {
      extractedWorkspaceId = archiveSuffixMatch[1];
      const suffix = archiveSuffixMatch[2];
      wasRewritten = true;
      issues.push({
        code: 'ARCHIVE_SUFFIX_STRIPPED',
        severity: 'warning',
        title: `Endpoint Suffix "/${suffix}" Stripped from Workspace Address`,
        detail: `Pasted link included file/action endpoint "/${suffix}" instead of the base workspace identifier.`,
        autoFixAction: `Stripped "/${suffix}" and resolved workspaceId="${extractedWorkspaceId}"`,
      });
    }
  }

  // 4. Detect direct file or shapefile path: /api/workspaces/<id>/file?path=layers/... or /layers/<name>.shp
  if (!extractedWorkspaceId) {
    const fileEndpointMatch = pathname.match(/\/api\/workspaces\/([^/?#]+)\/file$/i);
    if (fileEndpointMatch) {
      extractedWorkspaceId = fileEndpointMatch[1];
      const fileParam = searchParams.get('path') || 'layers/*.shp';
      wasRewritten = true;
      issues.push({
        code: 'LAYER_FILE_PATH_STRIPPED',
        severity: 'warning',
        title: 'Direct File Download Path Converted to Live Workspace',
        detail: `Link targeted single binary file (${fileParam}) rather than the live workspace stream.`,
        autoFixAction: `Extracted workspaceId="${extractedWorkspaceId}" for full layer sync`,
      });
    }
  }

  // 5. Standard /api/workspaces/<id>
  if (!extractedWorkspaceId) {
    const standardWsMatch = pathname.match(/\/api\/workspaces\/([^/?#]+)/i);
    if (standardWsMatch) {
      extractedWorkspaceId = standardWsMatch[1];
    }
  }

  // 6. Query param ?workspaceId=<id> or ?workspace=<id>
  if (!extractedWorkspaceId) {
    const qWs = searchParams.get('workspaceId') || searchParams.get('workspace');
    if (qWs) {
      extractedWorkspaceId = qWs;
      if (pathname.includes('/api/plugin/status')) {
        wasRewritten = true;
        issues.push({
          code: 'QUERY_PARAM_EXTRACTED',
          severity: 'info',
          title: 'Workspace ID Extracted from Status Query Parameter',
          detail: `Parsed workspaceId="${qWs}" from query string parameter.`,
          autoFixAction: `Bound active workspace selector to "${qWs}"`,
        });
      }
    }
  }

  // 7. Fallback: bare slug or last path segment
  if (!extractedWorkspaceId) {
    const cleanSegments = pathname
      .split('/')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'api' && s !== 'workspaces' && s !== 'plugin' && s !== 'status');
    const candidate = cleanSegments[cleanSegments.length - 1] || defaultWorkspaceId;
    extractedWorkspaceId = candidate.replace(/\.(shp|shx|dbf|qgs|qgz|zip|tif)$/i, '');
    if (candidate !== extractedWorkspaceId) {
      wasRewritten = true;
      issues.push({
        code: 'LAYER_FILE_PATH_STRIPPED',
        severity: 'warning',
        title: 'File Extension Stripped from Identifier',
        detail: `Removed file extension from "${candidate}" to resolve workspace slug.`,
        autoFixAction: `Normalized slug to "${extractedWorkspaceId}"`,
      });
    }
  }

  const sanitizedId =
    extractedWorkspaceId
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '') || defaultWorkspaceId;

  return {
    rawInput: trimmed,
    isValid: Boolean(sanitizedId),
    wasRewritten,
    originType,
    inputOrigin,
    resolvedOrigin,
    fallbackOrigin,
    isCrossOrigin,
    extractedWorkspaceId: sanitizedId,
    issues,
    endpoints: {
      statusUrl: `${resolvedOrigin}/api/plugin/status?workspaceId=${sanitizedId}`,
      workspaceUrl: `${resolvedOrigin}/api/workspaces/${sanitizedId}`,
      manifestUrl: `${resolvedOrigin}/api/workspaces/${sanitizedId}/manifest`,
      pullZipUrl: `${resolvedOrigin}/api/workspaces/${sanitizedId}/pull.zip`,
      sampleGeoJsonUrl: `${resolvedOrigin}/api/db/layers/${sampleTableKey}/geojson`,
      proxyProbeUrl: `/api/plugin/diagnose-workspace`,
    },
  };
}

export function getDiagnosticTestPresets(primaryOrigin: string) {
  return [
    {
      id: 'preset-clean-mangrove',
      label: 'Valid Mangrove Workspace Link',
      badge: '200 OK',
      url: `${primaryOrigin}/api/workspaces/coastal-mangrove-delta-2026`,
      description: 'Canonical Cloud Workspace address for Jakarta Bay & Coastal Mangrove Delta 2026',
    },
    {
      id: 'preset-double-path',
      label: 'Broken Double-Path Collision',
      badge: 'AUTO-FIX',
      url: `${primaryOrigin}/api/workspaces/coastal-mangrove-delta-2026/api/plugin/status?refresh=true`,
      description: 'Simulates when a client appends /api/plugin/status onto a workspace URL',
    },
    {
      id: 'preset-archive-zip',
      label: 'Archive .pull.zip Suffix Link',
      badge: 'AUTO-FIX',
      url: `${primaryOrigin}/api/workspaces/urban-transit-corridor-2026/pull.zip`,
      description: 'Simulates pasting a ZIP bundle download link into the workspace address bar',
    },
    {
      id: 'preset-cross-cloud',
      label: 'Cross-Cloud External Host Link',
      badge: 'PROXIED',
      url: `https://ais-dev-remote-cluster-99.asia-southeast1.run.app/api/workspaces/urban-transit-corridor-2026/manifest`,
      description: 'Simulates connecting a workspace URL from a different Cloud Run preview origin',
    },
  ];
}
